"use client";
import { useContext, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { CatalogLink, CatalogInspectionLink, CatalogSessionContext } from "./catalog-form-navigation";
import { catalogHref, parseCatalogPageQuery, type CatalogQuery } from "./catalog-navigation";
import { CatalogChoicePicker } from "./catalog-choice-picker";
import type { CatalogChoice } from "./catalog-choices-gateway";

const subscribeEmpty = () => () => {};
const revisionEmpty = () => 0;
/** Read destinations keep unresolved inspection in the same document/RAM session. */
export function CatalogProductReadLink({ href, businessId, children }: { href: string; businessId: string; children: ReactNode }) {
  const session = useContext(CatalogSessionContext);
  useSyncExternalStore(session?.subscribe ?? subscribeEmpty, session?.version ?? revisionEmpty, revisionEmpty);
  return session?.locked()
    ? <CatalogInspectionLink href={href} businessId={businessId}>{children}</CatalogInspectionLink>
    : <CatalogLink href={href} className="min-h-11 py-2 font-extrabold underline">{children}</CatalogLink>;
}

export type CatalogProductFiltersProps = {
  scopeKey: string; businessId: string; query: CatalogQuery; category: { id: string; name: string } | null;
};
export function CatalogProductFilters({ scopeKey: callerScopeKey, businessId, query, category }: CatalogProductFiltersProps) {
  const scopeKey = JSON.stringify([callerScopeKey, businessId]);
  const seed = { scopeKey, q: query.q, choice: category ? { id: category.id, label: category.name } : null };
  const [draft, setDraft] = useState<{ scopeKey: string; q: string; choice: CatalogChoice | null }>(seed);
  const current = useRef(scopeKey); current.current = scopeKey;
  const value = draft.scopeKey === scopeKey ? draft : seed;
  const parsed = parseCatalogPageQuery(new URLSearchParams({ businessId, storePage: String(query.storePage), q: value.q,
    ...(value.choice ? { categoryId: value.choice.id } : {}) }), { resource: "items" });
  return <fieldset className="grid min-w-0 gap-4 rounded-2xl border border-[var(--line)] bg-white p-5" aria-label="Buscar productos">
    <label className="text-sm">Buscar productos<input className="mt-1 min-h-11 w-full rounded-lg border border-[var(--line)] px-3"
      name="q" value={value.q} maxLength={100} onChange={event => setDraft({ ...value, q: event.target.value })} /></label>
    <CatalogChoicePicker scope={{ scopeKey, selectedBusinessId: businessId, kind: "categories" }} seed={seed.choice}
      label="Categoría" onSelect={choice => { if (current.current === scopeKey) setDraft({ ...value, choice }); }} />
    {parsed.ok ? <>
      <CatalogProductReadLink href={catalogHref("items", parsed.query)} businessId={businessId}>Aplicar filtros</CatalogProductReadLink>
      {value.choice && <CatalogProductReadLink href={catalogHref("items", { ...parsed.query, categoryId: undefined })}
        businessId={businessId}>Todas las categorías</CatalogProductReadLink>}
    </> : <p role="alert">Revisá la búsqueda antes de consultar.</p>}
  </fieldset>;
}
