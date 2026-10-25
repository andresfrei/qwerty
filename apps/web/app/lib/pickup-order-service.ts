// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { presentConfiguredPickupOrder } from "./configured-order-presenter.ts";
import { isDeepStrictEqual } from "node:util";
import type { OrderCatalog, PickupIntent, PickupQuote } from "./order-quote";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { normalizePickupIntent, quotePickupOrder } from "./order-quote.ts";

export const PICKUP_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type OrderResult = { status: number; body: object };
export type PickupOrderRepository = {
  resolveBusiness(slug: string): Promise<string | null>;
  findAttempt(actor: string, business: string, request: string): Promise<unknown>;
  catalog(business: string, slug: string): Promise<OrderCatalog | null>;
  finalize(actor: string, business: string, intent: PickupIntent, quote: PickupQuote): Promise<unknown>;
};
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const uuid = (value: unknown): value is string => typeof value === "string" && PICKUP_UUID.test(value);
const money = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
export const unavailableOrder = (): OrderResult => ({ status: 503, body: { error: "Order unavailable", code: "unavailable" } });
export const unknownOrder = (requestId: string): OrderResult => ({ status: 503, body: { error: "Order outcome unknown", code: "outcome_unknown", requestId } });
const rejected = (code: string, status = 409): OrderResult => ({ status, body: { error: "Order unavailable", code } });

// Never serialize provider rows/JSON snapshots wholesale, even on privileged replay.
export function presentPickupOrder(value: unknown) {
  if (object(value) && object(value.intent) && value.intent.version === 2) return presentConfiguredPickupOrder(value);
  if (!object(value) || !uuid(value.id) || !uuid(value.actor_id) || !uuid(value.business_id) || !uuid(value.request_id) || !uuid(value.receipt_id)
    || !object(value.intent) || typeof value.intent.slug !== "string" || value.intent.version !== 1
    || !object(value.quote) || value.quote.version !== 1 || value.quote.businessId !== value.business_id
    || !money(value.total_minor) || value.quote.totalMinor !== value.total_minor || value.quote.currency !== value.currency
    || typeof value.currency !== "string" || !/^[A-Z]{3}$/.test(value.currency)
    || value.fulfillment_state !== "pendiente_de_pago" || value.payment_state !== "pendiente"
    || typeof value.created_at !== "string" || !Number.isFinite(Date.parse(value.created_at))) throw Error("Invalid stored order");
  const { version: _version, slug, ...body } = value.intent;
  const normalized = normalizePickupIntent(body, slug);
  if (!normalized.ok || !isDeepStrictEqual(normalized.intent, value.intent) || normalized.intent.requestId !== value.request_id
    || normalized.intent.receiptId !== value.receipt_id || !isDeepStrictEqual(value.quote.contact, normalized.intent.contact)
    || value.currency !== normalized.intent.expected.currency || value.total_minor !== normalized.intent.expected.totalMinor
    || !Array.isArray(value.quote.lines) || value.quote.lines.length !== normalized.intent.lines.length) throw Error("Invalid stored intent");
  const lines = value.quote.lines.map((line: unknown, index: number) => {
    const intended = normalized.intent.lines[index];
    if (!object(line) || !intended || line.itemId !== intended.itemId || line.quantity !== intended.quantity
      || !isDeepStrictEqual(line.selection, intended.selection) || line.currency !== value.currency
      || typeof line.name !== "string" || !line.name.trim() || typeof line.selectionText !== "string"
      || !money(line.unitPriceMinor) || !money(line.lineTotalMinor) || line.lineTotalMinor !== line.unitPriceMinor * intended.quantity) throw Error("Invalid stored line");
    return { itemId: intended.itemId, name: line.name, quantity: intended.quantity, unitPriceMinor: line.unitPriceMinor, lineTotalMinor: line.lineTotalMinor, selectionText: line.selectionText };
  });
  if (lines.reduce((sum, line) => sum + line.lineTotalMinor, 0) !== value.total_minor) throw Error("Invalid stored total");
  return { id: value.id, requestId: value.request_id, receiptId: value.receipt_id, currency: value.currency, totalMinor: value.total_minor,
    fulfillmentState: value.fulfillment_state, paymentState: value.payment_state, createdAt: value.created_at, contact: { ...normalized.intent.contact }, lines };
}
function boundAttempt(value: unknown, actor: string, business: string, requestId: string, intent?: PickupIntent): OrderResult {
  if (!object(value) || value.actor_id !== actor || value.business_id !== business || value.request_id !== requestId) throw Error("Invalid attempt binding");
  const order = presentPickupOrder(value);
  return intent && !isDeepStrictEqual(value.intent, intent) ? rejected("idempotency_conflict") : { status: 200, body: { order } };
}

