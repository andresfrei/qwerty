import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's native TypeScript runner resolves explicit .ts imports.
import { describeSelection, priceSelection, validateSelections, type Option, type OptionGroup, type SelectionRequest } from "../app/lib/catalog-selection.ts";

const pizzaId = "11111111-1111-4111-8111-111111111111";
const dozenId = "22222222-2222-4222-8222-222222222222";

const sizeGroup: OptionGroup = {
  id: "g-size",
  item_id: pizzaId,
  name: "Tamaño",
  selection_mode: "distinct",
  min_select: 1,
  max_select: 1,
  sort_order: 0,
};
const flavorGroup: OptionGroup = {
  id: "g-flavor",
  item_id: pizzaId,
  name: "Sabor",
  selection_mode: "distinct",
  min_select: 1,
  max_select: 2,
  sort_order: 1,
};
const dozenFlavorGroup: OptionGroup = {
  id: "g-dozen-flavor",
  item_id: dozenId,
  name: "Sabor",
  selection_mode: "quantity",
  min_select: 12,
  max_select: 12,
  sort_order: 0,
};

const option = (id: string, group_id: string, name: string, price_delta_minor = 0, is_available = true): Option => ({
  id,
  group_id,
  name,
  price_delta_minor,
  is_available,
  sort_order: 0,
});

const small = option("o-small", sizeGroup.id, "Chica", 0);
const large = option("o-large", sizeGroup.id, "Grande", 400000);
const mozzarella = option("o-mozzarella", flavorGroup.id, "Muzzarella", 0);
const napolitana = option("o-napolitana", flavorGroup.id, "Napolitana", 0);
const calabresa = option("o-calabresa", flavorGroup.id, "Calabresa", 50000);
const soldOut = option("o-soldout", flavorGroup.id, "Fugazzeta", 0, false);
const carne = option("o-carne", dozenFlavorGroup.id, "Carne", 0);
const pollo = option("o-pollo", dozenFlavorGroup.id, "Pollo", 10000);

const pizzaRequest = (selections: SelectionRequest["selections"]): SelectionRequest => ({
  item: { id: pizzaId, price_minor: 1000000 },
  groups: [sizeGroup, flavorGroup],
  options: [small, large, mozzarella, napolitana, calabresa, soldOut],
  selections,
  surchargeMinor: 150000,
});

const dozenRequest = (selections: SelectionRequest["selections"]): SelectionRequest => ({
  item: { id: dozenId, price_minor: 900000 },
  groups: [dozenFlavorGroup],
  options: [carne, pollo],
  selections,
  surchargeMinor: 150000,
});

test("a two-flavor pizza adds one fixed surcharge and reads as halves", () => {
  const request = pizzaRequest([
    { groupId: sizeGroup.id, picks: [{ optionId: large.id, quantity: 1 }] },
    { groupId: flavorGroup.id, picks: [{ optionId: mozzarella.id, quantity: 1 }, { optionId: napolitana.id, quantity: 1 }] },
  ]);

  assert.deepEqual(validateSelections(request), []);
  assert.deepEqual(priceSelection(request), { ok: true, unitPriceMinor: 1550000, surchargeMinor: 150000 });
  assert.equal(describeSelection(request), "Grande · Mitad Muzzarella / mitad Napolitana");
});

test("a single flavor is charged without the two-flavor surcharge", () => {
  const request = pizzaRequest([
    { groupId: sizeGroup.id, picks: [{ optionId: small.id, quantity: 1 }] },
    { groupId: flavorGroup.id, picks: [{ optionId: mozzarella.id, quantity: 1 }] },
  ]);

  assert.deepEqual(validateSelections(request), []);
  assert.deepEqual(priceSelection(request), { ok: true, unitPriceMinor: 1000000, surchargeMinor: 0 });
  assert.equal(describeSelection(request), "Chica · Muzzarella");
});

test("a third flavor is rejected and no price is reported", () => {
  const request = pizzaRequest([
    { groupId: sizeGroup.id, picks: [{ optionId: small.id, quantity: 1 }] },
    { groupId: flavorGroup.id, picks: [{ optionId: mozzarella.id, quantity: 1 }, { optionId: napolitana.id, quantity: 1 }, { optionId: calabresa.id, quantity: 1 }] },
  ]);

  assert.deepEqual(validateSelections(request), [{ code: "too_many", groupId: flavorGroup.id, selected: 3, max: 2 }]);
  assert.deepEqual(priceSelection(request), { ok: false, errors: [{ code: "too_many", groupId: flavorGroup.id, selected: 3, max: 2 }] });
});

test("the same flavor twice is rejected instead of counting as equal halves", () => {
  const request = pizzaRequest([
    { groupId: sizeGroup.id, picks: [{ optionId: small.id, quantity: 1 }] },
    { groupId: flavorGroup.id, picks: [{ optionId: mozzarella.id, quantity: 1 }, { optionId: mozzarella.id, quantity: 1 }] },
  ]);

  assert.deepEqual(validateSelections(request), [{ code: "repeated_option", groupId: flavorGroup.id, optionId: mozzarella.id }]);
});

