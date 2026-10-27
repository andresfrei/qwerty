import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server.js";
// @ts-expect-error Node's native TypeScript runner resolves explicit .ts imports.
import * as confirmRoute from "../app/auth/confirm/route.ts";
// @ts-expect-error Node's native TypeScript runner resolves explicit .ts imports.
import { handleAuthConfirm } from "../app/auth/confirm/handler.ts";
// @ts-expect-error Node's native TypeScript runner resolves explicit .ts imports.
import { createCallbackCookieState } from "../app/lib/supabase/callback-cookies.ts";
// @ts-expect-error Node's native TypeScript runner resolves explicit .ts imports.
import { getTrustedSiteOrigin, isTrustedCallbackRequest, resolveAuthConfirm } from "../app/lib/supabase/confirm.ts";

const trustedOrigin = "http://127.0.0.1:3000";
const trustedHost = "127.0.0.1:3000";
const anonKey = "eyJhbGciOiJub25lIn0.eyJyb2xlIjoiYW5vbiJ9.signature";
const signingKey = "A".repeat(43);
const userId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";

test("confirmation route exports only supported Next route entries", () => {
  assert.deepEqual(Object.keys(confirmRoute).sort(), ["GET"]);
});

function callbackRequest(type: "email" | "recovery"): NextRequest {
  return new NextRequest(`${trustedOrigin}/auth/confirm?token_hash=opaque-hash&type=${type}`, {
    headers: { Host: trustedHost },
  });
}

function accessToken(sub = userId, session_id = sessionId): string {
  const payload = Buffer.from(JSON.stringify({ sub, session_id })).toString("base64url");
  return `e30.${payload}.signature`;
}

function routeConfig() {
  return {
    getTrustedOrigin: () => trustedOrigin,
    getConfig: () => ({ url: "http://127.0.0.1:54321", anonKey }),
  };
}

function assertSecurityHeaders(response: Response): void {
  const directives = new Set((response.headers.get("cache-control") ?? "")
    .split(",").map((directive) => directive.trim()));
  for (const required of ["private", "no-cache", "no-store", "must-revalidate", "max-age=0"]) {
    assert.ok(directives.has(required), `missing cache directive: ${required}`);
  }
  assert.equal(response.headers.get("pragma"), "no-cache");
  assert.equal(response.headers.get("expires"), "0");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
}

test("email confirmation always resolves to the fixed owner path", () => {
  const result = resolveAuthConfirm(new URLSearchParams("token_hash=email-hash&type=email&next=https%3A%2F%2Fevil.test"));
  assert.deepEqual(result, { tokenHash: "email-hash", otpType: "email", redirectPath: "/owner" });
});

test("recovery confirmation resolves to the fixed password update path", () => {
  const result = resolveAuthConfirm(new URLSearchParams("token_hash=recovery-hash&type=recovery"));
  assert.deepEqual(result, { tokenHash: "recovery-hash", otpType: "recovery", redirectPath: "/auth/update-password" });
});

test("unknown type and missing hash resolve to the fixed error path", () => {
  assert.deepEqual(resolveAuthConfirm(new URLSearchParams("token_hash=hash&type=invite")), {
    tokenHash: null,
    otpType: null,
    redirectPath: "/auth/error",
  });
  assert.deepEqual(resolveAuthConfirm(new URLSearchParams("type=email")), {
    tokenHash: null,
    otpType: null,
    redirectPath: "/auth/error",
  });
});

test("an external next parameter cannot change the destination", () => {
  const result = resolveAuthConfirm(
    new URLSearchParams("token_hash=recovery-hash&type=recovery&next=https%3A%2F%2Fevil.test%2Fsteal"),
  );
  assert.equal(result.redirectPath, "/auth/update-password");
  assert.notEqual(result.redirectPath, "https://evil.test/steal");
});

test("trusted site origin requires a safe exact origin", () => {
  assert.equal(getTrustedSiteOrigin({}), null);
  assert.equal(getTrustedSiteOrigin({ QWERTY_SITE_URL: "http://example.test:3000" }), null);
  assert.equal(getTrustedSiteOrigin({ QWERTY_SITE_URL: "https://example.test/account" }), null);
  assert.equal(getTrustedSiteOrigin({ QWERTY_SITE_URL: "https://user:pass@example.test" }), null);
  assert.equal(getTrustedSiteOrigin({ QWERTY_SITE_URL: "https://example.test?next=/owner" }), null);
  assert.equal(getTrustedSiteOrigin({ QWERTY_SITE_URL: "https://example.test#fragment" }), null);
  assert.equal(getTrustedSiteOrigin({ QWERTY_SITE_URL: "http://127.0.0.1:3000/" }), "http://127.0.0.1:3000");
  assert.equal(getTrustedSiteOrigin({ QWERTY_SITE_URL: "https://example.test/" }), "https://example.test");
});

