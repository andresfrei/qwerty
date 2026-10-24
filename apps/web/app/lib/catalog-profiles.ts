import type { GroupSelection, Option, OptionGroup, SelectionError, SelectionRequest } from "./catalog-selection";
// @ts-expect-error Native Node tests require explicit extensions.
import { validateSelections } from "./catalog-selection.ts";

// Resource ceilings, not commercial limits. Shared with SQL/UI adapters.
export const PROFILE_MAX_JSON_BYTES = 262144;
export const PROFILE_MAX_CATALOG_BYTES = 2097152;
export const PROFILE_MAX_ROWS = 1000;
export const PROFILE_MAX_MATRIX_ROWS = 4096;
export const PROFILE_MAX_COMPONENTS = 32;
export const PROFILE_MAX_INSTANCES = 100;
export const PROFILE_MAX_GROUPS = 100;
export const PROFILE_MAX_PICKS = 1000;
export const PROFILE_MAX_DEPTH = 12;
export const PROFILE_SCHEMA_VERSION = 1;

export type ProfileErrorCode = "invalid_document" | "invalid_catalog" | "invalid_reference" | "invalid_selection" | "profile_version" | "profile_required" | "unavailable" | "forbidden_option" | "amount_out_of_range";
export type ProfileError = { code: ProfileErrorCode; path: string };
export type ProfileFailure = { ok: false; errors: (ProfileError | SelectionError)[] };
export type ProfileResult<T> = { ok: true; value: T } | ProfileFailure;
export type MatrixRow = { sizeOptionId: string; flavorOptionId: string; priceMinor: number; available: boolean };
export type Component = {
  componentId: string; itemId: string; quantity: number; order: number;
  fixedGroupPicks: GroupSelection[];
  allowedOptions: { groupId: string; optionIds: string[] }[];
};
export type ProfileDocument = { schemaVersion: 1 } & (
  | { kind: "standard" }
  | { kind: "pizza"; sizeGroupId: string; flavorGroupId: string; matrix: MatrixRow[] }
  | { kind: "dozen"; varietyGroupId: string }
  | { kind: "combo"; components: Component[] }
);
export type ProfileRecord = { business_id: string; item_id: string; version: number; is_active: boolean; document: unknown };
export type ProfileItem = { id: string; business_id: string; name: string; price_minor: number; currency: string; is_available: boolean };
export type ProfileCatalog = {
  businessId: string; surchargeMinor: number; items: ProfileItem[];
  groups: (OptionGroup & { business_id: string })[];
  options: (Option & { business_id: string })[];
  profiles: ProfileRecord[];
};
export type LeafSelection = { kind: "leaf" | "legacy"; profileVersion: number; groups: GroupSelection[] };
export type ProfileSelection = LeafSelection | { kind: "combo"; profileVersion: number; components: { componentId: string; instanceIndex: number; selection: LeafSelection }[] };
export type ProfileRequest = { catalog: unknown; itemId: string; selection: unknown };
export type ResolvedProfileSelection = {
  catalog: ProfileCatalog; item: ProfileItem; document: ProfileDocument | null;
  selection: ProfileSelection; children: ResolvedProfileSelection[];
  componentId?: string; instanceIndex?: number;
};
export const profileFailure = (code: ProfileErrorCode, path: string): ProfileFailure => ({ ok: false, errors: [{ code, path }] });
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const keys = (v: Record<string, unknown>, names: string[]) => Object.keys(v).length === names.length && names.every(n => Object.hasOwn(v, n));
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const integer = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const positive = (v: unknown): v is number => integer(v) && v > 0;
const array = (v: unknown, max: number): v is unknown[] => Array.isArray(v) && v.length <= max;
const unique = (ids: string[]) => new Set(ids).size === ids.length;
const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);

// Reject cycles, non-JSON values and oversized input before cloning. No revivers,
// schema framework or caller-owned objects cross the validated boundary.
function bounded(input: unknown, max: number): boolean {
  let nodes = 0, bytes = 0;
  const ancestors = new Set<object>();
  function visit(v: unknown, depth: number): boolean {
    if (depth > PROFILE_MAX_DEPTH || ++nodes > max || bytes > max) return false;
    if (typeof v === "string") { bytes += new TextEncoder().encode(JSON.stringify(v)).length; return bytes <= max; }
    if (v === null || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v))) { bytes += String(v).length; return bytes <= max; }
    if (!v || typeof v !== "object" || ancestors.has(v)) return false;
    if (!Array.isArray(v) && Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null) return false;
    ancestors.add(v);
    const entries = Object.entries(v);
    bytes += 2 + entries.length;
    const valid = entries.every(([k, child]) => (Array.isArray(v) || visit(k, depth + 1)) && visit(child, depth + 1));
    ancestors.delete(v);
    return valid && bytes <= max;
  }
  return visit(input, 0) && new TextEncoder().encode(JSON.stringify(input)).length <= max;
}

