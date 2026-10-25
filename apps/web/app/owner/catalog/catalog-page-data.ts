import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadOwnerDashboard, type OwnerDashboardData } from "../owner-dashboard-data";
import { parseCatalogPageQuery, type CatalogSearch, type CatalogView, type CatalogPageRequest } from "./catalog-navigation";

export const CATALOG_PAGE_SIZE = 25;
export type TaxonomyResource = "categories" | "groups" | "options" | "settings";
export type TaxonomyView = Omit<CatalogView, "resource"> & { resource: TaxonomyResource };
export type CategorySummary = { id: string; business_id: string; name: string; sort_order: number };
export type ItemParent = { id: string; business_id: string; name: string };
export type GroupSummary = CategorySummary & { item_id: string; selection_mode: "distinct" | "quantity"; min_select: number; max_select: number };
export type OptionSummary = CategorySummary & { group_id: string; price_delta_minor: number; is_available: boolean };
export type OptionDirectorySummary = OptionSummary & { item: ItemParent; group: GroupSummary };
export type TaxonomyRecord = CategorySummary | GroupSummary | OptionSummary | OptionDirectorySummary;
export type CatalogPagePagination = {
  page: number; pageSize: number; total: number; hasMore: boolean;
  pageComplete: true; collectionComplete: boolean;
};
type Parents = { item?: ItemParent; group?: GroupSummary };
export type TaxonomyPageData =
  | { kind: "list"; rows: TaxonomyRecord[]; pagination: CatalogPagePagination; parents: Parents }
  | { kind: "detail"; record: TaxonomyRecord; parents: Parents }
  | { kind: "new"; parents: Parents }
  | { kind: "settings"; storefront: Extract<OwnerDashboardData, { kind: "selected" }>["storefront"]; surchargeMinor: number };
