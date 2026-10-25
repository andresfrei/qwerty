import type { AcceptedOrderIntent, OrderContact } from "./pickup-order-client";
import type { ProfileRequest, ProfileSelection } from "./catalog-profiles";
import type { CartItem } from "./storefront";
// @ts-expect-error Native Node tests require explicit extensions.
import { parseProfileSelection, validateProfileSelection, canonicalProfileSelectionKey } from "./catalog-profiles.ts";
// @ts-expect-error Native Node tests require explicit extensions.
import { describeProfileSelection, priceProfileSelection } from "./catalog-profile-pricing.ts";
// @ts-expect-error Native Node tests require explicit extensions.
import { normalizePersistedCart } from "./storefront.ts";

export type ConfiguredCartLine = Omit<CartItem, "selection"> & { configured: true; selection: ProfileSelection };
export type PublicCartLine = CartItem | ConfiguredCartLine;
export type ConfiguredCart = { businessId: string; slug: string; items: PublicCartLine[] };
export type CartMutation = { ok: true; cart: ConfiguredCart } | { ok: false; cart: ConfiguredCart };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const amount = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const quantity = (v: unknown): v is number => amount(v) && v >= 1 && v <= 99;
export const isConfiguredCartLine = (line: PublicCartLine): line is ConfiguredCartLine => "configured" in line && line.configured === true;
export const configuredCartStorageKey = (businessId: string, slug: string) => `qwerty:cart:v3:${businessId}:${slug}`;

// Reads are pure. A caller must explicitly authorize a new-format write; never
// call persistence from a load effect or replace an unreadable stored value.
export function readConfiguredCart(value: unknown, businessId: string, slug: string):
  { ok: true; cart: ConfiguredCart } | { ok: false } {
  if (!uuid(businessId) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 63) return { ok: false };
  if (value === null) return { ok: true, cart: { businessId, slug, items: [] } };
  if (!object(value) || value.businessId !== businessId || !Array.isArray(value.items)) return { ok: false };
  if (value.version === undefined || value.version === 1 || value.version === 2) {
    return { ok: true, cart: { ...normalizePersistedCart(value, businessId), slug } };
  }
  if (value.version !== 3 || value.slug !== slug || value.items.length > 100) return { ok: false };
  const items: PublicCartLine[] = [];
  const keys = new Set<string>();
  for (const raw of value.items) {
    if (!object(raw) || typeof raw.key !== "string" || !raw.key || keys.has(raw.key)) return { ok: false };
    keys.add(raw.key);
    if (raw.configured === true) {
      const selection = parseProfileSelection(raw.selection);
      if (!selection.ok || selection.value.kind === "legacy" || !uuid(raw.id) || typeof raw.name !== "string" || !raw.name.trim()
        || !amount(raw.unitPriceMinor) || !quantity(raw.quantity) || typeof raw.currency !== "string" || !/^[A-Z]{3}$/.test(raw.currency)
        || typeof raw.selectionText !== "string") return { ok: false };
      items.push({ configured: true, id: raw.id, key: raw.key, name: raw.name, unitPriceMinor: raw.unitPriceMinor,
        currency: raw.currency, quantity: raw.quantity, selection: selection.value, selectionText: raw.selectionText });
    } else {
      if ("configured" in raw) return { ok: false };
      const legacy = normalizePersistedCart({ version: 2, businessId, items: [raw] }, businessId);
      if (legacy.items.length !== 1) return { ok: false };
      items.push(legacy.items[0]);
    }
  }
  return { ok: true, cart: { businessId, slug, items } };
}

export function addConfiguredVariant(cart: ConfiguredCart, request: ProfileRequest, units = 1): CartMutation {
  const rejected: CartMutation = { ok: false, cart };
  if (!quantity(units)) return rejected;
  const resolved = validateProfileSelection(request);
  if (!resolved.ok || resolved.value.catalog.businessId !== cart.businessId || resolved.value.selection.kind === "legacy") return rejected;
  const identity = canonicalProfileSelectionKey(request);
  const price = priceProfileSelection(request);
  const description = describeProfileSelection(request);
  if (!identity.ok || !price.ok || !description.ok) return rejected;
  const found = cart.items.findIndex(line => line.key === identity.key);
  const nextQuantity = units + (found < 0 ? 0 : cart.items[found].quantity);
  if (!quantity(nextQuantity) || found < 0 && cart.items.length >= 100) return rejected;
  const { item, selection } = resolved.value;
  const line: ConfiguredCartLine = { configured: true, id: item.id, key: identity.key, name: item.name,
    unitPriceMinor: price.unitPriceMinor, currency: item.currency, quantity: nextQuantity,
    selection, selectionText: description.text };
  const items = cart.items.slice();
  if (found < 0) items.push(line); else items[found] = line;
  return { ok: true, cart: { ...cart, items } };
}

// Zero is an explicit removal. Bad input leaves the original object unchanged.
export function changeConfiguredQuantity(cart: ConfiguredCart, key: string, units: number): CartMutation {
  if (units !== 0 && !quantity(units) || !cart.items.some(line => line.key === key)) return { ok: false, cart };
  const items = units === 0 ? cart.items.filter(line => line.key !== key)
    : cart.items.map(line => line.key === key ? { ...line, quantity: units } : line);
  return { ok: true, cart: { ...cart, items } };
}

export function persistConfiguredCart(write: (key: string, value: string) => void, cart: ConfiguredCart): boolean {
  try {
    const read = readConfiguredCart({ version: 3, ...cart }, cart.businessId, cart.slug);
    if (!read.ok) return false;
    write(configuredCartStorageKey(cart.businessId, cart.slug), JSON.stringify({ version: 3, ...read.cart }));
    return true;
  } catch { return false; }
}

// A wire projection, NOT a quote or authorization. Current-catalog review and
// attempt freezing must precede requestOrder in the future mounted controller.
export function configuredCartIntent(cart: ConfiguredCart,
  checkout: { requestId: string; receiptId: string; contact: OrderContact }):
  { ok: true; intent: AcceptedOrderIntent } | { ok: false } {
  if (!cart.items.length || cart.items.length > 100 || !uuid(checkout.requestId) || !uuid(checkout.receiptId)) return { ok: false };
  const currency = cart.items[0].currency;
  let total = BigInt(0);
  for (const line of cart.items) {
    if (line.currency !== currency || !quantity(line.quantity) || !amount(line.unitPriceMinor)) return { ok: false };
    total += BigInt(line.quantity) * BigInt(line.unitPriceMinor);
  }
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) return { ok: false };
  const common = { requestId: checkout.requestId, receiptId: checkout.receiptId, contact: { ...checkout.contact },
    expected: { currency, totalMinor: Number(total) } };
  if (!cart.items.some(isConfiguredCartLine)) {
    return { ok: true, intent: { ...common, lines: cart.items.map(line => ({ itemId: line.id, quantity: line.quantity,
      selection: structuredClone((line as CartItem).selection) })) } };
  }
  return { ok: true, intent: { version: 2, ...common, lines: cart.items.map(line => ({ itemId: line.id, quantity: line.quantity,
    selection: structuredClone(isConfiguredCartLine(line) ? line.selection : { kind: "legacy" as const, profileVersion: 0 as const, groups: line.selection }) })) } };
}