function parseGroups(input: unknown): GroupSelection[] | null {
  if (!array(input, PROFILE_MAX_GROUPS)) return null;
  const groups: GroupSelection[] = [];
  let picksUsed = 0;
  for (const entry of input) {
    if (!record(entry) || !keys(entry, ["groupId", "picks"]) || !uuid(entry.groupId) || !array(entry.picks, PROFILE_MAX_PICKS)) return null;
    const picks: GroupSelection["picks"] = [];
    for (const p of entry.picks) {
      if (++picksUsed > PROFILE_MAX_PICKS || !record(p) || !keys(p, ["optionId", "quantity"]) || !uuid(p.optionId) || !positive(p.quantity)) return null;
      picks.push({ optionId: p.optionId.toLowerCase(), quantity: p.quantity });
    }
    groups.push({ groupId: entry.groupId.toLowerCase(), picks });
  }
  return unique(groups.map(g => g.groupId)) ? groups : null;
}

export function parseProfileDocument(input: unknown): ProfileResult<ProfileDocument> {
  const bad = () => profileFailure("invalid_document", "document");
  if (!bounded(input, PROFILE_MAX_JSON_BYTES) || !record(input) || input.schemaVersion !== 1) return bad();
  if (input.kind === "standard" && keys(input, ["schemaVersion", "kind"])) return { ok: true, value: { schemaVersion: 1, kind: "standard" } };
  if (input.kind === "dozen" && keys(input, ["schemaVersion", "kind", "varietyGroupId"]) && uuid(input.varietyGroupId)) return { ok: true, value: { schemaVersion: 1, kind: "dozen", varietyGroupId: input.varietyGroupId.toLowerCase() } };
  if (input.kind === "pizza" && keys(input, ["schemaVersion", "kind", "sizeGroupId", "flavorGroupId", "matrix"]) && uuid(input.sizeGroupId) && uuid(input.flavorGroupId) && array(input.matrix, PROFILE_MAX_MATRIX_ROWS)) {
    const matrix: MatrixRow[] = [];
    for (const row of input.matrix) {
      if (!record(row) || !keys(row, ["sizeOptionId", "flavorOptionId", "priceMinor", "available"]) || !uuid(row.sizeOptionId) || !uuid(row.flavorOptionId) || !integer(row.priceMinor) || typeof row.available !== "boolean") return bad();
      matrix.push({ sizeOptionId: row.sizeOptionId.toLowerCase(), flavorOptionId: row.flavorOptionId.toLowerCase(), priceMinor: row.priceMinor, available: row.available });
    }
    if (!unique(matrix.map(r => `${r.sizeOptionId}:${r.flavorOptionId}`))) return bad();
    matrix.sort((a, b) => `${a.sizeOptionId}:${a.flavorOptionId}`.localeCompare(`${b.sizeOptionId}:${b.flavorOptionId}`));
    return { ok: true, value: { schemaVersion: 1, kind: "pizza", sizeGroupId: input.sizeGroupId.toLowerCase(), flavorGroupId: input.flavorGroupId.toLowerCase(), matrix } };
  }
  if (input.kind !== "combo" || !keys(input, ["schemaVersion", "kind", "components"]) || !array(input.components, PROFILE_MAX_COMPONENTS) || !input.components.length) return bad();
  const components: Component[] = [];
  let instances = 0;
  for (const c of input.components) {
    if (!record(c) || !keys(c, ["componentId", "itemId", "quantity", "order", "fixedGroupPicks", "allowedOptions"]) || !uuid(c.componentId) || !uuid(c.itemId) || !positive(c.quantity) || !integer(c.order) || !array(c.allowedOptions, PROFILE_MAX_GROUPS)) return bad();
    instances += c.quantity;
    if (instances > PROFILE_MAX_INSTANCES) return bad();
    const fixedGroupPicks = parseGroups(c.fixedGroupPicks);
    if (!fixedGroupPicks || fixedGroupPicks.some(g => !unique(g.picks.map(p => p.optionId)))) return bad();
    const allowedOptions: Component["allowedOptions"] = [];
    for (const a of c.allowedOptions) {
      if (!record(a) || !keys(a, ["groupId", "optionIds"]) || !uuid(a.groupId) || !array(a.optionIds, PROFILE_MAX_PICKS) || !a.optionIds.every(uuid)) return bad();
      const optionIds = a.optionIds.map(s => s.toLowerCase()).sort();
      if (!unique(optionIds)) return bad();
      allowedOptions.push({ groupId: a.groupId.toLowerCase(), optionIds });
    }
    if (!unique(allowedOptions.map(g => g.groupId))) return bad();
    components.push({ componentId: c.componentId.toLowerCase(), itemId: c.itemId.toLowerCase(), quantity: c.quantity, order: c.order, fixedGroupPicks, allowedOptions });
  }
  if (!unique(components.map(c => c.componentId)) || !unique(components.map(c => String(c.order)))) return bad();
  components.sort((a, b) => a.order - b.order || a.componentId.localeCompare(b.componentId));
  return { ok: true, value: { schemaVersion: 1, kind: "combo", components } };
}