export type CatalogTaxonomyPage = Exclude<OwnerDashboardData, { kind: "selected" }> | {
  kind: "ready"; owner: Extract<OwnerDashboardData, { kind: "selected" }>;
  request: CatalogPageRequest; data: TaxonomyPageData;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
const integer = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const name = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const fields = {
  categories: "id,business_id,name,sort_order",
  groups: "id,business_id,item_id,name,selection_mode,min_select,max_select,sort_order",
  options: "id,business_id,group_id,name,price_delta_minor,is_available,sort_order",
};
const tables = { categories: "catalog_categories", groups: "catalog_option_groups", options: "catalog_options" };
class Missing extends Error {}

function parseRow(value: unknown, resource: Exclude<TaxonomyResource, "settings">, business: string): TaxonomyRecord {
  if (!object(value) || !id(value.id) || value.business_id !== business || !name(value.name) || !integer(value.sort_order)) throw Error("unavailable");
  const base: CategorySummary = { id: value.id, business_id: business, name: value.name, sort_order: value.sort_order };
  if (resource === "categories") return base;
  if (resource === "groups") {
    if (!id(value.item_id) || (value.selection_mode !== "distinct" && value.selection_mode !== "quantity")
      || !integer(value.min_select) || !integer(value.max_select) || value.max_select < value.min_select) throw Error("unavailable");
    return { ...base, item_id: value.item_id, selection_mode: value.selection_mode, min_select: value.min_select, max_select: value.max_select };
  }
  if (!id(value.group_id) || !integer(value.price_delta_minor) || typeof value.is_available !== "boolean") throw Error("unavailable");
  return { ...base, group_id: value.group_id, price_delta_minor: value.price_delta_minor, is_available: value.is_available };
}

/** Exact count certifies the requested window, not that a first page is a whole collection. */
function counted(result: { data: unknown; error: unknown; count: number | null }, offset: number, size: number): unknown[] {
  if (result.error || !Array.isArray(result.data) || !integer(result.count)
    || result.data.length !== Math.min(size, Math.max(0, result.count - offset))) throw Error("unavailable");
  return result.data;
}

/** Request-local session SDK only. This taxonomy slice intentionally has no product/choice reader. */
export async function loadCatalogTaxonomyPage(client: SupabaseClient | null, search: CatalogSearch, view: TaxonomyView): Promise<CatalogTaxonomyPage> {
  const request = parseCatalogPageQuery(search, view);
  if (!request.ok || !["categories", "groups", "options", "settings"].includes(request.resource)) return { kind: "invalid" };
  const { mode, query } = request;
  const resource = request.resource as TaxonomyResource;
  // Contextual collections are not a global variety library. Details derive their real ancestry.
  if (mode !== "detail" && (resource === "groups" && !query.itemId || resource === "options" && mode === "new" && !query.groupId)) return { kind: "invalid" };
  const owner = await loadOwnerDashboard(client, request.ownerSearch);
  if (owner.kind !== "selected") return owner;
  if (!client) return { kind: "unavailable" };
  const sdk = client;
  const business = owner.business.id;
  try {
    async function single(table: string, columns: string, key: string, value: string): Promise<unknown> {
      const result = await client!.from(table).select(columns, { count: "exact" }).eq("business_id", business).eq(key, value).limit(2);
      const rows = counted(result, 0, 2);
      if (rows.length > 1) throw Error("unavailable");
      if (!rows.length) throw new Missing();
      return rows[0];
    }
    const parents: Parents = {};
    const items = new Map<string, ItemParent>();
    const groups = new Map<string, GroupSummary>();
    async function requireItem(itemId: string): Promise<void> {
      const cached = items.get(itemId);
      if (cached) { parents.item = cached; return; }
      const value = await single("catalog_items", "id,business_id,name", "id", itemId);
      if (!object(value) || value.business_id !== business || value.id !== itemId || !name(value.name)) throw Error("unavailable");
      parents.item = { id: itemId, business_id: business, name: value.name };
      items.set(itemId, parents.item);
    }
    async function requireGroup(groupId: string): Promise<void> {
      const cached = groups.get(groupId);
      if (cached) { parents.group = cached; await requireItem(cached.item_id); return; }
      const value = await single(tables.groups, fields.groups, "id", groupId);
      const group = parseRow(value, "groups", business) as GroupSummary;
      if (group.id !== groupId) throw Error("unavailable");
      if (query.itemId && group.item_id !== query.itemId) throw new Missing();
      await requireItem(group.item_id);
      parents.group = group;
      groups.set(groupId, group);
    }
    if (query.itemId) await requireItem(query.itemId);
    if (query.groupId) await requireGroup(query.groupId);

    let data: TaxonomyPageData;
    if (resource === "settings") {
      const result = await client.from("business_catalog_settings").select("business_id,two_flavor_surcharge_minor", { count: "exact" }).eq("business_id", business).limit(2);
      const rows = counted(result, 0, 2);
      if (rows.length > 1) throw Error("unavailable");
      const setting = rows[0];
      if (setting !== undefined && (!object(setting) || setting.business_id !== business || !integer(setting.two_flavor_surcharge_minor))) throw Error("unavailable");
      data = { kind: "settings", storefront: owner.storefront, surchargeMinor: setting === undefined ? 0 : (setting as { two_flavor_surcharge_minor: number }).two_flavor_surcharge_minor };
    } else if (mode === "new") {
      data = { kind: "new", parents };
    } else if (mode === "detail") {
      const record = parseRow(await single(tables[resource], fields[resource], "id", request.id!), resource, business);
      if (record.id !== request.id) throw Error("unavailable");
      if ("item_id" in record) {
        if (query.itemId && record.item_id !== query.itemId) throw new Missing();
        await requireItem(record.item_id);
      }
      if ("group_id" in record) {
        if (query.groupId && record.group_id !== query.groupId) throw new Missing();
        await requireGroup(record.group_id);
      }
      data = { kind: "detail", record, parents };
    } else {
      // An item-only directory uses the real group relationship, never a truncated group-ID selector.
      const columns = resource === "options" && query.itemId && !query.groupId
        ? `${fields.options},catalog_option_groups!inner(item_id)` : fields[resource];
      let read = client.from(tables[resource]).select(columns, { count: "exact" }).eq("business_id", business);
      if (resource === "groups" && query.itemId) read = read.eq("item_id", query.itemId);
      if (resource === "options" && query.groupId) read = read.eq("group_id", query.groupId);
      if (resource === "options" && query.itemId && !query.groupId) read = read.eq("catalog_option_groups.item_id", query.itemId);
      // One SDK filter value, never an interpolated PostgREST OR expression. '*' aliases '%'.
      if (query.q) read = read.ilike("name", `%${query.q.replace(/[\\%_*]/g, c => `\\${c === "*" ? "%" : c}`)}%`);
      const offset = query.page * CATALOG_PAGE_SIZE;
      const result = await read.order("sort_order", { ascending: true }).order("id", { ascending: true }).range(offset, offset + CATALOG_PAGE_SIZE - 1);
      let rows = counted(result, offset, CATALOG_PAGE_SIZE).map(value => parseRow(value, resource, business));
      if (new Set(rows.map(row => row.id)).size !== rows.length) throw Error("unavailable");
      for (const row of rows) {
        if ("item_id" in row && row.item_id !== query.itemId || "group_id" in row && query.groupId && row.group_id !== query.groupId) throw Error("unavailable");
      }
      if (resource === "options") {
        async function batch(table: string, columns: string, ids: string[]): Promise<unknown[]> {
          if (!ids.length) return [];
          const result = await sdk.from(table).select(columns, { count: "exact" })
            .eq("business_id", business).in("id", ids).limit(CATALOG_PAGE_SIZE);
          const found = counted(result, 0, CATALOG_PAGE_SIZE);
          if (result.count !== found.length || found.length > ids.length) throw Error("unavailable");
          return found;
        }
        const groupIds = new Set<string>();
        for (const row of rows) {
          if (!("group_id" in row)) throw Error("unavailable");
          groupIds.add(row.group_id);
        }
        const missingGroups = [...groupIds].filter(groupId => !groups.has(groupId));
        for (const value of await batch(tables.groups, fields.groups, missingGroups)) {
          const group = parseRow(value, "groups", business) as GroupSummary;
          if (!missingGroups.includes(group.id) || groups.has(group.id)) throw Error("unavailable");
          if (query.itemId && group.item_id !== query.itemId) throw new Missing();
          groups.set(group.id, group);
        }
        const itemIds = new Set<string>();
        for (const groupId of groupIds) {
          const group = groups.get(groupId);
          if (!group) throw new Missing();
          itemIds.add(group.item_id);
        }
        const missingItems = [...itemIds].filter(itemId => !items.has(itemId));
        for (const value of await batch("catalog_items", "id,business_id,name", missingItems)) {
          if (!object(value) || !id(value.id) || !missingItems.includes(value.id) || items.has(value.id)
            || value.business_id !== business || !name(value.name)) throw Error("unavailable");
          items.set(value.id, { id: value.id, business_id: business, name: value.name });
        }
        if ([...itemIds].some(itemId => !items.has(itemId))) throw new Missing();
        const enriched: OptionDirectorySummary[] = [];
        for (const row of rows) {
          if (!("group_id" in row)) throw Error("unavailable");
          const group = groups.get(row.group_id);
          const item = group && items.get(group.item_id);
          if (!group || !item) throw Error("unavailable");
          enriched.push({ ...row, group, item });
        }
        rows = enriched;
      }
      const total = result.count!;
      data = { kind: "list", rows, parents, pagination: {
        page: query.page, pageSize: CATALOG_PAGE_SIZE, total, hasMore: offset + rows.length < total,
        pageComplete: true, collectionComplete: offset === 0 && rows.length === total,
      } };
    }
    return { kind: "ready", owner, request, data };
  } catch (error) { return { kind: error instanceof Missing ? "missing" : "unavailable" }; }
}
