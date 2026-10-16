import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";
// @ts-expect-error Native Node tests require an explicit TypeScript extension.
import { changeProductPhoto, type PhotoChange, type PhotoPorts } from "../app/lib/product-photo-service.ts";
// @ts-expect-error Native Node tests require an explicit TypeScript extension.
import { PhotoNormalizationError } from "../app/lib/product-photo-normalizer.ts";
// @ts-expect-error Native Node tests require an explicit TypeScript extension.
import { PhotoSupabaseError } from "../app/lib/product-photo-supabase.ts";
// @ts-expect-error Native Node tests require an explicit TypeScript extension.
import { describePhotoState, photoEditMessage, photoEditOutcome, planPhotoEdit } from "../app/owner/catalog/photo-editor.ts";

// The photo HTTP handler keeps extensionless value imports; resolve them like the
// existing product-photo tests before loading it dynamically.
register(`data:text/javascript,${encodeURIComponent(`
  export async function resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !specifier.endsWith(".ts") && context.parentURL.includes("/apps/web/")) {
      return nextResolve(specifier + ".ts", context);
    }
    return nextResolve(specifier, context);
  }
`)}`, import.meta.url);

// @ts-expect-error Native Node tests require an explicit TypeScript extension.
const { handleProductPhotoRequest } = await import("../app/lib/product-photo-http.ts");

const trustedOrigin = "http://127.0.0.1:3000";
const trustedHost = "127.0.0.1:3000";
const itemId = "22222222-2222-4222-8222-222222222222";
const businessId = "11111111-1111-4111-8111-111111111111";
const actorId = "33333333-3333-4333-8333-333333333333";
const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x20, 0x20, 0x20, 0x20]);
const maxInputBytes = 4 * 1024 * 1024;

type HarnessOptions = {
  actor?: string | null;
  owned?: boolean;
  version?: string;
  normalize?: PhotoPorts["normalize"];
  upload?: PhotoPorts["upload"];
};

function harness(options: HarnessOptions = {}) {
  const actor = options.actor === undefined ? actorId : options.actor;
  const state = { photoPath: null as string | null, photoVersion: options.version ?? "0" };
  const calls = { normalize: 0, upload: 0, commit: 0 };
  const ports: PhotoPorts = {
    authenticatedUserId: async () => actor,
    ownedItem: async (requested, supplied) => {
      assert.equal(requested, itemId);
      assert.equal(supplied, actor);
      if (options.owned === false) return null;
      return { businessId, photoVersion: state.photoVersion };
    },
    normalize: async (bytes) => {
      calls.normalize += 1;
      if (options.normalize) return options.normalize(bytes);
      return { buffer: Buffer.from(webp), contentType: "image/webp", width: 1, height: 1, bytes: webp.byteLength };
    },
    upload: async (path, bytes, uploadOptions) => {
      calls.upload += 1;
      if (options.upload) return options.upload(path, bytes, uploadOptions);
      state.photoPath = path;
    },
    commit: async (change) => {
      calls.commit += 1;
      if (change.expectedVersion !== state.photoVersion) return false;
      state.photoPath = change.photoPath;
      state.photoVersion = change.nextVersion;
      return true;
    },
  };
  const runtime = {
    authenticate: async () => actor,
    change: async (change: PhotoChange) => changeProductPhoto(change, ports),
    applyCookies: (response: Response) => response,
  };
  return { runtime, state, calls };
}

function planFor(input: {
  operation?: "replace" | "detach";
  expectedVersion?: string;
  image?: BodyInit;
}) {
  const plan = planPhotoEdit({
    itemId,
    expectedVersion: input.expectedVersion ?? "0",
    operation: input.operation ?? "replace",
    ...(input.image !== undefined ? { image: input.image } : {}),
    origin: trustedOrigin,
  });
  if (!plan.ok) throw new Error(`unexpected invalid plan: ${plan.error}`);
  return plan;
}

async function submit(
  testHarness: ReturnType<typeof harness>,
  input: { operation?: "replace" | "detach"; expectedVersion?: string; image?: BodyInit },
) {
  const plan = planFor(input);
  const request = new Request(plan.url, {
    method: plan.method,
    headers: { ...plan.headers, origin: trustedOrigin, host: trustedHost },
    ...(plan.body !== undefined ? { body: plan.body } : {}),
  });
  const response = await handleProductPhotoRequest(request, itemId, {
    trustedOrigin,
    createRuntime: () => testHarness.runtime,
  });
  return { response, outcome: await photoEditOutcome(response) };
}

test("the editor plan carries the expected version and never a caller business", () => {
  const detach = planFor({ operation: "detach", expectedVersion: "7" });
  assert.equal(detach.method, "DELETE");
  assert.equal(detach.url, `${trustedOrigin}/owner/catalog/items/${itemId}/photo`);
  assert.deepEqual(detach.headers, { "x-photo-version": "7" });
  assert.equal(detach.body, undefined);
  assert.equal(detach.url.includes(businessId), false);

  const replace = planFor({ operation: "replace", expectedVersion: "7", image: webp });
  assert.equal(replace.method, "PUT");
  assert.deepEqual(replace.headers, { "x-photo-version": "7", "content-type": "image/webp" });
  assert.equal(replace.body, webp);
});

