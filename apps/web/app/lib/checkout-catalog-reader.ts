import type { Option, OptionGroup } from "./catalog-selection";
import type { StorefrontRead } from "./storefront-reader";
// @ts-expect-error Native Node tests require an explicit TypeScript extension.
import { readStorefront } from "./storefront-reader.ts";
// @ts-expect-error Native Node tests require an explicit TypeScript extension.
import { getSupabaseConfig } from "./supabase/config.ts";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type PublishedCatalog = Extract<StorefrontRead, { status: "ok" }>;
export type CheckoutCatalogRead =
  | (PublishedCatalog & { groups: OptionGroup[]; options: Option[]; surchargeMinor: number })
  | Exclude<StorefrontRead, { status: "ok" }>;

type Row = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_ROWS = 1000;
const groupFields = "id,business_id,item_id,name,selection_mode,min_select,max_select,sort_order";
const optionFields = "id,business_id,group_id,name,price_delta_minor,is_available,sort_order";
const settingsFields = "business_id,two_flavor_surcharge_minor";
const isId = (value: unknown): value is string => typeof value === "string" && UUID.test(value);
const isName = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const isInteger = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

function row(value: unknown): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid row");
  return value as Row;
}

function unique(ids: string[]): Set<string> {
  const set = new Set(ids);
  if (set.size !== ids.length) throw new Error("duplicate id");
  return set;
}

function ordered<T extends { sort_order: number; id: string }>(values: T[]): T[] {
  return values.sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
}

// Fixed-origin public REST only. Count metadata detects backend row caps instead
// of silently dropping a required group or an option from the price contract.
async function rows(fetcher: Fetcher, base: string, key: string, table: string,
  params: Record<string, string>): Promise<unknown[]> {
  const url = new URL(`/rest/v1/${table}`, base);
  for (const [name, value] of Object.entries({ ...params, limit: String(MAX_ROWS) })) {
    url.searchParams.set(name, value);
  }
  const response = await fetcher(url, {
    cache: "no-store", credentials: "omit", redirect: "error",
    headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: "count=exact" },
  });
  if (!response.ok) throw new Error("backend response");
  const body: unknown = await response.json();
  assertComplete(response, body);
  return body as unknown[];
}

function assertComplete(response: Response, body: unknown): void {
  const match = response.headers.get("content-range")?.match(/^(?:0-(\d+)|\*)\/(\d+)$/);
  if (!Array.isArray(body) || !match || Number(match[2]) !== body.length || body.length > MAX_ROWS ||
    (body.length === 0 ? match[1] !== undefined : Number(match[1]) !== body.length - 1)) {
    throw new Error("incomplete backend payload");
  }
}

function groupsFrom(values: unknown[], business: string, itemIds: Set<string>): OptionGroup[] {
  const groups = values.map((value): OptionGroup => {
    const g = row(value);
    if (!isId(g.id) || g.business_id !== business || !isId(g.item_id) || !itemIds.has(g.item_id) ||
      !isName(g.name) || (g.selection_mode !== "distinct" && g.selection_mode !== "quantity") ||
      !isInteger(g.min_select) || !isInteger(g.max_select) || g.max_select < g.min_select || !isInteger(g.sort_order)) {
      throw new Error("invalid group");
    }
    return { id: g.id, item_id: g.item_id, name: g.name, selection_mode: g.selection_mode,
      min_select: g.min_select, max_select: g.max_select, sort_order: g.sort_order };
  });
  unique(groups.map((group) => group.id));
  return ordered(groups);
}

function optionsFrom(values: unknown[], business: string, groupIds: Set<string>): Option[] {
  const options = values.map((value): Option => {
    const o = row(value);
    if (!isId(o.id) || o.business_id !== business || !isId(o.group_id) || !groupIds.has(o.group_id) ||
      !isName(o.name) || !isInteger(o.price_delta_minor) || o.is_available !== true || !isInteger(o.sort_order)) {
      throw new Error("invalid option");
    }
    return { id: o.id, group_id: o.group_id, name: o.name, price_delta_minor: o.price_delta_minor,
      is_available: true, sort_order: o.sort_order };
  });
  unique(options.map((option) => option.id));
  return ordered(options);
}

export async function readCheckoutCatalog(slug: string, fetcher: Fetcher = fetch): Promise<CheckoutCatalogRead> {
  // Browsing and session eligibility retain the original reader and fetch sequence.
  const catalog = await readStorefront(slug, async (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set("Prefer", "count=exact");
    const response = await fetcher(input, { ...init, headers, credentials: "omit", redirect: "error" });
    if (response.ok) assertComplete(response, await response.clone().json());
    return response;
  });
  if (catalog.status !== "ok") return catalog;
  const config = getSupabaseConfig();
  if (!config) return { status: "misconfigured" };
  try {
    if (catalog.storefront.slug !== slug) throw new Error("storefront association");
    const business = catalog.storefront.business_id;
    const itemIds = unique(catalog.categories.flatMap(({ items }) => items.map((item) => item.id)));
    const read = (table: string, params: Record<string, string>) => rows(fetcher, config.url, config.anonKey, table,
      { ...params, business_id: `eq.${business}` });
    const groups = itemIds.size === 0 ? [] : groupsFrom(await read("catalog_option_groups", {
      select: groupFields, item_id: `in.(${[...itemIds].join(",")})`, order: "sort_order.asc,id.asc",
    }), business, itemIds);
    const groupIds = new Set(groups.map((group) => group.id));
    // Options depend on validated groups; settings and options are independent.
    const [optionRows, settingRows] = await Promise.all([
      groupIds.size === 0 ? Promise.resolve([]) : read("catalog_options", {
        select: optionFields, group_id: `in.(${[...groupIds].join(",")})`, is_available: "eq.true", order: "sort_order.asc,id.asc",
      }),
      read("business_catalog_settings", { select: settingsFields }),
    ]);
    if (settingRows.length > 1) throw new Error("multiple settings");
    // Match the existing owner catalog: a complete successful zero-row read means zero.
    let surchargeMinor = 0;
    if (settingRows.length === 1) {
      const setting = row(settingRows[0]);
      if (setting.business_id !== business || !isInteger(setting.two_flavor_surcharge_minor)) throw new Error("invalid settings");
      surchargeMinor = setting.two_flavor_surcharge_minor;
    }
    const { business_id, slug: publicSlug, display_name, is_published } = catalog.storefront;
    return { status: "ok", storefront: { business_id, slug: publicSlug, display_name, is_published },
      categories: catalog.categories.map(({ category, items }) => ({
        category: { id: category.id, business_id: category.business_id, name: category.name, sort_order: category.sort_order },
        items,
      })),
      groups, options: optionsFrom(optionRows, business, groupIds), surchargeMinor };
  } catch {
    return { status: "unavailable" };
  }
}
