import type { Contact } from "./checkout-draft";
import type { GroupSelection, Option, OptionGroup } from "./catalog-selection";
// @ts-expect-error Native Node tests require explicit extensions.
import { validateContact } from "./checkout-draft.ts";
// @ts-expect-error Native Node tests require explicit extensions.
import { describeSelection, priceSelection } from "./catalog-selection.ts";
// @ts-expect-error Native Node tests require explicit extensions.
import { MAX_CART_QUANTITY } from "./storefront.ts";

export const ORDER_QUOTE_VERSION = 1;
export const ORDER_MAX_LINES = 100;
export const ORDER_MAX_PICKS = 1000;
type Failure = { ok: false; code: "invalid_request" | "invalid_selection" | "mixed_currency" | "unavailable" | "amount_out_of_range" };
type IntentLine = { itemId: string; quantity: number; selection: GroupSelection[] };
export type PickupIntent = { version: 1; slug: string; requestId: string; receiptId: string; contact: Contact; expected: { currency: string; totalMinor: number }; lines: IntentLine[] };
type Item = { id: string; business_id: string; name: string; price_minor: number; currency: string; is_available: boolean };
export type OrderCatalog = { version: number; fingerprint: string; businessId: string; slug: string; surchargeMinor: number; items: Item[]; groups: (OptionGroup & { business_id: string })[]; options: (Option & { business_id: string })[] };
type QuoteLine = IntentLine & { name: string; currency: string; unitPriceMinor: number; lineTotalMinor: number; surchargeMinor: number; selectionText: string };
export type PickupQuote = { version: 1; snapshotFingerprint: string; businessId: string; currency: string; totalMinor: number; contact: Contact; lines: QuoteLine[] };
type QuoteResult = { ok: true; quote: PickupQuote } | Failure | { ok: false; code: "quote_changed"; quote: PickupQuote };
const fail = (code: Failure["code"]): Failure => ({ ok: false, code });
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const keys = (value: Record<string, unknown>, expected: string[]) => Object.keys(value).length === expected.length && expected.every((key) => Object.hasOwn(value, key));
const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const money = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const currency = (value: unknown): value is string => typeof value === "string" && /^[A-Z]{3}$/.test(value);

// Intent identity is independent of the current catalog/quote fingerprint.
// A retry must resolve its prior result before publication checks or repricing.
export function normalizePickupIntent(input: unknown, slug: string): { ok: true; intent: PickupIntent } | Failure {
  if (typeof slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !record(input) || !keys(input, ["requestId", "receiptId", "contact", "expected", "lines"]) || !uuid(input.requestId) || !uuid(input.receiptId)) return fail("invalid_request");
  if (!record(input.contact) || !keys(input.contact, ["name", "email", "telephone"]) || typeof input.contact.name !== "string" || typeof input.contact.email !== "string" || typeof input.contact.telephone !== "string") return fail("invalid_request");
  const contact = { name: input.contact.name.trim(), email: input.contact.email.trim(), telephone: input.contact.telephone.trim() };
  if (Object.keys(validateContact(contact)).length || !record(input.expected) || !keys(input.expected, ["currency", "totalMinor"]) || !currency(input.expected.currency) || !money(input.expected.totalMinor)) return fail("invalid_request");
  if (!Array.isArray(input.lines) || input.lines.length < 1 || input.lines.length > ORDER_MAX_LINES) return fail("invalid_request");
  const lines: IntentLine[] = [];
  const variants = new Set<string>();
  let picksUsed = 0, groupsUsed = 0;
  for (const line of input.lines) {
    if (!record(line) || !keys(line, ["itemId", "quantity", "selection"]) || !uuid(line.itemId) || !money(line.quantity) || line.quantity < 1 || line.quantity > MAX_CART_QUANTITY || !Array.isArray(line.selection)) return fail("invalid_request");
    const selection: GroupSelection[] = [];
    const groupIds = new Set<string>();
    for (const entry of line.selection) {
      if (++groupsUsed > ORDER_MAX_PICKS || !record(entry) || !keys(entry, ["groupId", "picks"]) || !uuid(entry.groupId) || !Array.isArray(entry.picks)) return fail("invalid_selection");
      const groupId = entry.groupId.toLowerCase();
      if (groupIds.has(groupId)) return fail("invalid_selection");
      groupIds.add(groupId);
      const picks: GroupSelection["picks"] = [];
      const optionIds = new Set<string>();
      for (const pick of entry.picks) {
        if (++picksUsed > ORDER_MAX_PICKS || !record(pick) || !keys(pick, ["optionId", "quantity"]) || !uuid(pick.optionId) || !money(pick.quantity) || pick.quantity < 1) return fail("invalid_selection");
        const optionId = pick.optionId.toLowerCase();
        if (optionIds.has(optionId)) return fail("invalid_selection");
        optionIds.add(optionId);
        picks.push({ optionId, quantity: pick.quantity });
      }
      selection.push({ groupId, picks: picks.sort((a, b) => a.optionId.localeCompare(b.optionId)) });
    }
    selection.sort((a, b) => a.groupId.localeCompare(b.groupId));
    const itemId = line.itemId.toLowerCase(), variant = `${itemId}:${JSON.stringify(selection)}`;
    if (variants.has(variant)) return fail("invalid_request");
    variants.add(variant);
    lines.push({ itemId, quantity: line.quantity, selection });
  }
  lines.sort((a, b) => `${a.itemId}:${JSON.stringify(a.selection)}`.localeCompare(`${b.itemId}:${JSON.stringify(b.selection)}`));
  return { ok: true, intent: { version: 1, slug, requestId: input.requestId.toLowerCase(), receiptId: input.receiptId.toLowerCase(), contact, expected: { currency: input.expected.currency, totalMinor: input.expected.totalMinor }, lines } };
}

