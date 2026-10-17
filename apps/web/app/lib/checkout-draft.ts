import type { GroupSelection, Option, OptionGroup, SelectionRequest } from "./catalog-selection";
import type { CartState, CatalogItem } from "./storefront";
// @ts-expect-error Native Node tests require explicit extensions.
import { describeSelection, priceSelection, validateSelections } from "./catalog-selection.ts";
// @ts-expect-error Native Node tests require explicit extensions.
import { addSelectedCartItem, createCart, reconcileCart, setCartQuantity } from "./storefront.ts";

export type Contact = { name: string; email: string; telephone: string };
export type ContactErrors = Partial<Record<keyof Contact, string>>;
export type CheckoutCatalog = { items: CatalogItem[]; groups: OptionGroup[]; options: Option[]; surchargeMinor: number };
export const cartStorageKey = (businessId: string) => `qwerty:cart:v1:${businessId}`;

export function validateContact(contact: Contact): ContactErrors {
  const errors: ContactErrors = {};
  if (!contact.name.trim() || contact.name.length > 120 || Array.from(contact.name).some((character) => character.charCodeAt(0) < 32)) errors.name = "Ingresá tu nombre (hasta 120 caracteres).";
  if (contact.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email.trim())) errors.email = "Ingresá un correo válido (hasta 254 caracteres).";
  if (!contact.telephone.trim() || contact.telephone.length > 50 || !/^[+\d\s().-]+$/.test(contact.telephone) || !/\d/.test(contact.telephone)) errors.telephone = "Ingresá un teléfono de contacto (hasta 50 caracteres).";
  return errors;
}

export function selectionRequest(item: CatalogItem, selections: GroupSelection[], catalog: CheckoutCatalog): SelectionRequest {
  const groups = catalog.groups.filter((group) => group.item_id === item.id);
  const ids = new Set(groups.map((group) => group.id));
  return { item, selections, groups, options: catalog.options.filter((option) => ids.has(option.group_id)), surchargeMinor: catalog.surchargeMinor };
}

// Reconcile with the shared cart rules, but retain rejected/changed lines for
// explicit correction. Silently dropping a line could change the intended order.
export function inspectCart(cart: CartState, catalog: CheckoutCatalog) {
  const requests = new Map(catalog.items.map((item) => [item.id, selectionRequest(item, [], catalog)]));
  const reconciled = reconcileCart(cart, catalog.items, requests);
  const rows = cart.items.map((line) => {
    const item = catalog.items.find((entry) => entry.id === line.id && entry.business_id === cart.businessId && entry.is_available);
    const request = item ? selectionRequest(item, line.selection, catalog) : null;
    const errors = request ? validateSelections(request) : [];
    const price = request ? priceSelection(request) : null;
    const changed = price?.ok === true && (line.unitPriceMinor !== price.unitPriceMinor || line.currency !== item?.currency);
    const valid = !!item && errors.length === 0 && price?.ok === true && !changed;
    const current = valid ? reconciled.items.find((entry) => entry.id === line.id && entry.quantity === line.quantity && entry.unitPriceMinor === line.unitPriceMinor && JSON.stringify(entry.selection) === JSON.stringify(line.selection)) : undefined;
    return { line: current ?? line, request, price, changed, valid, description: request ? describeSelection(request) : line.selectionText };
  });
  return { cart: { ...cart, items: rows.map(({ line }) => line) }, rows, valid: rows.length > 0 && rows.every((row) => row.valid) };
}

export function updateQuantity(cart: CartState, key: string, quantity: number): CartState {
  const line = cart.items.find((entry) => entry.key === key);
  if (!line) return cart;
  // The shared helper accepts either a key or an item id. Isolate this line so
  // editing an unconfigured item never also changes another configured variant.
  const updated = setCartQuantity({ ...cart, items: [line] }, key, quantity).items[0];
  return { ...cart, items: cart.items.flatMap((entry) => entry.key === key ? updated ? [updated] : [] : [entry]) };
}

export function updateSelection(cart: CartState, key: string, selections: GroupSelection[], catalog: CheckoutCatalog): CartState {
  const line = cart.items.find((entry) => entry.key === key);
  const item = catalog.items.find((entry) => entry.id === line?.id && entry.business_id === cart.businessId && entry.is_available);
  if (!line || !item) return cart;
  const request = selectionRequest(item, selections, catalog);
  if (!priceSelection(request).ok) {
    return { ...cart, items: cart.items.map((entry) => entry.key === key ? { ...entry, selection: selections } : entry) };
  }
  const replacement = addSelectedCartItem(createCart(cart.businessId), { ...request, item }, selections).items[0];
  const others = cart.items.filter((entry) => entry.key !== key);
  const existing = others.find((entry) => entry.key === replacement.key);
  if (existing) return setCartQuantity({ ...cart, items: others }, existing.key, existing.quantity + line.quantity);
  return { ...cart, items: cart.items.map((entry) => entry.key === key ? { ...replacement, quantity: line.quantity } : entry) };
}

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
export async function submitCheckout(slug: string, contact: Contact, cart: CartState, catalog: CheckoutCatalog, fetcher: Fetcher = fetch): Promise<"invalid" | "ready" | "error"> {
  if (Object.keys(validateContact(contact)).length || !inspectCart(cart, catalog).valid) return "invalid";
  try {
    const response = await fetcher("/api/checkout/session", {
      method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug }),
    });
    if (!response.ok) return "error";
    const body: unknown = await response.json();
    return body !== null && typeof body === "object" && !Array.isArray(body) && Object.keys(body).length === 1 && "ready" in body && body.ready === true ? "ready" : "error";
  } catch {
    return "error";
  }
}
