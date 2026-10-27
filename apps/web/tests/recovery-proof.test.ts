import assert from "node:assert/strict";
import test from "node:test";
import {
  RECOVERY_PROOF_COOKIE_NAME,
  buildRecoveryProofCookieOptions,
  buildRecoveryProofClearCookieOptions,
  isRecoverySessionMatch,
  issueRecoveryProof,
  parseRecoveryAccessTokenIdentity,
  parseRecoverySigningKey,
  verifyRecoveryProof,
// @ts-expect-error Node's native TypeScript runner resolves explicit .ts imports.
} from "../app/lib/supabase/recovery-proof.ts";

const userId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const signingKey = "A".repeat(43);
const now = 1_700_000_000;

function claims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sub: userId,
    session_id: sessionId,
    exp: now + 300,
    ...overrides,
  };
}

function proof(overrides: Record<string, unknown> = {}, issuedAt = now): string {
  const value = issueRecoveryProof(claims(overrides), userId, signingKey, issuedAt);
  assert.ok(value);
  return value;
}

test("requires a canonical base64url key containing exactly 32 bytes", () => {
  assert.equal(parseRecoverySigningKey(signingKey)?.length, 32);
  assert.equal(parseRecoverySigningKey("A".repeat(42)), null);
  assert.equal(parseRecoverySigningKey("A".repeat(44)), null);
  assert.equal(parseRecoverySigningKey(`${"A".repeat(42)}=`), null);
  assert.equal(parseRecoverySigningKey("not base64url"), null);
});

function accessToken(sub = userId, session_id = sessionId): string {
  const payload = Buffer.from(JSON.stringify({ sub, session_id })).toString("base64url");
  return `e30.${payload}.signature`;
}

test("matches a bounded access-token identity to verified claims and fresh user", () => {
  const verifiedClaims = claims();
  assert.deepEqual(parseRecoveryAccessTokenIdentity(accessToken()), { sub: userId, session_id: sessionId });
  assert.equal(isRecoverySessionMatch(accessToken(), verifiedClaims, userId), true);
  assert.equal(isRecoverySessionMatch(accessToken(userId, "other-session"), verifiedClaims, userId), false);
  assert.equal(isRecoverySessionMatch("not-a-jwt", verifiedClaims, userId), false);
  assert.equal(isRecoverySessionMatch(accessToken(), { ...verifiedClaims, sub: "other-user" }, userId), false);
});

test("rejects invalid or oversized access-token payload shapes", () => {
  assert.equal(parseRecoveryAccessTokenIdentity("a.b.c"), null);
  assert.equal(parseRecoveryAccessTokenIdentity(`e30.${"A".repeat(8193)}.signature`), null);
  assert.equal(parseRecoveryAccessTokenIdentity(`e30.${Buffer.from("not-json").toString("base64url")}.signature`), null);
  assert.equal(parseRecoveryAccessTokenIdentity(`e30.${Buffer.from(JSON.stringify({ sub: userId })).toString("base64url")}.signature`), null);
});

test("mints and verifies a proof for the matching user and session", () => {
  const value = proof();
  assert.equal(verifyRecoveryProof(value, userId, sessionId, signingKey, now), true);
});

test("rejects tampered payloads and MACs", () => {
  const value = proof();
  const [payload, mac] = value.split(".");
  assert.equal(verifyRecoveryProof(`${payload.slice(0, -1)}A.${mac}`, userId, sessionId, signingKey, now), false);
  assert.equal(verifyRecoveryProof(`${payload}.${mac.slice(0, -1)}A`, userId, sessionId, signingKey, now), false);
});

test("rejects wrong identity, missing proof, and invalid signing keys", () => {
  const value = proof();
  assert.equal(verifyRecoveryProof(value, "33333333-3333-4333-8333-333333333333", sessionId, signingKey, now), false);
  assert.equal(verifyRecoveryProof(value, userId, "", signingKey, now), false);
  assert.equal(verifyRecoveryProof(undefined, userId, sessionId, signingKey, now), false);
  assert.equal(verifyRecoveryProof("", userId, sessionId, signingKey, now), false);
  assert.equal(verifyRecoveryProof(value, userId, sessionId, "invalid", now), false);
});

test("rejects expired, future, malformed, and oversized proofs", () => {
  assert.equal(verifyRecoveryProof(proof({}, now - 901), userId, sessionId, signingKey, now), false);
  assert.equal(verifyRecoveryProof(proof({}, now + 31), userId, sessionId, signingKey, now), false);
  assert.equal(verifyRecoveryProof("not.valid", userId, sessionId, signingKey, now), false);
  assert.equal(verifyRecoveryProof("!!!.abc", userId, sessionId, signingKey, now), false);
  assert.equal(verifyRecoveryProof(`${"A".repeat(513)}.${"A".repeat(43)}`, userId, sessionId, signingKey, now), false);
  assert.equal(issueRecoveryProof(claims({ exp: now }), userId, signingKey, now), null);
});

test("requires validated claims and does not treat generic OTP or URL type as recovery", () => {
  assert.equal(issueRecoveryProof({ amr: [{ method: "otp" }] }, userId, signingKey, now), null);
  assert.equal(issueRecoveryProof({ type: "recovery" }, userId, signingKey, now), null);
  assert.equal(issueRecoveryProof(claims({ sub: undefined }), userId, signingKey, now), null);
  assert.equal(issueRecoveryProof(claims({ session_id: undefined }), userId, signingKey, now), null);
  assert.equal(issueRecoveryProof(claims({ exp: undefined }), userId, signingKey, now), null);
  assert.equal(issueRecoveryProof(claims({ sub: "other" }), userId, signingKey, now), null);
});

test("builds host-only recovery cookie options for HTTP and HTTPS", () => {
  assert.equal(RECOVERY_PROOF_COOKIE_NAME, "qwerty_recovery_proof");
  assert.deepEqual(buildRecoveryProofCookieOptions(false), {
    httpOnly: true,
    sameSite: "lax",
    path: "/auth/update-password",
    maxAge: 900,
    secure: false,
  });
  assert.equal(buildRecoveryProofCookieOptions(true).secure, true);
  assert.deepEqual(buildRecoveryProofClearCookieOptions(true), {
    httpOnly: true,
    sameSite: "lax",
    path: "/auth/update-password",
    maxAge: 0,
    secure: true,
  });
});
