import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server.js";
// @ts-expect-error Node's native TypeScript runner resolves explicit .ts imports.
import * as updatePasswordRoute from "../app/auth/update-password/submit/route.ts";
// @ts-expect-error Node's native TypeScript runner resolves explicit .ts imports.
import { GET, POST } from "../app/auth/update-password/submit/route.ts";
// @ts-expect-error Node's native TypeScript runner resolves explicit .ts imports.
import { handleUpdatePasswordPost } from "../app/auth/update-password/submit/handler.ts";
// @ts-expect-error Node's native TypeScript runner resolves explicit .ts imports.
import { issueRecoveryProof, RECOVERY_PROOF_COOKIE_NAME } from "../app/lib/supabase/recovery-proof.ts";

const trustedOrigin = "http://127.0.0.1:3000";
const trustedHost = "127.0.0.1:3000";
const environmentKeys = ["QWERTY_SITE_URL", "SUPABASE_URL", "SUPABASE_ANON_KEY", "QWERTY_RECOVERY_SIGNING_KEY"] as const;
const signingKey = "A".repeat(43);
const validConfig = {
  QWERTY_SITE_URL: trustedOrigin,
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_ANON_KEY: "eyJhbGciOiJub25lIn0.eyJyb2xlIjoiYW5vbiJ9.signature",
  QWERTY_RECOVERY_SIGNING_KEY: signingKey,
};

