import type { SupabaseClient } from "@supabase/supabase-js";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { parseBusinessSelection, type OwnerBusiness } from "./owner-context.ts";

export class OwnerContextError extends Error {
  constructor() { super("unavailable"); }
}

/** Request-local notification for session refresh, not a business authorization grant. */
export type VerifiedOwnerCallback = (ownerId: string) => void;

/** Fresh identity notification runs before any subsequent owned-business read. */
export async function confirmedOwnerId(client: SupabaseClient, onVerifiedOwner?: VerifiedOwnerCallback): Promise<string | null> {
  const { data, error } = await client.auth.getUser();
  const user = data?.user;
  const ownerId = !error && user?.email && user.email_confirmed_at && !user.is_anonymous && user.role === "authenticated" ? user.id : null;
  if (ownerId) onVerifiedOwner?.(ownerId);
  return ownerId;
}

/** Independent owned-row lookup: a truncated switcher must never authorize selection. */
export async function findOwnedBusiness(client: SupabaseClient, ownerId: string, businessId?: string): Promise<OwnerBusiness | null> {
  if (businessId !== undefined && !parseBusinessSelection(new URLSearchParams({ businessId })).ok) throw new OwnerContextError();
  let query = client.from("businesses").select("id,name").eq("owner_id", ownerId);
  if (businessId !== undefined) query = query.eq("id", businessId);
  const { data, error } = await query.order("created_at", { ascending: true }).order("id", { ascending: true }).limit(1);
  if (error) throw new OwnerContextError();
  return (data as OwnerBusiness[] | null)?.[0] ?? null;
}

export type OwnerContext = { ownerId: string; business: OwnerBusiness | null };
/** One request/session client per invocation; explicit absence never falls back. */
export async function resolveOwnerContext(client: SupabaseClient, businessId?: string, onVerifiedOwner?: VerifiedOwnerCallback): Promise<OwnerContext | null> {
  if (businessId !== undefined && !parseBusinessSelection(new URLSearchParams({ businessId })).ok) throw new OwnerContextError();
  const ownerId = await confirmedOwnerId(client, onVerifiedOwner);
  if (!ownerId) return null;
  return { ownerId, business: await findOwnedBusiness(client, ownerId, businessId) };
}

/** Bounded, owned-only switcher page; callers paginate instead of treating it as authority. */
export async function listOwnerBusinesses(client: SupabaseClient, page = 0): Promise<{ ownerId: string; businesses: OwnerBusiness[]; hasMore: boolean } | null> {
  if (!Number.isSafeInteger(page) || page < 0 || page > 1000000) throw new OwnerContextError();
  const ownerId = await confirmedOwnerId(client);
  if (!ownerId) return null;
  const { data, error } = await client.from("businesses").select("id,name").eq("owner_id", ownerId)
    .order("created_at", { ascending: true }).order("id", { ascending: true }).range(page * 100, page * 100 + 100);
  if (error) throw new OwnerContextError();
  const rows = (data as OwnerBusiness[] | null) ?? [];
  return { ownerId, businesses: rows.slice(0, 100), hasMore: rows.length > 100 };
}
