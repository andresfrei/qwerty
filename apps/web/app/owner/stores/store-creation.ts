// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { getTrustedSiteOrigin, isTrustedCallbackRequest } from "../../lib/supabase/confirm.ts";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { parseBusinessSelection, type OwnerBusiness } from "../owner-context.ts";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { StoreCreationWriteError, type StoreCreationGateway, type StoreCreationInput, type StoreCreationResponse, type CreationStorefront } from "./store-creation-contract.ts";

type Dependencies = { trustedOrigin?: string | null; createGateway(): Promise<StoreCreationGateway | null> };
const headers = { "cache-control": "private, no-store", pragma: "no-cache", expires: "0", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff" };
const reply = (body: StoreCreationResponse, status: number) => Response.json(body, { status, headers });
const unknown = (businessId: string) => reply({ state: "outcome_unknown", businessId }, 503);
const ready = (business: OwnerBusiness, storefront: CreationStorefront, status = 200) => reply({ state: "ready", businessId: business.id, business, storefront }, status);
const partial = (business: OwnerBusiness, reason: "storefront_missing" | "slug_unavailable" | "draft_rejected") => reply({ state: "partial", businessId: business.id, business, reason }, 409);

async function creationInput(request: Request): Promise<StoreCreationInput> {
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > 2048)) throw new Error("length");
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get("content-type") ?? "") || !request.body) throw new Error("type");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2048) { await reader.cancel(); throw new Error("length"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("shape");
  const p = value as Record<string, unknown>;
  if (Object.keys(p).length !== 3 || Object.keys(p).some(k => !["businessId", "name", "slug"].includes(k)) || typeof p.businessId !== "string") throw new Error("shape");
  const selection = parseBusinessSelection(new URLSearchParams({ businessId: p.businessId }));
  if (!selection.ok || !selection.businessId || typeof p.name !== "string" || !p.name.trim() || p.name.trim().length > 120
    || typeof p.slug !== "string" || p.slug.length > 63 || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.slug)) throw new Error("fields");
  return { businessId: selection.businessId, name: p.name.trim(), slug: p.slug };
}

/** Creation and recovery deliberately share authority, never mutation policy. */
export async function handleStoreCreation(request: Request, dependencies: Dependencies): Promise<Response> {
  if (request.method !== "GET" && request.method !== "POST") {
    const result = reply({ error: "method_not_allowed" }, 405);
    result.headers.set("allow", "GET, POST");
    return result;
  }
  const origin = dependencies.trustedOrigin === undefined ? getTrustedSiteOrigin() : dependencies.trustedOrigin;
  const requestOrigin = request.headers.get("origin");
  if (!origin || !isTrustedCallbackRequest(request, origin) || new URL(request.url).pathname !== "/owner/stores/create"
    || request.headers.get("sec-fetch-site") === "cross-site" || (request.method === "POST" ? requestOrigin !== origin : requestOrigin !== null && requestOrigin !== origin)) return reply({ error: "request_rejected" }, 403);
  let input: StoreCreationInput | undefined;
  let businessId: string;
  try {
    const params = new URL(request.url).searchParams;
    if (request.method === "POST") {
      if ([...params].length) throw new Error("query");
      input = await creationInput(request);
      businessId = input.businessId;
    } else {
      const selection = parseBusinessSelection(params);
      if (!selection.ok || !selection.businessId || request.body) throw new Error("query");
      businessId = selection.businessId;
    }
  } catch { return reply({ error: "invalid_request" }, 400); }
  let gateway: StoreCreationGateway;
  let ownerId: string | null;
  try {
    const value = await dependencies.createGateway();
    if (!value) return reply({ error: "unavailable" }, 503);
    gateway = value;
    ownerId = await gateway.confirmedUser();
  } catch { return reply({ error: "unavailable" }, 503); }
  if (!ownerId) return reply({ error: "unauthorized" }, 401);
  try {
    let business = await gateway.ownedBusiness(ownerId, businessId);
    if (request.method === "GET") {
      if (!business) return unknown(businessId); // Absence cannot settle an in-flight POST.
      const storefront = await gateway.storefront(business.id);
      return storefront ? ready(business, storefront) : partial(business, "storefront_missing");
    }
    if (!input) return unknown(businessId);
    if (!business) {
      try { business = await gateway.insertBusiness(ownerId, input); }
      catch (error) {
        if (!(error instanceof StoreCreationWriteError) || error.code !== "duplicate") return unknown(businessId);
        // PK collisions may belong to someone else. Only the owned reread may resume.
        business = await gateway.ownedBusiness(ownerId, businessId);
        if (!business) return unknown(businessId);
      }
    }
    const existing = await gateway.storefront(business.id);
    if (existing) return ready(business, existing);
    try { return ready(business, await gateway.insertStorefront(business, input.slug), 201); }
    catch (error) {
      if (!(error instanceof StoreCreationWriteError)) return unknown(businessId);
      if (error.code === "duplicate") {
        // Do not inspect the foreign slug/constraint; our canonical row may have won.
        const canonical = await gateway.storefront(business.id);
        return canonical ? ready(business, canonical) : partial(business, "slug_unavailable");
      }
      return error.code === "rejected" ? partial(business, "draft_rejected") : unknown(businessId);
    }
  } catch { return unknown(businessId); }
}