function withEnvironment(values: Record<string, string>, callback: () => Promise<void>): Promise<void> {
  const previous = Object.fromEntries(environmentKeys.map((key) => [key, process.env[key]]));
  environmentKeys.forEach((key) => {
    process.env[key] = values[key];
  });
  return callback().finally(() => {
    environmentKeys.forEach((key) => {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  });
}

function recoveryProof(): string {
  const value = issueRecoveryProof(recoveryClaims(), userId, signingKey);
  assert.ok(value);
  return value;
}

function request(
  body: string | undefined = "password=correct-horse&password_confirmation=correct-horse",
  headers: Record<string, string> = {},
  omitHeader?: "origin" | "host",
  includeRecoveryProof: boolean | string = false,
): NextRequest {
  const proofValue = includeRecoveryProof === true
    ? recoveryProof()
    : typeof includeRecoveryProof === "string" ? includeRecoveryProof : null;
  const requestHeaders = new Headers({
    Host: trustedHost,
    Origin: trustedOrigin,
    Cookie: `sb-session=opaque-session${proofValue ? `; ${RECOVERY_PROOF_COOKIE_NAME}=${proofValue}` : ""}`,
    "Content-Type": "application/x-www-form-urlencoded",
    ...headers,
  });
  if (omitHeader) requestHeaders.delete(omitHeader === "origin" ? "Origin" : "Host");
  return new NextRequest(`${trustedOrigin}/auth/update-password/submit`, {
    method: "POST",
    headers: requestHeaders,
    body,
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

type FakeAuth = {
  getUser: () => Promise<{ data: { user: { id: string; email_confirmed_at: string | null } | null }; error: unknown | null }>;
  getClaims?: () => Promise<{ data: { claims: unknown } | null; error: unknown | null }>;
  updateUser: (credentials: { password: string }) => Promise<{ error: unknown | null }>;
  signOut: (options: { scope: "global" }) => Promise<{ error: unknown | null }>;
};

const userId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";

test("update-password submit route exports only supported Next route entries", () => {
  assert.deepEqual(Object.keys(updatePasswordRoute).sort(), ["GET", "POST"]);
});

function recoveryClaims(): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000);
  return {
    sub: userId,
    session_id: sessionId,
    exp: now + 300,
    amr: [{ method: "recovery", timestamp: now - 60 }],
  };
}

function dependencies(auth: FakeAuth, calls: { clients: number }) {
  return {
    createClient: () => {
      calls.clients += 1;
      return {
        auth: {
          getClaims: auth.getClaims ?? (async () => ({ data: { claims: recoveryClaims() }, error: null })),
          ...auth,
        },
      };
    },
  };
}

const confirmedUser = { data: { user: { id: userId, email_confirmed_at: "2026-01-01T00:00:00.000Z" } }, error: null };

test("GET on password update submit is disabled with protective headers", () => {
  const response = GET();
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "POST");
  assertSecurityHeaders(response);
  assertNoCookieLeak(response);
});

test("password update rejects missing or forged Origin and Host before reading the request", async () => {
  await withEnvironment(validConfig, async () => {
    const calls = { clients: 0 };
    const rejectedRequests = [
      request(undefined, { Origin: "https://evil.invalid" }),
      request(undefined, { Host: "evil.invalid" }),
      request(undefined, {}, "origin"),
      request(undefined, {}, "host"),
    ];
    for (const rejectedRequest of rejectedRequests) {
      const response = await handleUpdatePasswordPost(rejectedRequest, dependencies({
        getUser: async () => confirmedUser,
        updateUser: async () => ({ error: null }),
        signOut: async () => ({ error: null }),
      }, calls));
      assert.equal(response.status, 400);
      assertSecurityHeaders(response);
      assertNoCookieLeak(response);
    }
    assert.equal(calls.clients, 0);
  });
});

test("invalid password input redirects to a fixed status without touching Supabase", async () => {
  await withEnvironment(validConfig, async () => {
    const calls = { clients: 0 };
    for (const body of [
      "",
      "password=short&password_confirmation=short",
      "password=correct-horse&password_confirmation=different",
      "password=one&password=two&password_confirmation=one",
      `password=${"a".repeat(257)}&password_confirmation=${"a".repeat(257)}`,
    ]) {
      const response = await handleUpdatePasswordPost(request(body), dependencies({
        getUser: async () => confirmedUser,
        updateUser: async () => ({ error: null }),
        signOut: async () => ({ error: null }),
      }, calls));
      assert.equal(response.status, 303);
      assert.equal(response.headers.get("location"), `${trustedOrigin}/auth/update-password?status=invalid`);
      assertSecurityHeaders(response);
      assertNoCookieLeak(response);
    }
    assert.equal(calls.clients, 0);
  });
});

test("password update rejects an unauthenticated or unconfirmed recovery session", async () => {
  await withEnvironment(validConfig, async () => {
    for (const user of [null, { id: userId, email_confirmed_at: null }]) {
      const calls = { clients: 0 };
      const response = await handleUpdatePasswordPost(request(), dependencies({
        getUser: async () => ({ data: { user }, error: null }),
        updateUser: async () => ({ error: null }),
        signOut: async () => ({ error: null }),
      }, calls));
      assert.equal(response.status, 401);
      assertSecurityHeaders(response);
      assertNoCookieLeak(response);
      assert.doesNotMatch(await response.text(), /correct-horse/);
      assert.equal(calls.clients, 1);
    }
  });
});

test("password AMR cannot update a password even for a confirmed user", async () => {
  await withEnvironment(validConfig, async () => {
    let updates = 0;
    const response = await handleUpdatePasswordPost(request(), dependencies({
      getUser: async () => confirmedUser,
      getClaims: async () => ({
        data: { claims: { ...recoveryClaims(), amr: [{ method: "password", timestamp: Math.floor(Date.now() / 1000) - 60 }] } },
        error: null,
      }),
      updateUser: async () => {
        updates += 1;
        return { error: null };
      },
      signOut: async () => ({ error: null }),
    }, { clients: 0 }));
    assert.equal(response.status, 403);
    assertSecurityHeaders(response);
    assertNoCookieLeak(response);
    assert.equal(updates, 0);
  });
});

test("signed recovery proof binds the user, claims session, expiry, and configured key", async () => {
  await withEnvironment(validConfig, async () => {
    const cases = [
      { name: "missing proof", proof: null, claims: recoveryClaims(), signingKey },
      { name: "tampered proof", proof: `${recoveryProof()}x`, claims: recoveryClaims(), signingKey },
      {
        name: "expired proof",
        proof: issueRecoveryProof(recoveryClaims(), userId, signingKey, Math.floor(Date.now() / 1000) - 901),
        claims: recoveryClaims(),
        signingKey,
      },
      { name: "claims mismatch", proof: recoveryProof(), claims: { ...recoveryClaims(), sub: "33333333-3333-4333-8333-333333333333" }, signingKey },
      { name: "missing signing key", proof: recoveryProof(), claims: recoveryClaims(), signingKey: null },
    ];

    for (const scenario of cases) {
      let updates = 0;
      const response = await handleUpdatePasswordPost(
        request(undefined, {}, undefined, scenario.proof ?? false),
        {
          getRecoverySigningKey: () => scenario.signingKey,
          createClient: () => ({
            auth: {
              getUser: async () => confirmedUser,
              getClaims: async () => ({ data: { claims: scenario.claims }, error: null }),
              updateUser: async () => {
                updates += 1;
                return { error: null };
              },
              signOut: async () => ({ error: null }),
            },
          }),
        },
      );
      assert.equal(response.status, 403, scenario.name);
      assertSecurityHeaders(response);
      assertNoCookieLeak(response);
      assert.equal(updates, 0, scenario.name);
    }
  });
});

test("user and claims lookup errors fail closed without updating or setting cookies", async () => {
  await withEnvironment(validConfig, async () => {
    for (const auth of [
      {
        getUser: async () => ({ data: { user: confirmedUser.data.user }, error: new Error("user lookup failed") }),
        getClaims: async () => ({ data: { claims: recoveryClaims() }, error: null }),
      },
      {
        getUser: async () => confirmedUser,
        getClaims: async () => ({ data: { claims: recoveryClaims() }, error: new Error("claims lookup failed") }),
      },
      {
        getUser: async () => confirmedUser,
        getClaims: async () => { throw new Error("claims lookup threw"); },
      },
    ]) {
      let updates = 0;
      const response = await handleUpdatePasswordPost(request(), dependencies({
        ...auth,
        updateUser: async () => {
          updates += 1;
          return { error: null };
        },
        signOut: async () => ({ error: null }),
      }, { clients: 0 }));
      assert.equal(response.status, 503);
      assertSecurityHeaders(response);
      assertNoCookieLeak(response);
      assert.equal(updates, 0);
    }
  });
});

test("page source requires a recent recovery proof and explains link-required", () => {
  const source = readFileSync(new URL("../app/auth/update-password/page.tsx", import.meta.url), "utf8");
  assert.match(source, /getClaims/);
  assert.match(source, /verifyRecoveryProof/);
  assert.match(source, /RECOVERY_PROOF_COOKIE_NAME/);
  assert.match(source, /\/auth\/forgot-password\?status=link-required/);
});

test("successful password update globally signs out and redirects without credentials", async () => {
  await withEnvironment(validConfig, async () => {
    const calls: string[] = [];
    const response = await handleUpdatePasswordPost(request(undefined, {}, undefined, true), {
      createClient: (_url, _anonKey, state) => ({
        auth: {
          getUser: async () => confirmedUser,
          getClaims: async () => ({ data: { claims: recoveryClaims() }, error: null }),
          updateUser: async ({ password }) => {
            calls.push(`update:${password}`);
            state.setAll([{ name: "sb-session", value: "new-session", options: { path: "/", maxAge: 3600 } }], {});
            return { error: null };
          },
          signOut: async ({ scope }) => {
            calls.push(`signout:${scope}`);
            state.setAll([{ name: "sb-session", value: "", options: { path: "/", maxAge: 0 } }], {});
            return { error: null };
          },
        },
      }),
    });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), `${trustedOrigin}/auth/login?status=password-updated`);
    assert.deepEqual(calls, ["update:correct-horse", "signout:global"]);
    assertSecurityHeaders(response);
    const setCookie = response.headers.get("set-cookie") ?? "";
    assert.match(setCookie, /qwerty_recovery_proof=;/);
    assert.match(setCookie, /Path=\/auth\/update-password/);
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Lax/i);
    assert.match(setCookie, /max-age=0/i);
    const body = await response.text();
    assert.equal(body, "");
    assert.doesNotMatch(response.headers.get("location") ?? "", /correct-horse|token/i);
  });
});

