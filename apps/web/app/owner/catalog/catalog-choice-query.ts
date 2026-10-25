import { parseCatalogPageQuery } from "./catalog-navigation";

export type CatalogChoiceQuery = {
  selectedBusinessId: string;
  q: string;
  page: number;
} & ({ kind: "categories" | "items"; itemId?: never } | { kind: "groups"; itemId: string });

/** Separate HTTP contract: an explicit selection is mandatory, never a default store. */
export function parseCatalogChoiceQuery(params: URLSearchParams): CatalogChoiceQuery | null {
  const allowed = ["selectedBusinessId", "kind", "q", "page", "itemId"];
  for (const key of params.keys()) {
    if (!allowed.includes(key) || params.getAll(key).length !== 1) return null;
  }
  const kind = params.get("kind");
  const businessId = params.get("selectedBusinessId");
  if (!businessId || kind !== "categories" && kind !== "items" && kind !== "groups") return null;
  if (kind === "groups" ? !params.has("itemId") : params.has("itemId")) return null;
  const search = new URLSearchParams({ businessId });
  for (const key of ["q", "page", "itemId"]) {
    const value = params.get(key);
    if (value !== null) search.set(key, value);
  }
  const parsed = parseCatalogPageQuery(search, { resource: kind, mode: "list" });
  if (!parsed.ok || !parsed.query.businessId) return null;
  const common = { selectedBusinessId: parsed.query.businessId, q: parsed.query.q, page: parsed.query.page };
  if (kind === "groups") return parsed.query.itemId ? { ...common, kind, itemId: parsed.query.itemId } : null;
  return { ...common, kind };
}
