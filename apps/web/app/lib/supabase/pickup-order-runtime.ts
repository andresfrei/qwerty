import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { PickupOrderConfig, PickupOrderDependencies } from "../pickup-order-http";
import type { PickupOrderRepository } from "../pickup-order-service";
import type { OrderCatalog } from "../order-quote";
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
function repository(client: SupabaseClient): PickupOrderRepository {
  return {
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
    async finalize(actor, business, intent, quote) {
      const { data, error } = await client.rpc("finalize_pickup_order", { p_actor: actor, p_business: business, p_intent: intent, p_quote: quote });
      if (error) throw Error("Finalization unavailable");
      return data;
    },
  };
}
// The only injection is server-owned composition. All SDK traffic is no-store,
// bounded, and never retries a finalization or signs in a new anonymous user.
export function createPickupOrderRuntime(options: { getConfig?: PickupOrderDependencies["getConfig"]; getOrigin?: PickupOrderDependencies["getOrigin"]; fetch?: typeof fetch } = {}): PickupOrderDependencies {
  const fetcher = options.fetch ?? fetch;
  const privateFetch: typeof fetch = (input, init) => fetcher(input, { ...init, cache: "no-store", signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000) });
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
