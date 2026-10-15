import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";

register(`data:text/javascript,${encodeURIComponent(`
  export async function resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,export default undefined", shortCircuit: true };
    }
    if (specifier.startsWith(".") && !specifier.endsWith(".ts") && context.parentURL.includes("/apps/web/")) {
      return nextResolve(specifier + ".ts", context);
    }
    return nextResolve(specifier, context);
  }
`)}`, import.meta.url);

const { changeProductPhoto } = await import("../app/lib/product-photo-service.ts");
const { PhotoNormalizationError } = await import("../app/lib/product-photo-normalizer.ts");
const { PhotoSupabaseError } = await import("../app/lib/product-photo-supabase.ts");
const { handleProductPhotoRequest, createPhotoRouteHandlers } = await import("../app/lib/product-photo-http.ts");
const { createPhotoRuntime } = await import("../app/lib/product-photo-runtime.ts");
const routeExports = await import("../app/owner/catalog/items/[itemId]/photo/route.ts");

const origin = "https://qwerty.example";
const itemId = "22222222-2222-4222-8222-222222222222";
const businessId = "11111111-1111-4111-8111-111111111111";
const actorId = "33333333-3333-4333-8333-333333333333";
const oldPath = `${businessId}/${itemId}/old.webp`;
const maxInputBytes = 4 * 1024 * 1024;

function requestFor({
  method = "PUT",
  item = itemId,
  version = "0",
  body = new Uint8Array([1, 2, 3]),
  headers = {},
  url = "https://qwerty.example/owner/catalog/items/photo",
} = {}) {
  const init = {
    method,
    headers: {
      origin,
      host: "qwerty.example",
      "x-photo-version": version,
      ...headers,
    },
  };
  for (const [name, value] of Object.entries(init.headers)) {
    if (value === undefined) delete init.headers[name];
  }
  if (body !== undefined && body !== null && method !== "GET" && method !== "HEAD") {
    init.body = body;
    if (body instanceof ReadableStream) init.duplex = "half";
  }
  return { request: new Request(url, init), item };
}

function streamBody(chunks) {
  let index = 0;
  let cancelled = false;
  const stream = new ReadableStream({
    pull(controller) {
      if (index === chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(chunks[index++]);
    },
    cancel() {
      cancelled = true;
    },
  });
  return { stream, wasCancelled: () => cancelled };
}

function cancellableBody(chunks) {
  let index = 0;
  let cancelled = false;
  return {
    body: {
      getReader() {
        return {
          async read() {
            if (index === chunks.length) return { done: true, value: undefined };
            return { done: false, value: chunks[index++] };
          },
          async cancel() {
            cancelled = true;
          },
          releaseLock() {},
        };
      },
    },
    wasCancelled: () => cancelled,
  };
}

function fakeRuntime({
  authenticatedUserId = actorId,
  initialVersion = "0",
  initialPath = null,
  owned = true,
  normalize = async (bytes) => ({
    buffer: Buffer.from([0x57, 0x45, 0x42, 0x50]),
    contentType: "image/webp",
    width: 1,
    height: 1,
    bytes: 4,
    sourceBytes: bytes.byteLength,
  }),
  commitResult = true,
  applyCookie = false,
} = {}) {
  const state = {
    photoPath: initialPath,
    photoVersion: initialVersion,
    objects: initialPath ? [{ path: initialPath, bytes: new Uint8Array([9]) }] : [],
  };
  const calls = {
    authenticate: 0,
    change: 0,
    owned: 0,
    normalize: 0,
    upload: 0,
    commit: 0,
    appliedCookies: 0,
    uploadedPaths: [],
  };
  const ports = {
    authenticatedUserId: async () => authenticatedUserId,
    ownedItem: async (requestedItem, requestedActor) => {
      calls.owned += 1;
      assert.equal(requestedItem, itemId);
      assert.equal(requestedActor, actorId);
      if (!owned) return null;
      return { businessId, photoVersion: state.photoVersion };
    },
    normalize: async (bytes) => {
      calls.normalize += 1;
      return normalize(bytes);
    },
    upload: async (path, bytes, options) => {
      calls.upload += 1;
      assert.equal(options.contentType, "image/webp");
      assert.equal(options.upsert, false);
      calls.uploadedPaths.push(path);
      state.objects.push({ path, bytes: new Uint8Array(bytes) });
    },
    commit: async (change) => {
      calls.commit += 1;
      if (commitResult !== true) return commitResult;
      state.photoPath = change.photoPath;
      state.photoVersion = change.nextVersion;
      return true;
    },
  };
  const runtime = {
    authenticate: async () => {
      calls.authenticate += 1;
      return authenticatedUserId;
    },
    change: async (change) => {
      calls.change += 1;
      return changeProductPhoto(change, ports);
    },
    applyCookies: (response) => {
      calls.appliedCookies += 1;
      if (applyCookie) response.headers.append("set-cookie", "qwerty_refresh=in-memory; HttpOnly");
      return response;
    },
  };
  return { runtime, calls, state };
}

function invoke(harness, input = {}) {
  const { trustedOrigin = origin, ...requestInput } = input;
  const { request, item } = requestFor(requestInput);
  return handleProductPhotoRequest(request, item, {
    trustedOrigin,
    createRuntime: () => harness.runtime,
  });
}

async function json(response) {
  return response.json();
}

function assertPrivate(response) {
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("expires"), "0");
  assert.equal(response.headers.get("pragma"), "no-cache");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("content-type"), "application/json");
}

