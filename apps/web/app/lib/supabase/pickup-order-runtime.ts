import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { PickupOrderConfig, PickupOrderConnection, PickupOrderDependencies } from "../pickup-order-http";
import type { PickupOrderRepository } from "../pickup-order-service";
import type { OrderCatalog } from "../order-quote";
import type { CatalogConfigurationRuntime } from "../catalog-configuration-runtime";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { CONFIGURED_SNAPSHOT_MAX_BYTES, createCatalogConfigurationRuntime } from "../catalog-configuration-runtime.ts";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { getSupabaseConfig } from "./config.ts";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { getTrustedSiteOrigin } from "./confirm.ts";

const columns = "id,actor_id,business_id,request_id,receipt_id,intent,quote,currency,total_minor,fulfillment_state,payment_state,created_at";
function configuredServiceKey(): string | undefined {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) return undefined;
  if (key.startsWith("sb_secret_") && key.length > 10 && !key.includes(".")) return key;
  try {
    const parts = key.split(".");
    return parts.length === 3 && parts.every(Boolean) && JSON.parse(Buffer.from(parts[1] ?? "", "base64url").toString("utf8")).role === "service_role" ? key : undefined;
  } catch { return undefined; }
}
function repository(client: SupabaseClient): PickupOrderRepository & CatalogConfigurationRuntime {
  return {
    ...createCatalogConfigurationRuntime(client),
    async resolveBusiness(slug) {
      // Routing is privileged, not publication-gated: historical attempts must
      // still replay after unpublication. This selector grants no read authority.
      const { data, error } = await client.from("business_storefronts").select("business_id,slug").eq("slug", slug).maybeSingle();
      if (error || (data && data.slug !== slug)) throw Error("Routing unavailable");
      return data?.business_id ?? null;
    },
    async findAttempt(actor, business, requestId) {
      const { data, error } = await client.from("pickup_orders").select(columns).eq("actor_id", actor).eq("business_id", business).eq("request_id", requestId).maybeSingle();
      if (error) throw Error("Attempt unavailable");
      return data;
    },
    async catalog(business, slug) {
      const { data, error } = await client.rpc("pickup_order_catalog", { p_business: business, p_slug: slug });
      if (error) throw Error("Catalog unavailable");
      return data as OrderCatalog | null;
    },
    async finalizeConfigured(actor, business, intent, quote) {
      const { data, error } = await client.rpc("finalize_pickup_order_v2", { p_actor: actor, p_business: business, p_intent: intent, p_quote: quote });
      if (error) throw Error("Finalization unavailable");
      return data;
    },
    async finalize(actor, business, intent, quote) {
      const { data, error } = await client.rpc("finalize_pickup_order", { p_actor: actor, p_business: business, p_intent: intent, p_quote: quote });
      if (error) throw Error("Finalization unavailable");
      return data;
    },
  };
}
// Bound the privileged v2 body before the SDK's JSON decoder allocates it. The
// existing v1 transport is unchanged. Both declared and streamed sizes count.
async function boundedConfiguredResponse(response: Response): Promise<Response> {
  const tooLarge = () => Response.json({ code: "configured_snapshot_limit", message: "Catalog unavailable" }, { status: 413 });
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > CONFIGURED_SNAPSHOT_MAX_BYTES)) {
    await response.body?.cancel();
    return tooLarge();
  }
  if (!response.body) return response;
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > CONFIGURED_SNAPSHOT_MAX_BYTES) { await reader.cancel(); return tooLarge(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new Response(bytes, { status: response.status, statusText: response.statusText, headers: response.headers });
}

export type ConfiguredPickupOrderDependencies = Omit<PickupOrderDependencies, "connect"> & {
  connect(config: PickupOrderConfig, state: Parameters<PickupOrderDependencies["connect"]>[1]): Omit<PickupOrderConnection, "service"> & {
    service(): PickupOrderRepository & CatalogConfigurationRuntime;
  };
};
// The only injection is server-owned composition. All SDK traffic is no-store,
// bounded, and never retries a finalization or signs in a new anonymous user.
export function createPickupOrderRuntime(options: { getConfig?: PickupOrderDependencies["getConfig"]; getOrigin?: PickupOrderDependencies["getOrigin"]; fetch?: typeof fetch } = {}): ConfiguredPickupOrderDependencies {
  const fetcher = options.fetch ?? fetch;
  const privateFetch: typeof fetch = async (input, init) => {
    const response = await fetcher(input, { ...init, cache: "no-store", signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000) });
    const url = new URL(input instanceof Request ? input.url : String(input));
    return url.pathname === "/rest/v1/rpc/pickup_order_catalog_v2" ? boundedConfiguredResponse(response) : response;
  };
  return {
    getConfig: options.getConfig ?? (() => { const config = getSupabaseConfig(); return config ? { ...config, serviceKey: configuredServiceKey() } : null; }),
    getOrigin: options.getOrigin ?? getTrustedSiteOrigin,
    connect(config: PickupOrderConfig, state) {
      const client = createServerClient(config.url, config.anonKey, { cookies: { getAll: state.getAll, setAll: state.setAll }, global: { fetch: privateFetch } });
      return {
        getUser: () => client.auth.getUser(),
        service() {
          if (!config.serviceKey) throw Error("Service unavailable");
          return repository(createClient(config.url, config.serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: privateFetch } }));
        },
        async findOrder(id) {
          const { data, error } = await client.from("pickup_orders").select(columns).eq("id", id).maybeSingle();
          if (error) throw Error("Order unavailable");
          return data;
        },
        async queue(actor, business) {
          // Buyer SELECT permission is deliberately insufficient here. The INNER
          // business relation enforces CURRENT confirmed ownership in the SAME
          // RLS statement; there is no service check/read TOCTOU window.
          const { data, error } = await client.from("pickup_orders").select(`${columns},businesses!inner(id,owner_id)`)
            .eq("business_id", business).eq("businesses.id", business).eq("businesses.owner_id", actor)
            .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(100);
          if (error) throw Error("Queue unavailable");
          return data;
        },
      };
    },
  };
}
export const pickupOrderRuntime = createPickupOrderRuntime();
