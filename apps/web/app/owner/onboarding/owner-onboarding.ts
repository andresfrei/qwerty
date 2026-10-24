// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { getTrustedSiteOrigin, isTrustedCallbackRequest } from "../../lib/supabase/confirm.ts";

// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { parseBusinessSelection } from "../owner-context.ts";

export type FirstBusiness = { id: string; name: string };
export type DraftStorefront = { slug: string; display_name: string; is_published: boolean };
export interface OnboardingGateway {
  confirmedUser(): Promise<string | null>;
  firstBusiness(ownerId: string, businessId?: string): Promise<FirstBusiness | null>;
  storefront(businessId: string): Promise<DraftStorefront | null>;
  createBusiness(ownerId: string, name: string): Promise<FirstBusiness>;
  createDraft(businessId: string, displayName: string, slug: string): Promise<DraftStorefront>;
}
export class OnboardingError extends Error {
  readonly code: "slug_unavailable" | "unknown" | "unavailable";
  constructor(code: "slug_unavailable" | "unknown" | "unavailable") { super(code); this.code = code; }
}
type Dependencies = { trustedOrigin?: string | null; createGateway(): Promise<OnboardingGateway | null> };
const headers = { "cache-control": "private, no-store", pragma: "no-cache", expires: "0", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff" };
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });
const nameValid = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0 && v.trim().length <= 120;

async function boundedJson(request: Request): Promise<unknown> {
  if (!request.body) throw new Error("body");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2048) { await reader.cancel(); throw new Error("body"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

export async function handleOnboarding(request: Request, dependencies: Dependencies): Promise<Response> {
  if (request.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
  const origin = dependencies.trustedOrigin === undefined ? getTrustedSiteOrigin() : dependencies.trustedOrigin;
  const selection = parseBusinessSelection(new URL(request.url).searchParams);
  if (!origin || request.headers.get("origin") !== origin || !isTrustedCallbackRequest(request, origin)
    || !selection.ok || new URL(request.url).pathname !== "/owner/onboarding"
    || request.headers.get("sec-fetch-site") === "cross-site") return reply({ error: "request_rejected" }, 403);
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get("content-type") ?? "")) return reply({ error: "invalid_request" }, 400);
  let payload: Record<string, unknown>;
  try {
    const value = await boundedJson(request);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("shape");
    payload = value as Record<string, unknown>;
    const keys = payload.action === "create_business" ? ["action", "name"] : payload.action === "create_draft" ? ["action", "displayName", "slug"] : [];
    if (!keys.length || Object.keys(payload).length !== keys.length || Object.keys(payload).some(k => !keys.includes(k))) throw new Error("shape");
    if (payload.action === "create_business" ? !nameValid(payload.name) : !nameValid(payload.displayName)
      || typeof payload.slug !== "string" || payload.slug.length > 63 || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(payload.slug)) throw new Error("fields");
  } catch { return reply({ error: "invalid_request" }, 400); }
  // Legacy create_business always resumes the first existing store; it is not a
  // create-another endpoint. Selected context is supported only for draft recovery.
  if (!selection.ok || (selection.businessId && payload.action === "create_business")) return reply({ error: "invalid_request" }, 400);
  try {
    const gateway = await dependencies.createGateway();
    if (!gateway) return reply({ error: "unavailable" }, 503);
    const ownerId = await gateway.confirmedUser();
    if (!ownerId) return reply({ error: "unauthorized" }, 401);
    const business = await gateway.firstBusiness(ownerId, selection.businessId);
    if (selection.businessId && !business) return reply({ error: "business_missing" }, 409);
    if (payload.action === "create_business") {
      if (business) return reply({ business, resumed: true });
      return reply({ business: await gateway.createBusiness(ownerId, (payload.name as string).trim()) }, 201);
    }
    if (!business) return reply({ error: "business_missing" }, 409);
    const storefront = await gateway.storefront(business.id);
    if (storefront) return reply({ business, storefront, resumed: true });
    return reply({ business, storefront: await gateway.createDraft(business.id, (payload.displayName as string).trim(), payload.slug as string) }, 201);
  } catch (error) {
    const code = error instanceof OnboardingError ? error.code : "unknown";
    return reply({ error: code }, code === "slug_unavailable" ? 409 : 503);
  }
}
