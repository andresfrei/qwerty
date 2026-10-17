import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Native Node tests require explicit extensions.
import { validateContact, inspectCart, updateQuantity, updateSelection, submitCheckout, cartStorageKey } from "../app/lib/checkout-draft.ts";
// @ts-expect-error Native Node tests require explicit extensions.
import { addCartItem, createCart, normalizePersistedCart, persistCart } from "../app/lib/storefront.ts";

const item = { id: "pizza", business_id: "shop", category_id: "food", name: "Pizza", description: null, price_minor: 1000, currency: "ARS", is_available: true, sort_order: 0 };
const group = { id: "flavor", item_id: item.id, name: "Sabores", selection_mode: "distinct" as const, min_select: 1, max_select: 2, sort_order: 0 };
const options = ["A", "B", "C"].map((id) => ({ id, group_id: group.id, name: id, price_delta_minor: 100, is_available: true, sort_order: 0 }));
const catalog = { items: [item], groups: [group], options, surchargeMinor: 250 };
const contact = { name: "Ana Pérez", email: "ana@example.test", telephone: "+54 (11) 1234-5678" };
const simple = () => addCartItem(createCart("shop"), item);
const selected = () => updateSelection(simple(), item.id, [{ groupId: group.id, picks: [{ optionId: "A", quantity: 1 }, { optionId: "B", quantity: 1 }] }], catalog);

test("contact is bounded, required and contact-only, without OTP identity restrictions", () => {
  assert.deepEqual(validateContact(contact), {});
  assert.deepEqual(validateContact({ ...contact, telephone: "123" }), {});
  for (const field of ["name", "email", "telephone"] as const) assert.ok(validateContact({ ...contact, [field]: " " })[field]);
  assert.ok(validateContact({ ...contact, email: "not-email" }).email);
  assert.ok(validateContact({ ...contact, name: "x".repeat(121) }).name);
  assert.ok(validateContact({ ...contact, telephone: "x".repeat(51) }).telephone);
});

test("simple cart needs configured options; two flavors include surcharge and preserve units", () => {
  assert.equal(inspectCart(simple(), catalog).valid, false);
  const cart = selected();
  assert.equal(inspectCart(cart, catalog).valid, true);
  assert.equal(cart.items[0].unitPriceMinor, 1450);
  assert.match(cart.items[0].selectionText, /Mitad A/);
  const three = updateSelection(cart, cart.items[0].key, [{ groupId: group.id, picks: options.map((o) => ({ optionId: o.id, quantity: 1 })) }], catalog);
  assert.equal(inspectCart(three, catalog).valid, false);
  assert.equal(inspectCart(simple(), { ...catalog, groups: [], options: [] }).valid, true);
});

test("size and flavor groups are independent; quantities and existing selections survive edits", () => {
  const size = { ...group, id: "size", name: "Tamaño", max_select: 1 };
  const large = { ...options[0], id: "large", group_id: size.id, price_delta_minor: 500 };
  const configured = { ...catalog, groups: [size, group], options: [...options, large] };
  const cart = updateSelection(simple(), item.id, [{ groupId: size.id, picks: [{ optionId: large.id, quantity: 1 }] }, { groupId: group.id, picks: [{ optionId: "A", quantity: 1 }, { optionId: "B", quantity: 1 }] }], configured);
  assert.equal(inspectCart(cart, configured).valid, true);
  assert.equal(cart.items[0].unitPriceMinor, 1950);
  const three = updateQuantity(cart, cart.items[0].key, 3);
  assert.equal(three.items[0].quantity, 3);
  assert.deepEqual(three.items[0].selection, cart.items[0].selection);
  assert.deepEqual(inspectCart(three, configured).cart, three);
  const mixed = { ...cart, items: [...simple().items, ...cart.items] };
  const edited = updateQuantity(mixed, item.id, 2);
  assert.deepEqual(edited.items.map((line: { quantity: number }) => line.quantity), [2, 1]);
});