test("normal local Next forwarded headers accept its internal localhost URL", () => {
  assert.equal(isTrustedCallbackRequest({
    url: "http://localhost:3000/auth/confirm?token_hash=opaque&type=email",
    headers: new Headers({
      host: "127.0.0.1:3000",
      "x-forwarded-host": "127.0.0.1:3000",
      "x-forwarded-proto": "http",
    }),
  }, "http://127.0.0.1:3000"), true);
});

test("Portless HTTPS accepts an attested public origin over an internal loopback port", () => {
  const ingressHeaders = {
    host: "qwerty.localhost",
    "x-forwarded-host": "qwerty.localhost",
    "x-forwarded-proto": "https",
    "x-forwarded-port": "443",
  };

  assert.equal(isTrustedCallbackRequest({
    url: "https://localhost:4768/auth/confirm?token_hash=opaque&type=email",
    headers: new Headers(ingressHeaders),
  }, "https://qwerty.localhost"), true);
});

test("Portless HTTPS rejects incomplete or forged ingress attestation", () => {
  const trustedOrigin = "https://qwerty.localhost";
  const internalUrl = "https://localhost:4768/auth/confirm";
  const ingressHeaders = {
    host: "qwerty.localhost",
    "x-forwarded-host": "qwerty.localhost",
    "x-forwarded-proto": "https",
    "x-forwarded-port": "443",
  };

  const rejected: Record<string, string>[] = [
    { ...ingressHeaders, host: "evil.invalid" },
    { ...ingressHeaders, "x-forwarded-host": "evil.invalid" },
    { ...ingressHeaders, "x-forwarded-proto": "http" },
    { host: "qwerty.localhost", "x-forwarded-proto": "https" },
    { host: "qwerty.localhost", "x-forwarded-host": "qwerty.localhost" },
    { host: "qwerty.localhost" },
  ];

  for (const headers of rejected) {
    assert.equal(isTrustedCallbackRequest({ url: internalUrl, headers: new Headers(headers) }, trustedOrigin), false);
  }
  assert.equal(isTrustedCallbackRequest({
    url: "https://internal.example:4768/auth/confirm",
    headers: new Headers(ingressHeaders),
  }, trustedOrigin), false);
  assert.equal(isTrustedCallbackRequest({
    url: "http://localhost:4768/auth/confirm",
    headers: new Headers(ingressHeaders),
  }, trustedOrigin), false);
});

test("callback origin checks reject forged hosts, protocols, and remote URLs", () => {
  const trustedOrigin = "http://127.0.0.1:3000";
  const internalUrl = "http://localhost:3000/auth/confirm";
  const trustedHeaders = {
    host: "127.0.0.1:3000",
    "x-forwarded-host": "127.0.0.1:3000",
    "x-forwarded-proto": "http",
  };

  assert.equal(isTrustedCallbackRequest({ url: internalUrl, headers: new Headers({ ...trustedHeaders, host: "evil.invalid" }) }, trustedOrigin), false);
  assert.equal(isTrustedCallbackRequest({ url: internalUrl, headers: new Headers({ ...trustedHeaders, "x-forwarded-host": "evil.invalid" }) }, trustedOrigin), false);
  assert.equal(isTrustedCallbackRequest({ url: internalUrl, headers: new Headers({ ...trustedHeaders, "x-forwarded-proto": "https" }) }, trustedOrigin), false);
  assert.equal(isTrustedCallbackRequest({
    url: "https://evil.invalid/auth/confirm",
    headers: new Headers(trustedHeaders),
  }, trustedOrigin), false);
});

test("recovery callback rejects a missing or invalid signing key before consuming the token", async () => {
  for (const signingKey of [null, "invalid"]) {
    let verifyCalls = 0;
    let clientCalls = 0;
    const response = await handleAuthConfirm(callbackRequest("recovery"), {
      ...routeConfig(),
      getRecoverySigningKey: () => signingKey,
      createClient: () => {
        clientCalls += 1;
        return {
          auth: {
            verifyOtp: async () => {
              verifyCalls += 1;
              return { data: { session: null, user: null }, error: null };
            },
            getClaims: async () => ({ data: null, error: null }),
            getUser: async () => ({ data: { user: null }, error: null }),
          },
        };
      },
    });

    assert.equal(response.status, 503);
    assertSecurityHeaders(response);
    assert.equal(response.headers.get("set-cookie"), null);
    assert.equal(verifyCalls, 0);
    assert.equal(clientCalls, 0);
  }
});

