import { parseCatalogChoiceQuery, type CatalogChoiceQuery } from "./catalog-choice-query";
import type { CatalogChoice, CatalogChoicesDTO, CatalogItemChoice } from "./catalog-choices-gateway";

export type Choice = CatalogChoice | CatalogItemChoice;
export type CatalogChoiceScope = { scopeKey: string; selectedBusinessId: string } & (
  | { kind: "categories" | "items"; itemId?: never }
  | { kind: "groups"; itemId: string }
);
export type CatalogChoiceSnapshot = {
  scopeKey: string; q: string; page: number; status: "idle" | "loading" | "ready" | "unavailable";
  rows: Choice[]; selected: Choice | null; pagination: CatalogChoicesDTO["pagination"] | null;
};
export const catalogChoiceScopeKey = (scope: CatalogChoiceScope) =>
  JSON.stringify([scope.scopeKey, scope.selectedBusinessId, scope.kind, scope.itemId]);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const integer = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
function choice(v: unknown, kind: CatalogChoiceScope["kind"]): v is Choice {
  return object(v) && exact(v, kind === "items" ? ["id", "label", "itemKind", "isAvailable"] : ["id", "label"])
    && uuid(v.id) && typeof v.label === "string" && v.label.trim().length > 0
    && (kind !== "items" || typeof v.isAvailable === "boolean" && typeof v.itemKind === "string"
      && ["legacy", "standard", "pizza", "dozen", "combo"].includes(v.itemKind));
}
function queryFor(scope: CatalogChoiceScope, q: string, page: number): CatalogChoiceQuery | null {
  return parseCatalogChoiceQuery(new URLSearchParams({ selectedBusinessId: scope.selectedBusinessId, kind: scope.kind,
    ...(scope.itemId === undefined ? {} : { itemId: scope.itemId }), q, page: String(page) }));
}
function checkedDTO(v: unknown, query: CatalogChoiceQuery): CatalogChoicesDTO | null {
  if (!object(v) || !exact(v, ["selectedBusinessId", "kind", "q", "rows", "pagination", ...(query.kind === "groups" ? ["itemId"] : [])])
    || v.selectedBusinessId !== query.selectedBusinessId || v.kind !== query.kind || v.q !== query.q
    || query.kind === "groups" && v.itemId !== query.itemId || !Array.isArray(v.rows)
    || v.rows.length > 25 || !v.rows.every(row => choice(row, query.kind))) return null;
  const p = v.pagination;
  if (!object(p) || !exact(p, ["page", "pageSize", "total", "hasMore", "pageComplete", "collectionComplete"])
    || p.page !== query.page || p.pageSize !== 25 || !integer(p.total) || p.pageComplete !== true
    || v.rows.length !== Math.min(25, Math.max(0, p.total - query.page * 25))
    || p.hasMore !== ((query.page + 1) * 25 < p.total)
    || p.collectionComplete !== (query.page === 0 && p.total <= 25)
    || new Set(v.rows.map(row => row.id)).size !== v.rows.length) return null;
  return v as CatalogChoicesDTO;
}

/** Read-only controller. A generation, not abort support, owns response authority. */
export function createCatalogChoiceController(initial: CatalogChoiceScope, seed: Choice | null = null,
  fetcher: typeof fetch = fetch, onChange: (state: CatalogChoiceSnapshot) => void = () => {}) {
  let scope: CatalogChoiceScope, state: CatalogChoiceSnapshot, generation = 0, live = true;
  function reset(next: CatalogChoiceScope, selected: Choice | null = null) {
    if (typeof next.scopeKey !== "string" || !next.scopeKey || !queryFor(next, "", 0)
      || selected !== null && !choice(selected, next.kind)) throw Error("invalid_catalog_choice_scope");
    scope = { ...next }; generation++;
    state = { scopeKey: catalogChoiceScopeKey(scope), q: "", page: 0, status: "idle", rows: [],
      selected: selected ? { ...selected } : null, pagination: null };
    onChange(state);
  }
  reset(initial, seed);
  function update(patch: Partial<CatalogChoiceSnapshot>) { state = { ...state, ...patch }; onChange(state); }
  return {
    snapshot: () => state,
    reset,
    dispose() { live = false; generation++; },
    select(id: string) {
      if (!live || state.status !== "ready") return false;
      const selected = state.rows.find(row => row.id === id);
      if (!selected) return false;
      update({ selected }); return true;
    },
    async load(q = "", page = 0) {
      if (!live) return;
      const token = ++generation, query = queryFor(scope, q, page);
      if (!query) { update({ status: "unavailable", rows: [], pagination: null }); return; }
      update({ q: query.q, page: query.page, status: "loading", rows: [], pagination: null });
      const params = new URLSearchParams({ selectedBusinessId: query.selectedBusinessId, kind: query.kind,
        ...(query.kind === "groups" ? { itemId: query.itemId } : {}), q: query.q, page: String(query.page) });
      try {
        const response = await fetcher(`/owner/catalog/choices?${params}`, {
          method: "GET", credentials: "same-origin", cache: "no-store", redirect: "error",
        });
        const value: unknown = await response.json();
        if (!live || token !== generation) return;
        const dto = response.status === 200 ? checkedDTO(value, query) : null;
        if (dto) { update({ status: "ready", rows: dto.rows, pagination: dto.pagination }); return; }
      } catch { if (!live || token !== generation) return; }
      update({ status: "unavailable", rows: [], pagination: null });
    },
  };
}
export type CatalogChoiceController = ReturnType<typeof createCatalogChoiceController>;
