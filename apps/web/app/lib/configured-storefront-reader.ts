import type { ProfileCatalog, ProfileRecord } from "./catalog-profiles";
import type { ConfiguredStorefrontRead, PublicItemConfiguration } from "./configured-storefront";
// @ts-expect-error Native Node tests require explicit extensions.
import { parseProfileDocument, validateProfileConfiguration } from "./catalog-profiles.ts";
// @ts-expect-error Native Node tests require explicit extensions.
import { readCatalogConfigurationCapability } from "./catalog-configuration-runtime.ts";
// @ts-expect-error Native Node tests require explicit extensions.
import { readStorefront } from "./storefront-reader.ts";
// @ts-expect-error Native Node tests require explicit extensions.
import { getSupabaseConfig } from "./supabase/config.ts";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type Row = Record<string, unknown>;
const ROW_LIMIT = 1000;
export const PUBLIC_CONFIGURATION_MAX_BYTES = 1048576;
const fields = {
  profiles: "business_id,item_id,version,is_active,document",
  items: "id,business_id,name,price_minor,currency,is_available",
  groups: "id,business_id,item_id,name,selection_mode,min_select,max_select,sort_order",
  options: "id,business_id,group_id,name,price_delta_minor,is_available,sort_order",
};
const object = (v: unknown): v is Row => !!v && typeof v === "object" && !Array.isArray(v);
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const integer = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const exact = (v: Row, names: string) => Object.keys(v).sort().join(",") === names.split(",").sort().join(",");
const inIds = (ids: Iterable<string>) => `in.(${[...ids].join(",")})`;

// Enforce streamed bytes before decoding, then depth before inspecting documents.
// These limits apply to NEW REST reads, not the existing legacy catalog reader.
async function json(response: Response): Promise<unknown> {
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > PUBLIC_CONFIGURATION_MAX_BYTES)) {
    await response.body?.cancel(); throw Error("public transport");
  }
  const reader = response.body?.getReader();
  if (!reader) throw Error("public transport");
  let bytes = 0;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let text = "";
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > PUBLIC_CONFIGURATION_MAX_BYTES) throw Error("public transport");
      text += decoder.decode(next.value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
  if (declared !== null && Number(declared) !== bytes) throw Error("public transport");
  const value: unknown = JSON.parse(text);
  function depth(v: unknown, level: number): boolean {
    return level <= 24 && (!v || typeof v !== "object" || Object.values(v).every(child => depth(child, level + 1)));
  }
  if (!depth(value, 0)) throw Error("public depth");
  return value;
}

