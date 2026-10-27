import { createHmac, timingSafeEqual } from "node:crypto";

const RECOVERY_MAX_AGE_SECONDS = 15 * 60;
const RECOVERY_FUTURE_SKEW_SECONDS = 30;
const RECOVERY_PROOF_VERSION = 1;
const RECOVERY_SIGNING_KEY_BYTES = 32;
const RECOVERY_SIGNING_KEY_LENGTH = 43;
const RECOVERY_MAC_BYTES = 32;
const MAX_IDENTIFIER_LENGTH = 256;
const MAX_PAYLOAD_LENGTH = 512;
const MAX_PROOF_LENGTH = 768;
const MAX_ACCESS_TOKEN_LENGTH = 16 * 1024;
const MAX_ACCESS_TOKEN_SEGMENT_LENGTH = 8 * 1024;

export const RECOVERY_PROOF_COOKIE_NAME = "qwerty_recovery_proof";

export type RecoveryProofCookieOptions = {
  httpOnly: true;
  sameSite: "lax";
  path: "/auth/update-password";
  maxAge: number;
  secure: boolean;
};

type RecoveryProofPayload = {
  version: number;
  sub: string;
  session_id: string;
  issued_at: number;
};

export type RecoverySessionIdentity = {
  sub: string;
  session_id: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isEpochSeconds(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_IDENTIFIER_LENGTH;
}

function encodeBase64Url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function decodeCanonicalBase64Url(value: unknown, maxLength: number): Buffer | null {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > maxLength
    || !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    return null;
  }

  const decoded = Buffer.from(value, "base64url");
  return decoded.length > 0 && encodeBase64Url(decoded) === value ? decoded : null;
}

/** Parse the exact canonical 32-byte base64url value from QWERTY_RECOVERY_SIGNING_KEY. */
export function parseRecoverySigningKey(value: unknown): Buffer | null {
  if (typeof value !== "string" || value.length !== RECOVERY_SIGNING_KEY_LENGTH) return null;
  const decoded = decodeCanonicalBase64Url(value, RECOVERY_SIGNING_KEY_LENGTH);
  return decoded?.length === RECOVERY_SIGNING_KEY_BYTES ? decoded : null;
}

function isValidNow(value: unknown): value is number {
  return isEpochSeconds(value);
}

/**
 * Decode only the identity fields from a GoTrue access token returned by verifyOtp.
 * This deliberately does not verify the JWT; callers must compare this result with
 * getClaims() and getUser() before using it for a recovery proof.
 */
export function parseRecoveryAccessTokenIdentity(value: unknown): RecoverySessionIdentity | null {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_ACCESS_TOKEN_LENGTH) return null;

  const segments = value.split(".");
  if (segments.length !== 3 || segments.some((segment) => (
    segment.length === 0
    || segment.length > MAX_ACCESS_TOKEN_SEGMENT_LENGTH
    || !/^[A-Za-z0-9_-]+$/.test(segment)
  ))) return null;

  const payloadSegment = segments[1];
  const payload = decodeCanonicalBase64Url(payloadSegment, MAX_ACCESS_TOKEN_SEGMENT_LENGTH);
  if (!payload) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload.toString("utf8"));
  } catch {
    return null;
  }
  if (!isRecord(parsed) || !isIdentifier(parsed.sub) || !isIdentifier(parsed.session_id)) return null;

  return { sub: parsed.sub, session_id: parsed.session_id };
}

export function isRecoverySessionMatch(
  accessToken: unknown,
  claims: unknown,
  userId: unknown,
): boolean {
  if (!isRecord(claims) || !isIdentifier(userId) || !isIdentifier(claims.sub) || !isIdentifier(claims.session_id)) {
    return false;
  }
  const identity = parseRecoveryAccessTokenIdentity(accessToken);
  return identity !== null
    && identity.sub === claims.sub
    && identity.session_id === claims.session_id
    && identity.sub === userId;
}

