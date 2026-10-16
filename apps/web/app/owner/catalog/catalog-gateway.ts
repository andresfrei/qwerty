import type { SupabaseClient } from "@supabase/supabase-js";
// @ts-expect-error Native Node tests require an explicit TypeScript extension.
import { CatalogWriteError, type CatalogGateway, type CatalogWrite, type ItemFields } from "./catalog-actions.ts";

type WriteResult = { data: unknown[] | null; error: unknown };

function itemPayload(fields: ItemFields): Record<string, unknown> {
  return {
    category_id: fields.categoryId,
    name: fields.name,
    description: fields.description,
    price_minor: fields.priceMinor,
    currency: fields.currency,
    is_available: fields.isAvailable,
    sort_order: fields.sortOrder,
  };
}

/**
 * Production adapter for the guarded catalog boundary. It only ever uses the
 * RLS-scoped session client, so tenant isolation is enforced by the database
 * policies anchored to `businesses.owner_id`.
 */
export function createSupabaseCatalogGateway(supabase: SupabaseClient): CatalogGateway {
  async function requireAffected(result: WriteResult, code: "not_found" | "storefront_missing"): Promise<void> {
    if (result.error) throw new CatalogWriteError("unavailable");
    if (!result.data || result.data.length === 0) throw new CatalogWriteError(code);
  }

  async function owned(table: string, businessId: string, id: string): Promise<boolean> {
    const { data, error } = await supabase
      .from(table)
      .select("id")
      .eq("business_id", businessId)
      .eq("id", id)
      .limit(1);
    if (error) throw new CatalogWriteError("unavailable");
    return ((data as unknown[] | null)?.length ?? 0) > 0;
  }

  return {
    async ownerBusinessId() {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data?.user || !data.user.email_confirmed_at) return null;
      const { data: rows, error: readError } = await supabase
        .from("businesses")
        .select("id")
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(1);
      if (readError) throw new CatalogWriteError("unavailable");
      return (rows as { id: string }[] | null)?.[0]?.id ?? null;
    },

    categoryOwnedBy: (businessId, categoryId) => owned("catalog_categories", businessId, categoryId),
    itemOwnedBy: (businessId, itemId) => owned("catalog_items", businessId, itemId),

    async write(write: CatalogWrite) {
      if (write.kind === "insert_category") {
        const { error } = await supabase.from("catalog_categories").insert({
          business_id: write.businessId,
          name: write.name,
          sort_order: write.sortOrder,
        });
        if (error) throw new CatalogWriteError("unavailable");
        return;
      }

      if (write.kind === "update_category") {
        const patch: Record<string, unknown> = {};
        if (write.name !== undefined) patch.name = write.name;
        if (write.sortOrder !== undefined) patch.sort_order = write.sortOrder;
        await requireAffected(
          await supabase.from("catalog_categories").update(patch)
            .eq("business_id", write.businessId).eq("id", write.categoryId).select("id"),
          "not_found",
        );
        return;
      }

      if (write.kind === "insert_item") {
        const { error } = await supabase.from("catalog_items").insert({
          business_id: write.businessId,
          ...itemPayload(write),
        });
        if (error) throw new CatalogWriteError("unavailable");
        return;
      }

      if (write.kind === "update_item") {
        await requireAffected(
          await supabase.from("catalog_items").update(itemPayload(write))
            .eq("business_id", write.businessId).eq("id", write.itemId).select("id"),
          "not_found",
        );
        return;
      }

      await requireAffected(
        await supabase.from("business_storefronts").update({ is_published: write.isPublished })
          .eq("business_id", write.businessId).select("business_id"),
        "storefront_missing",
      );
    },
  };
}
