import type { ProfileCatalog, ProfileResult } from "./catalog-profiles";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { parseProfileDocument, profileFailure, validateProfileConfiguration } from "./catalog-profiles.ts";

export type CatalogConfigurationCapability = "ready" | "legacy_only" | "unavailable";
export type CatalogConfigurationRpc = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};
export type ConfiguredCatalogSnapshot = ProfileCatalog & {
  version: 2; schemaVersion: 1; slug: string; fingerprint: string;
};
export type CatalogConfigurationRuntime = {
  configurationCapability(): Promise<CatalogConfigurationCapability>;
  configuredCatalog(business: string, slug: string): Promise<ConfiguredCatalogSnapshot | null>;
};
// Transport budget, NOT T1's projected-catalog limit or a commercial row limit.
export const CONFIGURED_SNAPSHOT_MAX_BYTES = 16 * 1024 * 1024;
const capabilityFunction = "public.catalog_configuration_capabilities";
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const keys = (v: Record<string, unknown>, names: string[]) => Object.keys(v).length === names.length && names.every(n => Object.hasOwn(v, n));
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const integer = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v);
const money = (v: unknown): v is number => integer(v) && v >= 0;
const name = (v: unknown): v is string => typeof v === "string" && Boolean(v.trim());

// PGRST202 alone is insufficient: another function, a parameter overload or an
// arbitrary schema error is not proof that this no-argument capability is absent.
function missingCapability(error: unknown): boolean {
  return object(error) && error.code === "PGRST202"
    && error.message === `Could not find the function ${capabilityFunction} without parameters in the schema cache`
    && typeof error.details === "string" && [
      `Searched for the function ${capabilityFunction} without parameters, but no matches were found in the schema cache.`,
      `Searched for the function ${capabilityFunction} without parameters or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache.`,
    ].includes(error.details)
    && (error.hint === null || error.hint === undefined);
}
export async function readCatalogConfigurationCapability(client: CatalogConfigurationRpc): Promise<CatalogConfigurationCapability> {
  try {
    const { data, error } = await client.rpc("catalog_configuration_capabilities", {});
    if (error) return data === null && missingCapability(error) ? "legacy_only" : "unavailable";
    return Array.isArray(data) && data.length === 1 && object(data[0])
      && keys(data[0], ["version", "schemaVersion"]) && data[0].version === 2 && data[0].schemaVersion === 1 ? "ready" : "unavailable";
  } catch { return "unavailable"; }
}

function boundedSnapshot(value: unknown): boolean {
  let nodes = 0, estimatedBytes = 0;
  const ancestors = new Set<object>();
  function visit(v: unknown, depth: number): boolean {
    if (depth > 24 || ++nodes > CONFIGURED_SNAPSHOT_MAX_BYTES || estimatedBytes > CONFIGURED_SNAPSHOT_MAX_BYTES) return false;
    if (typeof v === "string") { estimatedBytes += v.length; return estimatedBytes <= CONFIGURED_SNAPSHOT_MAX_BYTES; }
    if (v === null || typeof v === "boolean" || typeof v === "number" && Number.isFinite(v)) return true;
    if (typeof v !== "object" || !v || ancestors.has(v)) return false;
    if (!Array.isArray(v) && Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null) return false;
    ancestors.add(v);
    const valid = Object.entries(v).every(([key, child]) => { estimatedBytes += key.length + 3; return visit(child, depth + 1); });
    ancestors.delete(v);
    return valid;
  }
  try { return visit(value, 0) && new TextEncoder().encode(JSON.stringify(value)).length <= CONFIGURED_SNAPSHOT_MAX_BYTES; }
  catch { return false; }
}

