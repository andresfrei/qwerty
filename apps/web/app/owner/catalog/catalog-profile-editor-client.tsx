"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AsyncActionButton } from "@/app/components/async-action-button";
import type { Component, ProfileDocument, MatrixRow, ProfileItem } from "../../lib/catalog-profiles";
import { parseProfileDocument } from "../../lib/catalog-profiles";
import { moneyMinor, moneyText } from "./catalog-editor";
import { createProfileEditorController, profileIntentKey, type ProfileEditorController, type ProfileEditorScope, type ProfileEditorState } from "./catalog-profile-editor";

export type CatalogProfileEditorProps = {
  scope: ProfileEditorScope;
  // Explicit owner-page context, not an assumption that scoped GET lists a store.
  products: Pick<ProfileItem, "id" | "name" | "currency">[];
};
const input = "mt-1 min-h-11 w-full min-w-0 rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm";
const button = "min-h-11 rounded-lg bg-[var(--lime)] px-4 py-2 text-sm font-extrabold disabled:opacity-50";
const secondary = "min-h-11 rounded-lg border border-[var(--line)] px-3 py-2 text-sm font-bold disabled:opacity-50";
// biome-ignore lint/a11y/noLabelWithoutControl: Every caller wraps a native input/select as the control; implicit association is preserved.
const field = (label: string, control: ReactNode, key?: string) => <label key={key} className="grid min-w-0 gap-1 text-sm">{label}{control}</label>;
const pairKey = (row: MatrixRow) => `${row.sizeOptionId}:${row.flavorOptionId}`;
const integerText = (value: string) => /^\d+$/.test(value) ? Number(value) : Number.NaN;