/**
 * The caller must first verify the recovery callback with verifyOtp({ type: "recovery" }),
 * then obtain getClaims() and a fresh getUser(), and compare the fresh user's id and
 * session_id with those verified claims before calling this helper. This helper validates
 * claim shape and expiry, but does not verify JWT signatures or infer recovery from AMR,
 * a URL type, or any other untrusted marker; generic AMR "otp" alone is insufficient.
 */
export function issueRecoveryProof(
  claims: unknown,
  userId: string,
  signingKey: unknown,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): string | null {
  if (!isValidNow(nowSeconds) || !isIdentifier(userId)) return null;
  const key = parseRecoverySigningKey(signingKey);
  if (!key || !isRecord(claims)) return null;

  const subject = claims.sub;
  const sessionId = claims.session_id;
  const expiration = claims.exp;
  if (
    subject !== userId
    || !isIdentifier(sessionId)
    || !isEpochSeconds(expiration)
    || expiration <= nowSeconds
  ) {
    return null;
  }

  const payload: RecoveryProofPayload = {
    version: RECOVERY_PROOF_VERSION,
    sub: userId,
    session_id: sessionId,
    issued_at: nowSeconds,
  };
  const payloadSegment = encodeBase64Url(JSON.stringify(payload));
  if (payloadSegment.length > MAX_PAYLOAD_LENGTH) return null;

  const mac = createHmac("sha256", key).update(payloadSegment, "ascii").digest();
  return `${payloadSegment}.${encodeBase64Url(mac)}`;
}

function parseProofPayload(value: Buffer): RecoveryProofPayload | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value.toString("utf8"));
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;

  const keys = Object.keys(parsed).sort();
  if (keys.join(",") !== "issued_at,session_id,sub,version") return null;
  if (
    parsed.version !== RECOVERY_PROOF_VERSION
    || !isIdentifier(parsed.sub)
    || !isIdentifier(parsed.session_id)
    || !isEpochSeconds(parsed.issued_at)
  ) {
    return null;
  }

  return {
    version: parsed.version,
    sub: parsed.sub,
    session_id: parsed.session_id,
    issued_at: parsed.issued_at,
  };
}

export function verifyRecoveryProof(
  proof: unknown,
  userId: string,
  sessionId: string,
  signingKey: unknown,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  if (
    typeof proof !== "string"
    || proof.length === 0
    || proof.length > MAX_PROOF_LENGTH
    || !isIdentifier(userId)
    || !isIdentifier(sessionId)
    || !isValidNow(nowSeconds)
  ) {
    return false;
  }

  const key = parseRecoverySigningKey(signingKey);
  if (!key) return false;

  const segments = proof.split(".");
  if (segments.length !== 2 || segments[0].length > MAX_PAYLOAD_LENGTH) return false;
  const [payloadSegment, macSegment] = segments;
  const payload = decodeCanonicalBase64Url(payloadSegment, MAX_PAYLOAD_LENGTH);
  if (!payload || macSegment.length !== 43) return false;
  const suppliedMac = decodeCanonicalBase64Url(macSegment, 43);
  if (!suppliedMac || suppliedMac.length !== RECOVERY_MAC_BYTES) return false;

  const expectedMac = createHmac("sha256", key).update(payloadSegment, "ascii").digest();
  if (expectedMac.length !== suppliedMac.length || !timingSafeEqual(expectedMac, suppliedMac)) return false;

  const parsed = parseProofPayload(payload);
  return parsed !== null
    && parsed.sub === userId
    && parsed.session_id === sessionId
    && parsed.issued_at <= nowSeconds + RECOVERY_FUTURE_SKEW_SECONDS
    && nowSeconds - parsed.issued_at <= RECOVERY_MAX_AGE_SECONDS;
}

export function buildRecoveryProofCookieOptions(
  secure: boolean,
  clear = false,
): RecoveryProofCookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/auth/update-password",
    maxAge: clear ? 0 : RECOVERY_MAX_AGE_SECONDS,
    secure,
  };
}

export function buildRecoveryProofClearCookieOptions(secure: boolean): RecoveryProofCookieOptions {
  return buildRecoveryProofCookieOptions(secure, true);
}

