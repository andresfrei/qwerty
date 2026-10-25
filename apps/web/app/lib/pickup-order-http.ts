import { NextRequest, NextResponse } from "next/server.js";
import type { CallbackCookieState } from "./supabase/callback-cookies";
import type { AcceptedPickupIntent, OrderResult, PickupOrderRepository } from "./pickup-order-service";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { normalizeConfiguredPickupIntent } from "./configured-order-quote.ts";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { createCallbackCookieState } from "./supabase/callback-cookies.ts";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { isTrustedCallbackRequest } from "./supabase/confirm.ts";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { normalizePickupIntent } from "./order-quote.ts";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { PICKUP_UUID, presentPickupOrder, presentPickupQueue, submitPickupOrder, recoverPickupOrder, unavailableOrder } from "./pickup-order-service.ts";

export type PickupOrderConfig = { url: string; anonKey: string; serviceKey?: string };
type User = { id: string; is_anonymous?: boolean; email_confirmed_at?: string };
export type PickupOrderConnection = {
  getUser(): Promise<{ data: { user: User | null }; error: unknown }>;
  service(): PickupOrderRepository;
  findOrder(id: string): Promise<unknown>;
  queue(actor: string, business: string): Promise<unknown>;
};
export type PickupOrderDependencies = {
  getConfig(): PickupOrderConfig | null;
  getOrigin(): string | null;
  connect(config: PickupOrderConfig, state: CallbackCookieState): PickupOrderConnection;
};
const MAX_BYTES = 1_048_576;
function response(body: object, status: number, allow?: string) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", Pragma: "no-cache", Expires: "0", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", ...(allow ? { Allow: allow } : {}) } });
}
const rejected = () => response({ error: "Request rejected" }, 400);
async function readJson(request: NextRequest): Promise<{ value: unknown } | "large" | null> {
  if (!/^application\/json(?:;\s*charset=utf-8)?$/i.test(request.headers.get("content-type") ?? "") || request.headers.has("content-encoding")) return null;
  const rawLength = request.headers.get("content-length");
  if (rawLength !== null && (!/^\d+$/.test(rawLength) || !Number.isSafeInteger(Number(rawLength)))) return null;
  const declared = rawLength === null ? null : Number(rawLength);
  if (declared !== null && declared > MAX_BYTES) return "large";
  const reader = request.body?.getReader(); if (!reader) return null;
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > MAX_BYTES) { await reader.cancel(); return "large"; }
      chunks.push(value);
    }
    if (!length || (declared !== null && length !== declared)) return null;
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return { value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) };
  } catch { return null; } finally { reader.releaseLock(); }
}
// target is route-owned, never taken from a query/body selector.
export async function handlePickupOrderRequest(request: NextRequest, target: "collection" | "queue" | { id: string }, dependencies: PickupOrderDependencies): Promise<NextResponse> {
  const allowed = target === "collection" ? "GET, POST" : "GET";
  if (request.method !== "GET" && !(target === "collection" && request.method === "POST")) return response({ error: "Method not allowed" }, 405, allowed);
  try {
    const config = dependencies.getConfig(), origin = dependencies.getOrigin();
    if (!config || !origin) { const result = unavailableOrder(); return response(result.body, result.status); }
    const suppliedOrigin = request.headers.get("origin");
    if (!isTrustedCallbackRequest(request, origin) || (request.method === "POST" ? suppliedOrigin !== origin : suppliedOrigin !== null && suppliedOrigin !== origin)) return rejected();
    const params = new URL(request.url).searchParams;
    const expected = target === "queue" ? ["businessId"] : target === "collection" ? request.method === "POST" ? ["slug"] : ["slug", "requestId"] : [];
    if ([...params.keys()].length !== expected.length || expected.some(key => params.getAll(key).length !== 1)) return rejected();
    const slug = params.get("slug"), requestId = params.get("requestId"), business = params.get("businessId");
    if (target === "collection" && (!slug || slug.length > 63 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || (request.method === "GET" && (!requestId || !PICKUP_UUID.test(requestId))))) return rejected();
    if (target === "queue" && (!business || !PICKUP_UUID.test(business))) return rejected();
    if (target !== "queue" && target !== "collection" && !PICKUP_UUID.test(target.id)) return response({ error: "Order not found" }, 404);
    let intent: AcceptedPickupIntent | undefined;
    if (request.method === "POST") {
      const json = await readJson(request);
      if (json === "large") return response({ error: "Request too large" }, 413);
      if (!json || !slug) return rejected();
      const value = json.value;
      const normalized = value !== null && typeof value === "object" && "version" in value && value.version === 2
        ? normalizeConfiguredPickupIntent(value, slug) : normalizePickupIntent(value, slug);
      if (!normalized.ok) return rejected();
      intent = normalized.intent;
    } else if (request.body || request.headers.has("content-encoding") || (request.headers.has("content-length") && request.headers.get("content-length") !== "0")) return rejected();
    const state = createCallbackCookieState(new NextRequest(request.url, { headers: new Headers(request.headers) }));
    const connection = dependencies.connect(config, state);
    const verified = await connection.getUser();
    if (verified.error || !verified.data.user || !PICKUP_UUID.test(verified.data.user.id)) return response({ error: "Session required" }, 401);
    const user = verified.data.user;
    let result: OrderResult;
    try {
      if (target === "queue") {
        if (user.is_anonymous !== false || !user.email_confirmed_at) result = { status: 403, body: { error: "Owner access required" } };
        else result = presentPickupQueue(await connection.queue(user.id, (business as string).toLowerCase()), user.id, (business as string).toLowerCase());
      } else if (target === "collection") {
        const repository = connection.service();
        result = intent ? await submitPickupOrder(repository, user.id, intent) : await recoverPickupOrder(repository, user.id, slug as string, (requestId as string).toLowerCase());
      } else {
        const row = await connection.findOrder(target.id.toLowerCase());
        const order = row === null ? null : presentPickupOrder(row);
        if (order && order.id !== target.id.toLowerCase()) throw Error("Invalid read binding");
        // RLS proves current DB authorization. Independently require current
        // getUser confirmation/nonanonymous identity when reading as a nonbuyer.
        const buyer = row !== null && (row as { actor_id: string }).actor_id === user.id;
        const owner = user.is_anonymous === false && Boolean(user.email_confirmed_at);
        result = !order || (!buyer && !owner) ? { status: 404, body: { error: "Order not found" } } : { status: 200, body: { order } };
      }
    } catch { result = unavailableOrder(); }
    const delivered = response(result.body, result.status);
    // Only cookies from a successful server verification are adopted. This also
    // preserves a refresh needed to recover an unknown outcome with the same actor.
    state.cookies.forEach(({ name, value, options }) => { delivered.cookies.set(name, value, options); });
    return delivered;
  } catch { const result = unavailableOrder(); return response(result.body, result.status); }
}