export function CatalogProfileEditor({ scope, products }: CatalogProfileEditorProps) {
  const controller = useRef<ProfileEditorController | null>(null);
  const [model, setModel] = useState<ProfileEditorState | null>(null);
  const [open, setOpen] = useState(false);
  const [replaceUnknown, setReplaceUnknown] = useState(false);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [childId, setChildId] = useState("");
  const scopeKey = profileIntentKey(scope);
  useEffect(() => {
    const instance = createProfileEditorController({accountId:scope.accountId,businessId:scope.businessId,itemId:scope.itemId}, {
      storage: {
        getItem: key => window.sessionStorage.getItem(key),
        setItem: (key, value) => window.sessionStorage.setItem(key, value),
        removeItem: key => window.sessionStorage.removeItem(key),
      },
      onChange: state => { if (controller.current === instance) setModel(state); },
    });
    controller.current = instance;
    setOpen(false); setReplaceUnknown(false); setPrices({}); setChildId("");
    instance.restore(); setModel(instance.snapshot());
    return () => { instance.dispose(); if (controller.current === instance) controller.current = null; };
  }, [scope.accountId, scope.businessId, scope.itemId]);
  function current() {
    return controller.current && profileIntentKey(controller.current.snapshot().scope) === scopeKey ? controller.current : null;
  }
  const state = model && profileIntentKey(model.scope) === scopeKey ? model : null;
  const catalog = state?.catalog;
  const root = catalog?.items.find(i => i.id === scope.itemId);
  const ownGroups = catalog?.groups.filter(g => g.item_id === scope.itemId) ?? [];
  const ownOptions = catalog?.options ?? [];
  const locked = state?.status !== "idle" || state.adding;
  const document = state?.draft.document as ProfileDocument | null;
  const kind = state?.draft.isActive ? document?.kind ?? "legacy" : "legacy";
  const unknownStored = state?.profile && !state.profile.is_active && !parseProfileDocument(state.profile.document).ok;
  function mutate(change: (doc: ProfileDocument) => ProfileDocument) {
    const c = current(), draft = c?.snapshot().draft;
    if (draft?.isActive && draft.document) c?.edit({isActive:true,document:change(draft.document as ProfileDocument)});
  }
  function chooseKind(value: string) {
    const c = current(); if (!c || unknownStored && !replaceUnknown) return;
    const draft = c.snapshot().draft;
    if (value === "legacy") { c.edit({...draft,isActive:false}); return; }
    const old = parseProfileDocument(draft.document);
    let next: ProfileDocument;
    if (old.ok && old.value.kind === value) next = old.value;
    else if (value === "pizza") next = {schemaVersion:1,kind:"pizza",sizeGroupId:"",flavorGroupId:"",matrix:[]};
    else if (value === "dozen") next = {schemaVersion:1,kind:"dozen",varietyGroupId:""};
    else if (value === "combo") next = {schemaVersion:1,kind:"combo",components:[]};
    else if (value === "standard") next = {schemaVersion:1,kind:"standard"};
    else return;
    if (c.edit({isActive:true,document:next})) setPrices({});
  }
  function pizzaGroup(key: "sizeGroupId" | "flavorGroupId", id: string) {
    mutate(doc => {
      if (doc.kind !== "pizza") return doc;
      const next = {...doc,[key]:id};
      const previous = new Map(doc.matrix.map(row=>[pairKey(row),row]));
      next.matrix = ownOptions.filter(o=>o.group_id===next.sizeGroupId).flatMap(size => ownOptions.filter(o=>o.group_id===next.flavorGroupId).map(flavor => {
        const row = {sizeOptionId:size.id,flavorOptionId:flavor.id,priceMinor:Number.NaN,available:false};
        return previous.get(pairKey(row)) ?? row;
      }));
      return next;
    });
  }
  function componentChange(id: string, change: (component: Component) => Component) {
    mutate(doc => doc.kind === "combo" ? {...doc,components:doc.components.map(c=>c.componentId===id?change(c):c)} : doc);
  }
  function pizzaControls(doc: Extract<ProfileDocument,{kind:"pizza"}>) {
    const sizes = ownGroups.filter(g=>g.selection_mode==="distinct" && g.min_select===1 && g.max_select===1);
    const flavors = ownGroups.filter(g=>g.selection_mode==="distinct" && g.min_select===1 && g.max_select===2);
    return <div className="grid min-w-0 gap-3">
      <p className="text-sm leading-6">Cada importe es el precio completo de esa pizza: no adicionales ni diferencias sobre el precio base. Dos sabores usan el promedio, redondeado hacia abajo al centavo, más un recargo de la tienda.</p>
      <p className="text-xs leading-5">Necesitás exactamente dos grupos: tamaños distintos 1–1 y sabores distintos 1–2. Si no cumplen esos límites, corregilos en el editor clásico. No modificamos grupos automáticamente.</p>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        {field("Grupo de tamaños",<select className={input} aria-label="Grupo de tamaños" value={doc.sizeGroupId} onChange={e=>pizzaGroup("sizeGroupId",e.target.value)}><option value="">Elegir grupo existente</option>{sizes.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select>)}
        {field("Grupo de sabores",<select className={input} aria-label="Grupo de sabores" value={doc.flavorGroupId} onChange={e=>pizzaGroup("flavorGroupId",e.target.value)}><option value="">Elegir grupo existente</option>{flavors.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select>)}
      </div>
      <ul className="grid min-w-0 gap-3">{doc.matrix.map(row=>{
        const key = pairKey(row);
        const size = ownOptions.find(o=>o.id===row.sizeOptionId), flavor = ownOptions.find(o=>o.id===row.flavorOptionId);
        const label = `${size?.name ?? row.sizeOptionId} × ${flavor?.name ?? row.flavorOptionId}`;
        return <li key={key} className="grid min-w-0 gap-3 rounded-lg border border-[var(--line)] p-3 sm:grid-cols-2">
          <strong className="break-words text-sm sm:col-span-2">{label}</strong>
          {field(`Precio completo (${root?.currency})`,<input className={input} aria-label={`Precio completo ${label}`} data-matrix-price={key} inputMode="decimal" value={prices[key] ?? (Number.isSafeInteger(row.priceMinor)?moneyText(row.priceMinor):"")} onChange={e=>{
            const value=e.target.value;setPrices(prev=>({...prev,[key]:value}));
            mutate(currentDoc=>currentDoc.kind==="pizza"?{...currentDoc,matrix:currentDoc.matrix.map(r=>pairKey(r)===key?{...r,priceMinor:moneyMinor(value)}:r)}:currentDoc);
          }} />)}
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" aria-label={`Permitir ${label}`} data-matrix-permission={key} checked={row.available} onChange={e=>{
            const available=e.target.checked;mutate(currentDoc=>currentDoc.kind==="pizza"?{...currentDoc,matrix:currentDoc.matrix.map(r=>pairKey(r)===key?{...r,available}:r)}:currentDoc);
          }} />Combinación permitida</label>
          {(!size?.is_available || !flavor?.is_available) && <p className="text-xs text-[var(--muted)] sm:col-span-2">Hay una opción temporalmente agotada. Podés definir su estructura igual.</p>}
        </li>;
      })}</ul>
    </div>;
  }
  function comboControls(doc: Extract<ProfileDocument,{kind:"combo"}>) {
    const sources = [catalog, ...Object.values(state?.children ?? {})].filter(v=>v!==null && v!==undefined);
    return <div className="grid min-w-0 gap-4">
      <p className="text-sm leading-6">El combo tiene el precio fijo del producto padre. No se suman precios de hijos, adicionales ni recargos. Cada instancia del cliente se configurará de forma independiente, sin sustituir productos.</p>
      {ownGroups.length>0 && <p role="alert" className="text-sm">Un combo no puede tener grupos propios. Revisalos en el editor clásico antes de guardar.</p>}
      {field("Producto fijo para agregar",<select className={input} aria-label="Producto fijo para agregar" value={childId} onChange={e=>setChildId(e.target.value)}><option value="">Elegir producto de esta tienda</option>{products.filter(p=>p.id!==scope.itemId && p.currency===root?.currency).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>)}
      <AsyncActionButton type="button" aria-label="Agregar producto fijo" className={secondary} pending={state?.adding ?? false} locked={locked || !childId} pendingLabel="Consultando producto…" onClick={async()=>{if(childId)await current()?.addComponent(childId);}}>Agregar producto fijo</AsyncActionButton>
      <p className="text-xs leading-5">Antes de agregarlo consultamos ese producto con tu sesión. No se permiten el propio producto, otra moneda ni combos anidados; agotado temporalmente no cambia la estructura.</p>
      {doc.components.map(component=>{
        const childGroups = new Map(), childOptions = new Map();
        for(const source of sources){for(const g of source.groups)if(g.item_id===component.itemId)childGroups.set(g.id,g);for(const o of source.options)childOptions.set(o.id,o);}
        const childName = products.find(p=>p.id===component.itemId)?.name ?? component.itemId;
        return <section key={component.componentId} data-component-id={component.componentId} className="grid min-w-0 gap-3 rounded-xl border border-[var(--line)] p-3">
          <h4 className="break-words font-bold">Producto fijo: {childName}</h4>
          {field("Cantidad de este producto",<input className={input} type="number" min={1} step={1} aria-label={`Cantidad del componente ${component.componentId}`} value={Number.isFinite(component.quantity)?component.quantity:""} onChange={e=>componentChange(component.componentId,c=>({...c,quantity:integerText(e.target.value)}))} />)}
          {[...childGroups.values()].map(g=>{
            const opts = [...childOptions.values()].filter(o=>o.group_id===g.id);
            const fixed = component.fixedGroupPicks.find(p=>p.groupId===g.id), allowed = component.allowedOptions.find(a=>a.groupId===g.id);
            return <div key={g.id} className="grid min-w-0 gap-2 border-t border-[var(--line)] pt-3">
              <strong className="text-sm">{g.name} · {g.min_select}–{g.max_select} {g.selection_mode==="quantity"?"unidades":"opciones distintas"}</strong>
              <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" aria-label={`Fijar grupo ${component.componentId}:${g.id}`} checked={Boolean(fixed)} onChange={e=>{
                const checked=e.target.checked;componentChange(component.componentId,c=>({...c,fixedGroupPicks:checked?[...c.fixedGroupPicks,{groupId:g.id,picks:[]}]:c.fixedGroupPicks.filter(p=>p.groupId!==g.id)}));
              }} />Fijar la selección completa de este grupo</label>
              {fixed && opts.map(o=>{
                const pick = fixed.picks.find(p=>p.optionId===o.id);
                return field(`${o.name}${o.is_available?"":" · agotado temporalmente"}`,g.selection_mode==="quantity"?
                  <input key={o.id} className={input} type="number" min={0} step={1} aria-label={`Cantidad fija ${component.componentId}:${o.id}`} value={pick?.quantity ?? 0} onChange={e=>{
                    const quantity=integerText(e.target.value);componentChange(component.componentId,c=>({...c,fixedGroupPicks:c.fixedGroupPicks.map(p=>p.groupId===g.id?{...p,picks:[...p.picks.filter(v=>v.optionId!==o.id),...(quantity===0?[]:[{optionId:o.id,quantity}])]}:p)}));
                  }} />:
                  <input key={o.id} type="checkbox" aria-label={`Opción fija ${component.componentId}:${o.id}`} checked={Boolean(pick)} onChange={e=>{
                    const checked=e.target.checked;componentChange(component.componentId,c=>({...c,fixedGroupPicks:c.fixedGroupPicks.map(p=>p.groupId===g.id?{...p,picks:[...p.picks.filter(v=>v.optionId!==o.id),...(checked?[{optionId:o.id,quantity:1}]:[])]}:p)}));
                  }} />, o.id);
              })}
              <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" aria-label={`Restringir opciones ${component.componentId}:${g.id}`} checked={Boolean(allowed)} onChange={e=>{
                const checked=e.target.checked;componentChange(component.componentId,c=>({...c,allowedOptions:checked?[...c.allowedOptions,{groupId:g.id,optionIds:[]}]:c.allowedOptions.filter(a=>a.groupId!==g.id)}));
              }} />Restringir las opciones permitidas</label>
              <p className="text-xs leading-5">{allowed?"Lista explícita: vacía no permite elegir ninguna opción. Las selecciones fijas también deben estar permitidas.":"Sin restricción adicional: se aplican las reglas propias del producto, sin opciones predeterminadas ni sustituciones."}</p>
              {allowed && opts.map(o=><label key={o.id} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" aria-label={`Opción permitida ${component.componentId}:${o.id}`} checked={allowed.optionIds.includes(o.id)} onChange={e=>{
                const checked=e.target.checked;componentChange(component.componentId,c=>({...c,allowedOptions:c.allowedOptions.map(a=>a.groupId===g.id?{...a,optionIds:[...a.optionIds.filter(id=>id!==o.id),...(checked?[o.id]:[])]}:a)}));
              }} />{o.name}{o.is_available?"":" · agotado temporalmente"}</label>)}
            </div>;
          })}
          <button type="button" className={secondary} onClick={()=>mutate(d=>d.kind==="combo"?{...d,components:d.components.filter(c=>c.componentId!==component.componentId).map((c,order)=>({...c,order}))}:d)}>Quitar este componente</button>
        </section>;
      })}
    </div>;
  }
  const controls = open && state?.catalog && !["loading","unavailable","legacy_only"].includes(state.status);
  return <section className="grid min-w-0 gap-3 rounded-xl border border-[var(--line)] bg-[var(--cream)] p-4" aria-label="Configuración avanzada del producto">
    <h3 className="font-extrabold">Configuración avanzada</h3>
    <p className="text-sm leading-6">Elegí el tipo explícitamente. El precio base se edita en el formulario clásico del producto; este guardado no cambia ese precio.</p>
    <AsyncActionButton type="button" aria-label="Consultar configuración avanzada" className={secondary} pending={state?.reading ?? false} locked={!current() || state?.reading===true} pendingLabel="Consultando estado…" onClick={async()=>{setOpen(true);await current()?.load();}}>Consultar configuración avanzada (solo lectura)</AsyncActionButton>
    {state && <p role="status" className="break-words text-sm leading-6">{state.message}</p>}
    {controls && <>
      <p className="text-xs">Versión actual: {state.profile?.version ?? 0}. La disponibilidad temporal no modifica la estructura.</p>
      <fieldset disabled={locked} className="grid min-w-0 gap-4">
        {unknownStored && <label className="flex min-h-11 items-start gap-2 text-sm"><input type="checkbox" aria-label="Autorizar reemplazo del borrador no reconocido" checked={replaceUnknown} onChange={e=>setReplaceUnknown(e.target.checked)} />El borrador inactivo no se reconoce. Lo conservamos con su versión; autorizo reemplazarlo al elegir un tipo nuevo.</label>}
        {field("Tipo de configuración",<select className={input} aria-label="Tipo de configuración" value={kind} disabled={Boolean(unknownStored && !replaceUnknown)} onChange={e=>chooseKind(e.target.value)}>
          <option value="legacy">Sin perfil activo · reglas clásicas</option><option value="standard">Estándar · adicionales</option><option value="pizza">Pizza · tamaños y sabores</option><option value="dozen">Docena · 12 unidades</option><option value="combo">Combo · productos fijos</option>
        </select>)}
        {kind==="legacy" && <p className="text-sm">Se mantienen las reglas clásicas. Desactivar conserva el documento y su versión; no lo borra.</p>}
        {kind==="standard" && <p className="text-sm">Precio base más adicionales de las opciones existentes; sin recargo especial por dos sabores.</p>}
        {kind==="pizza" && document?.kind==="pizza" && pizzaControls(document)}
        {kind==="dozen" && document?.kind==="dozen" && <div className="grid min-w-0 gap-3">
          <p className="text-sm">Exactamente 12 unidades, cualquier mezcla permitida, al precio fijo del producto. Las variedades no agregan precio.</p>
          {field("Grupo de las 12 unidades",<select className={input} aria-label="Grupo de las 12 unidades" value={document.varietyGroupId} onChange={e=>mutate(d=>d.kind==="dozen"?{...d,varietyGroupId:e.target.value}:d)}><option value="">Elegir grupo existente</option>{ownGroups.filter(g=>g.selection_mode==="quantity" && g.min_select===12 && g.max_select===12).map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select>)}
          <p className="text-xs leading-5">Debe existir exactamente un grupo, modo unidades, mínimo 12 y máximo 12. Corregí sus límites en el editor clásico; no los cambiamos automáticamente.</p>
        </div>}
        {kind==="combo" && document?.kind==="combo" && comboControls(document)}
        <AsyncActionButton type="button" aria-label="Guardar configuración" className={button} pending={state.status==="pending"} locked={locked} pendingLabel="Guardando configuración…" onClick={()=>current()?.save()}>Guardar configuración</AsyncActionButton>
      </fieldset>
      {state.canAdopt && <button type="button" className={secondary} onClick={()=>{if(current()?.adopt()){setPrices({});setReplaceUnknown(false);}}}>Adoptar estado actual para editar</button>}
    </>}
  </section>;
}
