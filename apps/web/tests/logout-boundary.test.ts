import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server.js";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { GET, POST } from "../app/auth/logout/route.ts";

const trustedOrigin = "http://127.0.0.1:3000";
const trustedHost = "127.0.0.1:3000";
const environmentKeys = ["QWERTY_SITE_URL", "SUPABASE_URL", "SUPABASE_ANON_KEY"] as const;

function withLogoutEnvironment(callback: () => Promise<void>): Promise<void> {
  const previous = Object.fromEntries(environmentKeys.map((key) => [key, process.env[key]]));
  process.env.QWERTY_SITE_URL = trustedOrigin;
  process.env.SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_ANON_KEY = "eyJhbGciOiJub25lIn0.eyJyb2xlIjoiYW5vbiJ9.signature";

  return callback().finally(() => {
    environmentKeys.forEach((key) => {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  });
}

function logoutRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`${trustedOrigin}/auth/logout`, {
    method: "POST",
    headers: {
      Host: trustedHost,
      Cookie: "sb-session=opaque-session",
      ...headers,
    },
  });
}

function assertSecurityHeaders(response: Response): void {
  const directives = new Set((response.headers.get("cache-control") ?? "")
    .split(",").map((value) => value.trim().toLowerCase()));
  assert.equal(directives.has("private"), true);
  assert.equal(directives.has("no-store"), true);
  assert.equal(response.headers.get("pragma"), "no-cache");
  assert.equal(response.headers.get("expires"), "0");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
}

function assertNoCookieLeak(response: Response): void {
  assert.equal(response.headers.get("set-cookie"), null);
}

test("logout rejects a missing Origin before touching session cookies", async () => {
  await withLogoutEnvironment(async () => {
    const response = await POST(logoutRequest());
    assert.equal(response.status, 400);
    assertSecurityHeaders(response);
    assertNoCookieLeak(response);
  });
});

test("logout rejects a forged Origin before touching session cookies", async () => {
  await withLogoutEnvironment(async () => {
    const response = await POST(logoutRequest({ Origin: "https://evil.invalid" }));
    assert.equal(response.status, 400);
    assertSecurityHeaders(response);
    assertNoCookieLeak(response);
  });
});

test("logout rejects a spoofed Host before touching session cookies", async () => {
  await withLogoutEnvironment(async () => {
    const response = await POST(logoutRequest({ Host: "evil.invalid", Origin: trustedOrigin }));
    assert.equal(response.status, 400);
    assertSecurityHeaders(response);
    assertNoCookieLeak(response);
  });
});

test("logout has no GET surface and keeps the 405 response private", async () => {
  const response = await GET();
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "POST");
  assertSecurityHeaders(response);
  assertNoCookieLeak(response);
});
