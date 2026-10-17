import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server.js";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { handleCheckoutSession, type CheckoutDependencies } from "../app/lib/supabase/checkout-session.ts";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { GET } from "../app/api/checkout/session/route.ts";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { readStorefront } from "../app/lib/storefront-reader.ts";

const origin = "https://shop.example.test";
function request(body = '{"slug":"pizza-shop"}', headers: Record<string, string> = {}, method = "POST") {
  return new NextRequest(`${origin}/api/checkout/session`, {
    method, headers: { host: "shop.example.test", origin, "content-type": "application/json", ...headers },
    ...(method === "POST" ? { body } : {}),
  });
}
function fixture(options: { user?: object | null; error?: { name: string }; signupError?: boolean; throws?: boolean; store?: string; config?: boolean; refresh?: boolean } = {}) {
  const counts = { store: 0, client: 0, verify: 0, signup: 0, writes: 0 };
  const dependencies: CheckoutDependencies = {
    getConfig: () => options.config === false ? null : { url: "https://auth.example.test", anonKey: "sb_publishable_test" },
    getOrigin: () => origin,
    readStorefront: async () => {
      counts.store++;
      if (options.store === "throw") throw new Error("store secret");
      return { status: options.store ?? "ok" } as Awaited<ReturnType<CheckoutDependencies["readStorefront"]>>;
    },
    createAuth: (_config, state) => {
      counts.client++;
      const write = () => {
        counts.writes++;
        state.setAll([{ name: "sb-project-auth-token", value: "new-secret", options: { httpOnly: true, path: "/", secure: true, sameSite: "lax" } }], {});
      };
      return {
        getUser: async () => {
          counts.verify++;
          if (options.throws) { write(); throw new Error("network secret"); }
          if (options.error || options.refresh) write(); // Simulate SDK cookie mutations.
          return { data: { user: options.user ?? null }, error: options.error ?? null };
        },
        signInAnonymously: async () => {
          counts.signup++;
          write();
          const user = { id: "private-id", is_anonymous: true, aud: "authenticated", created_at: "2026-01-01T00:00:00Z", app_metadata: {}, user_metadata: {} };
          return {
            data: {
              user: options.signupError ? null : user,
              session: options.signupError ? null : {
                access_token: "synthetic-access-token", refresh_token: "synthetic-refresh-token",
                token_type: "bearer", expires_in: 3600, user,
              },
            },
            error: options.signupError ? { name: "ProviderError" } : null,
          };
        },
      };
    },
  };
  return { counts, dependencies };
}
async function check(response: Response, status: number, payload: object, cookie = false) {
  assert.equal(response.status, status);
  assert.deepEqual(await response.json(), payload);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("pragma"), "no-cache");
  assert.equal(response.headers.get("expires"), "0");
  assert.equal(response.headers.has("set-cookie"), cookie);
}
const rejected = { error: "Request rejected" };
const unavailable = { error: "Checkout session unavailable" };

