import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server.js";
import { NextResponse } from "next/server.js";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { isUnconfirmedEmailError } from "../../auth/access-actions.ts";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { accessRedirect, ACCESS_STATUS_KEYS, validateAccessForm } from "../../auth/access-validation.ts";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { createCallbackCookieState } from "./callback-cookies.ts";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { getTrustedSiteOrigin, isTrustedCallbackRequest } from "./confirm.ts";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { getSupabaseConfig } from "./config.ts";

const securityHeaders = {
  "Cache-Control": "private, no-store",
  Expires: "0",
  Pragma: "no-cache",
  "Referrer-Policy": "no-referrer",
} as const;

type AccessKind = "login" | "signup";

type CookieState = ReturnType<typeof createCallbackCookieState>;

function errorResponse(message: string, status: 400 | 405 | 503, allow?: string): NextResponse {
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

function redirectWithState(origin: string, destination: string, state?: CookieState): NextResponse {
  const response = NextResponse.redirect(new URL(destination, origin), 303);
  if (state) {
    state.cookies.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options);
    });
    Object.entries(state.headers).forEach(([name, value]) => {
      response.headers.set(name, value);
    });
  }
  return applySecurityHeaders(response);
}

function hasTrustedRequestHeaders(request: NextRequest, trustedOrigin: string): boolean {
  return request.headers.get("origin") === trustedOrigin
    && isTrustedCallbackRequest(request, trustedOrigin);
}

function accessDestination(kind: AccessKind): "/auth/login" | "/auth/signup" {
  return kind === "login" ? "/auth/login" : "/auth/signup";
}

function accessErrorResponse(kind: AccessKind, origin: string, status: "invalid" | "unavailable"): NextResponse {
  return redirectWithState(origin, accessRedirect(accessDestination(kind), ACCESS_STATUS_KEYS[status]));
}

async function signOutUnexpectedSession(
  supabase: ReturnType<typeof createServerClient>,
): Promise<void> {
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // Do not forward staged session cookies even when local cleanup is unavailable.
  }
}

export function methodNotAllowed(): NextResponse {
  return errorResponse("Method not allowed", 405, "POST");
}

export async function handleAccessPost(request: NextRequest, kind: AccessKind): Promise<NextResponse> {
  const trustedOrigin = getTrustedSiteOrigin();
  const config = getSupabaseConfig();
  if (!trustedOrigin || !config) {
    return errorResponse("Authentication unavailable", 503);
  }

  if (!hasTrustedRequestHeaders(request, trustedOrigin)) {
    return errorResponse("Request rejected", 400);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return accessErrorResponse(kind, trustedOrigin, "invalid");
  }

  const credentials = validateAccessForm(formData);
  if (!credentials.ok) {
    return accessErrorResponse(kind, trustedOrigin, "invalid");
  }

  const state = createCallbackCookieState(request);
  const supabase = createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll: state.getAll,
      setAll: state.setAll,
    },
  });

  if (kind === "login") {
    try {
      const { data, error } = await supabase.auth.signInWithPassword(credentials);
      if (data.session) {
        if (error) {
          await signOutUnexpectedSession(supabase);
          return accessErrorResponse(kind, trustedOrigin, "unavailable");
        }
        return redirectWithState(trustedOrigin, "/owner", state);
      }
      if (!error) return accessErrorResponse(kind, trustedOrigin, "unavailable");
      if (isUnconfirmedEmailError(error)) {
        return redirectWithState(
          trustedOrigin,
          accessRedirect("/auth/login", ACCESS_STATUS_KEYS.unconfirmed),
        );
      }
    } catch {
      return accessErrorResponse(kind, trustedOrigin, "unavailable");
    }

    return accessErrorResponse(kind, trustedOrigin, "invalid");
  }

  try {
    const { data } = await supabase.auth.signUp({
      email: credentials.email,
      password: credentials.password,
      options: { emailRedirectTo: `${trustedOrigin}/auth/confirm` },
    });
    if (data.session) {
      await signOutUnexpectedSession(supabase);
      return accessErrorResponse(kind, trustedOrigin, "unavailable");
    }
  } catch {
    // Signup always uses the same neutral response for provider-level outcomes.
  }

  return redirectWithState(
    trustedOrigin,
    accessRedirect("/auth/signup", ACCESS_STATUS_KEYS.checkEmail),
  );
}
