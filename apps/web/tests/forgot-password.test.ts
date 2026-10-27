import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server.js";
// @ts-expect-error Node's native TypeScript runner resolves explicit .ts imports.
import * as forgotPasswordRoute from "../app/auth/forgot-password/submit/route.ts";
// @ts-expect-error Node's native TypeScript runner resolves explicit .ts imports.
import { GET, POST } from "../app/auth/forgot-password/submit/route.ts";
// @ts-expect-error Node's native TypeScript runner resolves explicit .ts imports.
import { handleForgotPasswordPost } from "../app/auth/forgot-password/submit/handler.ts";

const trustedOrigin = "http://127.0.0.1:3000";
const trustedHost = "127.0.0.1:3000";
const environmentKeys = ["QWERTY_SITE_URL", "SUPABASE_URL", "SUPABASE_ANON_KEY", "QWERTY_RECOVERY_SIGNING_KEY"] as const;
const anonKey = "eyJhbGciOiJub25lIn0.eyJyb2xlIjoiYW5vbiJ9.signature";
const signingKey = "A".repeat(43);

test("forgot-password submit route exports only supported Next route entries", () => {
  assert.deepEqual(Object.keys(forgotPasswordRoute).sort(), ["GET", "POST"]);
});

type Environment = Partial<Record<(typeof environmentKeys)[number], string>>;

function withEnvironment(values: Environment, callback: () => Promise<void>): Promise<void> {
  const previous = Object.fromEntries(environmentKeys.map((key) => [key, process.env[key]]));
  environmentKeys.forEach((key) => {
    const value = values[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  });
  return callback().finally(() => {
    environmentKeys.forEach((key) => {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  });
}

function request(body: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(trustedOrigin + "/auth/forgot-password/submit", {
    method: "POST",
    headers: {
      Host: trustedHost,
      Origin: trustedOrigin,
      "Content-Type": "application/x-www-form-urlencoded",
      ...headers,
    },
    body,
  });
}

function assertSecurityHeaders(response: Response): void {
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("pragma"), "no-cache");
  assert.equal(response.headers.get("expires"), "0");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
}

function assertRedirect(response: Response, status: string): void {
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), trustedOrigin + "/auth/forgot-password?status=" + status);
  assertSecurityHeaders(response);
}

function clientWithError(error: unknown): { auth: { resetPasswordForEmail: (email: string, options: { redirectTo: string }) => Promise<{ error: unknown }> } } {
  return {
    auth: {
      resetPasswordForEmail: async () => ({ error }),
    },
  };
}

const validConfig = {
  QWERTY_SITE_URL: trustedOrigin,
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_ANON_KEY: anonKey,
  QWERTY_RECOVERY_SIGNING_KEY: signingKey,
};

test("GET on recovery submit is disabled with protective headers", () => {
  const response = GET();
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "POST");
  assertSecurityHeaders(response);
});

test("recovery rejects a forged Origin or Host before touching Supabase", async () => {
  await withEnvironment(validConfig, async () => {
    let calls = 0;
    const dependencies = { createClient: () => { calls += 1; return clientWithError(null); } };
    const forgedHeaders: Record<string, string>[] = [
      { Origin: "https://evil.invalid" },
      { Host: "evil.invalid" },
    ];
    for (const headers of forgedHeaders) {
      const response = await handleForgotPasswordPost(request("email=owner%40example.test", headers), dependencies);
      assert.equal(response.status, 400);
      assertSecurityHeaders(response);
      assert.equal(calls, 0);
    }
  });
});

test("recovery fails closed when public Supabase configuration is missing", async () => {
  await withEnvironment({ QWERTY_SITE_URL: trustedOrigin }, async () => {
    let calls = 0;
    const response = await handleForgotPasswordPost(request("email=owner%40example.test"), {
      createClient: () => { calls += 1; return clientWithError(null); },
    });
    assert.equal(response.status, 503);
    assert.equal(await response.text(), '{"error":"Recovery unavailable"}');
    assert.equal(calls, 0);
    assertSecurityHeaders(response);
  });
});

test("recovery fails closed before dispatch when the signing key is missing or invalid", async () => {
  for (const signingKey of [undefined, "invalid"]) {
    await withEnvironment({ ...validConfig, QWERTY_RECOVERY_SIGNING_KEY: signingKey }, async () => {
      let calls = 0;
      const response = await handleForgotPasswordPost(request("email=owner%40example.test"), {
        createClient: () => {
          calls += 1;
          return clientWithError(null);
        },
      });
      assert.equal(response.status, 503);
      assert.equal(await response.text(), '{"error":"Recovery unavailable"}');
      assert.equal(calls, 0);
      assertSecurityHeaders(response);
    });
  }
});

test("invalid recovery input redirects to a fixed invalid status without calling Supabase", async () => {
  await withEnvironment(validConfig, async () => {
    let calls = 0;
    const dependencies = { createClient: () => { calls += 1; return clientWithError(null); } };
    for (const body of ["", "email=not-an-email", "email=" + "a".repeat(250) + "%40example.test"]) {
      const response = await handleForgotPasswordPost(request(body), dependencies);
      assertRedirect(response, "invalid");
    }
    assert.equal(calls, 0);
  });
});

test("existing and unknown addresses receive the same neutral recovery response", async () => {
  await withEnvironment(validConfig, async () => {
    const calls: Array<{ email: string; redirectTo: string }> = [];
    const dependencies = {
      createClient: () => ({
        auth: {
          resetPasswordForEmail: async (email: string, options: { redirectTo: string }) => {
            calls.push({ email, redirectTo: options.redirectTo });
            return { error: calls.length === 1 ? null : new Error("unknown address") };
          },
        },
      }),
    };
    const existing = await handleForgotPasswordPost(request("email=Owner%40Example.Test"), dependencies);
    const unknown = await handleForgotPasswordPost(request("email=unknown%40example.test"), dependencies);
    assertRedirect(existing, "check-email");
    assertRedirect(unknown, "check-email");
    assert.deepEqual(calls, [
      { email: "owner@example.test", redirectTo: trustedOrigin + "/auth/confirm" },
      { email: "unknown@example.test", redirectTo: trustedOrigin + "/auth/confirm" },
    ]);
  });
});
