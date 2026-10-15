import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import ts from "typescript";
import sharp from "sharp";
import { normalizeProductPhoto } from "../app/lib/product-photo-normalizer.ts";
import { changeProductPhoto, PhotoChangeError } from "../app/lib/product-photo-service.ts";
import {
  createSupabasePhotoPorts,
  PhotoSupabaseError,
} from "../app/lib/product-photo-supabase.ts";

const itemId = "22222222-2222-4222-8222-222222222222";
const businessId = "11111111-1111-4111-8111-111111111111";
const actorId = "33333333-3333-4333-8333-333333333333";
const otherActorId = "44444444-4444-4444-8444-444444444444";
const expectedVersion = "9007199254740993";
const input = new Uint8Array([1, 2, 3]);

function clientHarness({
  ownedData = [],
  commitData = true,
  rpcError = null,
  rpcThrow = null,
  uploadError = null,
  uploadThrow = null,
  uploadResponse = null,
} = {}) {
  const calls = { rpc: [], uploads: [] };
  const client = {
    rpc: async (name, args) => {
      calls.rpc.push({ name, args });
      if (rpcThrow) throw rpcThrow;
      if (name === "get_owned_product_photo") return { data: ownedData, error: rpcError };
      return { data: commitData, error: rpcError };
    },
    storage: {
      from(bucket) {
        return {
          upload: async (path, bytes, options) => {
            calls.uploads.push({ bucket, path, bytes, options });
            if (uploadThrow) throw uploadThrow;
            return uploadResponse ?? { data: { path }, error: uploadError };
          },
        };
      },
    },
  };
  return { client, calls };
}

function portsFor(client, overrides = {}) {
  return createSupabasePhotoPorts({
    client,
    authenticatedUserId: async () => actorId,
    normalize: async (bytes) => ({
      buffer: new Uint8Array(bytes),
      contentType: "image/webp",
      width: 1,
      height: 1,
      bytes: bytes.byteLength,
    }),
    ...overrides,
  });
}

function assertStableError(error, code) {
  assert.ok(error instanceof PhotoSupabaseError);
  assert.equal(error.code, code);
  assert.equal(error.message.includes("provider secret"), false);
  assert.equal(error.message.includes("raw database detail"), false);
}

const KNOWN_BASELINE_DIAGNOSTICS = [
  {
    file: "app/lib/product-photo-normalizer.ts",
    start: 5501,
    length: 5,
    code: 2503,
    category: 1,
    message: "Cannot find namespace 'sharp'.",
  },
  {
    file: "tests/product-photo-normalizer.test.ts",
    start: 166,
    length: 40,
    code: 5097,
    category: 1,
    message: "An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.",
  },
];

