"use client";
import { useState } from "react";
import { catalogHref, parseCatalogPageQuery, type CatalogQuery } from "./catalog-navigation";
import { CatalogProductReadLink } from "./catalog-product-filters";

/** Standalone GET controls, never a native form that could discard an unknown intent. */
export function CatalogCategorySearch({ scopeKey: callerKey, businessId, query }: {
  scopeKey: string; businessId: string; query: CatalogQuery;
}) {
  const scopeKey = JSON.stringify([callerKey, businessId]);
  const [draft, setDraft] = useState({ scopeKey, q: query.q });
  const value = draft.scopeKey === scopeKey ? draft.q : query.q;
  const parsed = parseCatalogPageQuery({ businessId, storePage: String(query.storePage), q: value }, { resource: "categories" });
  return <fieldset className="grid min-w-0 gap-4 rounded-2xl border border-[var(--line)] bg-white p-5" aria-label="Buscar categorías">
    <label className="text-sm">Buscar categorías
      <input className="mt-1 min-h-11 w-full rounded-lg border border-[var(--line)] px-3"
        value={value} maxLength={100} onChange={event => setDraft({ scopeKey, q: event.target.value })} />
    </label>
    {parsed.ok
      ? <CatalogProductReadLink href={catalogHref("categories", parsed.query)} businessId={businessId}>Buscar</CatalogProductReadLink>
      : <p role="alert">Revisá la búsqueda antes de consultar.</p>}
  </fieldset>;
}
