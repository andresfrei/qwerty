import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's native TypeScript runner resolves explicit .ts imports.
import { addCartItem, addSelectedCartItem, cartTotalsByCurrency, createCart, formatMoney, normalizePersistedCart, persistCart, reconcileCart, setCartQuantity, type CatalogItem, type CartState, type SelectionCartRequest } from "../app/lib/storefront.ts";
import type { GroupSelection, Option, OptionGroup, SelectionRequest } from "../app/lib/catalog-selection";

const businessId = "11111111-1111-4111-8111-111111111111";
const firstItem: CatalogItem = {
  id: "22222222-2222-4222-8222-222222222222",
  business_id: businessId,
  category_id: "44444444-4444-4444-8444-444444444444",
  name: "Empanada de carne",
  description: "Carne suave",
  price_minor: 120000,
  currency: "ARS",
  is_available: true,
  sort_order: 0,
};

const dozenItem: CatalogItem = {
  id: "33333333-3333-4333-8333-333333333333",
  business_id: businessId,
  category_id: "44444444-4444-4444-8444-444444444444",
  name: "Docena de empanadas",
  description: null,
  price_minor: 900000,
  currency: "ARS",
  is_available: true,
  sort_order: 1,
};

const flavorGroup: OptionGroup = {
  id: "g-dozen-flavor",
  item_id: dozenItem.id,
  name: "Sabor",
  selection_mode: "quantity",
  min_select: 12,
  max_select: 12,
  sort_order: 0,
};
const carneOption: Option = { id: "o-carne", group_id: flavorGroup.id, name: "Carne", price_delta_minor: 0, is_available: true, sort_order: 0 };
const polloOption: Option = { id: "o-pollo", group_id: flavorGroup.id, name: "Pollo", price_delta_minor: 10000, is_available: true, sort_order: 1 };

const dozenRequest = (options: Option[] = [carneOption, polloOption]): SelectionCartRequest => ({
  item: { id: dozenItem.id, name: dozenItem.name, price_minor: dozenItem.price_minor, currency: dozenItem.currency },
  groups: [flavorGroup],
  options,
  selections: [],
  surchargeMinor: 0,
});

const mixedDozen: GroupSelection[] = [
  { groupId: flavorGroup.id, picks: [{ optionId: carneOption.id, quantity: 6 }, { optionId: polloOption.id, quantity: 6 }] },
];
const allCarneDozen: GroupSelection[] = [
  { groupId: flavorGroup.id, picks: [{ optionId: carneOption.id, quantity: 12 }] },
];

test("cart adds quantities and refreshes price data from the current catalog", () => {
  const initial = createCart(businessId);
  const withItem = addCartItem(initial, firstItem);
  const updated = addCartItem(withItem, { ...firstItem, name: "Empanada criolla", price_minor: 130000 });

  assert.deepEqual(updated.items, [
    {
      id: firstItem.id,
      key: firstItem.id,
      name: "Empanada criolla",
      unitPriceMinor: 130000,
      currency: "ARS",
      quantity: 2,
      selection: [],
      selectionText: "",
    },
  ]);
});

test("cart totals stay separate when catalog currencies differ", () => {
  const cart: CartState = {
    businessId,
    items: [
      { id: firstItem.id, key: firstItem.id, name: firstItem.name, unitPriceMinor: 120000, currency: "ARS", quantity: 1, selection: [], selectionText: "" },
      { id: "33333333-3333-4333-8333-333333333333", key: "33333333-3333-4333-8333-333333333333", name: "USD item", unitPriceMinor: 250, currency: "USD", quantity: 2, selection: [], selectionText: "" },
    ],
  };

  assert.deepEqual(cartTotalsByCurrency(cart), { ARS: 120000, USD: 500 });
});

test("money formatting scales currency minor units by each currency's fraction digits", () => {
  const expected = (major: number, currency: string) => new Intl.NumberFormat("es-AR", { style: "currency", currency }).format(major);

  assert.equal(formatMoney(12345, "ARS"), expected(123.45, "ARS"));
  assert.equal(formatMoney(12345, "JPY"), expected(12345, "JPY"));
  assert.equal(formatMoney(12345, "KWD"), expected(12.345, "KWD"));
});

