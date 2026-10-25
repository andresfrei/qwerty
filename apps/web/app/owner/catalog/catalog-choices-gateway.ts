import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getTrustedSiteOrigin, isTrustedCallbackRequest } from "../../lib/supabase/confirm";
import { resolveOwnerContext, type VerifiedOwnerCallback } from "../owner-context-gateway";
import { loadCatalogItemPage, type ItemProfileSummary } from "./catalog-item-page-data";
import { loadCatalogTaxonomyPage, type CatalogPagePagination } from "./catalog-page-data";
import { parseCatalogChoiceQuery, type CatalogChoiceQuery } from "./catalog-choice-query";

export type CatalogChoice = { id: string; label: string };
export type CatalogItemChoice = CatalogChoice & { itemKind: ItemProfileSummary["kind"]; isAvailable: boolean };
export type CatalogChoicesDTO = {
  selectedBusinessId: string; q: string; pagination: CatalogPagePagination;
} & (
  | { kind: "categories"; rows: CatalogChoice[] }
  | { kind: "items"; rows: CatalogItemChoice[] }
  | { kind: "groups"; itemId: string; rows: CatalogChoice[] }
);
type ChoiceResult = { kind: "ready"; data: CatalogChoicesDTO } | { kind: "unauthorized" | "missing" | "unavailable" };

/** Session SDK and scope are request-local. Frozen page readers remain the only catalog reads. */
export function createCatalogChoicesGateway(client: SupabaseClient, onVerifiedOwner?: VerifiedOwnerCallback) {
  return {
    async read(query: CatalogChoiceQuery): Promise<ChoiceResult> {
      // Reuse the configuration route's verified-refresh boundary before later resource failures.
      const context = await resolveOwnerContext(client, query.selectedBusinessId, onVerifiedOwner);
      if (!context) return { kind: "unauthorized" };
      if (context.business?.id !== query.selectedBusinessId) return { kind: "missing" };
      const search = new URLSearchParams({ businessId: query.selectedBusinessId, q: query.q, page: String(query.page) });
      if (query.kind === "groups") search.set("itemId", query.itemId);
      const result = query.kind === "items"
        ? await loadCatalogItemPage(client, search, { resource: "items", mode: "list" })
        : await loadCatalogTaxonomyPage(client, search, { resource: query.kind, mode: "list" });
      if (result.kind !== "ready") return { kind: result.kind === "missing" ? "missing" : "unavailable" };
      if (result.owner.business.id !== query.selectedBusinessId || result.data.kind !== "list") return { kind: "unavailable" };
      const common = { selectedBusinessId: query.selectedBusinessId, q: query.q, pagination: result.data.pagination };
      if (query.kind === "items") {
        const rows: CatalogItemChoice[] = [];
        for (const row of result.data.rows) {
          if (!("profile" in row) || !("is_available" in row)) return { kind: "unavailable" };
          rows.push({ id: row.id, label: row.name, itemKind: row.profile.kind, isAvailable: row.is_available });
        }
        return { kind: "ready", data: { ...common, kind: "items", rows } };
      }
      const rows = result.data.rows.map(row => ({ id: row.id, label: row.name }));
      return { kind: "ready", data: query.kind === "groups"
        ? { ...common, kind: "groups", itemId: query.itemId, rows }
        : { ...common, kind: "categories", rows } };
    },
  };
}
function response(status: number, body: unknown, allow?: string): Response {
  return new Response(JSON.stringify(body), { status, headers: {
    "content-type": "application/json", "cache-control": "private, no-store", pragma: "no-cache", expires: "0",
    "referrer-policy": "no-referrer", "x-content-type-options": "nosniff", ...(allow ? { allow } : {}),
  } });
}
const failure = (status: number, error: string) => response(status, { error });
export type CatalogChoicesDependencies = {
  trustedOrigin?: string | null;
  createGateway(): Promise<ReturnType<typeof createCatalogChoicesGateway> | null>;
};
/** Validate all ingress before constructing the session client; no mutation or retry path. */
export async function handleCatalogChoicesRequest(request: Request, dependencies: CatalogChoicesDependencies): Promise<Response> {
  if (request.method !== "GET") return response(405, { error: "method_not_allowed" }, "GET");
  const origin = getTrustedSiteOrigin(dependencies.trustedOrigin === undefined ? process.env : { QWERTY_SITE_URL: dependencies.trustedOrigin ?? undefined });
  if (!origin) return failure(503, "unavailable");
  const url = new URL(request.url);
  const supplied = request.headers.get("origin");
  if (url.pathname !== "/owner/catalog/choices" || !isTrustedCallbackRequest(request, origin)
    || supplied !== null && supplied !== origin) return failure(400, "request_rejected");
  const query = parseCatalogChoiceQuery(url.searchParams);
  if (!query || request.body || request.headers.has("content-encoding")
    || request.headers.has("content-length") && request.headers.get("content-length") !== "0") return failure(400, "invalid_request");
  try {
    const gateway = await dependencies.createGateway();
    if (!gateway) return failure(503, "unavailable");
    const result = await gateway.read(query);
    if (result.kind === "ready") return response(200, result.data);
    if (result.kind === "unauthorized") return failure(401, "unauthorized");
    if (result.kind === "missing") return failure(404, "not_found");
  } catch { /* Never expose provider details or retry an automatic RPC. */ }
  return failure(503, "unavailable");
}
