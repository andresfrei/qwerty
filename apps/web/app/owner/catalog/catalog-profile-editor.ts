import type { Component, ProfileCatalog, ProfileDocument, ProfileRecord } from "../../lib/catalog-profiles";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { parseProfileDocument, validateProfileConfiguration } from "../../lib/catalog-profiles.ts";

export type ProfileEditorScope = { accountId: string; businessId: string; itemId: string };
export type ProfileDraft = { isActive: boolean; document: unknown };
export type ProfileEditorStatus = "loading" | "idle" | "pending" | "saved" | "unknown" | "conflict" | "storage_error" | "legacy_only" | "unavailable";
export type ProfileEditorState = {
  scope: ProfileEditorScope;
  status: ProfileEditorStatus;
  catalog: ProfileCatalog | null;
  children: Record<string, ProfileCatalog>;
  profile: ProfileRecord | null;
  draft: ProfileDraft;
  message: string;
  reading: boolean;
  adding: boolean;
  canAdopt: boolean;
};
type Payload = ProfileDraft & { expectedVersion: number };
type Intent = { version: 1; scope: ProfileEditorScope; payload: Payload };
export type ProfileEditorDependencies = {
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  fetcher?: typeof fetch;
  uuid?: () => string;
  onChange?: (state: ProfileEditorState) => void;
};
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export function profileStateKey(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(profileStateKey).join(",")}]`;
  if (object(value)) return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${profileStateKey(value[k])}`).join(",")}}`;
  return JSON.stringify(value);
}
export function profileIntentKey(scope: ProfileEditorScope): string {
  return `qwerty:catalog-configuration:1:${scope.accountId.toLowerCase()}:${scope.businessId.toLowerCase()}:${scope.itemId.toLowerCase()}`;
}
const draftOf = (profile: ProfileRecord | null): ProfileDraft => ({ isActive: profile?.is_active ?? false, document: profile?.document ?? null });
const sameState = (profile: ProfileRecord | null, draft: ProfileDraft) => profileStateKey(draftOf(profile)) === profileStateKey({isActive:draft.isActive,document:draft.document});

/** Merge only the chosen root/children; page-wide classic rows never get T1 caps. */
export function profileDraftCatalog(scope: ProfileEditorScope, catalog: ProfileCatalog, children: Record<string, ProfileCatalog>, draft: ProfileDraft, version: number): ProfileCatalog | null {
  let document = draft.document;
  if (draft.isActive) {
    const parsed = parseProfileDocument(document);
    if (!parsed.ok) return null;
    document = parsed.value;
  }
  const selected = new Set([scope.itemId]);
  if (draft.isActive && (document as ProfileDocument).kind === "combo") {
    for (const component of (document as Extract<ProfileDocument, { kind: "combo" }>).components) selected.add(component.itemId);
  }
  const all = [catalog, ...Object.values(children)];
  const items = new Map(), groups = new Map(), options = new Map(), profiles = new Map();
  for (const source of all) {
    for (const row of source.items) if (selected.has(row.id)) items.set(row.id, row);
    for (const row of source.groups) if (selected.has(row.item_id)) groups.set(row.id, row);
    for (const row of source.profiles) if (selected.has(row.item_id)) profiles.set(row.item_id, row);
  }
  for (const source of all) for (const row of source.options) if (groups.has(row.group_id)) options.set(row.id, row);
  profiles.set(scope.itemId, { business_id: scope.businessId, item_id: scope.itemId, version: Math.max(1, version), is_active: draft.isActive, document });
  const checked = validateProfileConfiguration({ businessId: scope.businessId, surchargeMinor: catalog.surchargeMinor, items: [...items.values()], groups: [...groups.values()], options: [...options.values()], profiles: [...profiles.values()] });
  return checked.ok ? checked.value : null;
}
function readCatalog(value: unknown, scope: ProfileEditorScope): ProfileCatalog | null {
  if (!object(value) || !exact(value, ["capability", "catalog"]) || value.capability !== "ready") return null;
  const checked = validateProfileConfiguration(value.catalog);
  if (!checked.ok || checked.value.businessId !== scope.businessId || !checked.value.items.some(i => i.id === scope.itemId)) return null;
  const root = checked.value.profiles.find(p => p.item_id === scope.itemId);
  const ids = new Set([scope.itemId]);
  if (root?.is_active) {
    const doc = parseProfileDocument(root.document);
    if (!doc.ok) return null;
    if (doc.value.kind === "combo") for (const component of doc.value.components) ids.add(component.itemId);
  }
  return checked.value.items.every(i => ids.has(i.id)) ? checked.value : null;
}
function readIntent(raw: string, scope: ProfileEditorScope): Intent | null {
  if (raw.length > 300000) return null;
  const value = JSON.parse(raw);
  if (!object(value) || !exact(value, ["version", "scope", "payload"]) || value.version !== 1
    || profileStateKey(value.scope) !== profileStateKey(scope) || !object(value.payload)
    || !exact(value.payload, ["expectedVersion", "isActive", "document"])) return null;
  const p = value.payload;
  if (typeof p.expectedVersion !== "number" || !Number.isSafeInteger(p.expectedVersion) || p.expectedVersion < 0 || p.expectedVersion >= Number.MAX_SAFE_INTEGER || typeof p.isActive !== "boolean") return null;
  // T1 validates bounded inactive JSON too, without interpreting forward drafts.
  const minimal = {businessId: scope.businessId, surchargeMinor:0, items:[{id:scope.itemId,business_id:scope.businessId,name:"Intent",price_minor:0,currency:"ARS",is_available:true}],groups:[],options:[],profiles:[{business_id:scope.businessId,item_id:scope.itemId,version:1,is_active:false,document:p.document}]};
  if (!validateProfileConfiguration(minimal).ok || p.isActive && !parseProfileDocument(p.document).ok) return null;
  return value as Intent;
}
const messages = {
  unknown: "No sabemos si se guardó. No repitas el envío; consultá el estado (solo lectura).",
  conflict: "La configuración cambió. Consultá y adoptá el estado actual antes de editar; tu borrador se conserva hasta entonces.",
  storage_error: "No pudimos asegurar el envío en esta pestaña. No se habilitarán nuevos envíos; conservá esta vista y revisá el almacenamiento del navegador.",
  legacy_only: "Las configuraciones avanzadas todavía no están habilitadas. El catálogo clásico sigue disponible.",
  unavailable: "No pudimos leer la configuración avanzada. No se puede guardar; el catálogo clásico sigue disponible.",
};
export function createProfileEditorController(inputScope: ProfileEditorScope, dependencies: ProfileEditorDependencies) {
  if (!Object.values(inputScope).every(uuid)) throw Error("invalid_scope");
  const scope = {accountId:inputScope.accountId.toLowerCase(),businessId:inputScope.businessId.toLowerCase(),itemId:inputScope.itemId.toLowerCase()};
  const fetcher = dependencies.fetcher ?? fetch;
  const key = profileIntentKey(scope);
  let alive = true, restored = false, readGeneration = 0, draftGeneration = 0, writeGeneration = 0;
  let intent: Intent | null = null, persisted: string | null = null;
  let state: ProfileEditorState = {scope,status:"loading",catalog:null,children:{},profile:null,draft:{isActive:false,document:null},message:"Consultá la configuración de este producto.",reading:false,adding:false,canAdopt:false};
  function update(patch: Partial<ProfileEditorState>) {
    if (!alive) return;
    state = {...state,...patch};
    dependencies.onChange?.(state);
  }
  function failStorage() { update({status:"storage_error",message:messages.storage_error,canAdopt:false}); }
  function pending(operation: number): boolean {
    return alive && operation === writeGeneration && state.status === "pending";
  }
  function clearIntent(): boolean {
    try {
      const current = dependencies.storage.getItem(key);
      if (current !== null && current !== persisted) return false;
      dependencies.storage.removeItem(key);
      if (dependencies.storage.getItem(key) !== null) return false;
      intent = null; persisted = null;
      return true;
    } catch { return false; }
  }
  function target(itemId = scope.itemId) {
    return `/owner/catalog/configurations?businessId=${encodeURIComponent(scope.businessId)}&itemId=${encodeURIComponent(itemId)}`;
  }
  function request(method: "GET" | "POST", payload?: Payload): RequestInit {
    return {method,credentials:"same-origin",cache:"no-store",redirect:"error",...(payload ? {headers:{"content-type":"application/json"},body:JSON.stringify(payload)} : {})};
  }
  function restore() {
    if (!alive || restored) return;
    restored = true;
    try {
      const raw = dependencies.storage.getItem(key);
      if (raw === null) return;
      const stored = readIntent(raw, scope);
      if (!stored) { failStorage(); return; }
      intent = stored; persisted = raw;
      update({status:"unknown",draft:{isActive:stored.payload.isActive,document:stored.payload.document},message:messages.unknown});
    } catch { failStorage(); }
  }
  async function load() {
    if (!alive || !restored) return;
    const generation = ++readGeneration;
    update({reading:true});
    try {
      const result = await fetcher(target(), request("GET"));
      const value = await result.json();
      if (!alive || generation !== readGeneration) return;
      const catalog = result.status === 200 ? readCatalog(value, scope) : null;
      if (!catalog) {
        const legacy = result.status === 200 && object(value) && exact(value,["capability"]) && value.capability === "legacy_only";
        if (!intent && state.status !== "storage_error") update({status:legacy?"legacy_only":"unavailable",message:legacy?messages.legacy_only:messages.unavailable});
        else update({message:state.status === "storage_error"?messages.storage_error:messages.unknown});
        return;
      }
      const profile = catalog.profiles.find(p => p.item_id === scope.itemId) ?? null;
      if (state.status === "storage_error") { update({catalog}); return; }
      if ((profile?.version ?? 0) < (state.profile?.version ?? 0)) {
        update({message:"La lectura no avanzó respecto de la última versión observada. Conservamos el estado y el bloqueo actuales."});
        return;
      }
      if (intent) {
        update({catalog});
        // Restored pending combos may not yet be the active root. Read each
        // intended child explicitly for retained controls, never to authorize retry.
        if ((profile?.version ?? 0) <= intent.payload.expectedVersion && intent.payload.isActive) {
          const intended = parseProfileDocument(intent.payload.document);
          if (intended.ok && intended.value.kind === "combo") {
            const ids = new Set(intended.value.components.map(c=>c.itemId));
            for (const id of ids) {
              if (id === scope.itemId || catalog.items.some(i=>i.id===id) || state.children[id]) continue;
              try {
                const childResponse = await fetcher(target(id),request("GET"));
                const child = childResponse.status === 200 ? readCatalog(await childResponse.json(),{...scope,itemId:id}) : null;
                if (!alive || generation !== readGeneration) return;
                if (child) update({children:{...state.children,[id]:child}});
              } catch { /* Keep the pending intent locked if display context is unavailable. */ }
            }
          }
        }
        if (!alive || generation !== readGeneration || !intent) return;
        // An unchanged/absent read says nothing about a write still in flight.
        if (profile && profile.version > intent.payload.expectedVersion) {
          const achieved = sameState(profile, intent.payload);
          update({catalog,profile,status:achieved?"saved":"conflict",canAdopt:true,message:achieved?"Configuración guardada y verificada. Para editar de nuevo, adoptá este estado.":messages.conflict});
        }
        return;
      }
      // A routine re-read must not replace an unsaved editable draft.
      const first = state.catalog === null;
      if (!first && (profile?.version ?? 0) > (state.profile?.version ?? 0)) {
        update({catalog,profile,status:"conflict",canAdopt:true,message:messages.conflict});
        return;
      }
      update({catalog,profile,status:"idle",...(first?{draft:draftOf(profile)}:{}),message:first?"Elegí explícitamente cómo se configura este producto.":"Estado consultado; tu borrador se conserva."});
    } catch {
      if (alive && generation === readGeneration) update(intent?{message:messages.unknown}:state.status === "storage_error"?{}:{status:"unavailable",message:messages.unavailable});
    } finally { if (alive && generation === readGeneration) update({reading:false}); }
  }
  function edit(draft: ProfileDraft): boolean {
    if (!alive || !restored || state.status !== "idle") return false;
    draftGeneration++;
    update({draft,message:"Cambios sin guardar."});
    return true;
  }
  async function save() {
    if (!alive || !restored || state.status !== "idle" || !state.catalog || state.adding) return;
    const expectedVersion = state.profile?.version ?? 0;
    if (expectedVersion >= Number.MAX_SAFE_INTEGER) {
      update({message:"Esta configuración alcanzó el límite seguro de versiones. No se envió ningún cambio; no reinicies ni borres su versión."});
      return;
    }
    const projected = profileDraftCatalog(scope,state.catalog,state.children,state.draft,expectedVersion);
    if (!projected) { update({message:"Revisá los grupos, límites, precios completos y restricciones. Corregí los grupos en el editor clásico; no los cambiamos automáticamente."}); return; }
    const canonical = projected.profiles.find(p => p.item_id === scope.itemId) as ProfileRecord;
    const draft = draftOf(canonical);
    if (sameState(state.profile,draft)) { update({message:"No hay cambios para guardar."}); return; }
    const payload = {expectedVersion,...draft};
    const next: Intent = {version:1,scope,payload};
    const operation = ++writeGeneration;
    // Synchronous status and durable intent precede the first await and POST.
    update({status:"pending",draft,message:"Guardando configuración…",canAdopt:false});
    try {
      const raw = JSON.stringify(next);
      if (dependencies.storage.getItem(key) !== null) { failStorage(); return; }
      dependencies.storage.setItem(key,raw);
      if (dependencies.storage.getItem(key) !== raw) { failStorage(); return; }
      intent = next; persisted = raw;
    } catch { failStorage(); return; }
    try {
      const result = await fetcher(target(),request("POST",payload));
      const value = await result.json();
      if (!pending(operation)) return;
      if (result.status === 200 && object(value) && exact(value,["code","profile"]) && value.code === "saved" && object(value.profile)) {
        const proposed = value.profile;
        const checked = validateProfileConfiguration({...projected,profiles:projected.profiles.map(p=>p.item_id===scope.itemId?proposed:p)});
        const saved = checked.ok ? checked.value.profiles.find(p=>p.item_id===scope.itemId) : null;
        if (saved && exact(proposed,["business_id","item_id","version","is_active","document"]) && saved.version === expectedVersion+1 && sameState(saved,draft)) {
          update({status:"saved",catalog:checked.ok?checked.value:projected,profile:saved,draft:draftOf(saved),canAdopt:true,message:"Configuración guardada. Adoptá el estado guardado para editar de nuevo."});
          return;
        }
      }
      if (object(value) && exact(value,["error"]) && typeof value.error === "string") {
        if (result.status === 409 && value.error === "configuration_version_conflict") {
          update({status:"conflict",message:messages.conflict,canAdopt:false}); return;
        }
        const known: Record<number,string[]> = {400:["invalid_request","request_rejected"],401:["unauthorized"],403:["configuration_forbidden"],404:["not_found"],413:["invalid_request"],422:["invalid_configuration","configuration_rejected"],503:["unavailable","legacy_only"]};
        if (known[result.status]?.includes(value.error)) {
          if (!clearIntent()) { failStorage(); return; }
          update({status:"idle",message:"No se guardó. Revisá los datos o tu acceso; conservamos tu borrador."}); return;
        }
      }
    } catch { /* Losing the response does not establish rollback. */ }
    if (pending(operation)) update({status:"unknown",message:messages.unknown});
  }
  function adopt(): boolean {
    if (!alive || !state.canAdopt || !["saved","conflict"].includes(state.status)) return false;
    if (!clearIntent()) { failStorage(); return false; }
    draftGeneration++; writeGeneration++;
    update({status:"idle",draft:draftOf(state.profile),canAdopt:false,message:"Estado actual adoptado. Podés editar; no se envió ningún cambio."});
    return true;
  }
  async function addComponent(itemId: string): Promise<boolean> {
    if (!alive || state.status !== "idle" || state.adding || !uuid(itemId) || itemId === scope.itemId) return false;
    const document = state.draft.document;
    if (!state.draft.isActive || !object(document) || document.kind !== "combo" || !Array.isArray(document.components)) return false;
    const components = document.components as Component[];
    const generation = draftGeneration;
    update({adding:true,message:"Consultando producto fijo…"});
    try {
      const response = await fetcher(target(itemId),request("GET"));
      const catalog = response.status === 200 ? readCatalog(await response.json(),{...scope,itemId}) : null;
      if (!alive || generation !== draftGeneration || state.status !== "idle") return false;
      const childProfile = catalog?.profiles.find(p=>p.item_id===itemId && p.is_active);
      const childDoc = childProfile ? parseProfileDocument(childProfile.document) : null;
      const child = catalog?.items.find(i=>i.id===itemId);
      const parent = state.catalog?.items.find(i=>i.id===scope.itemId);
      if (!catalog || !child || child.currency !== parent?.currency || childDoc?.ok && childDoc.value.kind === "combo") {
        update({message:"Elegí un producto de esta tienda y moneda, sin combo anidado. No pudimos habilitar ese producto."}); return false;
      }
      const componentId = (dependencies.uuid ?? (()=>crypto.randomUUID()))();
      if (!uuid(componentId) || components.some(c=>c.componentId===componentId)) return false;
      const component: Component = {componentId,itemId,quantity:1,order:components.length,fixedGroupPicks:[],allowedOptions:[]};
      update({children:{...state.children,[itemId]:catalog}});
      edit({isActive:true,document:{...document,components:[...components,component]}});
      return true;
    } catch {
      if (alive && generation === draftGeneration) update({message:"No pudimos consultar ese producto. No se agregó ni guardó ningún cambio."});
      return false;
    } finally { if (alive) update({adding:false}); }
  }
  return {snapshot:()=>state,restore,load,edit,save,adopt,addComponent,dispose(){alive=false;readGeneration++;draftGeneration++;writeGeneration++;}};
}
export type ProfileEditorController = ReturnType<typeof createProfileEditorController>;