test("a missing session surfaces as a clear unauthorized outcome with no write", async () => {
  const testHarness = harness({ actor: null });
  const { response, outcome } = await submit(testHarness, { operation: "replace", image: webp });
  assert.equal(response.status, 401);
  assert.deepEqual(outcome, { kind: "unauthorized" });
  assert.match(photoEditMessage(outcome), /sesión/i);
  assert.equal(testHarness.calls.normalize + testHarness.calls.upload + testHarness.calls.commit, 0);
});

test("an unknown or foreign item surfaces as not_found with no image work", async () => {
  const testHarness = harness({ owned: false });
  const { response, outcome } = await submit(testHarness, { operation: "replace", image: webp });
  assert.equal(response.status, 404);
  assert.deepEqual(outcome, { kind: "not_found" });
  assert.match(photoEditMessage(outcome), /producto/i);
  assert.equal(testHarness.calls.normalize + testHarness.calls.upload + testHarness.calls.commit, 0);
});

test("an invalid image surfaces as invalid_image with no upload or commit", async () => {
  const testHarness = harness({
    normalize: async (): Promise<never> => { throw new PhotoNormalizationError("invalid_input"); },
  });
  const { response, outcome } = await submit(testHarness, { operation: "replace", image: webp });
  assert.equal(response.status, 422);
  assert.deepEqual(outcome, { kind: "invalid_image" });
  assert.equal(testHarness.calls.upload + testHarness.calls.commit, 0);
});

test("an oversized image surfaces as input_too_large without touching the image ports", async () => {
  const testHarness = harness();
  const plan = planFor({ operation: "replace", image: webp });
  const request = {
    method: plan.method,
    url: plan.url,
    headers: new Headers({
      ...plan.headers,
      origin: trustedOrigin,
      host: trustedHost,
      "content-length": String(maxInputBytes + 1),
    }),
    body: plan.body,
  } as unknown as Request;
  const response = await handleProductPhotoRequest(request, itemId, {
    trustedOrigin,
    createRuntime: () => testHarness.runtime,
  });
  assert.equal(response.status, 413);
  assert.deepEqual(await photoEditOutcome(response), { kind: "input_too_large" });
  assert.equal(testHarness.calls.normalize + testHarness.calls.upload + testHarness.calls.commit, 0);
});

test("a stale expected version surfaces as a conflict without overwriting", async () => {
  const testHarness = harness({ version: "2" });
  const { response, outcome } = await submit(testHarness, { operation: "replace", expectedVersion: "0", image: webp });
  assert.equal(response.status, 409);
  assert.deepEqual(outcome, { kind: "conflict" });
  assert.match(photoEditMessage(outcome), /cambió/i);
  assert.equal(testHarness.state.photoVersion, "2");
  assert.equal(testHarness.calls.normalize + testHarness.calls.upload + testHarness.calls.commit, 0);
});

test("a Storage failure surfaces as unavailable and never claims success", async () => {
  const testHarness = harness({
    upload: async (): Promise<never> => { throw new PhotoSupabaseError("storage_error"); },
  });
  const { response, outcome } = await submit(testHarness, { operation: "replace", image: webp });
  assert.equal(response.status, 503);
  assert.deepEqual(outcome, { kind: "unavailable" });
  assert.equal(testHarness.calls.commit, 0);
  assert.equal(testHarness.state.photoPath, null);
});

test("a successful replace advances the version and carries the new path", async () => {
  const testHarness = harness();
  const { response, outcome } = await submit(testHarness, { operation: "replace", expectedVersion: "0", image: webp });
  assert.equal(response.status, 200);
  assert.equal(outcome.kind, "replaced");
  assert.match(
    (outcome as { photoPath: string }).photoPath,
    new RegExp(`^${businessId}/${itemId}/[0-9a-f-]{36}[.]webp$`),
  );
  assert.equal((outcome as { photoVersion: string }).photoVersion, "1");
  assert.equal(testHarness.state.photoVersion, "1");
  assert.match(photoEditMessage(outcome), /actualizada/i);
  assert.equal(testHarness.calls.commit, 1);
});

test("a successful detach clears the path, advances the version and keeps object history", async () => {
  const testHarness = harness({ version: "1" });
  testHarness.state.photoPath = `${businessId}/${itemId}/11111111-1111-4111-8111-111111111111.webp`;
  const { response, outcome } = await submit(testHarness, { operation: "detach", expectedVersion: "1" });
  assert.equal(response.status, 200);
  assert.deepEqual(outcome, { kind: "detached", photoPath: null, photoVersion: "2" });
  assert.equal(testHarness.state.photoVersion, "2");
  assert.match(photoEditMessage(outcome), /quitada/i);
  assert.equal(testHarness.calls.normalize + testHarness.calls.upload, 0);
});

test("a missing photo stays an honest missing photo", () => {
  assert.equal(describePhotoState({ photoPath: null, photoVersion: "0" }), "Sin foto (versión 0)");
  assert.equal(
    describePhotoState({ photoPath: `${businessId}/${itemId}/x.webp`, photoVersion: "4" }),
    "Con foto (versión 4)",
  );
});
