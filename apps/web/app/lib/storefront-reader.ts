import type { CatalogItem } from "./storefront";
// @ts-expect-error Native Node tests require an explicit TypeScript extension.
import { readProductPhoto, type StorefrontPhoto } from "./storefront-photo.ts";
// @ts-expect-error Native Node tests require an explicit TypeScript extension.
import { getSupabaseConfig } from "./supabase/config.ts";

export type CatalogCategory = {
  id: string;
  business_id: string;
  name: string;
  sort_order: number;
};

// The reader only exposes a photo when the stored path is valid; a malformed or
// missing value degrades to the honest fallback instead of breaking the read.
export type StorefrontItem = CatalogItem & { photo: StorefrontPhoto };

export type StorefrontCategory = {
  category: CatalogCategory;
  items: StorefrontItem[];
};

export type Storefront = {
  business_id: string;
  slug: string;
  display_name: string;
  is_published: boolean;
};

export type StorefrontRead =
  | { status: "ok"; storefront: Storefront; categories: StorefrontCategory[] }
  | { status: "not_found" }
  | { status: "misconfigured" | "unavailable" };

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const storefrontFields = "business_id,slug,display_name,is_published";
const categoryFields = "id,business_id,name,sort_order";
const itemFields = "id,business_id,category_id,name,description,price_minor,currency,is_available,sort_order,photo_path";

type CatalogItemRow = CatalogItem & { photo_path?: unknown };

function configured(): { base: string; key: string } | null {
  const config = getSupabaseConfig();
  return config ? { base: config.url, key: config.anonKey } : null;
}

function endpoint(base: string, table: string, params: Record<string, string>): string {
  const url = new URL(`/rest/v1/${table}`, base);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return url.toString();
}

function validStorefront(value: unknown): value is Storefront {
  const item = value as Storefront;
  return Boolean(item && UUID.test(item.business_id) && typeof item.slug === "string" &&
    typeof item.display_name === "string" && item.is_published === true);
}

function validCatalogCategory(value: unknown): value is CatalogCategory {
  const category = value as CatalogCategory;
  return Boolean(category && UUID.test(category.id) && UUID.test(category.business_id) &&
    typeof category.name === "string" && category.name.trim().length > 0 &&
    Number.isSafeInteger(category.sort_order) && category.sort_order >= 0);
}

function validCatalogItem(value: unknown): value is CatalogItemRow {
  const item = value as CatalogItem;
  return Boolean(item && UUID.test(item.id) && UUID.test(item.business_id) && UUID.test(item.category_id) &&
    typeof item.name === "string" && item.name.trim().length > 0 &&
    (item.description === null || typeof item.description === "string") &&
    Number.isSafeInteger(item.price_minor) && item.price_minor >= 0 && /^[A-Z]{3}$/.test(item.currency) &&
    item.is_available === true && Number.isSafeInteger(item.sort_order) && item.sort_order >= 0);
}

async function getRows(fetcher: Fetcher, url: string, key: string): Promise<unknown[]> {
  const response = await fetcher(url, {
    cache: "no-store",
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!response.ok) throw new Error("backend response");
  const body: unknown = await response.json();
  if (!Array.isArray(body)) throw new Error("backend payload");
  return body;
}

function bySortOrder(left: { sort_order: number; id: string }, right: { sort_order: number; id: string }): number {
  return left.sort_order - right.sort_order || left.id.localeCompare(right.id);
}

export async function readStorefront(slug: string, fetcher: Fetcher = fetch): Promise<StorefrontRead> {
  if (!SLUG.test(slug) || slug.length > 63) return { status: "not_found" };
  const config = configured();
  if (!config) return { status: "misconfigured" };
  try {
    const stores = await getRows(fetcher, endpoint(config.base, "business_storefronts", {
      select: storefrontFields, slug: `eq.${slug}`, limit: "1",
    }), config.key);
    const storefront = stores[0];
    if (!validStorefront(storefront)) return { status: "not_found" };

    const categoryRows = await getRows(fetcher, endpoint(config.base, "catalog_categories", {
      select: categoryFields, business_id: `eq.${storefront.business_id}`,
      order: "sort_order.asc,id.asc",
    }), config.key);
    if (!categoryRows.every(validCatalogCategory)) throw new Error("backend payload");
    const categories = categoryRows as CatalogCategory[];
    const categoryById = new Map<string, CatalogCategory>();
    for (const category of categories) {
      if (category.business_id !== storefront.business_id || categoryById.has(category.id)) throw new Error("backend association");
      categoryById.set(category.id, category);
    }

    const itemRows = await getRows(fetcher, endpoint(config.base, "catalog_items", {
      select: itemFields, business_id: `eq.${storefront.business_id}`, is_available: "eq.true",
      order: "sort_order.asc,id.asc",
    }), config.key);
    if (!itemRows.every(validCatalogItem)) throw new Error("backend payload");
    const items = itemRows as CatalogItemRow[];
    const grouped = new Map<string, StorefrontItem[]>();
    for (const item of items) {
      if (item.business_id !== storefront.business_id || !categoryById.has(item.category_id)) throw new Error("backend association");
      const storefrontItem: StorefrontItem = {
        id: item.id,
        business_id: item.business_id,
        category_id: item.category_id,
        name: item.name,
        description: item.description,
        price_minor: item.price_minor,
        currency: item.currency,
        is_available: item.is_available,
        sort_order: item.sort_order,
        photo: readProductPhoto({
          value: item.photo_path,
          businessId: storefront.business_id,
          itemId: item.id,
          baseUrl: config.base,
        }),
      };
      grouped.set(item.category_id, [...(grouped.get(item.category_id) ?? []), storefrontItem]);
    }

    const visibleCategories = categories
      .slice()
      .sort(bySortOrder)
      .flatMap((category) => {
        const categoryItems = grouped.get(category.id);
        if (!categoryItems?.length) return [];
        return [{ category, items: categoryItems.slice().sort(bySortOrder) }];
      });
    return { status: "ok", storefront, categories: visibleCategories };
  } catch {
    return { status: "unavailable" };
  }
}
