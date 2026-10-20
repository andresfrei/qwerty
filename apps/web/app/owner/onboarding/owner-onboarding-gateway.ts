import type { SupabaseClient } from "@supabase/supabase-js";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { OnboardingError, type OnboardingGateway, type FirstBusiness, type DraftStorefront } from "./owner-onboarding.ts";

/** Caller-session client only. Current confirmed/nondeleted ownership is enforced again by RLS. */
export function createOnboardingGateway(client: SupabaseClient): OnboardingGateway {
  let boundUser: string | null = null;
  let boundBusiness: string | null = null;
  return {
    async confirmedUser() {
      const { data, error } = await client.auth.getUser();
      const user = data?.user;
      boundUser = !error && user?.email && user.email_confirmed_at && !user.is_anonymous && user.role === "authenticated" ? user.id : null;
      return boundUser;
    },
    async firstBusiness(ownerId) {
      if (!boundUser || ownerId !== boundUser) throw new OnboardingError("unavailable");
      const { data, error } = await client.from("businesses").select("id,name").eq("owner_id", boundUser)
        .order("created_at", { ascending: true }).order("id", { ascending: true }).limit(1);
      if (error) throw new OnboardingError("unavailable");
      const business = (data as FirstBusiness[] | null)?.[0] ?? null;
      boundBusiness = business?.id ?? null;
      return business;
    },
    async storefront(businessId) {
      if (!boundUser || businessId !== boundBusiness) throw new OnboardingError("unavailable");
      const { data, error } = await client.from("business_storefronts").select("slug,display_name,is_published").eq("business_id", businessId).maybeSingle();
      if (error) throw new OnboardingError("unavailable");
      return data as DraftStorefront | null;
    },
    async createBusiness(ownerId, name) {
      if (!boundUser || ownerId !== boundUser || boundBusiness) throw new OnboardingError("unavailable");
      const { data, error } = await client.from("businesses").insert({ owner_id: boundUser, name }).select("id,name").single();
      // Even an error can follow a committed write; the client must read before retrying.
      if (error || !data) throw new OnboardingError("unknown");
      boundBusiness = data.id;
      return data as FirstBusiness;
    },
    async createDraft(businessId, displayName, slug) {
      if (!boundUser || businessId !== boundBusiness) throw new OnboardingError("unavailable");
      const { data, error } = await client.from("business_storefronts").insert({ business_id: boundBusiness, display_name: displayName, slug, is_published: false })
        .select("slug,display_name,is_published").single();
      // Never return provider details or inspect someone else's conflicting slug.
      if (error?.code === "23505") throw new OnboardingError("slug_unavailable");
      if (error || !data) throw new OnboardingError("unknown");
      return data as DraftStorefront;
    },
  };
}
