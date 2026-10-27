import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server.js";
import { NextResponse } from "next/server.js";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { getSupabaseConfig } from "./app/lib/supabase/config.ts";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { applyProxyResponse, collectProxyResponse, createProxyResponseState } from "./app/lib/supabase/proxy-response.ts";

export async function proxy(request: NextRequest) {
  const config = getSupabaseConfig();
  if (!config) {
    return NextResponse.json(
      { error: "Supabase session configuration unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  const responseState = createProxyResponseState();
  const supabase = createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
        });
        collectProxyResponse(responseState, cookiesToSet, headers);
      },
    },
  });

  try {
    await supabase.auth.getClaims();
  } catch {
    // A failed refresh is treated as an anonymous request; route authorization is separate.
  }

  // Next snapshots request cookies while constructing this response, so this must be last.
  const response = NextResponse.next({ request });
  applyProxyResponse(response, responseState);
  return response;
}

export const config = {
  matcher: ["/owner/:path*", "/auth/confirm"],
};
