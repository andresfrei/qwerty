import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readCatalogConfigurationCapability, type CatalogConfigurationCapability } from "../../lib/catalog-configuration-runtime";
import { loadOwnerDashboard, type OwnerDashboardData } from "../owner-dashboard-data";
import { parseCatalogPageQuery, type CatalogSearch, type CatalogView, type CatalogPageRequest } from "./catalog-navigation";
import { CATALOG_PAGE_SIZE, type CategorySummary, type CatalogPagePagination } from "./catalog-page-data";

export type ItemView = Omit<CatalogView, "resource"> & { resource: "items" };
export type ItemProfileSummary = { kind: "legacy" | "standard" | "pizza" | "dozen" | "combo"; version: number; isActive: boolean };
export type CatalogItemSummary = {
  id: string; business_id: string; category_id: string; name: string; description: string | null;
  price_minor: number; currency: string; is_available: boolean; sort_order: number;
  photo_path: string | null; photo_version: number | string;
  category: CategorySummary; profile: ItemProfileSummary;
};
type ItemParents = { category?: CategorySummary };
type Capability = Exclude<CatalogConfigurationCapability, "unavailable">;
export type CatalogItemPageData =
  | { kind: "list"; rows: CatalogItemSummary[]; parents: ItemParents; pagination: CatalogPagePagination; capability: Capability }
  | { kind: "detail"; record: CatalogItemSummary; parents: ItemParents; capability: Capability }
  | { kind: "new"; parents: ItemParents; capability: Capability };
export type CatalogItemPage = Exclude<OwnerDashboardData, { kind: "selected" }> | {
  kind: "ready"; owner: Extract<OwnerDashboardData, { kind: "selected" }>; request: CatalogPageRequest; data: CatalogItemPageData;
};
const FIELDS = "id,business_id,category_id,name,description,price_minor,currency,is_available,sort_order,photo_path,photo_version";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const id = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
const integer = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const name = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
class Missing extends Error {}
function counted(result: { data: unknown; error: unknown; count: number | null }, offset: number, size: number): unknown[] {
  if (result.error || !Array.isArray(result.data) || !integer(result.count)
    || result.data.length !== Math.min(size, Math.max(0, result.count - offset))) throw Error("unavailable");
  return result.data;
}
function item(value: unknown, business: string): Omit<CatalogItemSummary, "category" | "profile"> {
  if (!object(value) || !id(value.id) || value.business_id !== business || !id(value.category_id) || !name(value.name)
    || !(value.description === null || typeof value.description === "string") || !integer(value.price_minor)
    || typeof value.currency !== "string" || !/^[A-Z]{3}$/.test(value.currency) || typeof value.is_available !== "boolean"
    || !integer(value.sort_order) || !(value.photo_path === null || typeof value.photo_path === "string")
    || !(integer(value.photo_version) || typeof value.photo_version === "string" && /^(0|[1-9][0-9]*)$/.test(value.photo_version)
      && BigInt(value.photo_version) <= BigInt("9223372036854775807"))) throw Error("unavailable");
  return { id: value.id, business_id: business, category_id: value.category_id, name: value.name, description: value.description,
    price_minor: value.price_minor, currency: value.currency, is_available: value.is_available, sort_order: value.sort_order,
    photo_path: value.photo_path, photo_version: value.photo_version };
}

