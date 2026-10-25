"use client";
import { useContext, useEffect, useId, useRef, useState, useSyncExternalStore, type MouseEventHandler, type ReactNode } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { CatalogLink, CatalogInspectionLink, CatalogSessionContext } from "./catalog-form-navigation";
import { catalogHref, parseCatalogPageQuery, type CatalogQuery } from "./catalog-navigation";
import { CatalogChoicePicker } from "./catalog-choice-picker";
import type { CatalogChoice } from "./catalog-choices-gateway";

const subscribeEmpty = () => () => {};
const revisionEmpty = () => 0;
/** Read destinations keep unresolved inspection in the same document/RAM session. */
export function CatalogProductReadLink({ href, businessId, children, onClick }: { href: string; businessId: string; children: ReactNode; onClick?: MouseEventHandler<HTMLAnchorElement> }) {
  const session = useContext(CatalogSessionContext);
  useSyncExternalStore(session?.subscribe ?? subscribeEmpty, session?.version ?? revisionEmpty, revisionEmpty);
  return session?.locked()
    ? <CatalogInspectionLink href={href} businessId={businessId} onClick={onClick}>{children}</CatalogInspectionLink>
    : <CatalogLink href={href} onClick={onClick} className="min-h-11 py-2 font-extrabold underline">{children}</CatalogLink>;
}

export type CatalogProductFiltersProps = {
  scopeKey: string; businessId: string; query: CatalogQuery; category: { id: string; name: string } | null;
};
type FilterValues = { q: string; category: CatalogChoice | null };
const control = "min-h-11 rounded-lg border border-[var(--line)] px-3 py-2 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--olive)]";
const readButton = "[&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center [&_a]:rounded-lg [&_a]:border [&_a]:border-[var(--line)] [&_a]:px-4 [&_a]:py-2 [&_a]:no-underline";

/** A fresh owner/business/read scope owns its own RHF drafts and picker instance. */
export function CatalogProductFilters(props: CatalogProductFiltersProps) {
  const scopeKey = JSON.stringify([props.scopeKey, props.businessId]);
  return <ProductListFiltersBody key={scopeKey} {...props} scopeKey={scopeKey} />;
}
function ProductListFiltersBody({ scopeKey, businessId, query, category }: CatalogProductFiltersProps) {
  const dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const titleId = useId(), searchId = useId();
  const seed = category ? { id: category.id, label: category.name } : null;
  const form = useForm<FilterValues>({ defaultValues: { q: query.q, category: seed } });
  const q = useWatch({ control: form.control, name: "q" }) ?? query.q;
  const choice = useWatch({ control: form.control, name: "category" });
  const [pickerEpoch, setPickerEpoch] = useState(0);
  const session = useContext(CatalogSessionContext);
  const locked = useSyncExternalStore(session?.subscribe ?? subscribeEmpty, () => session?.locked() ?? false, () => false);
  const readQuery = (selected: CatalogChoice | null | undefined) => parseCatalogPageQuery(new URLSearchParams({
    businessId, storePage: String(query.storePage), q, ...(selected ? { categoryId: selected.id } : {}),
  }), { resource: "items" });
  const search = readQuery(seed), filters = readQuery(choice);
  const scopeQuery = { ...query, businessId };
  function resetCategory(value: CatalogChoice | null = seed) {
    form.setValue("category", value, { shouldDirty: false });
    setPickerEpoch(value => value + 1);
  }
  function close() { resetCategory(); dialog.current?.close(); trigger.current?.focus(); }
  useEffect(() => {
    if (pickerEpoch > 0 && dialog.current?.open) dialog.current.querySelector<HTMLInputElement>("input")?.focus();
  }, [pickerEpoch]);
  return <div className="grid min-w-0 gap-3">
    <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 flex-1 gap-2">
        <form action="/owner/catalog/items" method="get" className="flex min-w-0 flex-1 gap-2"
          onSubmit={event => { if (!search.ok) event.preventDefault(); }}>
          <input type="hidden" name="businessId" value={businessId} />
          {query.storePage > 0 && <input type="hidden" name="storePage" value={query.storePage} />}
          {category && <input type="hidden" name="categoryId" value={category.id} />}
          <label htmlFor={searchId} className="sr-only">Buscar productos</label>
          <input {...form.register("q")} id={searchId} type="search" defaultValue={query.q} maxLength={100}
            placeholder="Buscar productos…" className={`w-full min-w-0 bg-white ${control}`} />
          {locked && search.ok ? <span className={readButton}><CatalogProductReadLink href={catalogHref("items", search.query)} businessId={businessId}>Buscar</CatalogProductReadLink></span>
            : <button type="submit" disabled={!search.ok} className={control}>Buscar</button>}
        </form>
        <button ref={trigger} type="button" aria-haspopup="dialog" className={control}
          onClick={() => { resetCategory(); if (!dialog.current?.open) dialog.current?.showModal(); }}>Filtros{category ? " (1)" : ""}</button>
      </div>
      <CatalogLink href={catalogHref("items", scopeQuery, { mode: "new" })}
        className="inline-flex min-h-11 shrink-0 self-end items-center rounded-lg bg-[var(--lime)] px-4 py-2 text-sm font-extrabold text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--olive)] lg:self-auto">Nuevo producto</CatalogLink>
    </div>
    {!search.ok && <p role="alert" className="text-sm">Revisá la búsqueda antes de consultar.</p>}
    {locked && <p className="text-xs text-[var(--muted)]">Consulta protegida: usá los enlaces Buscar o Aplicar filtros. No repitas guardados pendientes.</p>}
    {category && <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="rounded-full bg-[var(--soft-lime)] px-3 py-1 font-bold">Categoría: {category.name}</span>
      <CatalogProductReadLink href={catalogHref("items", { ...scopeQuery, page: 0, categoryId: undefined })} businessId={businessId}>Quitar filtro</CatalogProductReadLink>
    </div>}
    <dialog ref={dialog} aria-labelledby={titleId} onCancel={() => resetCategory()}
      className="m-auto max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-2xl border border-[var(--line)] bg-white p-0 text-[var(--ink)] shadow-xl backdrop:bg-black/40">
      <div className="flex items-center justify-between gap-4 border-b border-[var(--line)] p-5">
        <h2 id={titleId} className="text-xl font-extrabold">Filtros de productos</h2>
        <button type="button" aria-label="Cancelar filtros" onClick={close} className={`${control} min-w-11`}>×</button>
      </div>
      <fieldset className="grid min-w-0 gap-4 p-5" aria-label="Opciones de filtro">
        <Controller name="category" control={form.control} render={({ field }) => <CatalogChoicePicker key={pickerEpoch}
          scope={{ scopeKey, selectedBusinessId: businessId, kind: "categories" }} seed={field.value}
          label="Categoría" onSelect={field.onChange} />} />
      </fieldset>
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[var(--line)] p-5">
        <button type="button" onClick={() => resetCategory(null)} className={`${control} mr-auto`}>Limpiar</button>
        <button type="button" onClick={close} className={control}>Cancelar</button>
        {filters.ok ? <span className={`${readButton} [&_a]:border-transparent [&_a]:bg-[var(--lime)] [&_a]:text-[var(--ink)]`}>
          <CatalogProductReadLink href={catalogHref("items", filters.query)} businessId={businessId}
            onClick={event => { if (!event.defaultPrevented) dialog.current?.close(); }}>Aplicar filtros</CatalogProductReadLink>
        </span> : <p role="alert" className="text-sm">Revisá los filtros antes de consultar.</p>}
      </div>
    </dialog>
  </div>;
}