test("email confirmation does not require or mint a recovery proof", async () => {
  let signingKeyLookups = 0;
  const response = await handleAuthConfirm(callbackRequest("email"), {
    ...routeConfig(),
    getRecoverySigningKey: () => {
      signingKeyLookups += 1;
      return signingKey;
    },
    createClient: (_url, _anonKey, state) => ({
      auth: {
        verifyOtp: async () => {
          state.setAll([{ name: "sb-session", value: "staged", options: { path: "/" } }], {
            "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
          });
          return { data: { session: null, user: null }, error: null };
        },
        getClaims: async () => ({ data: null, error: null }),
        getUser: async () => ({ data: { user: null }, error: null }),
      },
    }),
  });

  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), `${trustedOrigin}/owner`);
  assert.doesNotMatch(response.headers.get("set-cookie") ?? "", /qwerty_recovery_proof/);
  assert.match(response.headers.get("set-cookie") ?? "", /sb-session=staged/);
  assert.match(response.headers.get("cache-control") ?? "", /no-cache/);
  assert.match(response.headers.get("cache-control") ?? "", /must-revalidate/);
  assert.equal(signingKeyLookups, 0);
});

test("recovery failures never forward staged session cookies or proofs", async () => {
  const response = await handleAuthConfirm(callbackRequest("recovery"), {
    ...routeConfig(),
    getRecoverySigningKey: () => signingKey,
    createClient: (_url, _anonKey, state) => ({
      auth: {
        verifyOtp: async () => {
          state.setAll([{ name: "sb-session", value: "staged", options: { path: "/" } }], {});
          return { data: { session: null, user: null }, error: new Error("expired") };
        },
        getClaims: async () => ({ data: null, error: null }),
        getUser: async () => ({ data: { user: null }, error: null }),
      },
    }),
  });

  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), `${trustedOrigin}/auth/error`);
  assert.equal(response.headers.get("set-cookie"), null);
  assertSecurityHeaders(response);
});

test("successful recovery confirmation mints a scoped proof after verified identity checks", async () => {
  const calls: string[] = [];
  const now = Math.floor(Date.now() / 1000);
  const response = await handleAuthConfirm(callbackRequest("recovery"), {
    ...routeConfig(),
    getRecoverySigningKey: () => signingKey,
    createClient: (_url, _anonKey, state) => ({
      auth: {
        verifyOtp: async () => {
          calls.push("verifyOtp");
          state.setAll([{ name: "sb-session", value: "staged", options: { path: "/" } }], {});
          return { data: { session: { access_token: accessToken() }, user: { id: userId } }, error: null };
        },
        getClaims: async () => {
          calls.push(`getClaims:${state.getAll().find(({ name }) => name === "sb-session")?.value}`);
          return { data: { claims: { sub: userId, session_id: sessionId, exp: now + 300 } }, error: null };
        },
        getUser: async () => {
          calls.push("getUser");
          return { data: { user: { id: userId } }, error: null };
        },
      },
    }),
  });

  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), `${trustedOrigin}/auth/update-password`);
  assert.match(response.headers.get("set-cookie") ?? "", /qwerty_recovery_proof=/);
  assert.match(response.headers.get("set-cookie") ?? "", /Path=\/auth\/update-password/);
  assertSecurityHeaders(response);
  assert.deepEqual(calls, ["verifyOtp", "getClaims:staged", "getUser"]);
});

test("cookie state round-trips staged chunk writes into the request view", () => {
  const request = new NextRequest("http://127.0.0.1:3000/auth/confirm", {
    headers: { cookie: "sb-session.0=old" },
  });
  const state = createCallbackCookieState(request);

  state.setAll([{ name: "sb-session.0", value: "new-0", options: { path: "/" } }], {
    "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
  });
  state.setAll([{ name: "sb-session.1", value: "new-1", options: { path: "/" } }], { pragma: "no-cache" });

  assert.equal(state.getAll().find(({ name }) => name === "sb-session.0")?.value, "new-0");
  assert.equal(state.getAll().find(({ name }) => name === "sb-session.1")?.value, "new-1");
  assert.equal(state.cookies.length, 2);
  assert.equal(state.headers["Cache-Control"], "private, no-cache, no-store, must-revalidate, max-age=0");
  assert.equal(state.headers.pragma, "no-cache");
});
