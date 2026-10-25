import { parseBusinessSelection } from "../owner-context";

export const CATALOG_SECTIONS = [
  { id: "items", label: "Productos" },
  { id: "categories", label: "Categorías" },
  { id: "options", label: "Variedades y opciones" },
  { id: "settings", label: "Ajustes" },
] as const;
export type CatalogSection = (typeof CATALOG_SECTIONS)[number]["id"];
export type CatalogResource = CatalogSection | "groups";
export type CatalogMode = "list" | "new" | "detail";
export type CatalogView = { resource: CatalogResource; mode?: CatalogMode; id?: string };
export type CatalogQuery = {
  businessId?: string;
  storePage: number;
  page: number;
  q: string;
  categoryId?: string;
  itemId?: string;
  groupId?: string;
};
export type CatalogSearch = URLSearchParams | Record<string, string | string[] | undefined>;
export type CatalogPageRequest = {
  ok: true;
  resource: CatalogResource;
  mode: CatalogMode;
  id?: string;
  query: CatalogQuery;
  ownerSearch: { businessId?: string; storePage?: string };
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const resources = new Set<string>([...CATALOG_SECTIONS.map(section => section.id), "groups"]);
const filters: Record<CatalogResource, readonly string[]> = {
  items: ["categoryId"], categories: [], options: ["itemId", "groupId"],
  groups: ["itemId"], settings: [],
};

function pageNumber(value: string | undefined): number | null {
  if (value === undefined) return 0;
  return /^(0|[1-9][0-9]*)$/.test(value) && Number(value) <= 1000000 ? Number(value) : null;
}

/** Catalog pages have their own query contract; mutation/owner parsers stay strict. */
export function parseCatalogPageQuery(
  input: CatalogSearch,
  view: CatalogView,
): CatalogPageRequest | { ok: false } {
  if (!view || !resources.has(view.resource)) return { ok: false };
  const { resource } = view;
  const mode = view.mode ?? "list";
  if (!["list", "new", "detail"].includes(mode)) return { ok: false };
  if (resource === "settings" && (mode !== "list" || view.id !== undefined)) return { ok: false };
  const id = typeof view.id === "string" ? view.id.toLowerCase() : undefined;
  if (mode === "detail" ? id === undefined || !UUID.test(id) : view.id !== undefined) return { ok: false };
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false };

  const allowed = new Set(["businessId", "storePage"]);
  if (resource !== "settings") {
    for (const key of ["page", "q", ...filters[resource]]) allowed.add(key);
  }
  const values: Record<string, string> = {};
  const entries = input instanceof URLSearchParams ? [...input.entries()] : Object.entries(input);
  const seen = new Set<string>();
  for (const [key, value] of entries) {
    if (!allowed.has(key) || seen.has(key)) return { ok: false };
    seen.add(key);
    if (value === undefined) continue;
    if (typeof value !== "string") return { ok: false };
    values[key] = value;
  }
  const selection = parseBusinessSelection(new URLSearchParams(
    values.businessId === undefined ? [] : [["businessId", values.businessId]],
  ));
  const storePage = pageNumber(values.storePage);
  const page = pageNumber(values.page);
  if (!selection.ok || storePage === null || page === null) return { ok: false };
  const rawSearch = values.q ?? "";
  const hasControls = [...rawSearch].some(character => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
  if (rawSearch.length > 100 || hasControls) return { ok: false };
  const query: CatalogQuery = {
    ...(selection.businessId ? { businessId: selection.businessId } : {}),
    storePage, page, q: rawSearch.trim(),
  };
  for (const key of filters[resource]) {
    if (values[key] === undefined) continue;
    if (!UUID.test(values[key])) return { ok: false };
    query[key as "categoryId" | "itemId" | "groupId"] = values[key].toLowerCase();
  }
  return {
    ok: true, resource, mode,
    ...(id !== undefined ? { id } : {}),
    query,
    ownerSearch: {
      ...(selection.businessId ? { businessId: selection.businessId } : {}),
      ...(values.storePage !== undefined ? { storePage: values.storePage } : {}),
    },
  };
}

/** All paths and modes are fixed; callers cannot supply an arbitrary return URL. */
export function catalogHref(
  resource: CatalogResource,
  query: Partial<CatalogQuery> = {},
  view: Omit<CatalogView, "resource"> = {},
): string {
  const search: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === "" || (key === "page" || key === "storePage") && value === 0) continue;
    search[key] = String(value);
  }
  const parsed = parseCatalogPageQuery(search, { resource, ...view });
  if (!parsed.ok) throw new Error("invalid_catalog_navigation");
  const suffix = parsed.mode === "new" ? "/new" : parsed.mode === "detail" ? `/${parsed.id}` : "";
  const params = new URLSearchParams(search);
  if (parsed.query.businessId) params.set("businessId", parsed.query.businessId);
  if (params.has("q")) params.set("q", parsed.query.q);
  for (const key of filters[resource]) {
    const value = parsed.query[key as "categoryId" | "itemId" | "groupId"];
    if (value) params.set(key, value);
  }
  return `/owner/catalog/${resource}${suffix}${params.size ? `?${params.toString()}` : ""}`;
}

export function catalogStoreHref(resource: CatalogResource, businessId: string): string {
  return catalogHref(resource === "groups" ? "items" : resource, { businessId });
}

/** Pick list state only for presentation links, never to sanitize an incoming request. */
export function catalogSectionQuery(section: CatalogSection, query: CatalogQuery): Partial<CatalogQuery> {
  const selected: Partial<CatalogQuery> = { businessId: query.businessId, storePage: query.storePage };
  if (section !== "settings") {
    selected.page = query.page;
    selected.q = query.q;
    for (const key of filters[section]) {
      const name = key as "categoryId" | "itemId" | "groupId";
      if (query[name]) selected[name] = query[name];
    }
  }
  return selected;
}