export async function readConfiguredStorefront(slug: string, fetcher: Fetcher = fetch): Promise<ConfiguredStorefrontRead> {
  // Keep the old storefront's output and legacy-only sequence. All requests,
  // including those delegated to it, remain anonymous and refuse redirects.
  const storefront = await readStorefront(slug, (input, init) => fetcher(input, {
    ...init, credentials: "omit", redirect: "error",
  }));
  if (storefront.status !== "ok") return storefront;
  if (storefront.storefront.slug !== slug) return { status: "unavailable" };
  const config = getSupabaseConfig();
  if (!config) return { status: "misconfigured" };
  const headers = { apikey: config.anonKey, Authorization: `Bearer ${config.anonKey}` };
  const businessId = storefront.storefront.business_id;
  const configurations: Record<string, PublicItemConfiguration> = {};
  const urlFor = (table: string) => new URL(`/rest/v1/${table}`, config.url);
  const read = async (table: string, params: Record<string, string>): Promise<Row[]> => {
    const url = urlFor(table);
    for (const [key, value] of Object.entries({ ...params, business_id: `eq.${businessId}`, limit: String(ROW_LIMIT) })) url.searchParams.set(key, value);
    const response = await fetcher(url, { method: "GET", cache: "no-store", credentials: "omit", redirect: "error",
      signal: AbortSignal.timeout(5000), headers: { ...headers, Prefer: "count=exact" } });
    if (!response.ok) { await response.body?.cancel(); throw Error("public read"); }
    const values = await json(response);
    const range = response.headers.get("content-range")?.match(/^(?:0-(\d+)|\*)\/(\d+)$/);
    if (!Array.isArray(values) || values.length > ROW_LIMIT || !range || Number(range[2]) !== values.length
      || (values.length ? Number(range[1]) !== values.length - 1 : range[1] !== undefined)
      || !values.every(object)) throw Error("public count");
    return values;
  };
  try {
    const capability = await readCatalogConfigurationCapability({ async rpc(name, args) {
      const response = await fetcher(urlFor(`rpc/${name}`), { method: "POST", cache: "no-store", credentials: "omit", redirect: "error",
        signal: AbortSignal.timeout(5000), headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(args) });
      const body = await json(response);
      return response.ok ? { data: body, error: null } : { data: null, error: body };
    } });
    if (capability === "unavailable") return { status: "unavailable" };
    if (capability === "legacy_only") return { ...storefront, capability, configurations };
    const roots = storefront.categories.flatMap(category => category.items);
    const rootIds = new Set(roots.map(item => item.id));
    if (rootIds.size !== roots.length || roots.some(item => item.business_id !== businessId)) throw Error("public roots");
    const profiles = new Map<string, ProfileRecord>();
    const profileRows = async (ids: Set<string>) => {
      const result = await read("catalog_item_configurations", { select: fields.profiles, item_id: inIds(ids), is_active: "eq.true" });
      const seen = new Set<string>();
      for (const p of result) {
        if (!exact(p, fields.profiles) || p.business_id !== businessId || !uuid(p.item_id) || !ids.has(p.item_id)
          || seen.has(p.item_id) || p.is_active !== true || !integer(p.version) || !p.version) throw Error("public profile");
        seen.add(p.item_id);
      }
      return result.map(p => ({ business_id: businessId, item_id: p.item_id as string,
        version: p.version as number, is_active: true, document: p.document }));
    };
    // Bound URL size without imposing T1's per-projection row cap on the business.
    for (let offset = 0; offset < roots.length; offset += 100) {
      for (const p of await profileRows(new Set(roots.slice(offset, offset + 100).map(item => item.id)))) profiles.set(p.item_id, p);
    }
    const activeRoots = roots.filter(root => profiles.has(root.id));
    for (const root of roots) configurations[root.id] = { status: "legacy" };
    if (!activeRoots.length) return { ...storefront, capability, configurations };
    const settings = await read("business_catalog_settings", { select: "business_id,two_flavor_surcharge_minor" });
    if (settings.length > 1 || settings.some(s => !exact(s, "business_id,two_flavor_surcharge_minor")
      || s.business_id !== businessId || !integer(s.two_flavor_surcharge_minor))) throw Error("public settings");
    const surchargeMinor = settings.length ? settings[0].two_flavor_surcharge_minor as number : 0;
    for (const root of activeRoots) {
      configurations[root.id] = { status: "unavailable" };
      try {
        const profile = profiles.get(root.id);
        if (!profile) continue;
        const parsed = parseProfileDocument(profile.document);
        if (!parsed.ok) continue;
        const ids = new Set([root.id]);
        if (parsed.value.kind === "combo") for (const component of parsed.value.components) ids.add(component.itemId);
        const items: ProfileCatalog["items"] = roots.filter(item => ids.has(item.id)).map(item => ({
          id: item.id, business_id: businessId, name: item.name, price_minor: item.price_minor, currency: item.currency, is_available: item.is_available,
        }));
        const missing = new Set([...ids].filter(id => !items.some(item => item.id === id)));
        if (missing.size) {
          const rows = await read("catalog_items", { select: fields.items, id: inIds(missing), is_available: "eq.true" });
          if (rows.length !== missing.size) continue;
          const children = rows.map(item => {
            if (!exact(item, fields.items) || !uuid(item.id) || !missing.has(item.id) || item.business_id !== businessId
              || item.is_available !== true || typeof item.name !== "string" || !item.name.trim()
              || !integer(item.price_minor) || typeof item.currency !== "string" || !/^[A-Z]{3}$/.test(item.currency)) throw Error("public child");
            return { id: item.id, business_id: businessId, name: item.name, price_minor: item.price_minor,
              currency: item.currency, is_available: true };
          });
          items.push(...children);
        }
        const childIds = new Set([...ids].filter(id => id !== root.id));
        const childProfiles = childIds.size ? await profileRows(childIds) : [];
        const groupRows = await read("catalog_option_groups", { select: fields.groups, item_id: inIds(ids) });
        if (groupRows.some(group => !exact(group, fields.groups) || !ids.has(String(group.item_id)) || !uuid(group.id))) continue;
        const groupIds = new Set(groupRows.map(group => group.id as string));
        // PU2 permits unavailable option metadata. Retain its real boolean: the
        // full matrix/fixed references are structural, selection rejects agotado.
        const optionRows = groupIds.size ? await read("catalog_options", { select: fields.options, group_id: inIds(groupIds) }) : [];
        if (optionRows.some(option => !exact(option, fields.options) || !groupIds.has(String(option.group_id)))) continue;
        const projected = validateProfileConfiguration({ businessId, surchargeMinor, items,
          groups: groupRows, options: optionRows, profiles: [profile, ...childProfiles] });
        if (projected.ok) configurations[root.id] = { status: "ready", catalog: projected.value };
      } catch { /* Generic dependent-only unavailable. No private diagnostics. */ }
    }
    return { ...storefront, capability, configurations };
  } catch { return { status: "unavailable" }; }
}