test("malformed persisted items are dropped before catalog reconciliation", () => {
  const persisted = normalizePersistedCart({ businessId, items: [null, { id: firstItem.id, name: firstItem.name, unitPriceMinor: 120000, currency: "ARS", quantity: 2 }, { id: "bad" }] }, businessId);

  assert.deepEqual(reconcileCart(persisted, [firstItem]), {
    businessId,
    items: [{ id: firstItem.id, key: firstItem.id, name: firstItem.name, unitPriceMinor: firstItem.price_minor, currency: "ARS", quantity: 2, selection: [], selectionText: "" }],
  });
});

test("catalog refresh removes unavailable items and clamps persisted quantities", () => {
  const persisted: CartState = {
    businessId,
    items: [
      {
        id: firstItem.id,
        key: firstItem.id,
        name: firstItem.name,
        unitPriceMinor: firstItem.price_minor,
        currency: firstItem.currency,
        quantity: 200,
        selection: [],
        selectionText: "",
      },
      {
        id: "33333333-3333-4333-8333-333333333333",
        key: "33333333-3333-4333-8333-333333333333",
        name: "Ya no está",
        unitPriceMinor: 90000,
        currency: "ARS",
        quantity: 1,
        selection: [],
        selectionText: "",
      },
    ],
  };

  assert.deepEqual(reconcileCart(persisted, [{ ...firstItem, price_minor: 125000 }]), {
    businessId,
    items: [
      {
        id: firstItem.id,
        key: firstItem.id,
        name: firstItem.name,
        unitPriceMinor: 125000,
        currency: "ARS",
        quantity: 99,
        selection: [],
        selectionText: "",
      },
    ],
  });
});

test("storage write failures leave the in-memory cart usable", () => {
  const cart = addCartItem(createCart(businessId), firstItem);
  const blockedStorage = () => { throw new Error("quota exceeded"); };
  assert.equal(persistCart(blockedStorage, "cart-key", cart), false);
  assert.equal(cart.items.length, 1);

  let saved = "";
  const availableStorage = (_key: string, value: string) => { saved = value; };
  assert.equal(persistCart(availableStorage, "cart-key", cart), true);
  assert.equal((JSON.parse(saved) as { version: number }).version, 2);
  assert.deepEqual(normalizePersistedCart(JSON.parse(saved), businessId), cart);
});

test("a dozen line keeps one unit with its selection text and price", () => {
  const cart = addSelectedCartItem(createCart(businessId), dozenRequest(), mixedDozen);

  assert.equal(cart.items.length, 1);
  const line = cart.items[0];
  assert.equal(line.id, dozenItem.id);
  assert.equal(line.quantity, 1);
  assert.equal(line.name, dozenItem.name);
  assert.equal(line.unitPriceMinor, 960000);
  assert.equal(line.currency, "ARS");
  assert.equal(line.selectionText, "6 Carne + 6 Pollo");
  assert.deepEqual(line.selection, mixedDozen);
});

test("different selections create separate lines while repeating one selection increments it", () => {
  const mixedCart = addSelectedCartItem(createCart(businessId), dozenRequest(), mixedDozen);
  const twoLines = addSelectedCartItem(mixedCart, dozenRequest(), allCarneDozen);

  assert.equal(twoLines.items.length, 2);
  const repeated = addSelectedCartItem(twoLines, dozenRequest(), mixedDozen);

  assert.equal(repeated.items.length, 2);
  assert.equal(repeated.items[0].quantity, 2);
  assert.equal(repeated.items[0].key, mixedCart.items[0].key);
  assert.equal(repeated.items[1].quantity, 1);
  assert.equal(repeated.items[1].key, twoLines.items[1].key);
});

test("the same selection written in either order shares one line key", () => {
  const reversedDozen: GroupSelection[] = [
    { groupId: flavorGroup.id, picks: [{ optionId: polloOption.id, quantity: 6 }, { optionId: carneOption.id, quantity: 6 }] },
  ];
  const forwardCart = addSelectedCartItem(createCart(businessId), dozenRequest(), mixedDozen);
  const reversedCart = addSelectedCartItem(createCart(businessId), dozenRequest(), reversedDozen);

  assert.equal(forwardCart.items[0].key, reversedCart.items[0].key);

  const combined = addSelectedCartItem(forwardCart, dozenRequest(), reversedDozen);
  assert.equal(combined.items.length, 1);
  assert.equal(combined.items[0].quantity, 2);
});