for (const [identity, user] of Object.entries({ owner: { id: "owner", email: "private@example.test", app_metadata: { role: "owner" } }, registered: { id: "registered", is_anonymous: false }, anonymous: { id: "guest", is_anonymous: true } })) {
  test(`reuses server-verified ${identity} without signup, cookie loss or metadata disclosure`, async () => {
    const f = fixture({ user });
    const req = request(undefined, { cookie: "sb-project-auth-token=existing" });
    await check(await handleCheckoutSession(req, f.dependencies), 200, { ready: true });
    assert.equal(req.cookies.get("sb-project-auth-token")?.value, "existing");
    assert.deepEqual(f.counts, { store: 1, client: 1, verify: 1, signup: 0, writes: 0 });
  });
}
test("genuinely missing session creates once and propagates SSR cookies", async () => {
  const f = fixture({ error: { name: "AuthSessionMissingError" } });
  const req = request();
  const response = await handleCheckoutSession(req, f.dependencies);
  await check(response, 200, { ready: true }, true);
  assert.match(response.headers.get("set-cookie")!, /sb-project-auth-token=new-secret/);
  assert.match(response.headers.get("set-cookie")!, /HttpOnly/);
  assert.equal(req.cookies.get("sb-project-auth-token"), undefined);
  assert.equal(f.counts.signup, 1);
});
for (const body of ["{", "null", "[]", '{"slug":12}', '{"slug":"pizza-shop","email":"x"}', '{"slug":"' + "a".repeat(1024) + '"}']) {
  test(`rejects malformed or unbounded JSON: ${body.slice(0, 40)}`, async () => {
    const f = fixture();
    await check(await handleCheckoutSession(request(body), f.dependencies), 400, rejected);
    assert.deepEqual(f.counts, { store: 0, client: 0, verify: 0, signup: 0, writes: 0 });
  });
}
const untrustedHeaders: Record<string, string>[] = [{ origin: "https://evil.test" }, { origin: "" }, { host: "evil.test" }, { "x-forwarded-host": "evil.test" }, { "x-forwarded-proto": "http" }, { "content-type": "text/plain" }];
for (const headers of untrustedHeaders) {
  test(`rejects untrusted headers ${JSON.stringify(headers)}`, async () => {
    const f = fixture();
    await check(await handleCheckoutSession(request(undefined, headers), f.dependencies), 400, rejected);
    assert.equal(f.counts.store + f.counts.client + f.counts.writes, 0);
  });
}
test("GET entry and handler never read storefront or create Auth users", async () => {
  const f = fixture();
  for (const response of [await GET(), await handleCheckoutSession(request(undefined, {}, "GET"), f.dependencies)]) {
    await check(response, 405, { error: "Method not allowed" });
    assert.equal(response.headers.get("allow"), "POST");
  }
  assert.equal(f.counts.store + f.counts.client, 0);
});
for (const store of ["not_found", "misconfigured", "unavailable", "throw"]) {
  test(`storefront ${store} rejects before Auth`, async () => {
    const f = fixture({ store });
    await check(await handleCheckoutSession(request(), f.dependencies), store === "not_found" ? 404 : 503, store === "not_found" ? { error: "Storefront unavailable" } : unavailable);
    assert.equal(f.counts.client + f.counts.writes, 0);
  });
}
test("missing configuration fails closed before reads or Auth", async () => {
  const f = fixture({ config: false });
  await check(await handleCheckoutSession(request(), f.dependencies), 503, unavailable);
  assert.equal(f.counts.store + f.counts.client, 0);
});
for (const options of [{ error: { name: "AuthApiError" } }, { throws: true }, { error: { name: "AuthSessionMissingError" } }]) {
  test(`existing identity survives validation failure ${JSON.stringify(options)}`, async () => {
    const f = fixture(options);
    const req = request(undefined, { cookie: "sb-project-auth-token.0=existing" });
    await check(await handleCheckoutSession(req, f.dependencies), 503, unavailable);
    assert.equal(req.cookies.get("sb-project-auth-token.0")?.value, "existing");
    assert.equal(f.counts.signup, 0);
  });
}
test("invalid JWT without readable auth cookies is not a missing session", async () => {
  const f = fixture({ error: { name: "AuthApiError" } });
  await check(await handleCheckoutSession(request(), f.dependencies), 503, unavailable);
  assert.equal(f.counts.signup, 0);
});
test("verified session refresh commits SSR cookies without signup", async () => {
  const f = fixture({ user: { id: "owner" }, refresh: true });
  await check(await handleCheckoutSession(request(), f.dependencies), 200, { ready: true }, true);
  assert.equal(f.counts.signup, 0);
});
test("absent user without an error creates a session only with no existing auth cookie", async () => {
  const f = fixture();
  await check(await handleCheckoutSession(request(), f.dependencies), 200, { ready: true }, true);
  assert.equal(f.counts.signup, 1);
  const existing = fixture();
  await check(await handleCheckoutSession(request(undefined, { cookie: "sb-project-auth-token=opaque" }), existing.dependencies), 503, unavailable);
  assert.equal(existing.counts.signup, 0);
});
test("missing trusted site configuration fails closed", async () => {
  const f = fixture();
  f.dependencies.getOrigin = () => null;
  await check(await handleCheckoutSession(request(), f.dependencies), 503, unavailable);
  assert.equal(f.counts.client + f.counts.store, 0);
});
test("real public reader rejects invalid slug rules before Auth or public fetch", async () => {
  const f = fixture();
  let reads = 0;
  f.dependencies.readStorefront = (slug) => readStorefront(slug, async () => { reads++; throw new Error("unexpected fetch"); });
  for (const slug of ["", "Upper", "../store", "a".repeat(64)]) {
    await check(await handleCheckoutSession(request(JSON.stringify({ slug })), f.dependencies), 404, { error: "Storefront unavailable" });
  }
  assert.equal(reads + f.counts.client, 0);
});
test("anonymous provider failure discards all staged cookie mutations", async () => {
  const f = fixture({ signupError: true });
  await check(await handleCheckoutSession(request(), f.dependencies), 503, unavailable);
  assert.equal(f.counts.signup, 1);
  assert.equal(f.counts.writes, 1);
});