function assertBodyless(response) {
  assert.equal(response.body, null);
}

test("unsupported methods return the frozen Allow contract and HEAD has no body", async () => {
  const harness = fakeRuntime();
  for (const method of ["POST", "PATCH", "OPTIONS", "HEAD"]) {
    const response = await invoke(harness, { method });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("allow"), "PUT, DELETE");
    assertPrivate(response);
    if (method === "HEAD") {
      assertBodyless(response);
    } else {
      assert.deepEqual(await json(response), { error: "method_not_allowed" });
    }
  }
  assert.equal(harness.calls.authenticate, 0);
});

test("rejects forged origin, host, forwarded host and forwarded protocol before authentication", async () => {
  for (const headers of [
    { origin: "https://evil.example" },
    { host: "evil.example" },
    { "x-forwarded-host": "evil.example" },
    { "x-forwarded-proto": "http" },
  ]) {
    const harness = fakeRuntime();
    const response = await invoke(harness, { headers });
    assert.equal(response.status, 403);
    assert.deepEqual(await json(response), { error: "request_rejected" });
    assertPrivate(response);
    assert.equal(harness.calls.authenticate, 0);
    assert.equal(harness.calls.change, 0);
  }

  const localProxy = fakeRuntime();
  const local = requestFor({
    url: "https://127.0.0.1:3000/internal/photo",
    headers: {
      host: "qwerty.example",
      "x-forwarded-host": "qwerty.example",
      "x-forwarded-proto": "https",
    },
  });
  const accepted = await handleProductPhotoRequest(local.request, itemId, {
    trustedOrigin: origin,
    createRuntime: () => localProxy.runtime,
  });
  assert.equal(accepted.status, 200);
  assert.equal(localProxy.calls.authenticate, 1);
});

test("actual route exports reject unsupported methods with private headers and no body for HEAD", async () => {
  const expectedExports = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT", "dynamic", "runtime"];
  assert.deepEqual(Object.keys(routeExports).sort(), expectedExports);
  for (const method of ["GET", "POST", "PATCH", "OPTIONS", "HEAD"]) {
    const { request } = requestFor({ method, body: null });
    const response = await routeExports[method](request, { params: Promise.resolve({ itemId }) });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("allow"), "PUT, DELETE");
    assertPrivate(response);
    if (method === "HEAD") assertBodyless(response);
    else assert.deepEqual(await json(response), { error: "method_not_allowed" });
  }
});

test("missing trusted site configuration is unavailable before runtime and body access", async () => {
  const body = streamBody([new Uint8Array([1, 2, 3])]);
  let runtimeCalls = 0;
  const response = await invoke({
    runtime: {
      authenticate: async () => { runtimeCalls += 1; return actorId; },
      change: async () => { runtimeCalls += 1; throw new Error("must not run"); },
      applyCookies: (value) => value,
    },
  }, { trustedOrigin: null, body: body.stream });
  assert.equal(response.status, 503);
  assert.deepEqual(await json(response), { error: "unavailable" });
  assertPrivate(response);
  assert.equal(runtimeCalls, 0);
  assert.equal(body.wasCancelled(), false);
});

test("invalid trusted site configuration is unavailable before runtime and body access", async () => {
  const body = streamBody([new Uint8Array([1])]);
  const invalid = requestFor({ body: body.stream });
  const unavailable = await handleProductPhotoRequest(invalid.request, itemId, {
    trustedOrigin: "https://qwerty.example/photo",
    createRuntime: () => { throw new Error("must not run"); },
  });
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await json(unavailable), { error: "unavailable" });
  assertPrivate(unavailable);
  assert.equal(body.wasCancelled(), false);
});