test("a rejected selection leaves the cart untouched", () => {
  const cart = addCartItem(createCart(businessId), firstItem);
  const rejected = addSelectedCartItem(cart, dozenRequest(), [
    { groupId: flavorGroup.id, picks: [{ optionId: carneOption.id, quantity: 11 }] },
  ]);

  assert.equal(rejected, cart);
  assert.equal(cart.items.length, 1);
  assert.deepEqual(cart.items[0].selection, []);
});

test("quantity changes accept either the line key or the item id", () => {
  const withSelection = addSelectedCartItem(createCart(businessId), dozenRequest(), mixedDozen);
  const lineKey = withSelection.items[0].key;
  const byKey = setCartQuantity(withSelection, lineKey, 3);
  assert.equal(byKey.items[0].quantity, 3);

  const plain = addCartItem(createCart(businessId), firstItem);
  const byId = setCartQuantity(plain, firstItem.id, 4);
  assert.equal(byId.items[0].quantity, 4);

  const removed = setCartQuantity(byKey, lineKey, 0);
  assert.deepEqual(removed.items, []);
});

test("a stored version-1 payload loads without throwing and reconciles as selection-free", () => {
  const lines = [{ id: firstItem.id, name: firstItem.name, unitPriceMinor: firstItem.price_minor, currency: "ARS", quantity: 2 }];
  const expectedItem = {
    id: firstItem.id,
    key: firstItem.id,
    name: firstItem.name,
    unitPriceMinor: firstItem.price_minor,
    currency: "ARS",
    quantity: 2,
    selection: [],
    selectionText: "",
  };
  const unversioned = normalizePersistedCart({ businessId, items: lines }, businessId);
  const versionOne = normalizePersistedCart({ version: 1, businessId, items: lines }, businessId);

  assert.deepEqual(unversioned, { businessId, items: [expectedItem] });
  assert.deepEqual(versionOne, { businessId, items: [expectedItem] });
  assert.deepEqual(reconcileCart(versionOne, [{ ...firstItem, price_minor: 125000 }]), {
    businessId,
    items: [{ ...expectedItem, unitPriceMinor: 125000 }],
  });
});

test("a version-2 payload round-trips selection lines through normalization", () => {
  const cart = addSelectedCartItem(addCartItem(createCart(businessId), firstItem), dozenRequest(), mixedDozen);
  let saved = "";
  assert.equal(persistCart((_key, value) => { saved = value; }, "cart-key", cart), true);

  assert.deepEqual(normalizePersistedCart(JSON.parse(saved), businessId), cart);
});

test("reconciliation refreshes a selection line from the current catalog", () => {
  const cart = addSelectedCartItem(createCart(businessId), dozenRequest(), mixedDozen);
  const selectionData = new Map<string, SelectionRequest>([[dozenItem.id, dozenRequest()]]);

  const reconciled = reconcileCart(cart, [{ ...dozenItem, name: "Docena surtida", price_minor: 950000 }], selectionData);

  assert.equal(reconciled.items[0].name, "Docena surtida");
  assert.equal(reconciled.items[0].unitPriceMinor, 1010000);
  assert.equal(reconciled.items[0].selectionText, "6 Carne + 6 Pollo");
});

test("a stored selection whose option became unavailable is dropped while other lines survive", () => {
  const selected = addSelectedCartItem(createCart(businessId), dozenRequest(), mixedDozen);
  const persisted = { version: 2, businessId, items: [...addCartItem(selected, firstItem).items] };
  const selectionData = new Map<string, SelectionRequest>([[dozenItem.id, dozenRequest([{ ...carneOption, is_available: false }, polloOption])]]);

  const reconciled = reconcileCart(persisted, [firstItem, dozenItem], selectionData);

  assert.deepEqual(reconciled.items.map((line) => line.id), [firstItem.id]);
});

test("a selection line without verifying selection data is dropped instead of keeping an unverified price", () => {
  const cart = addSelectedCartItem(createCart(businessId), dozenRequest(), mixedDozen);

  assert.deepEqual(reconcileCart(cart, [dozenItem]), { businessId, items: [] });
});
