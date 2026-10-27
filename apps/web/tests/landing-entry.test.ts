import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server.js";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { handleLandingEntry } from "../app/ingresar/handler.ts";
import type { CallbackCookieState } from "../app/lib/supabase/callback-cookies.ts";

const config = { url: "https://auth.example.test", anonKey: "sb_publishable_synthetic" };
const eligible = {
  id: "synthetic-owner", email: "owner@example.test", email_confirmed_at: "2026-01-01T00:00:00Z",
  is_anonymous: false, role: "authenticated",
};
function request(path = "/ingresar", method = "GET") {
  return new NextRequest(`https://qwerty.example.test${path}`, {
    method, headers: { cookie: "synthetic-session=old", host: "attacker.example.test", "x-forwarded-host": "attacker.example.test" },
  });
}
function provider(user: unknown = eligible, error: unknown = null, throws = false) {
  let calls = 0;
  let creations = 0;
  const createClient = (url: string, key: string, state: CallbackCookieState): SupabaseClient => {
    creations++;
    assert.equal(url, config.url);
    assert.equal(key, config.anonKey);
    assert.deepEqual(state.getAll(), [{ name: "synthetic-session", value: "old" }]);
    // Only the real public getUser port exists: business/session/claims/mutation reads fail.
    return {
      auth: {
        async getUser() {
          calls++;
          state.setAll([{ name: "synthetic-session", value: "refreshed", options: {
            path: "/", httpOnly: true, secure: true, sameSite: "lax", maxAge: 3600,
          } }], {
            "X-Synthetic-Refresh": "observed",
            "Location": "https://attacker.example.test",
            "Cache-Control": "public, s-maxage=86400, immutable",
            "Pragma": "cache", "Expires": "Wed, 01 Jan 2031 00:00:00 GMT", "Vary": "Accept-Encoding",
          });
          assert.equal(state.getAll()[0]?.value, "refreshed");
          if (throws) throw new Error("synthetic private provider detail");
          return { data: { user }, error };
        },
      },
    } as unknown as SupabaseClient;
  };
  return { createClient, getConfig: () => config, calls: () => calls, creations: () => creations };
}
async function assertResponse(response: NextResponse, location: string, refreshed = false) {
  assert.ok(response instanceof NextResponse);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), location);
  assert.equal(await response.text(), "");
  assert.equal(response.headers.get("cache-control"), "private, no-store, no-cache, must-revalidate, max-age=0");
  assert.equal(response.headers.get("pragma"), "no-cache");
  assert.equal(response.headers.get("expires"), "0");
  assert.equal(response.headers.get("vary"), "Cookie");
  assert.equal(response.headers.get("x-synthetic-refresh"), refreshed ? "observed" : null);
  assert.equal(response.cookies.getAll().length, refreshed ? 1 : 0);
  if (refreshed) {
    assert.equal(response.cookies.get("synthetic-session")?.value, "refreshed");
    const cookie = response.headers.get("set-cookie") ?? "";
    for (const attribute of ["Path=/", "HttpOnly", "Secure", "SameSite=lax", "Max-Age=3600"]) {
      assert.ok(cookie.includes(attribute), attribute);
    }
  } else assert.equal(response.headers.get("set-cookie"), null);
}

test("fresh confirmed Owner identity alone selects Owner and publishes verified refresh state", async () => {
  const dependencies = provider();
  await assertResponse(await handleLandingEntry(request(), dependencies), "/owner", true);
  assert.equal(dependencies.calls(), 1);
  assert.equal(dependencies.creations(), 1);
});