test("typed normalization invalid_input maps to invalid_image", async () => {
  const normalized = fakeRuntime({
    normalize: async () => { throw new PhotoNormalizationError("invalid_input"); },
  });
  const normalizationResponse = await invoke(normalized, { body: new Uint8Array([1]) });
  assert.equal(normalizationResponse.status, 422);
  assert.deepEqual(await json(normalizationResponse), { error: "invalid_image" });
  assertPrivate(normalizationResponse);
});

test("typed adapter authentication and forged code properties map to unavailable", async () => {
  const adapter = fakeRuntime();
  adapter.runtime.change = async () => { throw new PhotoSupabaseError("authentication_failed"); };
  const adapterResponse = await invoke(adapter, { body: new Uint8Array([1]) });
  assert.equal(adapterResponse.status, 503);
  assert.deepEqual(await json(adapterResponse), { error: "unavailable" });
  assertPrivate(adapterResponse);

  for (const forged of [{ code: "unauthorized" }, { code: "conflict" }, { code: "invalid_input" }]) {
    const forgedRuntime = fakeRuntime();
    forgedRuntime.runtime.change = async () => { throw forged; };
    const forgedResponse = await invoke(forgedRuntime, { body: new Uint8Array([1]) });
    assert.equal(forgedResponse.status, 503);
    assert.deepEqual(await json(forgedResponse), { error: "unavailable" });
    assertPrivate(forgedResponse);
  }
});

test("missing identity is rejected before body consumption and does not propagate cookies", async () => {
  const body = streamBody([new Uint8Array([1, 2, 3])]);
  const harness = fakeRuntime({ authenticatedUserId: null, applyCookie: true });
  const response = await invoke(harness, { body: body.stream });
  assert.equal(response.status, 401);
  assert.deepEqual(await json(response), { error: "unauthorized" });
  assertPrivate(response);
  assert.equal(response.headers.has("set-cookie"), false);
  assert.equal(harness.calls.change, 0);
  assert.equal(harness.calls.appliedCookies, 0);
  assert.equal(body.wasCancelled(), false);
});

test("malformed item/version, empty PUT, and nonempty DELETE preserve state and avoid service calls", async () => {
  const harness = fakeRuntime({ initialVersion: "7", initialPath: oldPath });
  const before = structuredClone(harness.state);
  for (const input of [
    { item: "not-an-item" },
    { version: "01" },
    { version: "-1" },
    { version: "9223372036854775807" },
    { body: new Uint8Array() },
  ]) {
    const response = await invoke(harness, input);
    assert.equal(response.status, 400);
    assert.deepEqual(await json(response), { error: "invalid_input" });
    assertPrivate(response);
    assert.deepEqual(harness.state, before);
  }
  const deleteResponse = await invoke(harness, {
    method: "DELETE",
    version: "7",
    body: new Uint8Array([8]),
  });
  assert.equal(deleteResponse.status, 400);
  assert.deepEqual(await json(deleteResponse), { error: "invalid_input" });
  assert.deepEqual(harness.state, before);
  assert.equal(harness.calls.change, 0);
  assert.equal(harness.calls.upload, 0);
  assert.equal(harness.calls.commit, 0);
});

test("counts actual bytes when Content-Length is absent or false and rejects a lying length", async () => {
  const harness = fakeRuntime();
  const absent = streamBody([new Uint8Array([1, 2, 3])]);
  const accepted = await invoke(harness, {
    body: absent.stream,
    headers: { "content-length": undefined },
  });
  assert.equal(accepted.status, 200);
  assert.equal(harness.calls.change, 1);

  const falseLength = streamBody([new Uint8Array([4, 5, 6])]);
  const mismatch = await invoke(fakeRuntime(), {
    body: falseLength.stream,
    headers: { "content-length": "4" },
  });
  assert.equal(mismatch.status, 400);
  assert.deepEqual(await json(mismatch), { error: "invalid_input" });
  assertPrivate(mismatch);
  assert.equal(falseLength.wasCancelled(), false);
});

