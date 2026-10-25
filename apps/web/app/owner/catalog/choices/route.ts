import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "../../../lib/supabase/config";
import { createCatalogChoicesGateway, handleCatalogChoicesRequest } from "../catalog-choices-gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(request: NextRequest): Promise<Response> {
  const staged = new Map<string, { name: string; value: string; options: CookieOptions }>();
  let verifiedOwner = false;
  const response = await handleCatalogChoicesRequest(request, {
    async createGateway() {
      const config = getSupabaseConfig();
      if (!config) return null;
      const client = createServerClient(config.url, config.anonKey, {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll(values) { for (const cookie of values) staged.set(cookie.name, cookie); },
        },
      });
      return createCatalogChoicesGateway(client, () => { verifiedOwner = true; });
    },
  });
  const result = new NextResponse(response.body, { status: response.status, headers: response.headers });
  // Identity, not response.ok: retain refresh after later scoped 404/503 failures.
  if (verifiedOwner) for (const cookie of staged.values()) result.cookies.set(cookie.name, cookie.value, cookie.options);
  return result;
}
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const HEAD = handle;
export const OPTIONS = handle;
