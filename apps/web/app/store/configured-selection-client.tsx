'use client';

import { useEffect, useRef, useState } from "react";
import { AsyncActionButton } from "@/app/components/async-action-button";
import { parseProfileDocument, validateProfileSelection, type Component, type LeafSelection, type ProfileCatalog, type ProfileSelection } from "@/app/lib/catalog-profiles";
import { priceProfileSelection } from "@/app/lib/catalog-profile-pricing";
import { formatMoney } from "@/app/lib/storefront";

const control = "min-h-11 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--olive)]";
export type ConfiguredSelectionProps = {
  catalog: ProfileCatalog; itemId: string; scope: string; initial?: ProfileSelection;
  disabled?: boolean; label?: string; onAccept(selection: ProfileSelection): boolean;
};
function document(catalog: ProfileCatalog, itemId: string) {
  const record = catalog.profiles.find(p => p.item_id === itemId && p.is_active);
  const parsed = record ? parseProfileDocument(record.document) : null;
  return { version: record?.version ?? 0, document: parsed?.ok ? parsed.value : null };
}
function leaf(catalog: ProfileCatalog, itemId: string, component?: Component): LeafSelection {
  const metadata = document(catalog, itemId);
  return { kind: metadata.version ? "leaf" : "legacy", profileVersion: metadata.version,
    groups: catalog.groups.filter(g => g.item_id === itemId).map(g => ({ groupId: g.id,
      picks: structuredClone(component?.fixedGroupPicks.find(f => f.groupId === g.id)?.picks ?? []) })) };
}
function initialChoice(catalog: ProfileCatalog, itemId: string): ProfileSelection {
  const metadata = document(catalog, itemId);
  if (metadata.document?.kind !== "combo") return leaf(catalog, itemId);
  return { kind: "combo", profileVersion: metadata.version, components: metadata.document.components.flatMap(c =>
    Array.from({ length: c.quantity }, (_, instanceIndex) => ({ componentId: c.componentId, instanceIndex, selection: leaf(catalog, c.itemId, c) }))) };
}

