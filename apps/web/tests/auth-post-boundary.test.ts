import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server.js";
// @ts-expect-error Native Node's TypeScript runner resolves explicit .ts imports.
import { GET as loginGET, POST as loginPOST } from "../app/auth/login/submit/route.ts";
// @ts-expect-error Native Node's TypeScript runner resolves explicit .ts imports.
import { GET as signupGET, POST as signupPOST } from "../app/auth/signup/submit/route.ts";

const trustedOrigin = "http://127.0.0.1:3000";
const trustedHost = "127.0.0.1:3000";
const environmentKeys = ["QWERTY_SITE_URL", "SUPABASE_URL", "SUPABASE_ANON_KEY"] as const;

function withAuthEnvironment(callback: () => Promise<void>): Promise<void> {
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

function postRequest(path: string, headers: Record<string, string>): NextRequest {
  return new NextRequest(`${trustedOrigin}${path}`, {
    method: "POST",
    headers: {
      Host: trustedHost,
      Origin: trustedOrigin,
      Cookie: "sb-session=opaque-session",
      "Content-Type": "application/x-www-form-urlencoded",
      ...headers,
    },
    body: "email=owner%40example.test&password=correct-horse-battery-staple",
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

test("login and signup reject a forged Origin before touching session cookies", async () => {
  await withAuthEnvironment(async () => {
    for (const [post, path] of [[loginPOST, "/auth/login/submit"], [signupPOST, "/auth/signup/submit"]] as const) {
      const response = await post(postRequest(path, { Origin: "https://evil.invalid" }));
      assert.equal(response.status, 400);
      assertSecurityHeaders(response);
      assertNoCookieLeak(response);
      assert.equal(await response.text(), '{"error":"Request rejected"}');
    }
  });
});

test("login and signup reject a forged Host before touching session cookies", async () => {
  await withAuthEnvironment(async () => {
    for (const [post, path] of [[loginPOST, "/auth/login/submit"], [signupPOST, "/auth/signup/submit"]] as const) {
      const response = await post(postRequest(path, { Host: "evil.invalid" }));
      assert.equal(response.status, 400);
      assertSecurityHeaders(response);
      assertNoCookieLeak(response);
    }
  });
});

test("signup POST accepts a Portless-attested internal HTTPS request with the exact public Origin", async () => {
  const previous = Object.fromEntries(environmentKeys.map((key) => [key, process.env[key]]));
  process.env.QWERTY_SITE_URL = "https://qwerty.localhost";
  process.env.SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_ANON_KEY = "eyJhbGciOiJub25lIn0.eyJyb2xlIjoiYW5vbiJ9.signature";

  try {
    const request = new NextRequest("https://localhost:4768/auth/signup/submit", {
      method: "POST",
      headers: {
        Host: "qwerty.localhost",
        Origin: "https://qwerty.localhost",
        "X-Forwarded-Host": "qwerty.localhost",
        "X-Forwarded-Proto": "https",
        "X-Forwarded-Port": "443",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "email=invalid&password=short",
    });
    const response = await signupPOST(request);

    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), "https://qwerty.localhost/auth/signup?status=invalid");
    assertSecurityHeaders(response);
    assertNoCookieLeak(response);
  } finally {
    environmentKeys.forEach((key) => {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
});

test("login and signup GET surfaces are disabled with protective headers", async () => {
  for (const get of [loginGET, signupGET]) {
    const response = get();
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("allow"), "POST");
    assertSecurityHeaders(response);
    assertNoCookieLeak(response);
  }
});
