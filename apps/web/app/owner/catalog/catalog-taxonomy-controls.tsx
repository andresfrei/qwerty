"use client";
import { useRef, useState } from "react";
import type { ItemParent, GroupSummary } from "./catalog-page-data";
import type { Choice } from "./catalog-choice-state";
import { CatalogChoicePicker } from "./catalog-choice-picker";
import { catalogHref, parseCatalogPageQuery, type CatalogQuery } from "./catalog-navigation";
import { CatalogProductReadLink } from "./catalog-product-filters";

export type CatalogOptionParentsProps = { scopeKey: string; businessId: string; item: ItemParent | null; group: GroupSummary | null };

/** Checked minimal parents are selection state, never fabricated Items DTO metadata. */
export function useCatalogOptionParents(props: CatalogOptionParentsProps, q = "") {
  const key = JSON.stringify([props.scopeKey, props.businessId, props.item?.id, props.group?.id]);
  const seed = { key, item: props.item ? { id: props.item.id, label: props.item.name } as Choice : null,
    group: props.group ? { id: props.group.id, label: props.group.name } as Choice : null, q };
  const [draft, setDraft] = useState(seed);
  const value = draft.key === key ? draft : seed;
  const current = useRef(value); current.current = value;
  const parentId = value.item?.id;
  function update(next: typeof value) { current.current = next; setDraft(next); }
  function chooseItem(item: Choice | null) {
    if (current.current.key === key && current.current.item?.id === parentId) update({ ...current.current, item, group: null, q: "" });
  }
  function chooseGroup(group: Choice | null) {
    if (current.current.key === key && current.current.item?.id === parentId) update({ ...current.current, group, q: "" });
  }
  function setSearch(q: string) { if (current.current.key === key) update({ ...current.current, q }); }
  return { key, value, chooseItem, chooseGroup, setSearch };
}

export function CatalogOptionFilters(props: CatalogOptionParentsProps & { query: CatalogQuery }) {
  const { key, value, chooseItem, chooseGroup, setSearch } = useCatalogOptionParents(props, props.query.q);
  const parsed = parseCatalogPageQuery({ businessId: props.businessId, storePage: String(props.query.storePage), q: value.q,
    ...(value.item ? { itemId: value.item.id } : {}), ...(value.group ? { groupId: value.group.id } : {}) }, { resource: "options" });
  return <fieldset className="grid min-w-0 gap-4 rounded-2xl border border-[var(--line)] bg-white p-5" aria-label="Filtrar opciones">
    <label className="text-sm">Buscar opciones<input className="mt-1 min-h-11 w-full rounded-lg border border-[var(--line)] px-3"
      value={value.q} maxLength={100} onChange={event => setSearch(event.target.value)} /></label>
    {value.item && <p className="text-sm">Producto seleccionado: {value.item.label}</p>}
    <CatalogChoicePicker scope={{ scopeKey: JSON.stringify([key, value.item?.id]), selectedBusinessId: props.businessId, kind: "items" }}
      seed={value.item && "itemKind" in value.item ? value.item : null} label="Producto" onSelect={chooseItem} />
    <button type="button" className="min-h-11 underline" onClick={() => chooseItem(null)}>Todos los productos</button>
    {value.item && <>
      <CatalogChoicePicker scope={{ scopeKey: key, selectedBusinessId: props.businessId, kind: "groups", itemId: value.item.id }}
        seed={value.group} label="Grupo" onSelect={chooseGroup} />
      <button type="button" className="min-h-11 underline" onClick={() => chooseGroup(null)}>Todos los grupos</button>
    </>}
    {parsed.ok ? <CatalogProductReadLink href={catalogHref("options", parsed.query)} businessId={props.businessId}>Aplicar filtros</CatalogProductReadLink>
      : <p role="alert">Revisá la búsqueda antes de consultar.</p>}
  </fieldset>;
}

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