export function ConfiguredSelection({ catalog, itemId, scope, initial, disabled = false, label = "Agregar configuración", onAccept }: ConfiguredSelectionProps) {
  const identity = `${scope}:${itemId}`;
  const [draft, setDraft] = useState<ProfileSelection>(() => initial && validateProfileSelection({ catalog, itemId, selection: initial }).ok ? structuredClone(initial) : initialChoice(catalog, itemId));
  const latest = useRef(draft);
  const mountedScope = useRef(identity);
  useEffect(() => {
    mountedScope.current = identity;
    return () => { mountedScope.current = ""; };
  }, [identity]);
  const [saved, setSaved] = useState(false);
  const accepted = useRef(false);
  function change(update: (selection: ProfileSelection) => ProfileSelection) {
    if (disabled || mountedScope.current !== identity) return;
    latest.current = update(latest.current); accepted.current = false; setSaved(false); setDraft(latest.current);
  }
  function controls(childId: string, choice: LeafSelection, component?: Component, instanceIndex?: number) {
    const metadata = document(catalog, childId);
    const groups = catalog.groups.filter(g => g.item_id === childId);
    const prefix = instanceIndex === undefined ? `${scope}-` : `${scope}-instance-${component?.componentId}-${instanceIndex}-`;
    function updateGroup(groupId: string, update: (picks: LeafSelection["groups"][number]["picks"]) => LeafSelection["groups"][number]["picks"]) {
      change(current => {
        const updateLeaf = (value: LeafSelection): LeafSelection => ({ ...value, groups: value.groups.map(g => g.groupId === groupId ? { ...g, picks: update(g.picks) } : g) });
        if (current.kind !== "combo") return updateLeaf(current);
        return { ...current, components: current.components.map(c => c.componentId === component?.componentId && c.instanceIndex === instanceIndex ? { ...c, selection: updateLeaf(c.selection) } : c) };
      });
    }
    return groups.map(group => {
      const fixed = component?.fixedGroupPicks.find(f => f.groupId === group.id);
      const allow = component?.allowedOptions.find(a => a.groupId === group.id);
      const options = catalog.options.filter(o => o.group_id === group.id && (!allow || allow.optionIds.includes(o.id)));
      const picks = choice.groups.find(g => g.groupId === group.id)?.picks ?? [];
      const pizza = metadata.document?.kind === "pizza" ? metadata.document : null;
      const sizeId = pizza ? choice.groups.find(g => g.groupId === pizza.sizeGroupId)?.picks[0]?.optionId : undefined;
      const available = (optionId: string) => {
        const option = options.find(o => o.id === optionId);
        return !!option?.is_available && (!pizza || group.id !== pizza.flavorGroupId || !sizeId || pizza.matrix.some(row => row.sizeOptionId === sizeId && row.flavorOptionId === optionId && row.available));
      };
      if (fixed) return <fieldset key={group.id} className="mt-3 min-w-0"><legend className="text-sm font-bold">{group.name} · Incluido</legend><p className="break-words text-sm">{fixed.picks.map(p => `${p.quantity} × ${catalog.options.find(o => o.id === p.optionId)?.name ?? "Opción no disponible"}`).join(" + ")}</p></fieldset>;
      if (pizza && (group.id === pizza.sizeGroupId || group.id === pizza.flavorGroupId)) {
        const flavor = group.id === pizza.flavorGroupId;
        return <fieldset key={group.id} className="mt-3 min-w-0 space-y-2"><legend className="text-sm font-bold">{group.name}</legend>
          {[0, ...(flavor ? [1] : [])].map(index => {
            const id = `${prefix}${flavor ? index ? "flavor-second" : "flavor-first" : "size"}-${group.id}`;
            return <label key={id} className="block text-sm" htmlFor={id}>{flavor ? index ? "Segunda mitad (opcional)" : "Un sabor o primera mitad" : "Tamaño"}
              <select id={id} className={control} value={picks[index]?.optionId ?? ""} onChange={event => {
                const value = event.target.value;
                updateGroup(group.id, current => {
                  if (!flavor) return value ? [{ optionId: value, quantity: 1 }] : [];
                  const next = current.map(p => ({ ...p }));
                  if (value) next[index] = { optionId: value, quantity: 1 }; else next.splice(index, 1);
                  return next.filter(Boolean);
                });
              }}><option value="">{index ? "Un solo sabor" : "Elegí una opción"}</option>{options.map(option => <option key={option.id} value={option.id} disabled={!available(option.id)}>{option.name}{available(option.id) ? "" : " · No disponible"}</option>)}</select>
            </label>;
          })}
        </fieldset>;
      }
      const sum = picks.reduce((n, p) => n + p.quantity, 0);
      return <fieldset key={group.id} className="mt-3 min-w-0 space-y-2"><legend className="text-sm font-bold">{group.name} · {metadata.document?.kind === "dozen" ? `${sum}/12 · Completá exactamente 12` : `Elegí de ${group.min_select} a ${group.max_select}`}</legend>
        {options.map(option => {
          const count = picks.find(p => p.optionId === option.id)?.quantity ?? 0;
          const id = `${prefix}count-${group.id}-${option.id}`;
          function choose(value: number) { updateGroup(group.id, current => [...current.filter(p => p.optionId !== option.id), ...(value ? [{ optionId: option.id, quantity: value }] : [])]); }
          return <div key={option.id} className="flex items-center justify-between gap-3"><label className="min-w-0 break-words text-sm" htmlFor={id}>{option.name}{option.is_available ? "" : " · Agotado"}</label>
            {group.selection_mode === "quantity" ? <input id={id} className={`${control} w-20 shrink-0`} type="number" min={0} max={group.max_select} step={1} value={count} disabled={!option.is_available} onChange={event => choose(Number(event.target.value))} /> : <input id={id} type="checkbox" className="size-5 shrink-0" checked={count > 0} disabled={!option.is_available} onChange={event => choose(event.target.checked ? 1 : 0)} />}
          </div>;
        })}
      </fieldset>;
    });
  }
  const root = catalog.items.find(item => item.id === itemId);
  const validation = validateProfileSelection({ catalog, itemId, selection: draft });
  const price = validation.ok ? priceProfileSelection({ catalog, itemId, selection: draft }) : null;
  const metadata = document(catalog, itemId);
  return <section className="mt-3 min-w-0 rounded-xl border border-[var(--line)] bg-white p-4" aria-label={`Configurar ${root?.name ?? "producto"}`}>
    <fieldset disabled={disabled} className="min-w-0"><legend className="font-bold">Elegí tu configuración</legend>
      {draft.kind === "combo" && metadata.document?.kind === "combo" ? metadata.document.components.flatMap(component => draft.components.filter(c => c.componentId === component.componentId).map(instance => <section key={`${component.componentId}:${instance.instanceIndex}`} data-fixed-instance={`${component.componentId}:${instance.instanceIndex}`} className="mt-4 min-w-0 border-l-2 border-[var(--line)] pl-3"><h5 className="font-bold">{catalog.items.find(item => item.id === component.itemId)?.name} · Unidad {instance.instanceIndex + 1}</h5>{controls(component.itemId, instance.selection, component, instance.instanceIndex)}</section>)) : draft.kind !== "combo" ? controls(itemId, draft) : <p>No se puede configurar este producto.</p>}
    </fieldset>
    <p aria-live="polite" className="mt-4 text-sm font-bold">{price?.ok && root ? formatMoney(price.unitPriceMinor, root.currency) : "Completá una elección válida para ver el importe."}</p>
    <AsyncActionButton id="picker-accept" type="button" pending={false} pendingLabel="Agregando…" disabled={disabled || !validation.ok || !price?.ok || saved} className="mt-3 min-h-11 rounded-lg bg-[var(--lime)] px-4 py-2 text-sm font-bold disabled:opacity-50" onClick={() => {
      if (disabled || accepted.current || mountedScope.current !== identity) return;
      const checked = validateProfileSelection({ catalog, itemId, selection: latest.current });
      if (!checked.ok) return;
      accepted.current = true;
      if (onAccept(checked.value.selection)) setSaved(true); else accepted.current = false;
    }}>{saved ? "Configuración guardada" : label}</AsyncActionButton>
  </section>;
}
