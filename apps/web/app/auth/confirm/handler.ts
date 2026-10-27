import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server.js";
import { NextResponse } from "next/server.js";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { type CallbackCookieState, createCallbackCookieState } from "../../lib/supabase/callback-cookies.ts";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { getTrustedSiteOrigin, isTrustedCallbackRequest, resolveAuthConfirm } from "../../lib/supabase/confirm.ts";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { getSupabaseConfig } from "../../lib/supabase/config.ts";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { buildRecoveryProofCookieOptions, isRecoverySessionMatch, issueRecoveryProof, parseRecoverySigningKey, RECOVERY_PROOF_COOKIE_NAME } from "../../lib/supabase/recovery-proof.ts";

const securityHeaders = {
  "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
  Expires: "0",
  "Pragma": "no-cache",
  "Referrer-Policy": "no-referrer",
};

function errorResponse(message: string, status: 400 | 503): NextResponse {
  return NextResponse.json({ error: message }, { status, headers: securityHeaders });
}

type ConfirmAuth = {
  verifyOtp(options: { type: "email" | "recovery"; token_hash: string }): Promise<{
    data: { session: { access_token: string } | null; user: { id: string } | null };
    error: unknown | null;
  }>;
  getClaims(): Promise<{ data: { claims: unknown } | null; error: unknown | null }>;
  getUser(): Promise<{
    data: { user: { id: string } | null };
    error: unknown | null;
  }>;
};

type ConfirmClient = { auth: ConfirmAuth };

type ConfirmDependencies = {
  getTrustedOrigin?: typeof getTrustedSiteOrigin;
  getConfig?: typeof getSupabaseConfig;
  getRecoverySigningKey?: () => string | null;
  createClient?: (url: string, anonKey: string, state: CallbackCookieState) => ConfirmClient;
};

function createRouteClient(url: string, anonKey: string, state: CallbackCookieState): ConfirmClient {
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: state.getAll,
      setAll: state.setAll,
    },
  });
}

function getRecoverySigningKey(): string | null {
  const value = process.env.QWERTY_RECOVERY_SIGNING_KEY;
  return parseRecoverySigningKey(value) ? value ?? null : null;
}

function redirectWithState(
  origin: string,
  path: string,
  state?: ReturnType<typeof createCallbackCookieState>,
  recoveryProof?: string,
): NextResponse {
  const response = NextResponse.redirect(new URL(path, origin), 303);

  state?.cookies.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });
  if (state) {
    Object.entries(state.headers).forEach(([name, value]) => {
      response.headers.set(name, value);
    });
  }
  if (recoveryProof) {
    response.cookies.set(
      RECOVERY_PROOF_COOKIE_NAME,
      recoveryProof,
      buildRecoveryProofCookieOptions(new URL(origin).protocol === "https:"),
    );
  }

  const directives = new Set((response.headers.get("Cache-Control") ?? "")
    .split(",").map((directive) => directive.trim()).filter(Boolean));
  securityHeaders["Cache-Control"].split(",").forEach((directive) => {
    directives.add(directive.trim());
  });
  response.headers.set("Cache-Control", [...directives].join(", "));
  response.headers.set("Expires", securityHeaders.Expires);
  response.headers.set("Pragma", securityHeaders.Pragma);
  response.headers.set("Referrer-Policy", securityHeaders["Referrer-Policy"]);
  return response;
}

export async function handleAuthConfirm(
  request: NextRequest,
  dependencies: ConfirmDependencies = {},
): Promise<NextResponse> {
  const config = (dependencies.getConfig ?? getSupabaseConfig)();
  const trustedOrigin = (dependencies.getTrustedOrigin ?? getTrustedSiteOrigin)();
  if (!config || !trustedOrigin) {
    return errorResponse("Authentication configuration unavailable", 503);
  }

  if (!isTrustedCallbackRequest(request, trustedOrigin)) {
    return errorResponse("Callback origin mismatch", 400);
  }

  const resolution = resolveAuthConfirm(request.nextUrl.searchParams);
  if (!resolution.otpType) {
    return redirectWithState(trustedOrigin, resolution.redirectPath);
  }

  const recoverySigningKey = resolution.otpType === "recovery"
    ? (dependencies.getRecoverySigningKey ?? getRecoverySigningKey)()
    : null;
  if (resolution.otpType === "recovery" && !parseRecoverySigningKey(recoverySigningKey)) {
    return errorResponse("Recovery unavailable", 503);
  }

  const state = createCallbackCookieState(request);
  const supabase = (dependencies.createClient ?? createRouteClient)(config.url, config.anonKey, state);

  try {
    const verification = await supabase.auth.verifyOtp({
      type: resolution.otpType,
      token_hash: resolution.tokenHash,
    });
    if (verification.error) throw new Error("OTP verification failed");

    if (resolution.otpType === "email") {
      return redirectWithState(trustedOrigin, resolution.redirectPath, state);
    }

    const accessToken = verification.data.session?.access_token;
    const verifiedUser = verification.data.user;
    if (!accessToken || !verifiedUser?.id) throw new Error("Recovery session unavailable");

    // Keep these lookups sequential: setAll from verifyOtp updates the request cookie view.
    const claimsResult = await supabase.auth.getClaims();
    const userResult = await supabase.auth.getUser();
    const verifiedClaims = claimsResult.data?.claims;
    const user = userResult.data.user;
    if (
      claimsResult.error
      || userResult.error
      || !verifiedClaims
      || !user
      || user.id !== verifiedUser.id
      || !isRecoverySessionMatch(accessToken, verifiedClaims, user.id)
    ) {
      throw new Error("Recovery session identity mismatch");
    }

    const proof = issueRecoveryProof(verifiedClaims, user.id, recoverySigningKey);
    if (!proof) throw new Error("Recovery proof unavailable");
    return redirectWithState(trustedOrigin, resolution.redirectPath, state, proof);
  } catch {
    // Invalid, expired, or inconsistent links use the same limited error destination.
  }

  return redirectWithState(trustedOrigin, "/auth/error");
}