// Whole-business payload stays private. Validate bindings before projecting; no
// global 1000-row/2MiB T1 limit is imposed on unrelated legacy business rows.
export function validateConfiguredCatalogSnapshot(value: unknown, business: string, slug: string): ConfiguredCatalogSnapshot | null {
  if (!boundedSnapshot(value) || !object(value)
    || !keys(value, ["version", "schemaVersion", "businessId", "slug", "surchargeMinor", "items", "groups", "options", "profiles", "fingerprint"])
    || value.version !== 2 || value.schemaVersion !== 1 || !uuid(value.businessId) || value.businessId !== business || value.slug !== slug
    || !money(value.surchargeMinor) || typeof value.fingerprint !== "string" || !/^[0-9a-f]{64}$/.test(value.fingerprint)
    || !Array.isArray(value.items) || !Array.isArray(value.groups) || !Array.isArray(value.options) || !Array.isArray(value.profiles)) return null;
  const itemIds = new Set<string>(), groupIds = new Set<string>(), optionIds = new Set<string>(), profileIds = new Set<string>();
  for (const row of value.items) {
    if (!object(row) || !keys(row, ["id", "business_id", "name", "price_minor", "currency", "is_available"])
      || !uuid(row.id) || itemIds.has(row.id) || row.business_id !== business || !name(row.name) || !money(row.price_minor)
      || typeof row.currency !== "string" || !/^[A-Z]{3}$/.test(row.currency) || typeof row.is_available !== "boolean") return null;
    itemIds.add(row.id);
  }
  for (const row of value.groups) {
    if (!object(row) || !keys(row, ["id", "business_id", "item_id", "name", "selection_mode", "min_select", "max_select", "sort_order"])
      || !uuid(row.id) || groupIds.has(row.id) || row.business_id !== business || !uuid(row.item_id) || !itemIds.has(row.item_id) || !name(row.name)
      || !["distinct", "quantity"].includes(String(row.selection_mode)) || !money(row.min_select) || !money(row.max_select) || row.min_select > row.max_select || !money(row.sort_order)) return null;
    groupIds.add(row.id);
  }
  for (const row of value.options) {
    if (!object(row) || !keys(row, ["id", "business_id", "group_id", "name", "price_delta_minor", "is_available", "sort_order"])
      || !uuid(row.id) || optionIds.has(row.id) || row.business_id !== business || !uuid(row.group_id) || !groupIds.has(row.group_id) || !name(row.name)
      || !integer(row.price_delta_minor) || typeof row.is_available !== "boolean" || !money(row.sort_order)) return null;
    optionIds.add(row.id);
  }
  for (const row of value.profiles) {
    if (!object(row) || !keys(row, ["business_id", "item_id", "version", "is_active", "document"])
      || row.business_id !== business || !uuid(row.item_id) || !itemIds.has(row.item_id) || profileIds.has(row.item_id)
      || !money(row.version) || row.version === 0 || typeof row.is_active !== "boolean") return null;
    profileIds.add(row.item_id);
  }
  // Fresh private value: neither SDK-owned input nor a later caller can mutate
  // another request's snapshot. Only projectConfiguredCatalog crosses into T1.
  return JSON.parse(JSON.stringify(value)) as ConfiguredCatalogSnapshot;
}

export function projectConfiguredCatalog(snapshot: ConfiguredCatalogSnapshot, itemId: string): ProfileResult<ProfileCatalog> {
  // Public helper validates runtime shape too; callers cannot substitute an
  // asserted TypeScript snapshot for the service binding/transport boundary.
  const checked = validateConfiguredCatalogSnapshot(snapshot, snapshot?.businessId, snapshot?.slug);
  if (!checked || !uuid(itemId)) return profileFailure("invalid_catalog", "catalog");
  const itemIds = new Set([itemId]);
  const root = checked.profiles.find(p => p.item_id === itemId && p.is_active);
  if (root) {
    const parsed = parseProfileDocument(root.document);
    if (!parsed.ok) return parsed;
    if (parsed.value.kind === "combo") for (const component of parsed.value.components) itemIds.add(component.itemId);
  }
  const items = checked.items.filter(i => itemIds.has(i.id)).map(i => ({ id: i.id, business_id: i.business_id, name: i.name, price_minor: i.price_minor, currency: i.currency, is_available: i.is_available }));
  if (!items.some(i => i.id === itemId)) return profileFailure("invalid_reference", itemId);
  const groups = checked.groups.filter(g => itemIds.has(g.item_id)).map(g => ({ id: g.id, business_id: g.business_id, item_id: g.item_id, name: g.name, selection_mode: g.selection_mode, min_select: g.min_select, max_select: g.max_select, sort_order: g.sort_order }));
  const groupIds = new Set(groups.map(g => g.id));
  const options = checked.options.filter(o => groupIds.has(o.group_id)).map(o => ({ id: o.id, business_id: o.business_id, group_id: o.group_id, name: o.name, price_delta_minor: o.price_delta_minor, is_available: o.is_available, sort_order: o.sort_order }));
  const profiles = checked.profiles.filter(p => itemIds.has(p.item_id)).map(p => ({ business_id: p.business_id, item_id: p.item_id, version: p.version, is_active: p.is_active, document: p.document }));
  return validateProfileConfiguration({ businessId: checked.businessId, surchargeMinor: checked.surchargeMinor, items, groups, options, profiles });
}

export function createCatalogConfigurationRuntime(client: CatalogConfigurationRpc): CatalogConfigurationRuntime {
  return {
    configurationCapability: () => readCatalogConfigurationCapability(client),
    async configuredCatalog(business, slug) {
      const { data, error } = await client.rpc("pickup_order_catalog_v2", { p_business: business, p_slug: slug });
      if (error) throw Error("Configured catalog unavailable");
      if (data === null) return null;
      const snapshot = validateConfiguredCatalogSnapshot(data, business, slug);
      if (!snapshot) throw Error("Configured catalog unavailable");
      return snapshot;
    },
  };
}
