import type { NextRequest } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { handleCatalogPost, type CatalogGateway } from "../catalog-actions";
import { createSupabaseCatalogGateway } from "../catalog-gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function createGateway(): Promise<CatalogGateway | null> {
  const supabase = await createClient();
  return supabase ? createSupabaseCatalogGateway(supabase) : null;
}

export async function GET(request: NextRequest): Promise<Response> {
  return handleCatalogPost(request, { createGateway });
}

export async function POST(request: NextRequest): Promise<Response> {
  return handleCatalogPost(request, { createGateway });
}
