import assert from 'node:assert/strict';
import test from 'node:test';
import * as core from '../app/lib/configured-order-quote.ts';
import { normalizePickupIntent } from '../app/lib/order-quote.ts';
import { priceProfileSelection } from '../app/lib/catalog-profile-pricing.ts';
import { configuredFixture, id, pick, groupPick, leaf, frozen } from './configured-order-fixtures.mjs';
const normalize = wire => core.normalizeConfiguredPickupIntent(wire, 'pizza');
const quote = f => { const n = normalize(f.wire); assert.equal(n.ok, true); return core.quoteConfiguredPickupOrder(n.intent, f.snapshot); };
const code = (result, expected) => { assert.equal(result.ok, false); assert.equal(result.code, expected); assert.deepEqual(Object.keys(result).sort(), expected === 'quote_changed' ? ['code', 'ok', 'quote'] : ['code', 'ok']); };

test('explicit v2 wire uses route slug, strict common rules and exact normalized SQL intent', () => {
  const f = configuredFixture();
  const n = normalize(frozen(f.wire));
  assert.equal(n.ok, true);
  assert.deepEqual(Object.keys(n.intent).sort(), ['version', 'slug', 'requestId', 'receiptId', 'contact', 'expected', 'lines'].sort());
  assert.equal(n.intent.version, 2); assert.equal(n.intent.slug, 'pizza'); assert.equal(n.intent.contact.name, 'Ana');
  for (const change of [w => { delete w.version; }, w => { w.version = 1; }, w => { w.version = 3; }, w => { w.slug = 'elsewhere'; }, w => { w.actorId = id(90); }, w => { w.businessId = id(90); }, w => { w.requestId = 'bad'; }, w => { w.contact.name = ''; }, w => { w.contact.email = 'bad'; }, w => { w.expected.totalMinor = -1; }, w => { w.expected.currency = 'ars'; }, w => { w.lines = []; }, w => { w.lines[0].quantity = 0; }, w => { w.lines[0].quantity = Number.MAX_SAFE_INTEGER; }, w => { w.lines[0].name = 'forged'; }, w => { w.lines[0].price = 1; }]) {
    const w = structuredClone(f.wire); change(w); code(normalize(w), 'invalid_request');
  }
  code(core.normalizeConfiguredPickupIntent(f.wire, 'INVALID'), 'invalid_request');
  code(normalize(null), 'invalid_request');
  assert.equal(normalizePickupIntent(f.wire, 'pizza').ok, false);
});

test('normalization is catalog independent, sorts IDs/instances and retains instance identity', () => {
  const f = configuredFixture('combo'); const n = normalize(f.wire);
  const w = structuredClone(f.wire); w.lines[0].selection.components.reverse();
  for (const c of w.lines[0].selection.components) { c.selection.groups.reverse(); for (const g of c.selection.groups) g.picks.reverse(); }
  assert.deepEqual(normalize(w), n);
  const instances = w.lines[0].selection.components.filter(c => c.componentId === id(51));
  [instances[0].selection, instances[1].selection] = [instances[1].selection, instances[0].selection];
  assert.notDeepEqual(normalize(w), n);
  w.lines[0].selection.profileVersion = 900; assert.equal(normalize(w).ok, true);
  const p = configuredFixture().wire; p.lines[0].itemId = 'ABCDEFAB-0000-4000-8000-000000000001';
  assert.equal(normalize(p).intent.lines[0].itemId, p.lines[0].itemId.toLowerCase());
});

test('selection shape, numeric, nesting, duplicate identities and aggregate work bounds fail closed', () => {
  for (const change of [s => { s.extra = true; }, s => { s.profileVersion = -1; }, s => { s.groups[0].picks[0].quantity = 0.5; }, s => { s.groups.push(s.groups[0]); }, s => { s.groups[0].picks[0].name = 'forged'; }, s => { s.groups[0].groupId = 'bad'; }]) {
    const f = configuredFixture(); change(f.wire.lines[0].selection); code(normalize(f.wire), 'invalid_selection');
  }
  for (const change of [s => { s.components.push(s.components[0]); }, s => { delete s.components[0].instanceIndex; }, s => { s.components[0].instanceIndex = -1; }, s => { s.components[0].selection = structuredClone(s); }, s => { s.components[0].itemId = id(4); }]) {
    const f = configuredFixture('combo'); change(f.wire.lines[0].selection); code(normalize(f.wire), 'invalid_selection');
  }
  const f = configuredFixture(); f.wire.lines.push(structuredClone(f.wire.lines[0])); code(normalize(f.wire), 'invalid_request');
  const cyclic = configuredFixture().wire; cyclic.lines[0].selection.groups[0].picks = cyclic; code(normalize(cyclic), 'invalid_request');
  const big = configuredFixture().wire; big.contact.name = 'x'.repeat(1024 * 1024); code(normalize(big), 'invalid_request');
  const many = configuredFixture('dozen').wire;
  many.lines = Array.from({ length: 100 }, (_, i) => ({ itemId: id(100 + i), quantity: 1, selection: leaf(Array.from({ length: 11 }, (_, j) => groupPick(200 + j, [pick(400 + j)]))) }));
  code(normalize(many), 'invalid_selection');
});

