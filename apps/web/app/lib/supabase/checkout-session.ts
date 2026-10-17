import { NextRequest, NextResponse } from "next/server.js";
import type { Session } from "@supabase/supabase-js";
import type { SupabaseConfig } from "./config";
import type { StorefrontRead } from "../storefront-reader";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { createCallbackCookieState, type CallbackCookieState } from "./callback-cookies.ts";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { isTrustedCallbackRequest } from "./confirm.ts";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { checkoutRuntime } from "./checkout-session-runtime.ts";

type AuthResult = { data: { user: object | null }; error: { name: string } | null };
type SignupResult = { data: { user: object | null; session: Session | null }; error: { name: string } | null };
export type CheckoutDependencies = {
  getConfig(): SupabaseConfig | null;
  getOrigin(): string | null;
  readStorefront(slug: string): Promise<StorefrontRead>;
  createAuth(config: SupabaseConfig, state: CallbackCookieState): {
    getUser(): Promise<AuthResult>;
    signInAnonymously(): Promise<SignupResult>;
  };
};

function response(payload: object, status: number): NextResponse {
  return NextResponse.json(payload, { status, headers: {
    "Cache-Control": "private, no-store", Pragma: "no-cache", Expires: "0",
    "Referrer-Policy": "no-referrer", ...(status === 405 ? { Allow: "POST" } : {}),
  } });
}

export function checkoutMethodNotAllowed(): NextResponse {
  return response({ error: "Method not allowed" }, 405);
}

// Bound bytes while streaming, rather than trusting Content-Length or buffering
// an arbitrary body. Slug syntax/publication remains the public reader's job.
async function readSlug(request: NextRequest): Promise<string | null> {
  if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const body: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    const fields = Object.keys(body);
    if (fields.length !== 1 || fields[0] !== "slug") return null;
    const slug = (body as { slug: unknown }).slug;
    return typeof slug === "string" ? slug : null;
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

export async function handleCheckoutSession(request: NextRequest, dependencies: CheckoutDependencies = checkoutRuntime): Promise<NextResponse> {
  if (request.method !== "POST") return checkoutMethodNotAllowed();
  const unavailable = () => response({ error: "Checkout session unavailable" }, 503);
  try {
    const config = dependencies.getConfig();
    const origin = dependencies.getOrigin();
    if (!config || !origin) return unavailable();
    if (request.headers.get("origin") !== origin || !isTrustedCallbackRequest(request, origin)) {
      return response({ error: "Request rejected" }, 400);
    }
    const slug = await readSlug(request);
    if (slug === null) return response({ error: "Request rejected" }, 400);
    const store = await dependencies.readStorefront(slug);
    if (store.status === "not_found") return response({ error: "Storefront unavailable" }, 404);
    if (store.status !== "ok") return unavailable();

    // The shared helper mutates its request cookie jar. Give it a detached jar:
    // neither rejected requests nor provider failures can mutate the caller.
    const stagedRequest = new NextRequest(request.url, { headers: new Headers(request.headers) });
    const state = createCallbackCookieState(stagedRequest);
    const hadAuthCookie = state.getAll().some(({ name }) => /^sb-.*-auth-token(?:\.\d+)?$/.test(name));
    const auth = dependencies.createAuth(config, state);
    const verified = await auth.getUser();
    if (verified.error || !verified.data.user) {
      // Invalid JWTs, refresh/network errors and unreadable existing sessions
      // must not be treated as permission to replace the browser's identity.
      if (hadAuthCookie || (verified.error && verified.error.name !== "AuthSessionMissingError")) return unavailable();
      state.cookies.length = 0;
      state.headers = {};
      const signedIn = await auth.signInAnonymously();
      // A user-only SDK response does not establish a browser session.
      if (signedIn.error || !signedIn.data.user || !signedIn.data.session) return unavailable();
    }
    const ready = response({ ready: true }, 200);
    state.cookies.forEach(({ name, value, options }) => {
      ready.cookies.set(name, value, options);
    });
    // Only cookie writes are committed; SDK headers cannot override our private
    // response policy or introduce provider/account details into the response.
    return ready;
  } catch {
    return unavailable();
  }
}