function installedSdkAssignabilityDiagnostics({ injectUnexpectedBaseline = false } = {}) {
  const webRoot = join(process.cwd(), "apps/web");
  const configPath = join(webRoot, "tsconfig.json");
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  assert.equal(config.error, undefined);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, webRoot, undefined, configPath);
  const virtualPath = join(webRoot, "app/lib/product-photo-supabase.assignability.virtual.ts");
  const virtualSource = `
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SupabasePhotoClient } from "./product-photo-supabase";
const acceptsPhotoClient = (client: SupabasePhotoClient): SupabasePhotoClient => client;
declare const installedClient: SupabaseClient;
acceptsPhotoClient(installedClient);
`;
  const injectedPath = join(webRoot, "app/lib/product-photo-supabase.baseline-regression.virtual.ts");
  const sources = new Map([[virtualPath, virtualSource]]);
  if (injectUnexpectedBaseline) {
    sources.set(injectedPath, `
import sharp from "sharp";
let injectedMetadata: sharp.Metadata;
void injectedMetadata;
`);
  }
  const baseHost = ts.createCompilerHost(parsed.options, true);
  const host = {
    ...baseHost,
    fileExists(fileName) {
      return sources.has(fileName) || baseHost.fileExists(fileName);
    },
    readFile(fileName) {
      return sources.get(fileName) ?? baseHost.readFile(fileName);
    },
    getSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile) {
      const source = sources.get(fileName);
      if (source !== undefined) return ts.createSourceFile(fileName, source, languageVersion, true);
      return baseHost.getSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
    },
  };
  const program = ts.createProgram({
    rootNames: [...parsed.fileNames, ...sources.keys()],
    options: parsed.options,
    host,
  });
  const normalizedDiagnostics = ts.getPreEmitDiagnostics(program).map((diagnostic) => ({
    file: diagnostic.file ? diagnostic.file.fileName.slice(webRoot.length + 1).replaceAll("\\", "/") : null,
    start: diagnostic.start ?? null,
    length: diagnostic.length ?? null,
    code: diagnostic.code,
    category: diagnostic.category,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\\n"),
  }));
  const isKnownBaseline = (diagnostic) => KNOWN_BASELINE_DIAGNOSTICS.some((known) =>
    JSON.stringify(known) === JSON.stringify(diagnostic));
  const baselineDiagnostics = normalizedDiagnostics.filter(isKnownBaseline);
  const unexpectedDiagnostics = normalizedDiagnostics.filter((diagnostic) => !isKnownBaseline(diagnostic));
  assert.deepEqual(baselineDiagnostics, KNOWN_BASELINE_DIAGNOSTICS, "only the exact committed baseline diagnostics may be filtered");
  return {
    virtualDiagnostics: unexpectedDiagnostics.filter(({ file }) => file === "app/lib/product-photo-supabase.assignability.virtual.ts"),
    injectedDiagnostics: unexpectedDiagnostics.filter(({ file }) => file === "app/lib/product-photo-supabase.baseline-regression.virtual.ts"),
    unexpectedDiagnostics,
  };
}

test("installed SupabaseClient is assignable to the adapter port; exact TS2503/TS5097 baseline remains disclosed", () => {
  const result = installedSdkAssignabilityDiagnostics();
  assert.deepEqual(result.virtualDiagnostics, []);
  assert.deepEqual(result.unexpectedDiagnostics, []);
});

test("does not suppress a new baseline-code diagnostic at a different virtual location", () => {
  const result = installedSdkAssignabilityDiagnostics({ injectUnexpectedBaseline: true });
  assert.ok(result.injectedDiagnostics.length >= 1);
  const injectedDiagnostic = result.injectedDiagnostics.find(({ code }) => code === 2503 || code === 5097);
  assert.ok(injectedDiagnostic, JSON.stringify(result.injectedDiagnostics));
  assert.notEqual(injectedDiagnostic.file, "app/lib/product-photo-normalizer.ts");
  assert.notEqual(injectedDiagnostic.start, 5501);
  assert.equal(result.unexpectedDiagnostics.length, result.injectedDiagnostics.length);
});

function thenable(value) {
  return { then(resolve) { resolve(value); } };
}

test("accepts Supabase-style RPC thenables at runtime", async () => {
  const harness = clientHarness({
    ownedData: [{ business_id: businessId, photo_version: "7" }],
  });
  harness.client.rpc = (name) => thenable(
    name === "get_owned_product_photo"
      ? { data: [{ business_id: businessId, photo_version: "7" }], error: null }
      : { data: true, error: null },
  );
  assert.deepEqual(await portsFor(harness.client).ownedItem(itemId, actorId), {
    businessId,
    photoVersion: "7",
  });
});

test("uses the verified callback actor and exact owner RPC arguments, including bigint text", async () => {
  const { client, calls } = clientHarness({
    ownedData: [{ business_id: businessId, photo_version: expectedVersion }],
  });
  const ports = portsFor(client);
  const item = await ports.ownedItem(itemId, otherActorId);
  assert.deepEqual(item, { businessId, photoVersion: expectedVersion });
  assert.deepEqual(calls.rpc, [{
    name: "get_owned_product_photo",
    args: { p_actor_id: actorId, p_item_id: itemId },
  }]);

  const large = clientHarness({
    ownedData: [{ business_id: businessId, photo_version: expectedVersion }],
  });
  assert.deepEqual(
    await changeProductPhoto({ itemId, expectedVersion, operation: "detach" }, portsFor(large.client)),
    { photoPath: null, photoVersion: "9007199254740994" },
  );
  assert.deepEqual(large.calls.rpc[1], {
    name: "commit_product_photo",
    args: {
      p_actor_id: actorId,
      p_item_id: itemId,
      p_business_id: businessId,
      p_expected_version: expectedVersion,
      p_next_version: "9007199254740994",
      p_photo_path: null,
    },
  });
});