test("rejects declared oversize before allocation and cancels actual oversize streams", async () => {
  const declared = fakeRuntime();
  const declaredBody = streamBody([new Uint8Array([1])]);
  const declaredResponse = await invoke(declared, {
    body: declaredBody.stream,
    headers: { "content-length": String(maxInputBytes + 1) },
  });
  assert.equal(declaredResponse.status, 413);
  assert.deepEqual(await json(declaredResponse), { error: "input_too_large" });
  assertPrivate(declaredResponse);
  assert.equal(declared.calls.change, 0);
  assert.equal(declaredBody.wasCancelled(), false);

  const oversized = fakeRuntime();
  const oversizedBody = cancellableBody([
    new Uint8Array(maxInputBytes),
    new Uint8Array([1]),
  ]);
  const oversizedRequest = {
    method: "PUT",
    url: "https://qwerty.example/owner/catalog/items/photo",
    headers: new Headers({ origin, host: "qwerty.example", "x-photo-version": "0" }),
    body: oversizedBody.body,
  };
  const actualResponse = await handleProductPhotoRequest(oversizedRequest, itemId, {
    trustedOrigin: origin,
    createRuntime: () => oversized.runtime,
  });
  assert.equal(actualResponse.status, 413);
  assert.deepEqual(await json(actualResponse), { error: "input_too_large" });
  assertPrivate(actualResponse);
  assert.equal(oversizedBody.wasCancelled(), true);
  assert.equal(oversized.calls.change, 0);
});

test("handler composes the real photo runtime with injected in-memory SDK ports", async () => {
  const calls = { publicClients: 0, privateClients: 0, rpc: [], uploads: 0 };
  const fakeClient = {
    rpc: async (name, args) => {
      calls.rpc.push({ name, args });
      if (name === "get_owned_product_photo") {
        return { data: [{ business_id: businessId, photo_version: "0" }], error: null };
      }
      return { data: true, error: null };
    },
    storage: {
      from(bucket) {
        assert.equal(bucket, "product-photos");
        return {
          upload: async (path, bytes, options) => {
            calls.uploads += 1;
            assert.equal(options.upsert, false);
            assert.equal(options.contentType, "image/webp");
            assert.equal(bytes.byteLength, 4);
            return { data: { path }, error: null };
          },
        };
      },
    },
  };
  const { request } = requestFor({ version: "0", body: new Uint8Array([1, 2, 3]) });
  const runtime = createPhotoRuntime(request, {
    getConfig: () => ({ url: "https://supabase.test", anonKey: "sb_publishable_in_memory" }),
    getPrivateKey: () => "sb_secret_in_memory",
    createPublicClient: () => {
      calls.publicClients += 1;
      return {
        auth: {
          getUser: async () => ({
            data: { user: { id: actorId, email_confirmed_at: "2026-01-01T00:00:00.000Z" } },
            error: null,
          }),
        },
      };
    },
    createPrivateClient: () => {
      calls.privateClients += 1;
      return fakeClient;
    },
    normalize: async () => ({
      buffer: Buffer.from([0x57, 0x45, 0x42, 0x50]),
      contentType: "image/webp",
      width: 1,
      height: 1,
      bytes: 4,
    }),
  });
  const response = await handleProductPhotoRequest(request, itemId, {
    trustedOrigin: origin,
    createRuntime: () => runtime,
  });
  assert.equal(response.status, 200);
  assertPrivate(response);
  const result = await json(response);
  assert.equal(result.photoVersion, "1");
  assert.equal(calls.publicClients, 1);
  assert.equal(calls.privateClients, 1);
  assert.equal(calls.uploads, 1);
  assert.deepEqual(calls.rpc.map(({ name }) => name), [
    "get_owned_product_photo",
    "commit_product_photo",
  ]);
});

test("PUT attaches a first photo and replaces it through the same authenticated boundary", async () => {
  const harness = fakeRuntime();
  const attached = await invoke(harness, { version: "0", body: new Uint8Array([1, 2, 3]) });
  assert.equal(attached.status, 200);
  assertPrivate(attached);
  const attachedBody = await json(attached);
  assert.equal(attachedBody.photoVersion, "1");
  assert.match(attachedBody.photoPath, new RegExp(`^${businessId}/${itemId}/[0-9a-f-]{36}\\.webp$`));
  assert.equal(harness.calls.normalize, 1);
  assert.equal(harness.calls.upload, 1);
  assert.equal(harness.calls.commit, 1);
  assert.deepEqual(harness.state.photoPath, attachedBody.photoPath);

  const replaced = await invoke(harness, { version: "1", body: new Uint8Array([4, 5, 6]) });
  assert.equal(replaced.status, 200);
  const replacedBody = await json(replaced);
  assert.equal(replacedBody.photoVersion, "2");
  assert.notEqual(replacedBody.photoPath, attachedBody.photoPath);
  assert.equal(harness.calls.normalize, 2);
  assert.equal(harness.calls.upload, 2);
  assert.equal(harness.calls.commit, 2);
  assert.equal(harness.state.objects.length, 2);
  assertPrivate(replaced);
});