test("update failure and global sign-out failure never forward a staged session or claim success", async () => {
  await withEnvironment(validConfig, async () => {
    const updateFailure = await handleUpdatePasswordPost(request(undefined, {}, undefined, true), {
      createClient: () => ({
        auth: {
          getUser: async () => confirmedUser,
          getClaims: async () => ({ data: { claims: recoveryClaims() }, error: null }),
          updateUser: async () => ({ error: new Error("provider detail with password") }),
          signOut: async () => ({ error: null }),
        },
      }),
    });
    assert.equal(updateFailure.status, 503);
    assertSecurityHeaders(updateFailure);
    assertNoCookieLeak(updateFailure);
    assert.doesNotMatch(await updateFailure.text(), /provider detail|correct-horse|password-updated/);

    const signOutFailure = await handleUpdatePasswordPost(request(undefined, {}, undefined, true), {
      createClient: (_url, _anonKey, state) => ({
        auth: {
          getUser: async () => confirmedUser,
          getClaims: async () => ({ data: { claims: recoveryClaims() }, error: null }),
          updateUser: async () => {
            state.setAll([{ name: "sb-session", value: "new-session", options: { path: "/", maxAge: 3600 } }], {});
            return { error: null };
          },
          signOut: async () => ({ error: new Error("sign out detail") }),
        },
      }),
    });
    assert.equal(signOutFailure.status, 503);
    assertSecurityHeaders(signOutFailure);
    assertNoCookieLeak(signOutFailure);
    assert.doesNotMatch(await signOutFailure.text(), /sign out detail|password-updated/);
  });
});