test('inclusive common quantity and aggregate pick boundaries, and canonical duplicate rejection', () => {
  const f = configuredFixture('dozen', 99); assert.equal(normalize(f.wire).ok, true);
  f.wire.lines[0].quantity = 100; code(normalize(f.wire), 'invalid_request');
  const w = configuredFixture().wire;
  w.lines = Array.from({ length: 10 }, (_, i) => ({ itemId: id(100 + i), quantity: 1, selection: leaf(Array.from({ length: 100 }, (_, j) => groupPick(200 + j, [pick(400 + j)]))) }));
  assert.equal(normalize(w).ok, true);
  w.lines[0].selection.groups[0].picks.push(pick(999)); code(normalize(w), 'invalid_selection');
  const duplicate = configuredFixture('combo').wire; const second = structuredClone(duplicate.lines[0]); second.selection.components.reverse(); duplicate.lines.push(second); code(normalize(duplicate), 'invalid_request');
  const invalidLegacy = configuredFixture().wire; invalidLegacy.lines[0].selection = { kind: 'legacy', profileVersion: 0, groups: [groupPick(11, [pick(22), pick(22)])] }; code(normalize(invalidLegacy), 'invalid_selection');
});

test('pizza ARS full flavor average floor cent plus one fee, quantity and identical halves', () => {
  const f = configuredFixture('pizza', 2); const original = structuredClone(f);
  const r = quote(frozen(f)); assert.equal(r.ok, true); assert.equal(r.quote.totalMinor, 2_400_000); assert.equal(r.quote.lines[0].surchargeMinor, 100_000);
  assert.deepEqual(f, original);
  const odd = configuredFixture(); odd.snapshot.profiles[0].document.matrix.find(r => r.sizeOptionId === id(20) && r.flavorOptionId === id(23)).priceMinor++;
  assert.equal(quote(odd).quote.totalMinor, 1_200_000);
  const same = configuredFixture(); same.wire.lines[0].selection.groups[1].picks = [pick(22), pick(22)]; same.wire.expected.totalMinor = 1_000_000;
  const single = quote(same); assert.equal(single.ok, true); assert.equal(single.quote.lines[0].surchargeMinor, 0); assert.equal(single.quote.lines[0].selection.groups[1].picks.length, 1);
  const zero = configuredFixture(); zero.snapshot.surchargeMinor = 0; assert.equal(quote(zero).quote.totalMinor, 1_100_000);
});

test('dozen exactly twelve any allowed mix fixed price and combos validate but never bill children', () => {
  for (const kind of ['dozen', 'combo']) {
    const f = configuredFixture(kind, 2); assert.equal(quote(f).ok, true);
    assert.equal(quote(f).quote.totalMinor, kind === 'dozen' ? 2_400_000 : 6_000_000);
  }
  const f = configuredFixture('dozen'); f.wire.lines[0].selection.groups[0].picks = [pick(26, 12)]; assert.equal(quote(f).ok, true);
  f.wire.lines[0].selection.groups[0].picks[0].quantity = 11; code(quote(f), 'invalid_selection');
  const c = configuredFixture('combo'); c.snapshot.surchargeMinor = Number.MAX_SAFE_INTEGER; c.snapshot.items[0].price_minor = Number.MAX_SAFE_INTEGER;
  assert.equal(quote(c).ok, true);
  const line = quote(c).quote.lines[0]; assert.equal(line.components.length, 3); assert.notDeepEqual(line.components[1].groups, line.components[2].groups);
  for (const mutate of [s => { s.components.pop(); }, s => { s.components.push({ ...s.components[0], instanceIndex: 1 }); }, s => { s.components[1].selection.groups[1].picks = [pick(23)]; }]) {
    const bad = configuredFixture('combo'); mutate(bad.wire.lines[0].selection); code(quote(bad), 'invalid_selection');
  }
});

