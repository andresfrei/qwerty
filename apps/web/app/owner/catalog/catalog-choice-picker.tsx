"use client";
import { useEffect, useRef, useState } from "react";
import { catalogChoiceScopeKey, createCatalogChoiceController, type CatalogChoiceScope,
  type Choice, type CatalogChoiceController, type CatalogChoiceSnapshot } from "./catalog-choice-state";

export type CatalogChoicePickerProps = {
  scope: CatalogChoiceScope; seed?: Choice | null; label: string;
  onSelect(choice: Choice): void; fetcher?: typeof fetch;
};
const control = "min-h-11 rounded-lg border border-[var(--line)] px-3 py-2 text-sm disabled:opacity-50";
/** No form, named search control or hidden mutation field: the consumer owns payloads. */
export function CatalogChoicePicker({ scope, seed = null, label, onSelect, fetcher }: CatalogChoicePickerProps) {
  const key = catalogChoiceScopeKey(scope), current = useRef(key);
  current.current = key;
  const initial = useRef({ scope, seed });
  initial.current = { scope, seed };
  const controller = useRef<CatalogChoiceController | null>(null);
  const [model, setModel] = useState<CatalogChoiceSnapshot | null>(null);
  const [search, setSearch] = useState({ key, value: "" });
  useEffect(() => {
    const instance = createCatalogChoiceController(initial.current.scope, initial.current.seed, fetcher, state => {
      if (current.current === key) setModel(state);
    });
    controller.current = instance;
    return () => { instance.dispose(); if (controller.current === instance) controller.current = null; };
    // Seeds belong to the scope's fresh detail/config metadata, not search results.
  }, [key, fetcher]);
  const state = model?.scopeKey === key ? model : null;
  const selected = state ? state.selected : seed;
  const q = search.key === key ? search.value : "";
  function read(page = 0, query = q) {
    if (controller.current?.snapshot().scopeKey === key) void controller.current.load(query, page);
  }
  return <fieldset className="grid min-w-0 gap-3 rounded-xl border border-[var(--line)] p-4" aria-label={label}>
    <p className="text-sm font-bold">{label}: {selected?.label ?? "Sin seleccionar"}</p>
    <label className="text-sm">Buscar {label.toLowerCase()}
      <input className={`mt-1 w-full ${control}`} value={q} maxLength={100}
        onChange={event => setSearch({ key, value: event.target.value })}
        onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); read(); } }} />
    </label>
    <button type="button" className={control} onClick={() => read()}>Buscar opciones</button>
    {state?.status === "loading" && <p role="status">Consultando opciones…</p>}
    {state?.status === "unavailable" && <p role="alert">No pudimos consultar las opciones. Conservamos la selección; podés volver a buscar.</p>}
    {state?.status === "ready" && <>
      <p className="text-xs">{state.pagination?.total} coincidencias · Página {state.page + 1}. Esta página no es una biblioteca completa.</p>
      {state.rows.length === 0 && <p className="text-sm">Sin opciones en esta página.</p>}
      <ul className="grid gap-2">{state.rows.map(row => <li key={row.id}>
        <button type="button" className={`w-full text-left ${control}`} aria-pressed={selected?.id === row.id}
          onClick={() => {
            const c = controller.current;
            if (current.current === key && c?.snapshot().scopeKey === key && c.select(row.id)) onSelect(row);
          }}>{row.label}</button>
      </li>)}</ul>
      <div className="flex flex-wrap gap-3">
        {state.page > 0 && <button type="button" className={control} onClick={() => read(state.page - 1, state.q)}>Anterior</button>}
        {state.pagination?.hasMore && <button type="button" className={control} onClick={() => read(state.page + 1, state.q)}>Siguiente</button>}
      </div>
    </>}
  </fieldset>;
}