test("maps an empty owner result to null and rejects unexpected cardinality or shape", async () => {
  const empty = clientHarness({ ownedData: [] });
  assert.equal(await portsFor(empty.client).ownedItem(itemId, actorId), null);

  for (const ownedData of [
    [
      { business_id: businessId, photo_version: "1" },
      { business_id: businessId, photo_version: "2" },
    ],
    [{ business_id: businessId, photo_version: "1", extra: true }],
    [{ business_id: "not-a-uuid", photo_version: "1" }],
    [{ business_id: businessId, photo_version: "01" }],
    [{ business_id: businessId, photo_version: 1 }],
    [{ business_id: businessId, photo_version: "9223372036854775808" }],
  ]) {
    const harness = clientHarness({ ownedData });
    await assert.rejects(
      portsFor(harness.client).ownedItem(itemId, actorId),
      (error) => {
        assertStableError(error, "invalid_database_response");
        return true;
      },
    );
    assert.deepEqual(harness.calls.uploads, []);
  }
});

test("combines the service, canonical normalizer callback, Storage upload and exact commit RPC", async () => {
  const { client, calls } = clientHarness({
    ownedData: [{ business_id: businessId, photo_version: "7" }],
  });
  let normalized = 0;
  const ports = createSupabasePhotoPorts({
    client,
    authenticatedUserId: async () => actorId,
    normalize: async (bytes) => {
      normalized += 1;
      const photo = await normalizeProductPhoto(bytes);
      return photo;
    },
  });
  const png = await sharp({
    create: { width: 2, height: 1, channels: 3, background: "red" },
  }).png().toBuffer();

  const result = await changeProductPhoto({
    itemId,
    expectedVersion: "7",
    operation: "replace",
    image: png,
  }, ports);

  assert.equal(normalized, 1);
  assert.equal(calls.uploads.length, 1);
  const upload = calls.uploads[0];
  assert.equal(upload.bucket, "product-photos");
  assert.match(upload.path, new RegExp(`^${businessId}/${itemId}/[0-9a-f-]{36}\\.webp$`));
  assert.ok(upload.bytes instanceof Uint8Array);
  assert.equal(upload.options.contentType, "image/webp");
  assert.equal(upload.options.upsert, false);
  assert.deepEqual(calls.rpc[1], {
    name: "commit_product_photo",
    args: {
      p_actor_id: actorId,
      p_item_id: itemId,
      p_business_id: businessId,
      p_expected_version: "7",
      p_next_version: "8",
      p_photo_path: upload.path,
    },
  });
  assert.deepEqual(result, { photoPath: upload.path, photoVersion: "8" });
});

test("propagates strict false from commit as a service conflict", async () => {
  const { client, calls } = clientHarness({
    ownedData: [{ business_id: businessId, photo_version: "7" }],
    commitData: false,
  });
  await assert.rejects(
    changeProductPhoto({ itemId, expectedVersion: "7", operation: "detach" }, portsFor(client)),
    (error) => error instanceof PhotoChangeError && error.code === "conflict",
  );
  assert.equal(calls.uploads.length, 0);
  assert.equal(calls.rpc.length, 2);
});

