import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import test from "node:test";
import { parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";

register(`data:text/javascript,${encodeURIComponent(`
  export async function resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,", shortCircuit: true };
    }
    if (specifier.startsWith(".") && !/[.](?:m?js|c?js|json|ts|tsx)$/.test(specifier)) {
      return nextResolve(specifier + ".ts", context);
    }
    return nextResolve(specifier, context);
  }
`)}`, import.meta.url);

const { changeProductPhoto, PhotoChangeError } = await import("../app/lib/product-photo-service.ts");
const { createPhotoRuntime, PhotoRuntimeError } = await import("../app/lib/product-photo-runtime.ts");
const { AuthSessionMissingError, isAuthSessionMissingError } = await import("@supabase/supabase-js");
const { PhotoSupabaseError } = await import("../app/lib/product-photo-supabase.ts");

const itemId = "22222222-2222-4222-8222-222222222222";
const businessId = "11111111-1111-4111-8111-111111111111";
const actorId = "33333333-3333-4333-8333-333333333333";
const otherActorId = "44444444-4444-4444-8444-444444444444";
const publicConfig = { url: "https://project.invalid", anonKey: "sb_publishable_invented" };
const privateKey = "sb_secret_invented";

function responseFor(user, { error = null, refresh = false } = {}) {
  return {
    data: { user },
    error,
    refresh,
  };
}

function runtimeHarness({ user = { id: actorId, email_confirmed_at: "2026-01-01T00:00:00Z" }, getUserError = null, getUserResult, uploadResponse, normalize, privateClientOverrides = {} } = {}) {
  const calls = { publicClients: 0, privateClients: 0, getUser: 0, rpc: [], uploads: [] };
  let publicCookieHooks;
  const publicClient = {
    auth: {
      async getUser() {
        calls.getUser += 1;
        publicCookieHooks?.setAll?.([
          { name: "sb-access-token", value: "refreshed", options: { path: "/", httpOnly: true, maxAge: 60 } },
        ], { "Cache-Control": "private, no-store" });
        return getUserResult ?? responseFor(user, { error: getUserError });
      },
    },
  };
  const privateClient = {
    rpc: async (name, args) => {
      calls.rpc.push({ name, args });
      if (name === "get_owned_product_photo") {
        return { data: [{ business_id: businessId, photo_version: "7" }], error: null };
      }
      return { data: true, error: null };
    },
    storage: {
      from(bucket) {
        return {
          async upload(path, bytes, options) {
            calls.uploads.push({ bucket, path, bytes, options });
            return uploadResponse ?? { data: { path }, error: null };
          },
        };
      },
    },
    ...privateClientOverrides,
  };

  return {
    calls,
    privateClient,
    options: {
      getConfig: () => publicConfig,
      getPrivateKey: () => privateKey,
      createPublicClient: (_url, _key, cookies) => {
        calls.publicClients += 1;
        publicCookieHooks = cookies;
        return publicClient;
      },
      createPrivateClient: (url, key, options) => {
        calls.privateClients += 1;
        calls.privateArgs = { url, key, options };
        return privateClient;
      },
      ...(normalize ? { normalize } : {}),
    },
  };
}

async function assertRuntimeError(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof PhotoRuntimeError);
    assert.equal(error.code, code);
    assert.doesNotMatch(error.message, /secret|provider|raw/i);
    return true;
  });
}