function catalogShape(input: unknown): ProfileCatalog | null {
  if (!bounded(input, PROFILE_MAX_CATALOG_BYTES) || !record(input) || !keys(input, ["businessId", "surchargeMinor", "items", "groups", "options", "profiles"]) || !uuid(input.businessId) || !integer(input.surchargeMinor)) return null;
  if (![input.items, input.groups, input.options, input.profiles].every(a => array(a, PROFILE_MAX_ROWS))) return null;
  const c = JSON.parse(JSON.stringify(input)) as ProfileCatalog;
  c.businessId = c.businessId.toLowerCase();
  for (const item of c.items) {
    if (!record(item) || !keys(item, ["id", "business_id", "name", "price_minor", "currency", "is_available"]) || !uuid(item.id) || !uuid(item.business_id) || typeof item.name !== "string" || !item.name.trim() || !integer(item.price_minor) || typeof item.currency !== "string" || !/^[A-Z]{3}$/.test(item.currency) || typeof item.is_available !== "boolean") return null;
    item.id = item.id.toLowerCase(); item.business_id = item.business_id.toLowerCase();
  }
  for (const g of c.groups) {
    if (!record(g) || !keys(g, ["id", "business_id", "item_id", "name", "selection_mode", "min_select", "max_select", "sort_order"]) || !uuid(g.id) || !uuid(g.business_id) || !uuid(g.item_id) || typeof g.name !== "string" || !g.name.trim() || !["distinct", "quantity"].includes(g.selection_mode) || !integer(g.min_select) || !integer(g.max_select) || g.min_select > g.max_select || !integer(g.sort_order)) return null;
    g.id = g.id.toLowerCase(); g.business_id = g.business_id.toLowerCase(); g.item_id = g.item_id.toLowerCase();
  }
  for (const o of c.options) {
    if (!record(o) || !keys(o, ["id", "business_id", "group_id", "name", "price_delta_minor", "is_available", "sort_order"]) || !uuid(o.id) || !uuid(o.business_id) || !uuid(o.group_id) || typeof o.name !== "string" || !o.name.trim() || !Number.isSafeInteger(o.price_delta_minor) || typeof o.is_available !== "boolean" || !integer(o.sort_order)) return null;
    o.id = o.id.toLowerCase(); o.business_id = o.business_id.toLowerCase(); o.group_id = o.group_id.toLowerCase();
  }
  for (const p of c.profiles) {
    if (!record(p) || !keys(p, ["business_id", "item_id", "version", "is_active", "document"]) || !uuid(p.business_id) || !uuid(p.item_id) || !positive(p.version) || typeof p.is_active !== "boolean") return null;
    p.business_id = p.business_id.toLowerCase(); p.item_id = p.item_id.toLowerCase();
  }
  if (![c.items, c.groups, c.options].every(rows => unique(rows.map(r => r.id))) || !unique(c.profiles.map(p => p.item_id))) return null;
  return c;
}

export function activeProfile(c: ProfileCatalog, itemId: string): ProfileRecord | undefined {
  return c.profiles.find(p => p.item_id === itemId && p.is_active);
}
function documentFor(c: ProfileCatalog, itemId: string): ProfileDocument | null {
  // Only called with a configuration validated by the public boundary below.
  return (activeProfile(c, itemId)?.document as ProfileDocument | undefined) ?? null;
}

