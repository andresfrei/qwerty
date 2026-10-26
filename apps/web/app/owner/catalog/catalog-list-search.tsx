"use client";
import { useId, useState } from "react";
import { CatalogProductReadLink } from "./catalog-product-filters";
import { catalogHref, parseCatalogPageQuery, type CatalogQuery } from "./catalog-navigation";
export const catalogListInput = "min-h-11 rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm";
export const catalogListReadButton = "[&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center [&_a]:rounded-lg [&_a]:border [&_a]:border-[var(--line)] [&_a]:px-4 [&_a]:py-2 [&_a]:no-underline";
export function CatalogListSearch(props: { scopeKey: string; businessId: string; query: CatalogQuery }) {
  return <CategorySearch key={JSON.stringify([props.scopeKey, props.businessId])} {...props} />;
}
function CategorySearch({ businessId, query }: { businessId: string; query: CatalogQuery }) {
  const [q, setQ] = useState(query.q), id = useId();
  const parsed = parseCatalogPageQuery({ businessId, storePage: String(query.storePage), q }, { resource: "categories" });
  return <fieldset className="flex min-w-0 flex-1 flex-wrap items-center gap-2" aria-label="Buscar categorías">
    <label htmlFor={id} className="sr-only">Buscar categorías</label>
    <input id={id} value={q} onChange={event => setQ(event.target.value)} maxLength={100} placeholder="Buscar categorías…" className={`${catalogListInput} min-w-0 flex-1`} />
    {parsed.ok ? <span className={catalogListReadButton}><CatalogProductReadLink href={catalogHref("categories", parsed.query)} businessId={businessId}>Buscar</CatalogProductReadLink></span>
      : <p role="alert" className="w-full text-sm">Revisá la búsqueda antes de consultar.</p>}
  </fieldset>;
}
