import type { SupabaseClient } from "@supabase/supabase-js";
import { accessRedirect } from "../auth/access-validation";
import { parseBusinessSelection, type OwnerBusiness } from "./owner-context";
import { listOwnerBusinesses, resolveOwnerContext } from "./owner-context-gateway";
import type { CreationStorefront } from "./stores/store-creation-contract";
import { validStorefront } from "./store-creation-client";
import type { OwnerAccountContext, OwnerPagination } from "./owner-shell";

export type OwnerSearch = URLSearchParams | Record<string, string | string[] | undefined>;
export function parseOwnerDashboardSearch(search: OwnerSearch): { ok: true; businessId?: string; page: number } | { ok: false } {
  const params = new URLSearchParams();
  if (search instanceof URLSearchParams) search.forEach((value, key) => { params.append(key, value); });
  else for (const [key, value] of Object.entries(search)) {
    if (Array.isArray(value)) return { ok: false };
    if (value !== undefined) params.append(key, value);
  }
  if ([...params.keys()].some(key => key !== "businessId" && key !== "storePage") || params.getAll("storePage").length > 1) return { ok: false };
  const raw = params.get("storePage") ?? "0";
  if (!/^(0|[1-9]\d{0,6})$/.test(raw) || Number(raw) > 1000000) return { ok: false };
  // Only the selection subset reaches the strict shared API parser.
  const selection = new URLSearchParams();
  for (const value of params.getAll("businessId")) selection.append("businessId", value);
  const parsed = parseBusinessSelection(selection);
  return parsed.ok ? { ...parsed, page: Number(raw) } : parsed;
}
type DashboardContext = { account: OwnerAccountContext; businesses: OwnerBusiness[]; pagination: OwnerPagination };
export type OwnerDashboardData =
  | { kind: "redirect"; href: string }
  | { kind: "invalid" }
  | { kind: "unavailable" }
  | { kind: "missing" }
  | (DashboardContext & { kind: "empty" })
  | (DashboardContext & { kind: "selected"; business: OwnerBusiness; storefront: CreationStorefront | null });

/** Inject only this request's session client. No global identity or default-store cache. */
export async function loadOwnerDashboard(client: SupabaseClient | null, search: OwnerSearch = {}): Promise<OwnerDashboardData> {
  const parsed = parseOwnerDashboardSearch(search);
  if (!parsed.ok) return { kind: "invalid" };
  if (!client) return { kind: "redirect", href: accessRedirect("/auth/login", "unavailable") };
  try {
    const { data, error } = await client.auth.getUser();
    if (error) return { kind: "unavailable" };
    const user = data.user;
    if (!user || user.is_anonymous) return { kind: "redirect", href: accessRedirect("/auth/login", "required") };
    if (!user.email_confirmed_at) return { kind: "redirect", href: accessRedirect("/auth/login", "unconfirmed") };
    if (!user.email || user.role !== "authenticated") return { kind: "redirect", href: accessRedirect("/auth/login", "required") };
    const selected = await resolveOwnerContext(client, parsed.businessId);
    if (!selected || selected.ownerId !== user.id) return { kind: "unavailable" };
    const list = await listOwnerBusinesses(client, parsed.page);
    if (!list || list.ownerId !== user.id) return { kind: "unavailable" };
    const context: DashboardContext = { account: { id: user.id }, businesses: list.businesses, pagination: { page: parsed.page, hasMore: list.hasMore } };
    if (!selected.business) return parsed.businessId ? { kind: "missing" } : { kind: "empty", ...context };
    const { data: storefront, error: storeError } = await client.from("business_storefronts")
      .select("slug,display_name,is_published").eq("business_id", selected.business.id).maybeSingle();
    if (storeError || (storefront !== null && !validStorefront(storefront))) return { kind: "unavailable" };
    return { kind: "selected", ...context, business: selected.business, storefront };
  } catch { return { kind: "unavailable" }; }
}