export function validateProfileConfiguration(input: unknown): ProfileResult<ProfileCatalog> {
  const c = catalogShape(input);
  if (!c) return profileFailure("invalid_catalog", "catalog");
  const ref = (path: string) => profileFailure("invalid_reference", path);
  if (c.items.some(i => i.business_id !== c.businessId) || c.groups.some(g => g.business_id !== c.businessId || !c.items.some(i => i.id === g.item_id)) || c.options.some(o => o.business_id !== c.businessId || !c.groups.some(g => g.id === o.group_id)) || c.profiles.some(p => p.business_id !== c.businessId || !c.items.some(i => i.id === p.item_id))) return ref("catalog");
  for (const p of c.profiles.filter(p => p.is_active).sort((a, b) => a.item_id.localeCompare(b.item_id))) {
    const parsed = parseProfileDocument(p.document);
    if (!parsed.ok) return parsed;
    p.document = parsed.value;
  }
  for (const p of c.profiles.filter(p => p.is_active).sort((a, b) => a.item_id.localeCompare(b.item_id))) {
    const d = p.document as ProfileDocument;
    const groups = c.groups.filter(g => g.item_id === p.item_id);
    if (groups.length > PROFILE_MAX_GROUPS) return ref(p.item_id);
    if (d.kind === "pizza") {
      const size = groups.find(g => g.id === d.sizeGroupId), flavor = groups.find(g => g.id === d.flavorGroupId);
      if (groups.length !== 2 || !size || !flavor || size === flavor || size.selection_mode !== "distinct" || size.min_select !== 1 || size.max_select !== 1 || flavor.selection_mode !== "distinct" || flavor.min_select !== 1 || flavor.max_select !== 2) return ref(p.item_id);
      const sizes = c.options.filter(o => o.group_id === size.id), flavors = c.options.filter(o => o.group_id === flavor.id);
      if (!sizes.length || !flavors.length || d.matrix.length !== sizes.length * flavors.length || d.matrix.some(r => !sizes.some(o => o.id === r.sizeOptionId) || !flavors.some(o => o.id === r.flavorOptionId))) return ref(p.item_id);
    }
    if (d.kind === "dozen") {
      const group = groups.find(g => g.id === d.varietyGroupId);
      if (groups.length !== 1 || !group || group.selection_mode !== "quantity" || group.min_select !== 12 || group.max_select !== 12) return ref(p.item_id);
    }
    if (d.kind === "combo") {
      if (groups.length) return ref(p.item_id);
      const parent = c.items.find(i => i.id === p.item_id);
      if (!parent) return ref(p.item_id);
      for (const component of d.components) {
        const child = c.items.find(i => i.id === component.itemId);
        if (!child || child.id === parent.id || child.currency !== parent.currency || documentFor(c, child.id)?.kind === "combo") return ref(component.componentId);
        const childGroups = c.groups.filter(g => g.item_id === child.id);
        for (const restriction of [...component.fixedGroupPicks.map(g => ({ groupId: g.groupId, optionIds: g.picks.map(p => p.optionId) })), ...component.allowedOptions]) {
          if (!childGroups.some(g => g.id === restriction.groupId) || restriction.optionIds.some(id => !c.options.some(o => o.id === id && o.group_id === restriction.groupId))) return ref(component.componentId);
        }
        // Fixed selections are complete selections for the named group, not
        // implicit defaults. The client must send and preserve them explicitly.
        for (const fixed of component.fixedGroupPicks) {
          const group = childGroups.find(g => g.id === fixed.groupId);
          if (!group) return ref(component.componentId);
          // Availability is purchase state, not a structural reference guard.
          // Never alter the real snapshot used by resolve/validate selections.
          const structuralOptions = c.options.filter(o => o.group_id === group.id).map(o => ({ ...o, is_available: true }));
          const errors = validateSelections({ item: child, groups: [group], options: structuralOptions, selections: [fixed], surchargeMinor: 0 });
          if (errors.length || (group.selection_mode === "distinct" && fixed.picks.some(p => p.quantity !== 1))) return ref(component.componentId);
          const allowed = component.allowedOptions.find(g => g.groupId === fixed.groupId);
          if (allowed && fixed.picks.some(p => !allowed.optionIds.includes(p.optionId))) return ref(component.componentId);
        }
      }
    }
  }
  return { ok: true, value: c };
}

