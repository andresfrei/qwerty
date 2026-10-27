import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server.js";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { getTrustedSiteOrigin, isTrustedCallbackRequest } from "../../../lib/supabase/confirm.ts";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { getSupabaseConfig } from "../../../lib/supabase/config.ts";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { parseRecoverySigningKey } from "../../../lib/supabase/recovery-proof.ts";

const securityHeaders = {
  "Cache-Control": "private, no-store",
  Expires: "0",
  Pragma: "no-cache",
  "Referrer-Policy": "no-referrer",
} as const;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type RecoveryClient = {
  auth: {
    resetPasswordForEmail(email: string, options: { redirectTo: string }): Promise<unknown>;
  };
};

type RecoveryDependencies = {
  getTrustedOrigin?: typeof getTrustedSiteOrigin;
  getConfig?: typeof getSupabaseConfig;
  getRecoverySigningKey?: () => string | null;
  createClient?: (url: string, anonKey: string) => RecoveryClient;
};

function getRecoverySigningKey(): string | null {
  const value = process.env.QWERTY_RECOVERY_SIGNING_KEY;
  return parseRecoverySigningKey(value) ? value ?? null : null;
}

function createRecoveryClient(url: string, anonKey: string): RecoveryClient {
  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function headers(): Headers {
  return new Headers(securityHeaders);
}

function errorResponse(message: string, status: 400 | 405 | 503, allow?: string): Response {
  const responseHeaders = headers();
  responseHeaders.set("Content-Type", "application/json");
  if (allow) responseHeaders.set("Allow", allow);
  return new Response(JSON.stringify({ error: message }), { status, headers: responseHeaders });
}

function redirectResponse(origin: string, status: "check-email" | "invalid"): Response {
  const responseHeaders = headers();
  responseHeaders.set("Location", new URL(`/auth/forgot-password?status=${status}`, origin).toString());
  return new Response(null, { status: 303, headers: responseHeaders });
}

function hasTrustedRequestHeaders(request: NextRequest, trustedOrigin: string): boolean {
  return request.headers.get("origin") === trustedOrigin
    && isTrustedCallbackRequest(request, trustedOrigin);
}

function validateRecoveryEmail(formData: FormData): string | null {
  const values = formData.getAll("email");
  if (values.length !== 1 || typeof values[0] !== "string") return null;

  const email = values[0].trim().toLowerCase();
  if (email.length === 0 || email.length > 254 || !EMAIL_PATTERN.test(email)) return null;
  return email;
}

export function methodNotAllowed(): Response {
  return errorResponse("Method not allowed", 405, "POST");
}

export async function handleForgotPasswordPost(
  request: NextRequest,
  dependencies: RecoveryDependencies = {},
): Promise<Response> {
  const trustedOrigin = (dependencies.getTrustedOrigin ?? getTrustedSiteOrigin)();
  const config = (dependencies.getConfig ?? getSupabaseConfig)();
  if (!trustedOrigin || !config) return errorResponse("Recovery unavailable", 503);

  if (!hasTrustedRequestHeaders(request, trustedOrigin)) {
    return errorResponse("Request rejected", 400);
  }

  if (!parseRecoverySigningKey((dependencies.getRecoverySigningKey ?? getRecoverySigningKey)())) {
    return errorResponse("Recovery unavailable", 503);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return redirectResponse(trustedOrigin, "invalid");
  }

  const email = validateRecoveryEmail(formData);
  if (!email) return redirectResponse(trustedOrigin, "invalid");

  try {
    const client = (dependencies.createClient ?? createRecoveryClient)(config.url, config.anonKey);
    await client.auth.resetPasswordForEmail(email, {
      redirectTo: `${trustedOrigin}/auth/confirm`,
    });
  } catch {
    // Provider errors intentionally share the same response as an existing address.
  }

  return redirectResponse(trustedOrigin, "check-email");
}
