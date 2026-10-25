"use client";
import { useState } from "react";
import { catalogHref, parseCatalogPageQuery, type CatalogQuery } from "./catalog-navigation";
import { CatalogProductReadLink } from "./catalog-product-filters";

/** Standalone GET controls, never a native form that could discard an unknown intent. */
export function CatalogCategorySearch({ scopeKey: callerKey, businessId, query, resource = "categories" }: {
  scopeKey: string; businessId: string; query: CatalogQuery; resource?: "categories" | "groups";
}) {
  const scopeKey = JSON.stringify([callerKey, businessId, resource, query.itemId]);
  const [draft, setDraft] = useState({ scopeKey, q: query.q });
  const value = draft.scopeKey === scopeKey ? draft.q : query.q;
  const label = resource === "groups" ? "Buscar grupos" : "Buscar categorías";
  const parsed = parseCatalogPageQuery({ businessId, storePage: String(query.storePage), q: value,
    ...(resource === "groups" && query.itemId ? { itemId: query.itemId } : {}) }, { resource });
  return <fieldset className="grid min-w-0 gap-4 rounded-2xl border border-[var(--line)] bg-white p-5" aria-label={label}>
    <label className="text-sm">{label}
      <input className="mt-1 min-h-11 w-full rounded-lg border border-[var(--line)] px-3"
        value={value} maxLength={100} onChange={event => setDraft({ scopeKey, q: event.target.value })} />
    </label>
    {parsed.ok
      ? <CatalogProductReadLink href={catalogHref(resource, parsed.query)} businessId={businessId}>Buscar</CatalogProductReadLink>
      : <p role="alert">Revisá la búsqueda antes de consultar.</p>}
  </fieldset>;
}