test("server-only marker and browser guard run before configuration or SDK effects", () => {
  const source = readFileSync(new URL("../app/lib/product-photo-runtime.ts", import.meta.url), "utf8");
  assert.match(source, /import ["']server-only["'];/);

  let configCalls = 0;
  let secretCalls = 0;
  let publicFactoryCalls = 0;
  let privateFactoryCalls = 0;
  const h = runtimeHarness();
  h.options.getConfig = () => { configCalls += 1; return publicConfig; };
  h.options.getPrivateKey = () => { secretCalls += 1; return privateKey; };
  h.options.createPublicClient = () => { publicFactoryCalls += 1; throw new Error("browser must stop"); };
  h.options.createPrivateClient = () => { privateFactoryCalls += 1; throw new Error("browser must stop"); };
  globalThis.window = { document: {} };
  try {
    assert.throws(
      () => createPhotoRuntime(new Request("https://qwerty.invalid/photo"), h.options),
      (error) => error instanceof PhotoRuntimeError && error.code === "unavailable",
    );
  } finally {
    delete globalThis.window;
  }
  assert.deepEqual({ configCalls, secretCalls, publicFactoryCalls, privateFactoryCalls }, {
    configCalls: 0, secretCalls: 0, publicFactoryCalls: 0, privateFactoryCalls: 0,
  });
});

test("authenticate throws sanitized unavailable for missing config, transport errors, malformed envelopes, and anonymous flags", async () => {
  const missing = runtimeHarness();
  missing.options.getConfig = () => null;
  await assertRuntimeError(createPhotoRuntime(new Request("https://qwerty.invalid/photo"), missing.options).authenticate(), "unavailable");

  const missingSessionError = new AuthSessionMissingError();
  assert.equal(isAuthSessionMissingError(missingSessionError), true);
  const missingSession = runtimeHarness({ getUserResult: { data: { user: null }, error: missingSessionError } });
  assert.equal(await createPhotoRuntime(new Request("https://qwerty.invalid/photo"), missingSession.options).authenticate(), null);

  const transport = runtimeHarness({ getUserError: new Error("provider secret") });
  await assertRuntimeError(createPhotoRuntime(new Request("https://qwerty.invalid/photo"), transport.options).authenticate(), "unavailable");

  const malformed = runtimeHarness({ getUserResult: { data: { user: { id: actorId, email_confirmed_at: "2026-01-01T00:00:00Z" } } } });
  await assertRuntimeError(createPhotoRuntime(new Request("https://qwerty.invalid/photo"), malformed.options).authenticate(), "unavailable");

  const anonymousFlag = runtimeHarness({
    getUserResult: { data: { user: { id: actorId, email_confirmed_at: "2026-01-01T00:00:00Z", is_anonymous: true } }, error: null },
  });
  assert.equal(await createPhotoRuntime(new Request("https://qwerty.invalid/photo"), anonymousFlag.options).authenticate(), null);

  for (const user of [null, { id: actorId, email_confirmed_at: null }]) {
    const h = runtimeHarness({ user });
    assert.equal(await createPhotoRuntime(new Request("https://qwerty.invalid/photo"), h.options).authenticate(), null);
  }
});

test("verified request snapshots one public config for the private client", async () => {
  const alternateConfig = { url: "https://other-project.invalid", anonKey: "sb_publishable_other" };
  let configCalls = 0;
  const h = runtimeHarness();
  h.options.getConfig = () => configCalls++ === 0 ? publicConfig : alternateConfig;
  const runtime = createPhotoRuntime(new Request("https://qwerty.invalid/photo"), h.options);
  assert.equal(await runtime.authenticate(), actorId);
  await runtime.change({ itemId, expectedVersion: "7", operation: "detach" });
  assert.equal(configCalls, 1);
  assert.equal(h.calls.privateArgs.url, publicConfig.url);
});

test("private client rejects blank, public, and non-modern keys before factory or writes", async () => {
  for (const key of ["", "   ", "sb_publishable_not-secret", "eyJhbGciOiJub25lIn0.fake.anon"]) {
    const h = runtimeHarness();
    h.options.getPrivateKey = () => key;
    const runtime = createPhotoRuntime(new Request("https://qwerty.invalid/photo"), h.options);
    await assertRuntimeError(runtime.change({ itemId, expectedVersion: "7", operation: "detach" }), "unavailable");
    assert.equal(h.calls.privateClients, 0);
    assert.equal(h.calls.rpc.length, 0);
  }
});

test("GET_USER rejection and malformed identity become unavailable without private-client effects", async () => {
  for (const scenario of [
    { getUserError: new Error("provider secret") },
    { user: { email_confirmed_at: "2026-01-01T00:00:00Z" } },
    { user: { id: "not-a-uuid", email_confirmed_at: "2026-01-01T00:00:00Z" } },
  ]) {
    const h = runtimeHarness(scenario);
    const runtime = createPhotoRuntime(new Request("https://qwerty.invalid/photo"), h.options);
    await assertRuntimeError(runtime.authenticate(), "unavailable");
    await assertRuntimeError(runtime.change({ itemId, expectedVersion: "7", operation: "detach" }), "unavailable");
    assert.equal(h.calls.privateClients, 0);
    assert.equal(h.calls.rpc.length, 0);
  }
});

test("anonymous and unconfirmed sessions are unauthorized before private access", async () => {
  for (const user of [null, { id: actorId, email_confirmed_at: null }]) {
    const h = runtimeHarness({ user });
    const runtime = createPhotoRuntime(new Request("https://qwerty.invalid/photo"), h.options);
    assert.equal(await runtime.authenticate(), null);
    await assert.rejects(
      runtime.change({ itemId, expectedVersion: "7", operation: "detach" }),
      (error) => error instanceof PhotoChangeError && error.code === "unauthorized",
    );
    const response = runtime.applyCookies(new Response(null, { status: 204 }));
    assert.equal(response.headers.has("set-cookie"), false);
    assert.equal(h.calls.privateClients, 0);
    assert.equal(h.calls.rpc.length, 0);
  }
});

test("request cookies and staged cookies use the installed SSR helpers and final security headers cannot be weakened", async () => {
  const requestCookie = "encoded%2Dname=hello%20world; spaced= value%3Bsemi";
  const observed = { initial: null };
  const staged = [
    { name: "cookie-name", value: " value;semi", options: { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 } },
    { name: "second", value: "two", options: { secure: true, sameSite: "none" } },
  ];
  const h = runtimeHarness();
  h.options.createPublicClient = (_url, _key, cookies) => ({
    auth: {
      async getUser() {
        observed.initial = cookies.getAll();
        cookies.setAll(staged, {
          "Cache-Control": "public, max-age=999",
          Pragma: "public",
          Expires: "2099",
          "X-Provider-Leak": "must-not-forward",
        });
        return { data: { user: { id: actorId, email_confirmed_at: "2026-01-01T00:00:00Z" } }, error: null };
      },
    },
  });
  const runtime = createPhotoRuntime(new Request("https://qwerty.invalid/photo", { headers: { cookie: requestCookie } }), h.options);
  await runtime.authenticate();
  assert.deepEqual(observed.initial, parseCookieHeader(requestCookie));
  const response = runtime.applyCookies(new Response(null, { status: 204 }));
  assert.match(response.headers.get("set-cookie") ?? "", new RegExp(serializeCookieHeader(staged[0].name, staged[0].value, staged[0].options).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(response.headers.get("set-cookie") ?? "", /second=two/);
  assert.equal(response.headers.get("cache-control"), "private, no-store, no-cache, max-age=0, must-revalidate");
  assert.equal(response.headers.get("pragma"), "no-cache");
  assert.equal(response.headers.get("expires"), "0");
  assert.equal(response.headers.get("x-provider-leak"), null);
});

test("identity is cached per request and staged cookies apply only to that response after verification", async () => {
  const first = runtimeHarness();
  const runtime = createPhotoRuntime(new Request("https://qwerty.invalid/photo"), first.options);
  const responseBeforeAuth = runtime.applyCookies(new Response(null, { status: 204 }));
  assert.equal(responseBeforeAuth.headers.has("set-cookie"), false);
  assert.equal(await runtime.authenticate(), actorId);
  assert.equal(await runtime.authenticate(), actorId);
  assert.equal(first.calls.getUser, 1);

  const response = runtime.applyCookies(new Response(null, { status: 204 }));
  assert.match(response.headers.get("set-cookie") ?? "", /sb-access-token=refreshed/);
  assert.match(response.headers.get("cache-control") ?? "", /private/);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  assert.equal(response.headers.get("pragma"), "no-cache");
  assert.equal(response.headers.get("expires"), "0");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");

  const second = runtimeHarness();
  const otherRuntime = createPhotoRuntime(new Request("https://qwerty.invalid/photo"), second.options);
  const otherResponse = otherRuntime.applyCookies(new Response(null, { status: 204 }));
  assert.equal(otherResponse.headers.has("set-cookie"), false);
  assert.equal(second.calls.publicClients, 0);
});

test("private client is lazy, has isolated auth settings, and real service/adapter orchestration uses verified actor", async () => {
  const h = runtimeHarness({
    normalize: async (bytes) => ({
      buffer: new Uint8Array(bytes),
      contentType: "image/webp",
      width: 1,
      height: 1,
      bytes: bytes.byteLength,
    }),
  });
  const runtime = createPhotoRuntime(new Request("https://qwerty.invalid/photo"), h.options);
  assert.equal(h.calls.publicClients, 0);
  assert.equal(h.calls.privateClients, 0);
  assert.equal(await runtime.authenticate(), actorId);
  assert.equal(h.calls.privateClients, 0);

  const result = await runtime.change({
    itemId,
    expectedVersion: "7",
    operation: "replace",
    image: new Uint8Array([1, 2, 3]),
  });
  assert.equal(result.photoVersion, "8");
  assert.equal(h.calls.privateClients, 1);
  assert.deepEqual(h.calls.privateArgs, {
    url: publicConfig.url,
    key: privateKey,
    options: { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  });
  assert.deepEqual(h.calls.rpc[0], {
    name: "get_owned_product_photo",
    args: { p_actor_id: actorId, p_item_id: itemId },
  });
  assert.equal(h.calls.rpc[1].args.p_actor_id, actorId);
  assert.notEqual(h.calls.rpc[1].args.p_actor_id, otherActorId);
  assert.equal(h.calls.uploads.length, 1);
});

test("private configuration failure and malformed Storage success are sanitized and side-effect bounded", async () => {
  const missing = runtimeHarness({ normalize: async () => { throw new Error("must not normalize"); } });
  missing.options.getPrivateKey = () => null;
  const missingRuntime = createPhotoRuntime(new Request("https://qwerty.invalid/photo"), missing.options);
  await assertRuntimeError(missingRuntime.change({ itemId, expectedVersion: "7", operation: "detach" }), "unavailable");
  assert.equal(missing.calls.rpc.length, 0);

  const malformed = runtimeHarness({
    normalize: async (bytes) => ({ buffer: new Uint8Array(bytes), contentType: "image/webp", width: 1, height: 1, bytes: bytes.byteLength }),
    uploadResponse: { data: null, error: null },
  });
  const malformedRuntime = createPhotoRuntime(new Request("https://qwerty.invalid/photo"), malformed.options);
  await assert.rejects(
    malformedRuntime.change({ itemId, expectedVersion: "7", operation: "replace", image: new Uint8Array([1]) }),
    (error) => error instanceof PhotoSupabaseError && error.code === "storage_error" &&
      !/provider|secret|raw/i.test(error.message),
  );
  assert.equal(malformed.calls.rpc.length, 1);
  assert.equal(malformed.calls.rpc[1], undefined);
});

test("default runtime binds the canonical normalizer rather than accepting unnormalized bytes", async () => {
  const h = runtimeHarness();
  const runtime = createPhotoRuntime(new Request("https://qwerty.invalid/photo"), h.options);
  await assert.rejects(
    runtime.change({ itemId, expectedVersion: "7", operation: "replace", image: new Uint8Array([1, 2, 3]) }),
    (error) => error?.code === "unsupported_format",
  );
  assert.equal(h.calls.uploads.length, 0);
  assert.equal(h.calls.rpc.length, 1);
});