test("explicit review accepts changed price without losing selections or unit count", () => {
  const cart = selected();
  cart.items[0].quantity = 3;
  const changed = { ...catalog, surchargeMinor: 500 };
  assert.equal(inspectCart(cart, changed).valid, false);
  const accepted = updateSelection(cart, cart.items[0].key, cart.items[0].selection, changed);
  assert.equal(inspectCart(accepted, changed).valid, true);
  assert.equal(accepted.items[0].unitPriceMinor, 1700);
  assert.equal(accepted.items[0].quantity, 3);
  assert.deepEqual(accepted.items[0].selection, cart.items[0].selection);
});

test("quantity dozen requires exactly twelve, uses shared price deltas", () => {
  const dozen = { ...catalog, groups: [{ ...group, selection_mode: "quantity" as const, min_select: 12, max_select: 12 }] };
  for (const quantity of [11, 12, 13]) {
    const cart = updateSelection(simple(), item.id, [{ groupId: group.id, picks: [{ optionId: "A", quantity }] }], dozen);
    assert.equal(inspectCart(cart, dozen).valid, quantity === 12);
    if (quantity === 12) assert.equal(cart.items[0].unitPriceMinor, 2200);
  }
});

test("unavailable, foreign, changed price/options remain visible and block readiness", () => {
  const cart = selected();
  for (const changed of [{ ...catalog, items: [] }, { ...catalog, options: [] }, { ...catalog, items: [{ ...item, price_minor: 2000 }] }]) {
    const result = inspectCart(cart, changed);
    assert.equal(result.valid, false);
    assert.equal(result.cart.items.length, 1);
    assert.deepEqual(result.cart.items[0].selection, cart.items[0].selection);
  }
  assert.equal(inspectCart({ ...cart, businessId: "other" }, catalog).valid, false);
  assert.equal(inspectCart(createCart("shop"), catalog).valid, false);
});

test("existing key/version roundtrip retains selections, counts and business isolation", () => {
  const cart = selected();
  cart.items[0].quantity = 3;
  let stored = "";
  assert.equal(cartStorageKey("shop"), "qwerty:cart:v1:shop");
  persistCart((key: string, value: string) => { assert.equal(key, cartStorageKey("shop")); stored = value; }, cartStorageKey("shop"), cart);
  assert.equal(JSON.parse(stored).version, 2);
  assert.deepEqual(normalizePersistedCart(JSON.parse(stored), "shop"), cart);
  assert.equal(normalizePersistedCart(JSON.parse(stored), "other").items.length, 0);
});

test("submit validates first and sends ONLY slug; readiness preserves contact/cart without order calls", async () => {
  const cart = selected();
  const snapshot = JSON.stringify({ contact, cart });
  const calls: unknown[] = [];
  const fetcher = async (url: string, init: RequestInit) => { calls.push([url, init]); return Response.json({ ready: true }); };
  assert.equal(await submitCheckout("tienda", contact, cart, catalog, fetcher), "ready");
  assert.deepEqual(calls, [["/api/checkout/session", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: "tienda" }) }]]);
  assert.equal(JSON.stringify({ contact, cart }), snapshot);
  calls.length = 0;
  assert.equal(await submitCheckout("tienda", { ...contact, email: "bad" }, cart, catalog, fetcher), "invalid");
  assert.equal(await submitCheckout("tienda", contact, simple(), catalog, fetcher), "invalid");
  assert.equal(calls.length, 0);
});

test("network, rejection, 503 and malformed replies preserve all draft data for retry", async () => {
  const cart = selected();
  const before = JSON.stringify({ contact, cart });
  for (const response of [new Response("", { status: 503 }), new Response("", { status: 403 }), Response.json({ ready: false }), Response.json({ ready: true, account: "private" }), new Response("not json")]) {
    assert.equal(await submitCheckout("tienda", contact, cart, catalog, async () => response), "error");
    assert.equal(JSON.stringify({ contact, cart }), before);
  }
  assert.equal(await submitCheckout("tienda", contact, cart, catalog, async () => { throw Error("offline"); }), "error");
  assert.equal(JSON.stringify({ contact, cart }), before);
});
