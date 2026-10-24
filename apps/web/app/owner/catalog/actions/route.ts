import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { getSupabaseConfig } from "../../../lib/supabase/config";
import { handleCatalogPost, type CatalogGateway } from "../catalog-actions";
import { createSupabaseCatalogGateway } from "../catalog-gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function createGateway(): Promise<CatalogGateway | null> {
  const supabase = await createClient();
  return supabase ? createSupabaseCatalogGateway(supabase) : null;
}

export async function GET(request: NextRequest): Promise<Response> {
  return POST(request);
}

export async function POST(request: NextRequest): Promise<Response> {
  // Preserve the existing no-selection cookie adapter. Selected requests stage
  // refresh locally; only fresh identity, not later business/action status, enables it.
  if (!request.nextUrl.searchParams.has("businessId")) return handleCatalogPost(request, { createGateway });
  const staged = new Map<string, { name: string; value: string; options: CookieOptions }>();
  let verifiedOwner = false;
  const response = await handleCatalogPost(request, {
    async createGateway() {
      const config = getSupabaseConfig();
      if (!config) return null;
      const client = createServerClient(config.url, config.anonKey, {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll(values) { for (const cookie of values) staged.set(cookie.name, cookie); },
        },
      });
      return createSupabaseCatalogGateway(client, () => { verifiedOwner = true; });
    },
  });
  const result = new NextResponse(response.body, { status: response.status, headers: response.headers });
  if (verifiedOwner) for (const cookie of staged.values()) result.cookies.set(cookie.name, cookie.value, cookie.options);
  return result;
}