test("rejects provider and malformed responses without raw errors or unintended effects", async () => {
  const rpc = clientHarness({
    rpcError: { message: "raw database detail with provider secret" },
  });
  await assert.rejects(
    changeProductPhoto({ itemId, expectedVersion: "7", operation: "detach" }, portsFor(rpc.client)),
    (error) => {
      assertStableError(error, "database_error");
      return true;
    },
  );
  assert.deepEqual(rpc.calls.uploads, []);
  assert.equal(rpc.calls.rpc.length, 1);

  const malformedCommit = clientHarness({
    ownedData: [{ business_id: businessId, photo_version: "7" }],
    commitData: "true",
  });
  await assert.rejects(
    changeProductPhoto({ itemId, expectedVersion: "7", operation: "detach" }, portsFor(malformedCommit.client)),
    (error) => {
      assertStableError(error, "invalid_database_response");
      return true;
    },
  );
  assert.deepEqual(malformedCommit.calls.uploads, []);

  const thrownRpc = clientHarness({
    rpcThrow: new Error("raw database detail with provider secret"),
  });
  await assert.rejects(
    changeProductPhoto({ itemId, expectedVersion: "7", operation: "detach" }, portsFor(thrownRpc.client)),
    (error) => {
      assertStableError(error, "database_error");
      return true;
    },
  );
  assert.deepEqual(thrownRpc.calls.uploads, []);

  const storage = clientHarness({
    ownedData: [{ business_id: businessId, photo_version: "7" }],
    uploadError: { message: "raw storage detail with provider secret" },
  });
  await assert.rejects(
    changeProductPhoto({ itemId, expectedVersion: "7", operation: "replace", image: input }, portsFor(storage.client)),
    (error) => {
      assertStableError(error, "storage_error");
      return true;
    },
  );
  assert.equal(storage.calls.uploads.length, 1);
  assert.equal(storage.calls.rpc.length, 1);

  const thrownStorage = clientHarness({
    ownedData: [{ business_id: businessId, photo_version: "7" }],
    uploadThrow: new Error("raw storage detail with provider secret"),
  });
  await assert.rejects(
    changeProductPhoto({ itemId, expectedVersion: "7", operation: "replace", image: input }, portsFor(thrownStorage.client)),
    (error) => {
      assertStableError(error, "storage_error");
      return true;
    },
  );
  assert.equal(thrownStorage.calls.uploads.length, 1);
  assert.equal(thrownStorage.calls.rpc.length, 1);
});

test("rejects every malformed successful upload envelope before metadata commit", async () => {
  const oldPath = `${businessId}/${itemId}/old.webp`;
  const envelopes = [
    { error: null },
    { data: null, error: null },
    { data: { path: "wrong/path.webp" }, error: null },
    { data: [], error: null },
    { data: { path: 42 }, error: null },
  ];

  for (const uploadResponse of envelopes) {
    const harness = clientHarness({
      ownedData: [{ business_id: businessId, photo_version: "7" }],
      uploadResponse,
    });
    let stored = { photoPath: oldPath, photoVersion: "7" };
    const baseRpc = harness.client.rpc;
    harness.client.rpc = async (name, args) => {
      if (name === "commit_product_photo") {
        stored = { photoPath: args.p_photo_path, photoVersion: args.p_next_version };
      }
      return baseRpc(name, args);
    };

    await assert.rejects(
      changeProductPhoto({ itemId, expectedVersion: "7", operation: "replace", image: input }, portsFor(harness.client)),
      (error) => {
        assertStableError(error, "storage_error");
        return true;
      },
    );
    assert.equal(harness.calls.uploads.length, 1);
    assert.deepEqual(harness.calls.rpc.map(({ name }) => name), ["get_owned_product_photo"]);
    assert.deepEqual(stored, { photoPath: oldPath, photoVersion: "7" });
  }
});

test("does not manufacture identity and never uses a caller-supplied actor", async () => {
  const signedOut = clientHarness({
    ownedData: [{ business_id: businessId, photo_version: "7" }],
  });
  const ports = portsFor(signedOut.client, { authenticatedUserId: async () => null });
  await assert.rejects(
    changeProductPhoto({ itemId, expectedVersion: "7", operation: "detach" }, ports),
    (error) => error instanceof PhotoChangeError && error.code === "unauthorized",
  );
  assert.deepEqual(signedOut.calls.rpc, []);
});
