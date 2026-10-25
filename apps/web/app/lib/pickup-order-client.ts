// Browser-only wire adapter. Selectors and DTOs never confer authority.
import type { ConfiguredPickupIntent, ConfiguredQuoteLine } from "./configured-order-quote";
// @ts-expect-error Native Node tests require explicit extensions.
import { validateConfiguredQuoteLine, sameConfiguredSelection } from "./configured-order-presenter.ts";
export const pickupUUID = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
export const pickupSlug = (v: unknown): v is string => typeof v === "string" && v.length <= 63 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const money = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const text = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;
export type OrderContact = { name: string; email: string; telephone: string };
export type OrderLine = { itemId: string; name: string; quantity: number; unitPriceMinor: number; lineTotalMinor: number; selectionText: string };
export type LegacyPickupOrder = { id: string; requestId: string; receiptId: string; currency: string; totalMinor: number; fulfillmentState: "pendiente_de_pago"; paymentState: "pendiente"; createdAt: string; contact: OrderContact; lines: OrderLine[] };
export type OrderIntent = { requestId: string; receiptId: string; contact: OrderContact; expected: { currency: string; totalMinor: number }; lines: { itemId: string; quantity: number; selection: { groupId: string; picks: { optionId: string; quantity: number }[] }[] }[] };
export type ConfiguredOrderIntent = Omit<ConfiguredPickupIntent, "slug">;
export type AcceptedOrderIntent = OrderIntent | ConfiguredOrderIntent;
export type ConfiguredOrder = Omit<LegacyPickupOrder, "lines"> & { version: 2; lines: ConfiguredQuoteLine[] };
export type PickupOrder = LegacyPickupOrder | ConfiguredOrder;
export function validateOrder(v: unknown, bind: { id?: string; requestId?: string; receiptId?: string; intent?: AcceptedOrderIntent } = {}): PickupOrder | null {
  if (object(v) && Object.hasOwn(v, "version") && v.version !== 2) return null;
  const configured = object(v) && v.version === 2;
  if (!object(v) || !pickupUUID(v.id) || !pickupUUID(v.requestId) || !pickupUUID(v.receiptId)
    || (bind.id && v.id !== bind.id) || (bind.requestId && v.requestId !== bind.requestId) || (bind.receiptId && v.receiptId !== bind.receiptId)
    || !text(v.currency, 3) || !/^[A-Z]{3}$/.test(v.currency) || !money(v.totalMinor)
    || v.fulfillmentState !== "pendiente_de_pago" || v.paymentState !== "pendiente"
    || !text(v.createdAt, 64) || !Number.isFinite(Date.parse(v.createdAt)) || !object(v.contact)
    || !text(v.contact.name, 120) || !v.contact.name.trim() || !text(v.contact.email, 254) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.contact.email)
    || !text(v.contact.telephone, 50) || !v.contact.telephone.trim() || !Array.isArray(v.lines) || !v.lines.length || v.lines.length > 100) return null;
  const lines: OrderLine[] = [];
  const configuredLines: ConfiguredQuoteLine[] = [];
  for (const line of v.lines) {
    if (configured) {
      const checked = validateConfiguredQuoteLine(line);
      if (!checked || checked.currency !== v.currency) return null;
      configuredLines.push(checked); lines.push(checked); continue;
    }
    if (!object(line) || !pickupUUID(line.itemId) || !text(line.name, 500) || !line.name.trim() || !text(line.selectionText, 20000)
      || !money(line.quantity) || line.quantity < 1 || line.quantity > 99 || !money(line.unitPriceMinor) || !money(line.lineTotalMinor)
      || line.lineTotalMinor !== line.quantity * line.unitPriceMinor) return null;
    lines.push({ itemId: line.itemId, name: line.name, quantity: line.quantity, unitPriceMinor: line.unitPriceMinor, lineTotalMinor: line.lineTotalMinor, selectionText: line.selectionText });
  }
  if (lines.reduce((sum, line) => sum + line.lineTotalMinor, 0) !== v.totalMinor) return null;
  const contact = { name: v.contact.name, email: v.contact.email, telephone: v.contact.telephone };
  const intent = bind.intent;
  if (intent && (v.currency !== intent.expected.currency || v.totalMinor !== intent.expected.totalMinor
    || Object.keys(contact).some(key => contact[key as keyof OrderContact] !== intent.contact[key as keyof OrderContact].trim())
    || lines.length !== intent.lines.length || lines.some((line, i) => line.itemId !== intent.lines[i].itemId || line.quantity !== intent.lines[i].quantity))) return null;
  if (intent && "version" in intent && intent.version === 2) {
    if (!configured || configuredLines.some((line, i) => !sameConfiguredSelection(line.selection, intent.lines[i].selection, line.profileKind))) return null;
  } else if (intent && configured) return null;
  const common: Omit<LegacyPickupOrder, "lines"> = { id: v.id, requestId: v.requestId, receiptId: v.receiptId, currency: v.currency, totalMinor: v.totalMinor, fulfillmentState: v.fulfillmentState, paymentState: v.paymentState, createdAt: v.createdAt, contact };
  return configured ? { ...common, version: 2, lines: configuredLines } : { ...common, lines };
}
export const correctableCodes = ["quote_changed", "catalog_changed", "unavailable", "invalid_request", "mixed_currency", "invalid_selection", "amount_out_of_range"] as const;
export type CorrectableCode = typeof correctableCodes[number];
export const isCorrectableCode = (value: unknown): value is CorrectableCode => correctableCodes.some(code => code === value);
export type OrderRequest = { kind: "submit"; slug: string; intent: AcceptedOrderIntent } | { kind: "recover"; slug: string; requestId: string; receiptId?: string; intent?: AcceptedOrderIntent } | { kind: "known"; id: string } | { kind: "queue"; businessId: string };
export type OrderResponse = { status: "confirmed"; order: PickupOrder } | { status: "queue"; orders: PickupOrder[] } | { status: "correctable"; code: CorrectableCode } | { status: "rejected"; code: "idempotency_conflict" | "receipt_used" | "invalid_receipt" } | { status: "unknown" | "error" | "session" | "forbidden" | "missing" };
export async function requestOrder(request: OrderRequest, fetcher: (url: string, init: RequestInit) => Promise<Response> = fetch): Promise<OrderResponse> {
  const uncertain = request.kind === "submit" || request.kind === "recover";
  const failure = (): OrderResponse => ({ status: uncertain ? "unknown" : "error" });
  let url: string;
  if (request.kind === "known") { if (!pickupUUID(request.id)) return { status: "error" }; url = `/api/checkout/orders/${request.id}`; }
  else if (request.kind === "queue") { if (!pickupUUID(request.businessId)) return { status: "error" }; url = `/api/business/orders?businessId=${request.businessId}`; }
  else {
    if (!pickupSlug(request.slug) || !pickupUUID(request.kind === "submit" ? request.intent.requestId : request.requestId)) return failure();
    url = `/api/checkout/orders?slug=${encodeURIComponent(request.slug)}`;
    if (request.kind === "recover") url += `&requestId=${request.requestId}`;
  }
  try {
    const response = await fetcher(url, { method: request.kind === "submit" ? "POST" : "GET", credentials: "same-origin", cache: "no-store", redirect: "error", ...(request.kind === "submit" ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...("version" in request.intent && request.intent.version === 2 ? { version: 2 } : {}), requestId: request.intent.requestId, receiptId: request.intent.receiptId, contact: request.intent.contact, expected: request.intent.expected, lines: request.intent.lines }) } : {}) });
    if (response.status === 401) return { status: "session" };
    if (response.status === 403) return { status: "forbidden" };
    if (response.status === 404) return { status: "missing" };
    if (request.kind === "submit" && [409, 422].includes(response.status)) {
      const error: unknown = await response.json();
      if (!object(error) || Object.keys(error).length !== 2 || error.error !== "Order unavailable") return failure();
      const codes = response.status === 409 ? ["quote_changed", "catalog_changed", "unavailable"] : ["invalid_request", "mixed_currency", "invalid_selection", "amount_out_of_range"];
      if (isCorrectableCode(error.code) && codes.includes(error.code)) return { status: "correctable", code: error.code };
      if (response.status === 409 && (error.code === "idempotency_conflict" || error.code === "receipt_used" || error.code === "invalid_receipt")) return { status: "rejected", code: error.code };
      return failure();
    }
    if (response.status !== 200 && !(request.kind === "submit" && response.status === 201)) return failure();
    const body: unknown = await response.json();
    if (!object(body)) return failure();
    if (request.kind === "queue") {
      if (!Array.isArray(body.orders) || body.orders.length > 100) return failure();
      const orders = body.orders.map((v: unknown) => validateOrder(v));
      if (orders.some(v => v === null)) return failure();
      return { status: "queue", orders: orders as PickupOrder[] };
    }
    const bind = request.kind === "known" ? { id: request.id } : request.kind === "submit" ? { requestId: request.intent.requestId, receiptId: request.intent.receiptId, intent: request.intent } : request;
    const order = validateOrder(body.order, bind);
    return order ? { status: "confirmed", order } : failure();
  } catch { return failure(); }
}
