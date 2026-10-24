import assert from 'node:assert/strict';
import test from 'node:test';
import {fixture, id, pick, groupPick, request, frozen, loadProfileDomain, unavailableFixedComboFixture} from './catalog-profiles-fixtures.mjs';
import {priceSelection, describeSelection} from '../app/lib/catalog-selection.ts';
import * as pricing from '../app/lib/catalog-profile-pricing.ts';

const domain = await loadProfileDomain();
const price = (c, i, s) => pricing.priceProfileSelection(request(c, i, s));
const reject = (c, i, s) => { const before = structuredClone({c, s}); const result = price(frozen(c), i, frozen(s)); assert.equal(result.ok, false, JSON.stringify(result)); assert.deepEqual({c, s}, before); };

test('public pricing and description APIs exist', () => {
  for (const name of ['priceProfileSelection', 'describeProfileSelection']) assert.equal(typeof pricing[name], 'function', name);
});
test('L8 agotado fixed components do not poison unrelated dozen pricing', () => {
  for (const kind of ['flavor', 'size', 'child']) {
    const f = unavailableFixedComboFixture(kind), before = structuredClone(f);
    frozen(f);
    assert.deepEqual(price(f.catalog, 2, f.dozen), {ok: true, unitPriceMinor: 12000, surchargeMinor: 0}, kind);
    const result = price(f.catalog, 3, f.combo);
    assert.equal(result.ok, false, kind);
    assert.equal(result.errors[0].code, kind === 'child' ? 'unavailable' : 'unavailable_option');
    assert.deepEqual(f, before);
  }
});
test('S2 average, floor, single and identical halves; full matrix replaces all deltas', () => {
  const {catalog: c, pizza: s} = fixture();
  assert.equal(price(c, 1, s).unitPriceMinor, 12000);
  c.profiles[0].document.matrix.find(r => r.sizeOptionId === id(20) && r.flavorOptionId === id(23)).priceMinor = 10001;
  assert.equal(price(c, 1, s).unitPriceMinor, 11000);
  c.surchargeMinor = 0; assert.equal(price(c, 1, s).unitPriceMinor, 10000);
  s.groups[1].picks = [pick(22)]; assert.equal(price(c, 1, s).surchargeMinor, 0);
  s.groups[1].picks = [pick(22), pick(22)];
  assert.equal(price(c, 1, s).unitPriceMinor, 10000);
  assert.equal(price(c, 1, s).surchargeMinor, 0);
  assert.equal(pricing.describeProfileSelection(request(c, 1, s)).text, 'Grande · Muzzarella');
});
test('BigInt intermediates protect safe floor/overflow', () => {
  const {catalog, pizza} = fixture(); catalog.profiles[0].document.matrix.forEach(r => r.priceMinor = Number.MAX_SAFE_INTEGER);
  catalog.surchargeMinor = 0; assert.equal(price(catalog, 1, pizza).unitPriceMinor, Number.MAX_SAFE_INTEGER);
  catalog.surchargeMinor = 1; reject(catalog, 1, pizza);
});
test('S5 twelve same or mixed units fixed parent price despite special deltas', () => {
  const {catalog, dozen} = fixture(); assert.equal(price(catalog, 2, dozen).unitPriceMinor, 12000);
  dozen.groups[0].picks = [pick(26, 12)]; assert.equal(price(catalog, 2, dozen).unitPriceMinor, 12000);
});
test('S4/S6 independent component instances charge ONLY parent with fresh kitchen snapshots', () => {
  const {catalog, combo} = fixture(); const before = structuredClone({catalog, combo});
  const result = price(frozen(catalog), 3, frozen(combo)); assert.equal(result.ok, true); assert.equal(result.unitPriceMinor, 30000); assert.equal(result.surchargeMinor, 0);
  const described = pricing.describeProfileSelection(request(catalog, 3, combo));
  assert.equal(described.ok, true); assert.equal(described.components.length, 3);
  assert.match(described.text, /Docena.*6 Carne \+ 6 Especial/); assert.match(described.text, /Pizza.*Grande/); assert.match(described.text, /Pizza.*Chica/);
  assert.equal(JSON.stringify(described.components).includes('price'), false);
  assert.deepEqual({catalog, combo}, before); assert.notEqual(described.components[0].groups, combo.components[0].selection.groups);
});
test('standard extras never pizza-fee; unprofiled/inactive EXACT old helper results/errors/descriptions', () => {
  const {catalog, extras} = fixture(); assert.equal(price(catalog, 4, extras).unitPriceMinor, 2300);
  assert.equal(pricing.describeProfileSelection(request(catalog, 4, extras)).text, 'Huevo + Queso');
  for (const inactive of [false, true]) for (const bad of [false, true]) {
    const f = fixture(); if (inactive) f.catalog.profiles[3].is_active = false; else f.catalog.profiles.pop();
    f.extras.kind = 'legacy'; f.extras.profileVersion = 0; if (bad) f.extras.groups[0].picks = [pick(999)];
    const legacy = {item: f.catalog.items[3], groups: f.catalog.groups.filter(g => g.item_id === id(4)), options: f.catalog.options.filter(o => o.group_id === id(13)), selections: f.extras.groups, surchargeMinor: f.catalog.surchargeMinor};
    assert.deepEqual(price(f.catalog, 4, f.extras), priceSelection(legacy));
    assert.equal(pricing.describeProfileSelection(request(f.catalog, 4, f.extras)).text, describeSelection(legacy));
  }
});
test('legacy combo leaves and ignored child charges', () => {
  const f = fixture(); f.catalog.profiles[0].is_active = false;
  f.combo.components.filter(c => c.componentId === id(51)).forEach(c => { c.selection.kind = 'legacy'; c.selection.profileVersion = 0; });
  assert.equal(price(f.catalog, 3, f.combo).unitPriceMinor, 30000);
  const g = fixture(); g.catalog.profiles[2].document.components[1].fixedGroupPicks = [];
  g.combo.components[1].selection = structuredClone(g.pizza);
  g.catalog.surchargeMinor = Number.MAX_SAFE_INTEGER;
  assert.equal(price(g.catalog, 3, g.combo).unitPriceMinor, 30000);
});
test('inclusive instance and pick boundaries remain priceable', () => {
  const f = fixture(); const component = f.catalog.profiles[2].document.components[0];
  component.quantity = domain.PROFILE_MAX_INSTANCES; f.catalog.profiles[2].document.components = [component];
  f.combo.components = Array.from({length: component.quantity}, (_, instanceIndex) => ({componentId: component.componentId, instanceIndex, selection: structuredClone(f.dozen)}));
  assert.equal(price(f.catalog, 3, f.combo).unitPriceMinor, 30000);
  const h = fixture(); h.catalog.items = [h.catalog.items[3]]; h.catalog.profiles = [h.catalog.profiles[3]];
  h.catalog.groups = [{...h.catalog.groups[3], selection_mode: 'quantity', min_select: 1000, max_select: 1000}];
  h.catalog.options = Array.from({length: domain.PROFILE_MAX_PICKS}, (_, n) => ({...h.catalog.options[7], id: id(1000 + n), price_delta_minor: 0}));
  h.extras.groups = [groupPick(13, h.catalog.options.map(o => ({optionId: o.id, quantity: 1})))];
  assert.equal(price(h.catalog, 4, h.extras).unitPriceMinor, 2000);
});
test('S2/S5/S6 accepted ARS commercial examples use centavos, not whole pesos', () => {
  // Synthetic illustrative prices: ARS $10.000 = 1_000_000 minor units.
  const {catalog, pizza, dozen, combo} = fixture();
  catalog.surchargeMinor = 100_000;
  catalog.profiles[0].document.matrix.forEach(row => {
    row.priceMinor = row.flavorOptionId === id(23) ? 1_200_000 : 1_000_000;
  });
  catalog.items.find(item => item.id === id(2)).price_minor = 1_200_000;
  catalog.items.find(item => item.id === id(3)).price_minor = 3_000_000;
  const before = structuredClone({catalog, pizza, dozen, combo});
  assert.deepEqual(price(frozen(catalog), 1, frozen(pizza)), {
    ok: true, unitPriceMinor: 1_200_000, surchargeMinor: 100_000
  });
  assert.deepEqual(price(catalog, 2, frozen(dozen)), {
    ok: true, unitPriceMinor: 1_200_000, surchargeMinor: 0
  });
  assert.deepEqual(price(catalog, 3, frozen(combo)), {
    ok: true, unitPriceMinor: 3_000_000, surchargeMinor: 0
  });
  assert.deepEqual({catalog, pizza, dozen, combo}, before);
});