test('current versions, all references, compatibility, unavailable children and invalid active profiles', () => {
  const cases = [
    ['pizza', f => { f.wire.lines[0].selection.groups[0].picks = [pick(21)]; }, 'unavailable'],
    ['pizza', f => { f.wire.lines[0].selection.profileVersion = 2; }, 'invalid_selection'],
    ['combo', f => { f.wire.lines[0].selection.components[0].selection.profileVersion = 2; }, 'invalid_selection'],
    ['pizza', f => { f.wire.lines[0].selection.groups[1].picks = [pick(27)]; }, 'invalid_selection'],
    ['pizza', f => { f.wire.lines[0].selection.groups.pop(); }, 'invalid_selection'],
    ['pizza', f => { f.wire.lines[0].selection.groups.push(groupPick(13, [pick(27)])); }, 'invalid_selection'],
    ['pizza', f => { f.wire.lines[0].selection.groups[1].picks.push(pick(24)); }, 'invalid_selection'],
    ['pizza', f => { f.snapshot.profiles[0].is_active = false; }, 'invalid_selection'],
    ['pizza', f => { f.snapshot.profiles[0].version = 2; }, 'invalid_selection'],
    ['pizza', f => { f.snapshot.profiles[0].document.matrix.pop(); }, 'unavailable'],
    ['combo', f => { f.wire.lines[0].selection.components[2].instanceIndex = 2; }, 'invalid_selection'],
    ['combo', f => { f.snapshot.profiles[2].document.components[1].allowedOptions[0].optionIds = [id(20)]; }, 'invalid_selection'],
    ['pizza', f => { f.wire.lines[0].selection.kind = 'legacy'; f.wire.lines[0].selection.profileVersion = 0; }, 'invalid_selection'],
    ['pizza', f => { f.snapshot.profiles[0].document.kind = 'unknown'; }, 'unavailable'],
    ['combo', f => { f.snapshot.options.find(o => o.id === id(22)).is_available = false; }, 'invalid_selection'],
    ['combo', f => { f.snapshot.items[0].is_available = false; }, 'unavailable'],
    ['pizza', f => { f.snapshot.items[0].is_available = false; }, 'unavailable'],
    ['pizza', f => { f.snapshot.items[0].business_id = id(98); }, 'unavailable'],
  ];
  for (const [kind, mutate, expected] of cases) { const f = configuredFixture(kind); mutate(f); code(quote(f), expected); }
  const unrelated = configuredFixture('dozen'); unrelated.snapshot.options.find(o => o.id === id(22)).is_available = false; assert.equal(quote(unrelated).ok, true);
});

test('inactive/missing legacy profiles preserve old helper price, active standard does not add pizza fee', () => {
  const f = configuredFixture('extras');
  const standard = quote(f); assert.equal(standard.ok, true); assert.equal(standard.quote.totalMinor, 2300);
  f.snapshot.profiles[3].is_active = false; f.snapshot.profiles[3].document = { arbitrary: ['draft'] };
  f.wire.lines[0].selection.kind = 'legacy'; f.wire.lines[0].selection.profileVersion = 0;
  const p = priceProfileSelection({ catalog: f.catalog, itemId: id(4), selection: f.wire.lines[0].selection });
  assert.equal(p.ok, true); assert.equal(quote(f).quote.totalMinor, p.unitPriceMinor); assert.equal(p.unitPriceMinor, 102300);
  f.snapshot.profiles.pop(); assert.equal(quote(f).quote.totalMinor, p.unitPriceMinor);
});

test('safe totals, mixed currency, trusted correction, exact metadata and immutable kitchen snapshot', () => {
  const f = configuredFixture('combo'); f.wire.expected.totalMinor = 1; f.wire.expected.currency = 'USD';
  const r = quote(f); code(r, 'quote_changed');
  assert.deepEqual(Object.keys(r.quote).sort(), ['version', 'snapshotFingerprint', 'businessId', 'currency', 'totalMinor', 'contact', 'lines'].sort());
  assert.equal(r.quote.currency, 'ARS'); assert.equal(r.quote.totalMinor, 3_000_000);
  assert.deepEqual(Object.keys(r.quote.lines[0]).sort(), ['itemId', 'quantity', 'selection', 'name', 'currency', 'profileVersion', 'profileKind', 'unitPriceMinor', 'lineTotalMinor', 'surchargeMinor', 'selectionText', 'groups', 'components'].sort());
  const saved = structuredClone(r.quote); f.snapshot.items[0].name = 'changed'; f.snapshot.options[0].name = 'changed'; assert.deepEqual(r.quote, saved);
  assert.equal(JSON.stringify(r.quote).includes('matrix'), false); assert.equal(JSON.stringify(r.quote).includes('schemaVersion'), false);
  assert.equal(r.quote.lines[0].components[1].name, 'Pizza'); assert.match(r.quote.lines[0].selectionText, /Muzzarella/);
  const overflow = configuredFixture('dozen', 2); overflow.snapshot.items[1].price_minor = Number.MAX_SAFE_INTEGER; code(quote(overflow), 'amount_out_of_range');
  const mixed = configuredFixture('dozen'); mixed.snapshot.items[3].currency = 'USD'; mixed.wire.lines.push(configuredFixture('extras').wire.lines[0]); code(quote(mixed), 'mixed_currency');
  const size = configuredFixture('dozen'); size.snapshot.items[1].name = 'ñ'.repeat(530000); code(quote(size), 'amount_out_of_range');
  const bad = configuredFixture(); bad.snapshot.slug = 'elsewhere'; code(quote(bad), 'unavailable');
  const sum = configuredFixture('extras'); sum.snapshot.items[3].price_minor = Number.MAX_SAFE_INTEGER; sum.snapshot.options.filter(o => o.group_id === id(13)).forEach(o => { o.price_delta_minor = 0; }); sum.wire.lines.push(configuredFixture('dozen').wire.lines[0]); code(quote(sum), 'amount_out_of_range');
  const n = normalize(configuredFixture().wire).intent; n.actorId = id(98); code(core.quoteConfiguredPickupOrder(n, configuredFixture().snapshot), 'invalid_request');
});
