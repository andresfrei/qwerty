import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server.js";
import { NextResponse } from "next/server.js";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { createCallbackCookieState } from "../../lib/supabase/callback-cookies.ts";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { getTrustedSiteOrigin, isTrustedCallbackRequest } from "../../lib/supabase/confirm.ts";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { getSupabaseConfig } from "../../lib/supabase/config.ts";

const securityHeaders = {
  "Cache-Control": "private, no-store",
  Expires: "0",
  Pragma: "no-cache",
  "Referrer-Policy": "no-referrer",
};

function errorResponse(message: string, status: 400 | 401 | 405 | 503, allow?: string): NextResponse {
  const headers = new Headers(securityHeaders);
  if (allow) headers.set("Allow", allow);
  return NextResponse.json({ error: message }, { status, headers });
}

function applySecurityHeaders(response: NextResponse): NextResponse {
  Object.entries(securityHeaders).forEach(([name, value]) => {
    response.headers.set(name, value);
  });
  return response;
}

function redirectWithState(
  origin: string,
  state: ReturnType<typeof createCallbackCookieState>,
): NextResponse {
  const response = NextResponse.redirect(new URL("/auth/login?status=signed-out", origin), 303);
  state.cookies.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });
  Object.entries(state.headers).forEach(([name, value]) => {
    response.headers.set(name, value);
  });
  return applySecurityHeaders(response);
}

function hasTrustedRequestHeaders(request: NextRequest, trustedOrigin: string): boolean {
  return request.headers.get("origin") === trustedOrigin
    && isTrustedCallbackRequest(request, trustedOrigin);
}

export async function GET(): Promise<NextResponse> {
  return errorResponse("Method not allowed", 405, "POST");
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const config = getSupabaseConfig();
  const trustedOrigin = getTrustedSiteOrigin();
  if (!config || !trustedOrigin) {
    return errorResponse("Authentication configuration unavailable", 503);
  }

  if (!hasTrustedRequestHeaders(request, trustedOrigin)) {
    return errorResponse("Logout origin mismatch", 400);
  }

  const state = createCallbackCookieState(request);
  const supabase = createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll: state.getAll,
      setAll: state.setAll,
    },
  });

  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) return errorResponse("Authentication unavailable", 503);
    if (!data.user) return errorResponse("Authentication required", 401);

    const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
    if (signOutError) return errorResponse("Could not sign out", 503);
  } catch {
    return errorResponse("Authentication unavailable", 503);
  }

  return redirectWithState(trustedOrigin, state);
}