const denied: [string, unknown, unknown][] = [
  ["absent", null, null],
  ["expired", eligible, { message: "expired" }],
  ["unconfirmed", { ...eligible, email_confirmed_at: null }, null],
  ["anonymous", { ...eligible, is_anonymous: true }, null],
  ["missing role", { ...eligible, role: undefined }, null],
  ["non-authenticated role", { ...eligible, role: "anon" }, null],
  ["missing email", { ...eligible, email: undefined }, null],
  ["malformed user", {}, null],
  ["missing id", { ...eligible, id: undefined }, null],
  ["empty id", { ...eligible, id: "" }, null],
  ["malformed id", { ...eligible, id: 123 }, null],
];
for (const [name, user, error] of denied) {
  test(`${name}: required redirect discards unverified refresh cookies and headers`, async () => {
    const dependencies = provider(user, error);
    await assertResponse(await handleLandingEntry(request(), dependencies), "/auth/login?status=required");
    assert.equal(dependencies.calls(), 1);
  });
}

test("missing config does not construct a provider", async () => {
  const dependencies = provider();
  await assertResponse(await handleLandingEntry(request(), { ...dependencies, getConfig: () => null }), "/auth/login?status=unavailable");
  assert.equal(dependencies.calls(), 0);
  assert.equal(dependencies.creations(), 0);
});

test("provider throws after refresh: unavailable without cookie/header publication", async () => {
  const dependencies = provider(eligible, null, true);
  await assertResponse(await handleLandingEntry(request(), dependencies), "/auth/login?status=unavailable");
  assert.equal(dependencies.calls(), 1);
});

test("configuration and client-construction errors fail privately", async () => {
  for (const dependencies of [
    { getConfig: () => { throw new Error("synthetic config failure"); } },
    { getConfig: () => config, createClient: () => { throw new Error("synthetic client failure"); } },
  ]) await assertResponse(await handleLandingEntry(request(), dependencies), "/auth/login?status=unavailable");
});

test("query, Host and forwarded host cannot select store, cookies or redirect destination", async () => {
  for (const user of [eligible, null]) {
    const dependencies = provider(user);
    const req = request("/ingresar?next=https://attacker.example.test&returnTo=//attacker.example.test&callback=/owner?businessId=other&businessId=other&cookie=other");
    await assertResponse(await handleLandingEntry(req, dependencies), user ? "/owner" : "/auth/login?status=required", !!user);
    assert.equal(dependencies.calls(), 1);
  }
});

test("each invocation verifies anew and cannot reuse another request's identity or refresh", async () => {
  const valid = provider();
  const absent = provider(null);
  await assertResponse(await handleLandingEntry(request(), valid), "/owner", true);
  await assertResponse(await handleLandingEntry(request(), absent), "/auth/login?status=required");
  await assertResponse(await handleLandingEntry(request(), valid), "/owner", true);
  assert.equal(valid.calls(), 2);
  assert.equal(valid.creations(), 2);
  assert.equal(absent.calls(), 1);
});

test("unsupported direct handler methods fail closed before config or provider access", async () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]) {
    const dependencies = provider();
    const response = await handleLandingEntry(request("/ingresar", method), {
      ...dependencies, getConfig: () => { assert.fail("must not read config"); },
    });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("allow"), "GET");
    assert.equal(response.headers.get("location"), null);
    assert.equal(response.headers.get("cache-control"), "private, no-store, no-cache, must-revalidate, max-age=0");
    assert.equal(response.headers.get("pragma"), "no-cache");
    assert.equal(response.headers.get("expires"), "0");
    assert.equal(response.headers.get("vary"), "Cookie");
    assert.equal(response.headers.get("set-cookie"), null);
    assert.equal(await response.text(), "");
    assert.equal(dependencies.creations(), 0);
    assert.equal(dependencies.calls(), 0);
  }
});

test("route is only a GET adapter; Next owns automatic HEAD/OPTIONS and 405 behavior", () => {
  const source = readFileSync(new URL("../app/ingresar/route.ts", import.meta.url), "utf8");
  assert.match(source, /export async function GET\(request: NextRequest\)/);
  assert.match(source, /return handleLandingEntry\(request\)/);
  assert.doesNotMatch(source, /export (?:async function|const) (?:POST|PUT|PATCH|DELETE|HEAD|OPTIONS)/);
});