test("DELETE detaches only the catalog reference and preserves public objects", async () => {
  const harness = fakeRuntime({ initialVersion: "7", initialPath: oldPath });
  const beforeObjects = structuredClone(harness.state.objects);
  const response = await invoke(harness, {
    method: "DELETE",
    version: "7",
    body: null,
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await json(response), { photoPath: null, photoVersion: "8" });
  assert.equal(harness.calls.normalize, 0);
  assert.equal(harness.calls.upload, 0);
  assert.deepEqual(harness.state.objects, beforeObjects);
  assert.equal(harness.state.photoPath, null);
  assert.equal(harness.state.photoVersion, "8");
});

test("normalization rejection maps to invalid_image without upload or metadata writes", async () => {
  const harness = fakeRuntime({
    normalize: async () => { throw new PhotoNormalizationError("unsupported_format"); },
  });
  const before = structuredClone(harness.state);
  const response = await invoke(harness, { body: new Uint8Array([9, 9]) });
  assert.equal(response.status, 422);
  assert.deepEqual(await json(response), { error: "invalid_image" });
  assertPrivate(response);
  assert.deepEqual(harness.state, before);
  assert.equal(harness.calls.normalize, 1);
  assert.equal(harness.calls.upload, 0);
  assert.equal(harness.calls.commit, 0);
});

test("non-owner and stale versions are rejected before normalization, and a lost CAS race cannot report success", async () => {
  const nonOwner = fakeRuntime({ owned: false });
  const nonOwnerResponse = await invoke(nonOwner, { version: "0", body: new Uint8Array([1]) });
  assert.equal(nonOwnerResponse.status, 404);
  assert.deepEqual(await json(nonOwnerResponse), { error: "not_found" });
  assert.equal(nonOwner.calls.normalize, 0);
  assert.equal(nonOwner.calls.upload, 0);
  assert.equal(nonOwner.calls.commit, 0);

  const stale = fakeRuntime({ initialVersion: "8" });
  const staleResponse = await invoke(stale, { version: "7", body: new Uint8Array([1]) });
  assert.equal(staleResponse.status, 409);
  assert.deepEqual(await json(staleResponse), { error: "conflict" });
  assert.equal(stale.calls.normalize, 0);
  assert.equal(stale.calls.upload, 0);
  assert.equal(stale.calls.commit, 0);

  const race = fakeRuntime({ initialVersion: "7", commitResult: false });
  const before = structuredClone(race.state);
  const raceResponse = await invoke(race, { version: "7", body: new Uint8Array([1]) });
  assert.equal(raceResponse.status, 409);
  assert.deepEqual(await json(raceResponse), { error: "conflict" });
  assert.deepEqual(
    { photoPath: race.state.photoPath, photoVersion: race.state.photoVersion },
    { photoPath: before.photoPath, photoVersion: before.photoVersion },
  );
  assert.equal(race.state.objects.length, before.objects.length + 1);
  assert.equal(race.calls.normalize, 1);
  assert.equal(race.calls.upload, 1);
  assert.equal(race.calls.commit, 1);
});

test("upstream failures are sanitized and unexpected cookies are not exposed before verification", async () => {
  const unavailable = fakeRuntime({
    normalize: async () => { throw new Error("provider secret and raw storage detail"); },
    applyCookie: true,
  });
  const response = await invoke(unavailable, { body: new Uint8Array([1]) });
  assert.equal(response.status, 503);
  assert.deepEqual(await json(response), { error: "unavailable" });
  assertPrivate(response);
  assert.equal(response.headers.get("set-cookie"), "qwerty_refresh=in-memory; HttpOnly");

  const denied = fakeRuntime({ authenticatedUserId: null, applyCookie: true });
  const deniedResponse = await invoke(denied, { body: new Uint8Array([1]) });
  assert.equal(deniedResponse.status, 401);
  assert.equal(deniedResponse.headers.has("set-cookie"), false);
  assert.equal(denied.calls.appliedCookies, 0);
});

test("route handlers await Next 16 params and expose the public PUT/DELETE seam", async () => {
  const harness = fakeRuntime({ initialVersion: "0" });
  const handlers = createPhotoRouteHandlers({
    trustedOrigin: origin,
    createRuntime: () => harness.runtime,
  });
  const { request } = requestFor({ version: "0", body: new Uint8Array([1]) });
  const put = await handlers.PUT(request, { params: Promise.resolve({ itemId }) });
  assert.equal(put.status, 200);
  assert.equal((await put.json()).photoVersion, "1");

  const { request: deleteRequest } = requestFor({ method: "DELETE", version: "1", body: null });
  const del = await handlers.DELETE(deleteRequest, { params: Promise.resolve({ itemId }) });
  assert.equal(del.status, 200);
  assert.deepEqual(await del.json(), { photoPath: null, photoVersion: "2" });
});