function parseSelection(input: unknown, child = false): ProfileSelection | null {
  if (!record(input) || !integer(input.profileVersion)) return null;
  if ((input.kind === "leaf" || input.kind === "legacy") && keys(input, ["kind", "profileVersion", "groups"])) {
    const groups = parseGroups(input.groups);
    return groups ? { kind: input.kind, profileVersion: input.profileVersion, groups } : null;
  }
  if (child || input.kind !== "combo" || !keys(input, ["kind", "profileVersion", "components"]) || !array(input.components, PROFILE_MAX_INSTANCES)) return null;
  const components: Extract<ProfileSelection, { kind: "combo" }>["components"] = [];
  for (const entry of input.components) {
    if (!record(entry) || !keys(entry, ["componentId", "instanceIndex", "selection"]) || !uuid(entry.componentId) || !integer(entry.instanceIndex) || entry.instanceIndex >= PROFILE_MAX_INSTANCES) return null;
    const selection = parseSelection(entry.selection, true);
    if (!selection || selection.kind === "combo") return null;
    components.push({ componentId: entry.componentId.toLowerCase(), instanceIndex: entry.instanceIndex, selection });
  }
  if (!unique(components.map(c => `${c.componentId}:${c.instanceIndex}`))) return null;
  return { kind: "combo", profileVersion: input.profileVersion, components };
}

export function legacyProfileRequest(resolved: ResolvedProfileSelection): SelectionRequest {
  const { catalog: c, item, selection } = resolved;
  const groups = c.groups.filter(g => g.item_id === item.id);
  return { item, groups, options: c.options.filter(o => groups.some(g => g.id === o.group_id)), selections: selection.kind === "combo" ? [] : selection.groups, surchargeMinor: c.surchargeMinor };
}

function normalizeGroups(groups: GroupSelection[]): GroupSelection[] {
  return groups.map(g => ({ groupId: g.groupId, picks: g.picks.map(p => ({ ...p })).sort((a, b) => a.optionId.localeCompare(b.optionId)) })).sort((a, b) => a.groupId.localeCompare(b.groupId));
}
function resolve(c: ProfileCatalog, itemId: string, s: ProfileSelection): ProfileResult<ResolvedProfileSelection> {
  const item = c.items.find(i => i.id === itemId);
  if (!item?.is_available) return profileFailure("unavailable", itemId);
  const d = documentFor(c, itemId), version = activeProfile(c, itemId)?.version ?? 0;
  if (d && s.kind === "legacy") return profileFailure("profile_required", itemId);
  if (version !== s.profileVersion) return profileFailure("profile_version", itemId);
  if ((!d && s.kind !== "legacy") || (d?.kind === "combo" ? s.kind !== "combo" : s.kind === "combo")) return profileFailure("invalid_selection", itemId);
  const resolved: ResolvedProfileSelection = { catalog: c, item, document: d, selection: s, children: [] };
  if (s.kind === "combo") {
    if (d?.kind !== "combo" || s.components.length !== d.components.reduce((n, component) => n + component.quantity, 0)) return profileFailure("invalid_selection", itemId);
    const normalized: typeof s.components = [];
    for (const component of d.components) for (let index = 0; index < component.quantity; index++) {
      const instance = s.components.find(e => e.componentId === component.componentId && e.instanceIndex === index);
      if (!instance) return profileFailure("invalid_selection", component.componentId);
      const child = resolve(c, component.itemId, instance.selection);
      if (!child.ok) return child;
      const childSelection = child.value.selection as LeafSelection;
      if (!child.value.document) {
        const legacy = legacyProfileRequest(child.value);
        const errors = validateSelections(legacy);
        if (errors.length) return { ok: false, errors };
        if (legacy.selections.some(g => !unique(g.picks.map(p => p.optionId)) || (legacy.groups.find(row => row.id === g.groupId)?.selection_mode === "distinct" && g.picks.some(p => p.quantity !== 1)))) return profileFailure("invalid_selection", component.componentId);
      }
      for (const fixed of component.fixedGroupPicks) {
        const selected = childSelection.groups.find(g => g.groupId === fixed.groupId);
        if (!selected || JSON.stringify(normalizeGroups([selected])) !== JSON.stringify(normalizeGroups([fixed]))) return profileFailure("forbidden_option", component.componentId);
      }
      for (const allowed of component.allowedOptions) {
        if (childSelection.groups.find(g => g.groupId === allowed.groupId)?.picks.some(p => !allowed.optionIds.includes(p.optionId))) return profileFailure("forbidden_option", component.componentId);
      }
      child.value.componentId = component.componentId; child.value.instanceIndex = index;
      resolved.children.push(child.value);
      normalized.push({ componentId: component.componentId, instanceIndex: index, selection: childSelection });
    }
    resolved.selection = { ...s, components: normalized };
    return { ok: true, value: resolved };
  }
  // The legacy branch keeps ordering and duplicate semantics unchanged. Its
  // actual validator/pricer/describer remain authoritative for legacy inputs.
  if (!d) return { ok: true, value: resolved };
  const groups = s.groups.map(g => ({ groupId: g.groupId, picks: g.picks.map(p => ({ ...p })) }));
  for (const g of groups) {
    if (d.kind === "pizza" && g.groupId === d.flavorGroupId) {
      if (g.picks.length < 1 || g.picks.length > 2 || g.picks.some(p => p.quantity !== 1)) return profileFailure("invalid_selection", g.groupId);
      g.picks = g.picks.filter((p, i, all) => all.findIndex(other => other.optionId === p.optionId) === i);
    }
    if (!unique(g.picks.map(p => p.optionId))) return profileFailure("invalid_selection", g.groupId);
    const group = c.groups.find(row => row.id === g.groupId && row.item_id === itemId);
    if (group?.selection_mode === "distinct" && g.picks.some(p => p.quantity !== 1)) return profileFailure("invalid_selection", g.groupId);
    const total = g.picks.reduce((n, p) => n + BigInt(p.quantity), BigInt(0));
    if (total > BigInt(Number.MAX_SAFE_INTEGER)) return profileFailure("invalid_selection", g.groupId);
  }
  resolved.selection = { ...s, groups: normalizeGroups(groups) };
  const request = legacyProfileRequest(resolved), errors = validateSelections(request);
  if (errors.length) return { ok: false, errors };
  if (d.kind === "pizza") {
    const size = groups.find(g => g.groupId === d.sizeGroupId)?.picks[0]?.optionId;
    const flavors = groups.find(g => g.groupId === d.flavorGroupId)?.picks;
    if (!size || !flavors?.length) return profileFailure("invalid_selection", itemId);
    if (flavors.some(p => !d.matrix.some(r => r.sizeOptionId === size && r.flavorOptionId === p.optionId && r.available))) return profileFailure("unavailable", d.flavorGroupId);
  }
  return { ok: true, value: resolved };
}

