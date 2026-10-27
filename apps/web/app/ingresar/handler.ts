import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server.js";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { type CallbackCookieState, createCallbackCookieState } from "../lib/supabase/callback-cookies.ts";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { getSupabaseConfig } from "../lib/supabase/config.ts";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { confirmedOwnerId } from "../owner/owner-context-gateway.ts";

type EntryDependencies = {
  getConfig?: typeof getSupabaseConfig;
  createClient?: (url: string, anonKey: string, state: CallbackCookieState) => SupabaseClient;
};
type EntryDestination = "/owner" | "/auth/login?status=required" | "/auth/login?status=unavailable";

function createRouteClient(url: string, anonKey: string, state: CallbackCookieState): SupabaseClient {
  return createServerClient(url, anonKey, {
    cookies: { getAll: state.getAll, setAll: state.setAll },
  });
}

function privateResponse(destination?: EntryDestination, verifiedState?: CallbackCookieState): NextResponse {
  // A raw response preserves a literal relative Location, never derived from request URL/Host.
  const response = new NextResponse(null, { status: destination ? 303 : 405 });
  if (verifiedState) {
    Object.entries(verifiedState.headers).forEach(([name, value]) => {
      response.headers.set(name, value);
    });
    verifiedState.cookies.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options);
    });
  }
  // Set last: SDK metadata must not replace the destination or enable shared caching.
  response.headers.set("Cache-Control", "private, no-store, no-cache, must-revalidate, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  response.headers.set("Vary", "Cookie");
  if (destination) response.headers.set("Location", destination);
  else response.headers.set("Allow", "GET");
  return response;
}

/** Server route only. A fresh identity selects a destination, never business authority. */
export async function handleLandingEntry(request: NextRequest, dependencies: EntryDependencies = {}): Promise<NextResponse> {
  if (request.method !== "GET") return privateResponse();
  try {
    const config = (dependencies.getConfig ?? getSupabaseConfig)();
    if (!config) return privateResponse("/auth/login?status=unavailable");
    const state = createCallbackCookieState(request);
    const client = (dependencies.createClient ?? createRouteClient)(config.url, config.anonKey, state);
    const ownerId = await confirmedOwnerId(client);
    // Guard malformed SDK identity shape without replacing the shared eligibility helper.
    if (typeof ownerId !== "string" || !ownerId) return privateResponse("/auth/login?status=required");
    return privateResponse("/owner", state);
  } catch {
    // No provider details, identity, or unverified refresh state escape on failure.
    return privateResponse("/auth/login?status=unavailable");
  }
}
