import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server.js";
import { NextResponse } from "next/server.js";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { type CallbackCookieState, createCallbackCookieState } from "../../../lib/supabase/callback-cookies.ts";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { getSupabaseConfig } from "../../../lib/supabase/config.ts";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { getTrustedSiteOrigin, isTrustedCallbackRequest } from "../../../lib/supabase/confirm.ts";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { buildRecoveryProofClearCookieOptions, parseRecoverySigningKey, RECOVERY_PROOF_COOKIE_NAME, verifyRecoveryProof } from "../../../lib/supabase/recovery-proof.ts";

const securityHeaders = {
  "Cache-Control": "private, no-store",
  Expires: "0",
  Pragma: "no-cache",
  "Referrer-Policy": "no-referrer",
} as const;

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 256;

type UpdatePasswordAuth = {
  getUser(): Promise<{
    data: { user: { id: string; email_confirmed_at?: string | null } | null };
    error: unknown | null;
  }>;
  getClaims(): Promise<{
    data: { claims: unknown } | null;
    error: unknown | null;
  }>;
  updateUser(credentials: { password: string }): Promise<{ error: unknown | null }>;
  signOut(options: { scope: "global" }): Promise<{ error: unknown | null }>;
};

type UpdatePasswordClient = { auth: UpdatePasswordAuth };

type UpdatePasswordDependencies = {
  getTrustedOrigin?: typeof getTrustedSiteOrigin;
  getConfig?: typeof getSupabaseConfig;
  getRecoverySigningKey?: () => string | null;
  createClient?: (url: string, anonKey: string, state: CallbackCookieState) => UpdatePasswordClient;
};

function createRouteClient(url: string, anonKey: string, state: CallbackCookieState): UpdatePasswordClient {
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: state.getAll,
      setAll: state.setAll,
    },
  });
}

function applySecurityHeaders(response: NextResponse): NextResponse {
  Object.entries(securityHeaders).forEach(([name, value]) => {
    response.headers.set(name, value);
  });
  return response;
}

function errorResponse(message: string, status: 400 | 401 | 403 | 405 | 503, allow?: string): NextResponse {
  const headers = new Headers(securityHeaders);
  if (allow) headers.set("Allow", allow);
  return NextResponse.json({ error: message }, { status, headers });
}

export function methodNotAllowed(): NextResponse {
  return errorResponse("Method not allowed", 405, "POST");
}

function invalidRedirect(origin: string): NextResponse {
  return applySecurityHeaders(NextResponse.redirect(
    new URL("/auth/update-password?status=invalid", origin),
    303,
  ));
}

function successRedirect(origin: string, state: CallbackCookieState): NextResponse {
  const response = NextResponse.redirect(
    new URL("/auth/login?status=password-updated", origin),
    303,
  );
  state.cookies.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });
  response.cookies.set(
    RECOVERY_PROOF_COOKIE_NAME,
    "",
    buildRecoveryProofClearCookieOptions(new URL(origin).protocol === "https:"),
  );
  Object.entries(state.headers).forEach(([name, value]) => {
    response.headers.set(name, value);
  });
  return applySecurityHeaders(response);
}

function trustedHeaders(request: NextRequest, trustedOrigin: string): boolean {
  return request.headers.get("origin") === trustedOrigin
    && isTrustedCallbackRequest(request, trustedOrigin);
}

function singleString(formData: FormData, name: string): string | null {
  const values = formData.getAll(name);
  return values.length === 1 && typeof values[0] === "string" ? values[0] : null;
}

function validPasswords(formData: FormData): { password: string } | null {
  const password = singleString(formData, "password");
  const confirmation = singleString(formData, "password_confirmation");
  if (password === null || confirmation === null
    || password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH
    || confirmation.length > MAX_PASSWORD_LENGTH || password !== confirmation) return null;
  return { password };
}

type RecoveryUserResult = {
  data: { user: { id: string; email_confirmed_at?: string | null } | null };
  error: unknown | null;
};

type RecoveryClaimsResult = {
  data: { claims: unknown } | null;
  error: unknown | null;
};

function getRecoverySigningKey(): string | null {
  const value = process.env.QWERTY_RECOVERY_SIGNING_KEY;
  return parseRecoverySigningKey(value) ? value ?? null : null;
}

function hasValidRecoveryProof(
  userResult: RecoveryUserResult,
  claimsResult: RecoveryClaimsResult,
  proof: string | undefined,
  signingKey: unknown,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  const user = userResult.data.user;
  const claims = claimsResult.data?.claims;
  if (
    userResult.error
    || claimsResult.error
    || !user?.email_confirmed_at
    || typeof claims !== "object"
    || claims === null
  ) return false;

  const verifiedClaims = claims as Record<string, unknown>;
  const sessionId = verifiedClaims.session_id;
  const expiration = verifiedClaims.exp;
  if (
    verifiedClaims.sub !== user.id
    || typeof sessionId !== "string"
    || sessionId.length === 0
    || typeof expiration !== "number"
    || !Number.isSafeInteger(expiration)
    || expiration <= nowSeconds
  ) return false;

  return parseRecoverySigningKey(signingKey) !== null
    && verifyRecoveryProof(proof, user.id, sessionId, signingKey, nowSeconds);
}

export async function handleUpdatePasswordPost(
  request: NextRequest,
  dependencies: UpdatePasswordDependencies = {},
): Promise<NextResponse> {
  const trustedOrigin = (dependencies.getTrustedOrigin ?? getTrustedSiteOrigin)();
  const config = (dependencies.getConfig ?? getSupabaseConfig)();
  if (!trustedOrigin || !config) return errorResponse("Authentication unavailable", 503);

  if (!trustedHeaders(request, trustedOrigin)) {
    return errorResponse("Request rejected", 400);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return invalidRedirect(trustedOrigin);
  }
  const credentials = validPasswords(formData);
  if (!credentials) return invalidRedirect(trustedOrigin);

  const state = createCallbackCookieState(request);
  const proof = request.cookies.get(RECOVERY_PROOF_COOKIE_NAME)?.value;
  const signingKey = (dependencies.getRecoverySigningKey ?? getRecoverySigningKey)();
  const supabase = (dependencies.createClient ?? createRouteClient)(config.url, config.anonKey, state);

  try {
    const [userResult, claimsResult] = await Promise.all([
      supabase.auth.getUser(),
      supabase.auth.getClaims(),
    ]);
    if (userResult.error || claimsResult.error) return errorResponse("Authentication unavailable", 503);
    if (!userResult.data.user?.email_confirmed_at) {
      return errorResponse("Authentication required", 401);
    }
    if (!hasValidRecoveryProof(userResult, claimsResult, proof, signingKey)) {
      return errorResponse("Recovery link required", 403);
    }

    const { error: updateError } = await supabase.auth.updateUser(credentials);
    if (updateError) return errorResponse("Password update unavailable", 503);

    const { error: signOutError } = await supabase.auth.signOut({ scope: "global" });
    if (signOutError) return errorResponse("Could not complete password recovery", 503);
  } catch {
    return errorResponse("Authentication unavailable", 503);
  }

  return successRedirect(trustedOrigin, state);
}