// Shared parse/resolve path. Description deliberately preserves the old helper's
// permissive text behavior for legacy inputs, even when its validator rejects.
export function resolveProfileRequest(request: unknown): ProfileResult<ResolvedProfileSelection> {
  if (!record(request) || !keys(request, ["catalog", "itemId", "selection"])) return profileFailure("invalid_selection", "request");
  const parsed = validateProfileConfiguration(request.catalog);
  if (!parsed.ok) return parsed;
  if (!uuid(request.itemId) || !bounded(request.selection, PROFILE_MAX_JSON_BYTES)) return profileFailure("invalid_selection", "selection");
  const selection = parseSelection(request.selection);
  if (!selection) return profileFailure("invalid_selection", "selection");
  return resolve(parsed.value, request.itemId.toLowerCase(), selection);
}

export function validateProfileSelection(request: unknown): ProfileResult<ResolvedProfileSelection> {
  const result = resolveProfileRequest(request);
  if (!result.ok || result.value.document) return result;
  const errors = validateSelections(legacyProfileRequest(result.value));
  return errors.length ? { ok: false, errors } : result;
}

export function canonicalProfileSelectionKey(request: unknown): { ok: true; key: string } | ProfileFailure {
  const result = validateProfileSelection(request);
  if (!result.ok) return result;
  const { catalog, item, selection } = result.value;
  if (selection.kind === "legacy") return profileFailure("invalid_selection", "legacy_identity_owned_by_existing_cart");
  const canonical = selection.kind === "combo" ? {
    ...selection,
    components: selection.components.map(c => ({ ...c, selection: { ...c.selection, groups: normalizeGroups(c.selection.groups) } }))
  } : selection;
  return { ok: true, key: JSON.stringify({ schemaVersion: 1, businessId: catalog.businessId, itemId: item.id, selection: canonical }) };
}

export function orderedProfileOptions(resolved: ResolvedProfileSelection, groupId: string): Option[] {
  return resolved.catalog.options.filter(o => o.group_id === groupId).sort((a, b) => a.sort_order - b.sort_order || byId(a, b));
}