// One finalization at most. A separate lookup has a new READ COMMITTED visibility
// boundary; a failed/missing lookup after a transport error cannot establish absence.
export async function submitPickupOrder(repository: PickupOrderRepository, actor: string, intent: PickupIntent): Promise<OrderResult> {
  let business: string | null;
  try { business = await repository.resolveBusiness(intent.slug); } catch { return unavailableOrder(); }
  if (!business || !PICKUP_UUID.test(business)) return unknownOrder(intent.requestId);
  const fresh = async () => {
    const row = await repository.findAttempt(actor, business, intent.requestId);
    return row === null ? null : boundAttempt(row, actor, business, intent.requestId, intent);
  };
  try {
    const prior = await fresh(); if (prior) return prior;
    let failure: OrderResult;
    const catalog = await repository.catalog(business, intent.slug);
    if (!catalog || catalog.businessId !== business) failure = rejected("unavailable");
    else {
      const priced = quotePickupOrder(intent, catalog);
      if (!priced.ok) failure = rejected(priced.code, ["quote_changed", "unavailable"].includes(priced.code) ? 409 : 422);
      else {
        const result = await repository.finalize(actor, business, intent, priced.quote);
        if (object(result) && (result.code === "created" || result.code === "replayed")) {
          const confirmed = boundAttempt(result.order, actor, business, intent.requestId, intent);
          return confirmed.status === 200 ? { ...confirmed, status: result.code === "created" ? 201 : 200 } : confirmed;
        }
        const code = object(result) ? result.code : null;
        if (typeof code !== "string" || !["invalid_request", "idempotency_conflict", "receipt_used", "invalid_receipt", "invalid_quote", "mixed_currency", "unavailable", "catalog_changed"].includes(code)) throw Error("Unknown finalizer result");
        failure = code === "invalid_quote" ? unavailableOrder() : rejected(code, ["invalid_request", "mixed_currency"].includes(code) ? 422 : 409);
      }
    }
    return await fresh() ?? failure;
  } catch {
    // Includes catalog errors/gate changes and malformed/foreign RPC results.
    // Never repeat the write or adopt a new request ID in this request.
    try { return await fresh() ?? unknownOrder(intent.requestId); } catch { return unknownOrder(intent.requestId); }
  }
}
export async function recoverPickupOrder(repository: PickupOrderRepository, actor: string, slug: string, requestId: string): Promise<OrderResult> {
  try {
    const business = await repository.resolveBusiness(slug);
    if (business && PICKUP_UUID.test(business)) {
      const row = await repository.findAttempt(actor, business, requestId);
      if (row !== null) return boundAttempt(row, actor, business, requestId);
    }
  } catch { /* An interrupted or still-running attempt is never proven absent. */ }
  return unknownOrder(requestId);
}
export function presentPickupQueue(rows: unknown, actor: string, business: string): OrderResult {
  if (!Array.isArray(rows) || rows.length > 100) throw Error("Invalid queue");
  const orders = rows.map((row: unknown) => {
    if (!object(row) || row.business_id !== business || !object(row.businesses)
      || row.businesses.id !== business || row.businesses.owner_id !== actor) throw Error("Invalid owner binding");
    return presentPickupOrder(row);
  });
  return { status: 200, body: { orders } };
}