/** Fresh session-role reads only; this is not a configuration/editor snapshot or write authorization. */
export async function loadCatalogItemPage(client: SupabaseClient | null, search: CatalogSearch, view: ItemView): Promise<CatalogItemPage> {
  const request = parseCatalogPageQuery(search, view);
  if (!request.ok || request.resource !== "items") return { kind: "invalid" };
  const owner = await loadOwnerDashboard(client, request.ownerSearch);
  if (owner.kind !== "selected") return owner;
  if (!client) return { kind: "unavailable" };
  const sdk = client;
  const business = owner.business.id;
  const { query, mode } = request;
  try {
    const categories = new Map<string, CategorySummary>();
    async function category(categoryId: string): Promise<CategorySummary> {
      const cached = categories.get(categoryId); if (cached) return cached;
      const rows = counted(await sdk.from("catalog_categories").select("id,business_id,name,sort_order", { count: "exact" })
        .eq("business_id", business).eq("id", categoryId).limit(2), 0, 2);
      if (!rows.length) throw new Missing();
      const row = rows[0];
      if (rows.length !== 1 || !object(row) || row.id !== categoryId || row.business_id !== business || !name(row.name) || !integer(row.sort_order)) throw Error("unavailable");
      const result = { id: categoryId, business_id: business, name: row.name, sort_order: row.sort_order };
      categories.set(categoryId, result); return result;
    }
    const parents: ItemParents = {};
    // Detail identity is never narrowed by the category used to reach the list.
    if (mode !== "detail" && query.categoryId) parents.category = await category(query.categoryId);
    let raw: unknown[] = [];
    let pagination: CatalogPagePagination | undefined;
    if (mode !== "new") {
      let read = client.from("catalog_items").select(FIELDS, { count: "exact" }).eq("business_id", business);
      if (mode === "detail") {
        if (!request.id) return { kind: "invalid" };
        raw = counted(await read.eq("id", request.id).limit(2), 0, 2);
        if (!raw.length) throw new Missing();
        if (raw.length !== 1) throw Error("unavailable");
      } else {
        if (query.categoryId) read = read.eq("category_id", query.categoryId);
        if (query.q) read = read.ilike("name", `%${query.q.replace(/[\\%_*]/g, c => `\\${c === "*" ? "%" : c}`)}%`);
        const offset = query.page * CATALOG_PAGE_SIZE;
        const result = await read.order("sort_order", { ascending: true }).order("id", { ascending: true }).range(offset, offset + CATALOG_PAGE_SIZE - 1);
        raw = counted(result, offset, CATALOG_PAGE_SIZE);
        if (!integer(result.count)) throw Error("unavailable");
        pagination = { page: query.page, pageSize: CATALOG_PAGE_SIZE, total: result.count, hasMore: offset + raw.length < result.count,
          pageComplete: true, collectionComplete: offset === 0 && raw.length === result.count };
      }
    }
    const items = raw.map(row => item(row, business));
    if (new Set(items.map(row => row.id)).size !== items.length || items.some(row => mode === "detail" ? row.id !== request.id : query.categoryId && row.category_id !== query.categoryId)) throw Error("unavailable");
    const capability = await readCatalogConfigurationCapability(client);
    if (capability === "unavailable") throw Error("unavailable");
    const profiles = new Map<string, ItemProfileSummary>();
    if (capability === "ready" && items.length) {
      // Extract kind in PostgREST: never transfer full documents/matrices to this reader.
      const result = await client.from("catalog_item_configurations").select("business_id,item_id,version,is_active,kind:document->>kind", { count: "exact" })
        .eq("business_id", business).in("item_id", items.map(row => row.id)).limit(CATALOG_PAGE_SIZE + 1);
      const rows = counted(result, 0, CATALOG_PAGE_SIZE + 1);
      if (rows.length > items.length) throw Error("unavailable");
      for (const row of rows) {
        if (!object(row) || row.business_id !== business || !id(row.item_id) || !items.some(i => i.id === row.item_id)
          || profiles.has(row.item_id) || !integer(row.version) || row.version < 1 || typeof row.is_active !== "boolean") throw Error("unavailable");
        const kind = row.kind;
        if (row.is_active && kind !== "standard" && kind !== "pizza" && kind !== "dozen" && kind !== "combo") throw Error("unavailable");
        profiles.set(row.item_id, { kind: row.is_active ? kind as ItemProfileSummary["kind"] : "legacy", version: row.version, isActive: row.is_active });
      }
    }
    if (mode === "list") {
      const ids = [...new Set(items.map(row => row.category_id))].filter(categoryId => !categories.has(categoryId));
      if (ids.length) {
        const result = await sdk.from("catalog_categories").select("id,business_id,name,sort_order", { count: "exact" })
          .eq("business_id", business).in("id", ids).limit(CATALOG_PAGE_SIZE);
        const found = counted(result, 0, CATALOG_PAGE_SIZE);
        if (result.count !== found.length || found.length > ids.length) throw Error("unavailable");
        for (const row of found) {
          if (!object(row) || !id(row.id) || !ids.includes(row.id) || categories.has(row.id)
            || row.business_id !== business || !name(row.name) || !integer(row.sort_order)) throw Error("unavailable");
          categories.set(row.id, { id: row.id, business_id: business, name: row.name, sort_order: row.sort_order });
        }
        if (ids.some(categoryId => !categories.has(categoryId))) throw new Missing();
      }
    }
    const rows: CatalogItemSummary[] = [];
    for (const row of items) rows.push({ ...row, category: await category(row.category_id), profile: profiles.get(row.id) ?? { kind: "legacy", version: 0, isActive: false } });
    let data: CatalogItemPageData;
    if (mode === "new") data = { kind: "new", parents, capability };
    else if (mode === "detail") { parents.category = rows[0].category; data = { kind: "detail", record: rows[0], parents, capability }; }
    else { if (!pagination) throw Error("unavailable"); data = { kind: "list", rows, parents, pagination, capability }; }
    return { kind: "ready", owner, request, data };
  } catch (error) { return { kind: error instanceof Missing ? "missing" : "unavailable" }; }
}