test("a dozen accepts exactly twelve units across flavors", () => {
  const request = dozenRequest([{ groupId: dozenFlavorGroup.id, picks: [{ optionId: carne.id, quantity: 6 }, { optionId: pollo.id, quantity: 6 }] }]);

  assert.deepEqual(validateSelections(request), []);
  assert.deepEqual(priceSelection(request), { ok: true, unitPriceMinor: 960000, surchargeMinor: 0 });
  assert.equal(describeSelection(request), "6 Carne + 6 Pollo");
});

test("a dozen short of or over twelve units is rejected", () => {
  const short = dozenRequest([{ groupId: dozenFlavorGroup.id, picks: [{ optionId: carne.id, quantity: 11 }] }]);
  const over = dozenRequest([{ groupId: dozenFlavorGroup.id, picks: [{ optionId: carne.id, quantity: 11 }, { optionId: pollo.id, quantity: 2 }] }]);

  assert.deepEqual(validateSelections(short), [{ code: "too_few", groupId: dozenFlavorGroup.id, selected: 11, min: 12 }]);
  assert.deepEqual(validateSelections(over), [{ code: "too_many", groupId: dozenFlavorGroup.id, selected: 13, max: 12 }]);
});

test("a required group without a selection is reported as missing", () => {
  const request = pizzaRequest([{ groupId: sizeGroup.id, picks: [{ optionId: small.id, quantity: 1 }] }]);

  assert.deepEqual(validateSelections(request), [{ code: "missing_selection", groupId: flavorGroup.id }]);
});

test("an unavailable option is rejected even when the count fits", () => {
  const request = pizzaRequest([
    { groupId: sizeGroup.id, picks: [{ optionId: small.id, quantity: 1 }] },
    { groupId: flavorGroup.id, picks: [{ optionId: soldOut.id, quantity: 1 }] },
  ]);

  assert.deepEqual(validateSelections(request), [{ code: "unavailable_option", groupId: flavorGroup.id, optionId: soldOut.id }]);
});

test("unknown groups and options are reported with their identifiers", () => {
  const unknownGroup = pizzaRequest([
    { groupId: sizeGroup.id, picks: [{ optionId: small.id, quantity: 1 }] },
    { groupId: flavorGroup.id, picks: [{ optionId: mozzarella.id, quantity: 1 }] },
    { groupId: "g-missing", picks: [] },
  ]);
  const unknownOption = pizzaRequest([
    { groupId: sizeGroup.id, picks: [{ optionId: small.id, quantity: 1 }] },
    { groupId: flavorGroup.id, picks: [{ optionId: "o-missing", quantity: 1 }] },
  ]);

  assert.deepEqual(validateSelections(unknownGroup), [{ code: "unknown_group", groupId: "g-missing" }]);
  assert.deepEqual(validateSelections(unknownOption), [{ code: "unknown_option", groupId: flavorGroup.id, optionId: "o-missing" }]);
});

test("quantities must be positive whole numbers", () => {
  const zero = dozenRequest([{ groupId: dozenFlavorGroup.id, picks: [{ optionId: carne.id, quantity: 0 }, { optionId: pollo.id, quantity: 12 }] }]);
  const fractional = dozenRequest([{ groupId: dozenFlavorGroup.id, picks: [{ optionId: carne.id, quantity: 11.5 }, { optionId: pollo.id, quantity: 0.5 }] }]);

  assert.deepEqual(validateSelections(zero), [{ code: "invalid_quantity", groupId: dozenFlavorGroup.id, optionId: carne.id }]);
  assert.deepEqual(validateSelections(fractional), [{ code: "invalid_quantity", groupId: dozenFlavorGroup.id, optionId: carne.id }, { code: "invalid_quantity", groupId: dozenFlavorGroup.id, optionId: pollo.id }]);
});

test("a selection that would price below zero is rejected", () => {
  const cheaper = { ...flavorGroup, id: "g-discount", max_select: 1 };
  const discount = option("o-discount", cheaper.id, "Descuento", -2000000);
  const request: SelectionRequest = {
    item: { id: pizzaId, price_minor: 1000000 },
    groups: [cheaper],
    options: [discount],
    selections: [{ groupId: cheaper.id, picks: [{ optionId: discount.id, quantity: 1 }] }],
    surchargeMinor: 0,
  };

  assert.deepEqual(priceSelection(request), { ok: false, errors: [{ code: "negative_price", itemId: pizzaId }] });
});

test("validation and pricing leave the request untouched", () => {
  const request = pizzaRequest([
    { groupId: sizeGroup.id, picks: [{ optionId: large.id, quantity: 1 }] },
    { groupId: flavorGroup.id, picks: [{ optionId: calabresa.id, quantity: 1 }] },
  ]);
  const snapshot = JSON.parse(JSON.stringify(request));

  validateSelections(request);
  priceSelection(request);
  describeSelection(request);

  assert.deepEqual(request, snapshot);
});

test("an item with no option groups reports no selection text", () => {
  const request: SelectionRequest = { item: { id: pizzaId, price_minor: 500000 }, groups: [], options: [], selections: [], surchargeMinor: 150000 };

  assert.deepEqual(validateSelections(request), []);
  assert.deepEqual(priceSelection(request), { ok: true, unitPriceMinor: 500000, surchargeMinor: 0 });
  assert.equal(describeSelection(request), "");
});