function catalogValid(catalog: OrderCatalog): boolean {
  if (!catalog || catalog.version !== ORDER_QUOTE_VERSION || !uuid(catalog.businessId) || !/^[0-9a-f]{64}$/.test(catalog.fingerprint) || !money(catalog.surchargeMinor) || !Array.isArray(catalog.items) || !Array.isArray(catalog.groups) || !Array.isArray(catalog.options)) return false;
  if ([catalog.items, catalog.groups, catalog.options].some((rows) => rows.length > 1000 || new Set(rows.map((row) => row.id)).size !== rows.length)) return false;
  if (catalog.items.some((item) => !uuid(item.id) || item.business_id !== catalog.businessId || typeof item.name !== "string" || !item.name.trim() || !money(item.price_minor) || !currency(item.currency) || typeof item.is_available !== "boolean")) return false;
  if (catalog.groups.some((group) => !uuid(group.id) || group.business_id !== catalog.businessId || !catalog.items.some((item) => item.id === group.item_id) || typeof group.name !== "string" || !group.name.trim() || !["distinct", "quantity"].includes(group.selection_mode) || !money(group.min_select) || !money(group.max_select) || group.max_select < group.min_select || !money(group.sort_order))) return false;
  return !catalog.options.some((option) => !uuid(option.id) || option.business_id !== catalog.businessId || !catalog.groups.some((group) => group.id === option.group_id) || typeof option.name !== "string" || !option.name.trim() || !money(option.price_delta_minor) || typeof option.is_available !== "boolean" || !money(option.sort_order));
}

// Pure pricing boundary, not authentication, persistence or an atomicity proof.
// The BFF must supply a coherent trusted snapshot; SQL must fence it again.
export function quotePickupOrder(intent: PickupIntent, catalog: OrderCatalog): QuoteResult {
  if (!catalogValid(catalog) || catalog.slug !== intent.slug) return fail("unavailable");
  const lines: QuoteLine[] = [];
  let orderCurrency: string | undefined, totalMinor = 0;
  for (const line of intent.lines) {
    const item = catalog.items.find((entry) => entry.id === line.itemId);
    if (!item?.is_available) return fail("unavailable");
    if (orderCurrency && orderCurrency !== item.currency) return fail("mixed_currency");
    orderCurrency = item.currency;
    const groups = catalog.groups.filter((group) => group.item_id === item.id);
    const options = catalog.options.filter((option) => groups.some((group) => group.id === option.group_id));
    for (const selection of line.selection) {
      const group = groups.find((entry) => entry.id === selection.groupId);
      if (!group || (group.selection_mode === "distinct" && selection.picks.some((pick) => pick.quantity !== 1))) return fail("invalid_selection");
    }
    const request = { item, groups, options, selections: line.selection, surchargeMinor: catalog.surchargeMinor };
    const price = priceSelection(request);
    if (!price.ok) return fail("invalid_selection");
    const lineTotalMinor = price.unitPriceMinor * line.quantity;
    if (!money(price.unitPriceMinor) || !money(lineTotalMinor) || !money(totalMinor + lineTotalMinor)) return fail("amount_out_of_range");
    totalMinor += lineTotalMinor;
    lines.push({ itemId: item.id, quantity: line.quantity, selection: line.selection.map((group) => ({ groupId: group.groupId, picks: group.picks.map((pick) => ({ ...pick })) })), name: item.name, currency: item.currency, unitPriceMinor: price.unitPriceMinor, lineTotalMinor, surchargeMinor: price.surchargeMinor, selectionText: describeSelection(request) });
  }
  if (!orderCurrency) return fail("invalid_request");
  const quote: PickupQuote = { version: 1, snapshotFingerprint: catalog.fingerprint, businessId: catalog.businessId, currency: orderCurrency, totalMinor, contact: { ...intent.contact }, lines };
  return intent.expected.currency === orderCurrency && intent.expected.totalMinor === totalMinor ? { ok: true, quote } : { ok: false, code: "quote_changed", quote };
}
