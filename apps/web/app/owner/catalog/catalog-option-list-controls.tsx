"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { CatalogChoicePicker } from "./catalog-choice-picker";
import type { Choice } from "./catalog-choice-state";
import type { GroupSummary, ItemParent } from "./catalog-page-data";
import { catalogHref, parseCatalogPageQuery, type CatalogQuery } from "./catalog-navigation";
import { CatalogProductReadLink } from "./catalog-product-filters";
import { catalogListInput, catalogListReadButton } from "./catalog-list-search";

type Values = { q: string; item: Choice | null; group: Choice | null };
type Props = { scopeKey: string; businessId: string; query: CatalogQuery; item: ItemParent | null; group: GroupSummary | null };
export function CatalogOptionListControls(props: Props) {
  const identity = JSON.stringify([props.scopeKey, props.businessId, props.item?.id, props.group?.id]);
  return <OptionControls key={identity} {...props} scopeKey={identity} />;
}
function OptionControls({ scopeKey, businessId, query, item: appliedItem, group: appliedGroup }: Props) {
  const seed: Values = { q: query.q, item: appliedItem ? { id: appliedItem.id, label: appliedItem.name } : null,
    group: appliedGroup ? { id: appliedGroup.id, label: appliedGroup.name } : null };
  const form = useForm<Values>({ defaultValues: seed });
  const q = useWatch({ control: form.control, name: "q" }) ?? query.q;
  const item = useWatch({ control: form.control, name: "item" }) ?? null;
  const group = useWatch({ control: form.control, name: "group" }) ?? null;
  const [epoch, setEpoch] = useState(0), dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const opened = useRef(seed), searchId = useId(), titleId = useId();
  const mark = JSON.stringify([scopeKey, item?.id, epoch]), current = useRef({ mark, live: true });
  current.current.mark = mark;
  useEffect(() => { current.current.live = true; return () => { current.current.live = false; }; }, []);
  useEffect(() => { if (epoch > 0 && dialog.current?.open) dialog.current.querySelector<HTMLInputElement>("input")?.focus(); }, [epoch]);
  function reset(next: Values) {
    current.current.mark = "retired";
    form.reset(next); setEpoch(value => value + 1);
  }
  function chooseItem(next: Choice | null) {
    if (!current.current.live || current.current.mark !== mark) return;
    reset({ q: "", item: next, group: null });
  }
  function chooseGroup(next: Choice | null) {
    if (!current.current.live || current.current.mark !== mark) return;
    if (!next) reset({ q: "", item, group: null });
    else { form.setValue("group", next); form.setValue("q", ""); }
  }
  function cancel() { reset(opened.current); dialog.current?.close(); trigger.current?.focus(); }
  const read = (value: Values) => parseCatalogPageQuery({ businessId, storePage: String(query.storePage), q: value.q,
    ...(value.item ? { itemId: value.item.id } : {}), ...(value.group ? { groupId: value.group.id } : {}) }, { resource: "options" });
  const search = read({ ...seed, q }), filters = read({ q, item, group });
  const count = Number(!!appliedItem) + Number(!!appliedGroup);
  const pickerScope = JSON.stringify([scopeKey, epoch]);
  return <div className="grid min-w-0 gap-3">
    <fieldset className="flex min-w-0 flex-wrap items-center gap-2" aria-label="Buscar opciones">
      <label htmlFor={searchId} className="sr-only">Buscar opciones</label>
      <input id={searchId} value={q} onChange={event => form.setValue("q", event.target.value)} maxLength={100}
        placeholder="Buscar opciones…" className={`${catalogListInput} min-w-0 flex-1`} />
      {search.ok && <span className={catalogListReadButton}><CatalogProductReadLink href={catalogHref("options", search.query)} businessId={businessId}>Buscar</CatalogProductReadLink></span>}
      <button ref={trigger} type="button" aria-haspopup="dialog" className={catalogListInput}
        onClick={() => { opened.current = { ...seed, q }; reset(opened.current); if (!dialog.current?.open) dialog.current?.showModal(); }}>Filtros{count ? ` (${count})` : ""}</button>
    </fieldset>
    {!search.ok && <p role="alert" className="text-sm">Revisá la búsqueda antes de consultar.</p>}
    {count > 0 && <p className="text-xs text-[var(--muted)]">{appliedItem && `Producto: ${appliedItem.name}`}{appliedItem && appliedGroup && " · "}{appliedGroup && `Grupo: ${appliedGroup.name}`}</p>}
    <dialog ref={dialog} aria-labelledby={titleId} onCancel={() => reset(opened.current)}
      className="m-auto max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-xl overflow-y-auto rounded-2xl border border-[var(--line)] bg-white p-0 text-[var(--ink)] shadow-xl backdrop:bg-black/40">
      <div className="flex items-center justify-between gap-4 border-b border-[var(--line)] p-5">
        <h2 id={titleId} className="text-xl font-extrabold">Filtros de opciones</h2>
        <button type="button" aria-label="Cancelar filtros" onClick={cancel} className={`${catalogListInput} min-w-11`}>×</button>
      </div>
      <div className="grid min-w-0 gap-4 p-5">
        {item && <p className="text-sm">Producto seleccionado: {item.label}</p>}
        <CatalogChoicePicker key={`item:${pickerScope}`} scope={{ scopeKey: pickerScope, selectedBusinessId: businessId, kind: "items" }}
          seed={item && "itemKind" in item ? item : null} label="Producto" onSelect={chooseItem} />
        <button type="button" onClick={() => chooseItem(null)} className={catalogListInput}>Todos los productos</button>
        {item && <>
          <CatalogChoicePicker key={`group:${pickerScope}:${item.id}`} scope={{ scopeKey: pickerScope, selectedBusinessId: businessId, kind: "groups", itemId: item.id }}
            seed={group} label="Grupo" onSelect={chooseGroup} />
          <button type="button" onClick={() => chooseGroup(null)} className={catalogListInput}>Todos los grupos</button>
        </>}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[var(--line)] p-5">
        <button type="button" onClick={() => reset({ q: "", item: null, group: null })} className={`${catalogListInput} mr-auto`}>Limpiar</button>
        <button type="button" onClick={cancel} className={catalogListInput}>Cancelar</button>
        {filters.ok ? <span className={`${catalogListReadButton} [&_a]:border-transparent [&_a]:bg-[var(--lime)] [&_a]:text-[var(--ink)]`}>
          <CatalogProductReadLink href={catalogHref("options", filters.query)} businessId={businessId}
            onClick={event => { if (!event.defaultPrevented) dialog.current?.close(); }}>Aplicar filtros</CatalogProductReadLink>
        </span> : <p role="alert" className="text-sm">Revisá los filtros antes de consultar.</p>}
      </div>
    </dialog>
  </div>;
}
