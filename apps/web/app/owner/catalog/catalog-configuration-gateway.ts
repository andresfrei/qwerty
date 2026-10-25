import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProfileCatalog, ProfileRecord } from "../../lib/catalog-profiles";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { parseProfileDocument, validateProfileConfiguration, PROFILE_MAX_JSON_BYTES } from "../../lib/catalog-profiles.ts";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { readCatalogConfigurationCapability } from "../../lib/catalog-configuration-runtime.ts";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { resolveOwnerContext, type VerifiedOwnerCallback } from "../owner-context-gateway.ts";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { getTrustedSiteOrigin, isTrustedCallbackRequest } from "../../lib/supabase/confirm.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const exact = (v: Record<string, unknown>, names: string[]) => Object.keys(v).length === names.length && names.every(n => Object.hasOwn(v, n));
export type ConfigurationSave = { expectedVersion: number; isActive: boolean; document: unknown };
export type CatalogConfigurationGateway = ReturnType<typeof createCatalogConfigurationGateway>;

/** Canonical JSON equality also works for inactive, forward-compatible documents. */
export function configurationStateKey(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(configurationStateKey).join(",")}]`;
  if (record(value)) return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${configurationStateKey(value[k])}`).join(",")}}`;
  return JSON.stringify(value);
}
function boundedDocument(value: unknown): boolean {
  let nodes = 0;
  function visit(v: unknown, depth: number): boolean {
    if (depth > 12 || ++nodes > PROFILE_MAX_JSON_BYTES) return false;
    if (v === null || typeof v === "string" || typeof v === "boolean" || typeof v === "number" && Number.isFinite(v)) return true;
    return Array.isArray(v) ? v.every(child => visit(child, depth + 1)) : record(v) && Object.values(v).every(child => visit(child, depth + 1));
  }
  try { return visit(value, 0) && new TextEncoder().encode(JSON.stringify(value)).length <= PROFILE_MAX_JSON_BYTES; } catch { return false; }
}
export function parseConfigurationSave(value: unknown): ConfigurationSave | null {
  if (!record(value) || !exact(value, ["expectedVersion", "isActive", "document"])
    || typeof value.expectedVersion !== "number" || !Number.isSafeInteger(value.expectedVersion) || value.expectedVersion < 0 || value.expectedVersion >= Number.MAX_SAFE_INTEGER
    || typeof value.isActive !== "boolean" || !boundedDocument(value.document)) return null;
  let document = value.document;
  if (value.isActive) { const parsed = parseProfileDocument(document); if (!parsed.ok) return null; document = parsed.value; }
  return { expectedVersion: value.expectedVersion, isActive: value.isActive, document };
}
export function parseConfigurationRecord(value: unknown, business: string, item: string): ProfileRecord | null {
  if (!record(value) || !exact(value, ["business_id", "item_id", "version", "is_active", "document"])
    || value.business_id !== business || value.item_id !== item || typeof value.version !== "number" || !Number.isSafeInteger(value.version) || value.version < 1
    || typeof value.is_active !== "boolean" || !boundedDocument(value.document)) return null;
  let document = value.document;
  if (value.is_active) { const parsed = parseProfileDocument(document); if (!parsed.ok) return null; document = parsed.value; }
  return { business_id: business, item_id: item, version: value.version, is_active: value.is_active, document };
}
const ITEM = "id,business_id,name,price_minor,currency,is_available";
const GROUP = "id,business_id,item_id,name,selection_mode,min_select,max_select,sort_order";
const OPTION = "id,business_id,group_id,name,price_delta_minor,is_available,sort_order";
const PROFILE = "business_id,item_id,version,is_active,document";
function rows(result: {data: unknown; error: unknown}): unknown[] {
  if (result.error || !Array.isArray(result.data)) throw Error("unavailable");
  return result.data;
}
function completeRows(result: {data: unknown; error: unknown; count: number | null}): unknown[] {
  const found = rows(result);
  // PostgREST may cap rows below the requested limit. Exact scoped counts must
  // certify completeness; a truncated result is not an empty/partial catalog.
  if (result.count !== found.length || found.length > 1000) throw Error("unavailable");
  return found;
}
/** Session-role only. Queries never load a whole-business private snapshot. */
export function createCatalogConfigurationGateway(client: SupabaseClient, onVerifiedOwner?: VerifiedOwnerCallback) {
  async function profile(business: string, item: string): Promise<ProfileRecord | null> {
    const found = rows(await client.from("catalog_item_configurations").select(PROFILE).eq("business_id", business).eq("item_id", item).limit(2));
    if (!found.length) return null;
    if (found.length !== 1) throw Error("unavailable");
    const parsed = parseConfigurationRecord(found[0], business, item);
    if (!parsed) throw Error("unavailable");
    return parsed;
  }
  async function selectedItem(business: string, item: string) {
    const found = rows(await client.from("catalog_items").select(ITEM).eq("business_id", business).eq("id", item).limit(2));
    if (found.length > 1) throw Error("unavailable");
    return found[0] ?? null;
  }
  async function catalog(business: string, item: string, rootItem: unknown, current: ProfileRecord | null, proposed?: ConfigurationSave): Promise<ProfileCatalog | null> {
    // Use the proposed root for reference loading, but retain current version for CAS.
    const root: ProfileRecord | null = proposed ? { business_id: business, item_id: item, version: Math.max(1, proposed.expectedVersion), is_active: proposed.isActive, document: proposed.document } : current;
    const children = new Set<string>();
    if (root?.is_active) {
      const parsed = parseProfileDocument(root.document);
      if (!parsed.ok) return null;
      if (parsed.value.kind === "combo") for (const component of parsed.value.components) children.add(component.itemId);
    }
    const items: unknown[] = [rootItem], profiles: ProfileRecord[] = root ? [root] : [];
    for (const child of children) {
      if (child === item) return null;
      const row = await selectedItem(business, child); if (!row) return null;
      items.push(row); const childProfile = await profile(business, child); if (childProfile) profiles.push(childProfile);
    }
    const itemIds = [item, ...children];
    const groups = completeRows(await client.from("catalog_option_groups").select(GROUP, {count:"exact"}).eq("business_id", business).in("item_id", itemIds).limit(1001));
    const groupIds = groups.map(g => record(g) ? g.id : null);
    const options = groupIds.length ? completeRows(await client.from("catalog_options").select(OPTION, {count:"exact"}).eq("business_id", business).in("group_id", groupIds).limit(1001)) : [];
    const settings = rows(await client.from("business_catalog_settings").select("two_flavor_surcharge_minor").eq("business_id", business).limit(2));
    if (settings.length > 1) throw Error("unavailable");
    const surchargeMinor = settings.length ? (settings[0] as {two_flavor_surcharge_minor: unknown}).two_flavor_surcharge_minor : 0;
    const checked = validateProfileConfiguration({businessId: business, surchargeMinor, items, groups, options, profiles});
    return checked.ok ? checked.value : null;
  }
  return {
    ownerContext: (business: string) => resolveOwnerContext(client, business, onVerifiedOwner),
    capability: () => readCatalogConfigurationCapability(client), selectedItem, profile, catalog,
    save: (business: string, item: string, input: ConfigurationSave) => client.rpc("save_catalog_item_configuration", {
      p_business: business, p_item: item, p_expected_version: input.expectedVersion, p_is_active: input.isActive, p_document: input.document,
    }),
  };
}
function response(status: number, body: unknown, allow?: string): Response {
  return new Response(JSON.stringify(body), {status, headers: {"content-type":"application/json", "cache-control":"private, no-store", pragma:"no-cache", expires:"0", "referrer-policy":"no-referrer", "x-content-type-options":"nosniff", ...(allow ? {allow} : {})}});
}
const failure = (status: number, error: string) => response(status, {error});
// Document cap plus a small exact envelope. Bounded streaming, not request.json().
const MAX_BODY = PROFILE_MAX_JSON_BYTES + 1024;
async function body(request: Request): Promise<unknown> {
  if (!/^application\/json(?:;\s*charset=utf-8)?$/i.test(request.headers.get("content-type") ?? "") || request.headers.has("content-encoding")) throw Error("invalid_request");
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)))) throw Error("invalid_request");
  if (length !== null && Number(length) > MAX_BODY) throw Error("too_large");
  const reader = request.body?.getReader(); if (!reader) throw Error("invalid_request");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const {done, value} = await reader.read(); if (done) break;
      size += value.byteLength; if (size > MAX_BODY) { await reader.cancel(); throw Error("too_large"); }
      chunks.push(value);
    }
    if (length !== null && size !== Number(length)) throw Error("invalid_request");
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder("utf-8", {fatal:true}).decode(bytes));
  } finally { reader.releaseLock(); }
}
export type ConfigurationRequestDependencies = {
  trustedOrigin?: string | null;
  createGateway(): Promise<CatalogConfigurationGateway | null>;
};
/** All ingress checks finish before creating a client or verifying identity. */
export async function handleCatalogConfigurationRequest(request: Request, dependencies: ConfigurationRequestDependencies): Promise<Response> {
  if (!["GET", "POST"].includes(request.method)) return response(405, {error:"method_not_allowed"}, "GET, POST");
  const origin = getTrustedSiteOrigin(dependencies.trustedOrigin === undefined ? process.env : {QWERTY_SITE_URL: dependencies.trustedOrigin ?? undefined});
  if (!origin) return failure(503, "unavailable");
  const supplied = request.headers.get("origin");
  if (!isTrustedCallbackRequest(request, origin) || (request.method === "POST" ? supplied !== origin : supplied !== null && supplied !== origin)) return failure(400, "request_rejected");
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].length !== 2 || params.getAll("businessId").length !== 1 || params.getAll("itemId").length !== 1
    || !UUID.test(params.get("businessId") ?? "") || !UUID.test(params.get("itemId") ?? "")) return failure(400, "invalid_request");
  const business = (params.get("businessId") as string).toLowerCase(), item = (params.get("itemId") as string).toLowerCase();
  let input: ConfigurationSave | undefined;
  if (request.method === "POST") {
    try { input = parseConfigurationSave(await body(request)) ?? undefined; }
    catch (error) { return failure(error instanceof Error && error.message === "too_large" ? 413 : 400, "invalid_request"); }
    if (!input) return failure(400, "invalid_request");
  } else if (request.body || request.headers.has("content-encoding") || request.headers.has("content-length") && request.headers.get("content-length") !== "0") return failure(400, "invalid_request");
  let gateway: CatalogConfigurationGateway;
  try {
    const created = await dependencies.createGateway(); if (!created) return failure(503, "unavailable"); gateway = created;
    const context = await gateway.ownerContext(business);
    if (!context) return failure(401, "unauthorized");
    if (context.business?.id !== business) return failure(404, "not_found");
    const root = await gateway.selectedItem(business, item); if (!root) return failure(404, "not_found");
    const capability = await gateway.capability();
    if (capability !== "ready") return capability === "legacy_only" && !input ? response(200, {capability}) : failure(503, capability);
    const current = await gateway.profile(business, item);
    const projected = await gateway.catalog(business, item, root, current, input);
    if (!projected) return failure(input ? 422 : 503, input ? "invalid_configuration" : "unavailable");
    if (!input) return response(200, {capability:"ready", catalog:projected});
  } catch { return failure(503, "unavailable"); }
  // From here onwards an RPC transport/codec failure could follow COMMIT.
  try {
    const result = await gateway.save(business, item, input);
    if (result.error) {
      const code = record(result.error) ? result.error.code : null;
      if (code === "42501") return failure(403, "configuration_forbidden");
      if (code === "23505") return failure(409, "configuration_version_conflict");
      if (["23514", "23503", "25001", "40P01", "40001"].includes(String(code))) return failure(422, "configuration_rejected");
      return failure(503, "outcome_unknown");
    }
    if (record(result.data) && exact(result.data, ["code"]) && result.data.code === "configuration_version_conflict") return failure(409, "configuration_version_conflict");
    if (record(result.data) && exact(result.data, ["code", "profile"]) && result.data.code === "saved") {
      const profile = parseConfigurationRecord(result.data.profile, business, item);
      if (profile && profile.version === input.expectedVersion + 1 && profile.is_active === input.isActive && configurationStateKey(profile.document) === configurationStateKey(input.document)) return response(200, {code:"saved", profile});
    }
  } catch { /* Never retry after an attempted write. */ }
  return failure(503, "outcome_unknown");
}
