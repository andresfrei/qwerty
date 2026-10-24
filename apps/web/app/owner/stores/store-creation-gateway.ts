import type { SupabaseClient } from "@supabase/supabase-js";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { confirmedOwnerId, findOwnedBusiness, type VerifiedOwnerCallback } from "../owner-context-gateway.ts";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { StoreCreationWriteError, type StoreCreationGateway } from "./store-creation-contract.ts";

function writeFailure(code?: string): StoreCreationWriteError {
  // Only a received SQL rejection is known not to have committed. Transport/SDK
  // failures, malformed representations and all other codes remain ambiguous.
  return new StoreCreationWriteError(code === "23505" ? "duplicate" : ["23514", "23502", "42501"].includes(code ?? "") ? "rejected" : "unknown");
}

/** Only caller-session clients; the owner predicate must precede storefront access. */
export function createStoreCreationGateway(client: SupabaseClient, onVerifiedOwner?: VerifiedOwnerCallback): StoreCreationGateway {
  return {
    confirmedUser: () => confirmedOwnerId(client, onVerifiedOwner),
    ownedBusiness: (ownerId, businessId) => findOwnedBusiness(client, ownerId, businessId),
    async storefront(businessId) {
      const { data, error } = await client.from("business_storefronts").select("slug,display_name,is_published").eq("business_id", businessId).maybeSingle();
      if (error) throw new Error("unavailable");
      return data;
    },
    async insertBusiness(ownerId, input) {
      const { data, error } = await client.from("businesses").insert({ id: input.businessId, owner_id: ownerId, name: input.name }).select("id,name").single();
      if (error) throw writeFailure(error.code);
      if (!data || data.id !== input.businessId || typeof data.name !== "string") throw writeFailure();
      return data;
    },
    async insertStorefront(business, slug) {
      const { data, error } = await client.from("business_storefronts").insert({ business_id: business.id, slug, display_name: business.name, is_published: false }).select("slug,display_name,is_published").single();
      if (error) throw writeFailure(error.code);
      if (!data || typeof data.slug !== "string" || typeof data.display_name !== "string" || typeof data.is_published !== "boolean") throw writeFailure();
      return data;
    },
  };
}
