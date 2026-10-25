import assert from 'node:assert/strict';
import test from 'node:test';
import {fixture, id, pick, request, frozen, loadProfileDomain, unavailableFixedComboFixture} from './catalog-profiles-fixtures.mjs';

const domain = await loadProfileDomain();
const reject = (c, i, s) => { const before = structuredClone({c, s}); const result = domain.validateProfileSelection(request(frozen(c), i, frozen(s))); assert.equal(result.ok, false, JSON.stringify(result)); assert.deepEqual({c, s}, before); };

test('public domain APIs exist independently of the pricing consumer', () => {
  for (const name of ['parseProfileDocument', 'validateProfileConfiguration', 'validateProfileSelection', 'canonicalProfileSelectionKey']) assert.equal(typeof domain[name], 'function', name);
});
test('public structural selection parser is bounded, fresh and catalog independent', () => {
  assert.equal(typeof domain.parseProfileSelection, 'function');
  const f = fixture();
  for (const selection of [f.pizza, f.combo, { ...f.pizza, profileVersion: 999 }]) {
    const parsed = domain.parseProfileSelection(frozen(selection)); assert.equal(parsed.ok, true); assert.deepEqual(parsed.value, selection); assert.notEqual(parsed.value, selection);
  }
  for (const selection of [null, { ...f.pizza, extra: true }, { ...f.pizza, groups: 'x'.repeat(262145) }]) {
    assert.deepEqual(domain.parseProfileSelection(selection), { ok: false, errors: [{ code: 'invalid_selection', path: 'selection' }] });
  }
  const cyclic = {}; cyclic.groups = cyclic; assert.equal(domain.parseProfileSelection(cyclic).ok, false);
});

test('L8 fixed-choice availability is purchase state, not catalog structure', () => {
  for (const kind of ['flavor', 'size', 'child']) {
    const f = unavailableFixedComboFixture(kind), before = structuredClone(f);
    frozen(f);
    const configured = domain.validateProfileConfiguration(f.catalog);
    assert.equal(configured.ok, true, `${kind}: ${JSON.stringify(configured)}`);
    assert.equal(domain.validateProfileSelection(request(f.catalog, 2, f.dozen)).ok, true);
    const errors = kind === 'child'
      ? [{code: 'unavailable', path: id(1)}]
      : [{code: 'unavailable_option', groupId: id(kind === 'size' ? 10 : 11), optionId: id(kind === 'size' ? 20 : 22)}];
    assert.deepEqual(domain.validateProfileSelection(request(f.catalog, 3, f.combo)), {ok: false, errors});
    assert.deepEqual(f, before);
  }
});
test('L8 availability-neutral fixed validation retains strict references/counts/restrictions', () => {
  for (const mutate of [
    c => c.profiles[2].document.components[1].fixedGroupPicks[0].groupId = id(12),
    c => c.profiles[2].document.components[1].fixedGroupPicks[0].picks = [pick(25)],
    c => c.profiles[2].document.components[1].fixedGroupPicks[0].picks = [pick(999)],
    ...[0, -1, 1.5, 2, Number.MAX_SAFE_INTEGER + 1].map(n => c => c.profiles[2].document.components[1].fixedGroupPicks[0].picks = [pick(22, n)]),
    c => c.profiles[2].document.components[1].fixedGroupPicks[0].picks = [],
    c => c.profiles[2].document.components[1].fixedGroupPicks[0].picks = [pick(22), pick(22)],
    c => c.profiles[2].document.components[1].fixedGroupPicks[0].picks = [pick(22), pick(23), pick(24)],
    c => c.profiles[2].document.components[1].allowedOptions.push({groupId: id(11), optionIds: [id(23)]}),
    c => c.options[2].business_id = id(98)
  ]) {
    const f = unavailableFixedComboFixture('flavor'); mutate(f.catalog);
    const before = structuredClone(f);
    assert.equal(domain.validateProfileConfiguration(frozen(f.catalog)).ok, false);
    assert.deepEqual(f, before);
  }
});
test('S2/S3 rejects max2, bad IDs, cross groups, matrix and option unavailability', () => {
  for (const mutate of [s => s.groups[1].picks.push(pick(24)), s => s.groups[0].picks = [pick(22)], s => s.groups[1].picks = [pick(20)], s => s.groups[1].picks = [pick(999)], s => s.groups[0].picks = [pick(21)]]) {
    const {catalog, pizza} = fixture(); mutate(pizza); reject(catalog, 1, pizza);
  }
  for (const mutate of [c => c.options[2].is_available = false, c => c.profiles[0].document.matrix[0].available = false, c => c.profiles[0].document.matrix.pop(), c => c.profiles[0].document.matrix.push(structuredClone(c.profiles[0].document.matrix[0])), c => c.groups[0].min_select = 0, c => c.groups[1].max_select = 3]) {
    const {catalog, pizza} = fixture(); mutate(catalog); reject(catalog, 1, pizza);
  }
});
test('matrix money must be nonnegative safe integers', () => {
  for (const bad of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, Infinity]) {
    const {catalog, pizza} = fixture(); catalog.profiles[0].document.matrix[0].priceMinor = bad; reject(catalog, 1, pizza);
  }
});
test('S5 exact twelve-unit bounds, quantity purpose and availability are required', () => {
  for (const n of [11, 13]) { const f = fixture(); f.dozen.groups[0].picks = [pick(25, n)]; reject(f.catalog, 2, f.dozen); }
  for (const mutate of [c => c.groups[2].min_select = 0, c => c.groups[2].selection_mode = 'distinct', c => c.options[5].is_available = false]) { const f = fixture(); mutate(f.catalog); reject(f.catalog, 2, f.dozen); }
});
test('S4/S6 no substitutions, missing/duplicate instances, forbidden fixed/allowed choices', () => {
  for (const mutate of [s => s.components.pop(), s => s.components.push(structuredClone(s.components[0])), s => s.components[0].itemId = id(4), s => s.components[1].selection.groups[1].picks = [pick(23)], s => s.components[1].selection.groups[0].picks = [pick(999)], s => s.components[1].instanceIndex = 2, s => s.components[0].selection = {kind: 'combo', profileVersion: 1, components: []}]) {
    const {catalog, combo} = fixture(); mutate(combo); reject(catalog, 3, combo);
  }
  const f = fixture(); f.catalog.profiles[2].document.components[1].allowedOptions[0].optionIds = [id(20)]; reject(f.catalog, 3, f.combo);
});
test('S8 coherent references, child availability/currency and no nested/self combos', () => {
  for (const mutate of [c => c.items[0].business_id = id(98), c => c.groups[0].item_id = id(2), c => c.options[0].business_id = id(98), c => c.options[0].group_id = id(12), c => c.items[0].is_available = false, c => c.items[0].currency = 'USD', c => c.profiles[2].document.components[0].itemId = id(3), c => c.profiles[1].document = {schemaVersion: 1, kind: 'combo', components: []}, c => c.profiles[0].business_id = id(98), c => c.profiles[2].document.components[1].fixedGroupPicks[0].groupId = id(12)]) {
    const {catalog, combo} = fixture(); mutate(catalog); reject(catalog, 3, combo);
  }
});
test('active standard profile rejects legacy downgrade and malformed profile fallback', () => {
  const f = fixture(); f.extras.kind = 'legacy'; f.extras.profileVersion = 0; reject(f.catalog, 4, f.extras);
  const g = fixture(); g.catalog.profiles[3].document = {schemaVersion: 1, kind: 'typo'}; reject(g.catalog, 4, g.extras);
});
test('runtime request boundary, legacy validator errors and canonical legacy child ordering', () => {
  for (const input of [null, {}, {catalog: null, itemId: id(1), selection: null}, {...request(fixture().catalog, 1, fixture().pizza), price: 1}]) assert.equal(domain.validateProfileSelection(input).ok, false);
  const f = fixture(); f.catalog.profiles.pop(); f.extras.kind = 'legacy'; f.extras.profileVersion = 0;
  f.extras.groups[0].picks = [pick(999)];
  assert.equal(domain.validateProfileSelection(request(f.catalog, 4, f.extras)).ok, false);
  const g = fixture(); g.catalog.profiles[0].is_active = false;
  g.combo.components.filter(c => c.componentId === id(51)).forEach(c => { c.selection.kind = 'legacy'; c.selection.profileVersion = 0; });
  const key = domain.canonicalProfileSelectionKey(request(g.catalog, 3, g.combo));
  g.combo.components[1].selection.groups.reverse();
  assert.deepEqual(domain.canonicalProfileSelectionKey(request(g.catalog, 3, g.combo)), key);
});
test('legacy combo child distinct quantities are still validated', () => {
  const f = fixture(); f.catalog.profiles[0].is_active = false;
  f.combo.components.filter(c => c.componentId === id(51)).forEach(c => { c.selection.kind = 'legacy'; c.selection.profileVersion = 0; });
  f.combo.components[1].selection.groups[1].picks = [pick(22, 2)]; reject(f.catalog, 3, f.combo);
});
test('technical ceilings and strict references/duplicates/versions', () => {
  for (const mutate of [
    c => c.profiles.push(structuredClone(c.profiles[0])), c => c.items.push(structuredClone(c.items[0])),
    c => c.profiles[0].version = Number.MAX_SAFE_INTEGER + 1, c => c.items[0].price_minor = -1,
    c => c.groups[0].extra = true, c => c.options[0].group_id = id(999),
    c => c.items = Array(domain.PROFILE_MAX_ROWS + 1).fill(c.items[0]),
    c => c.profiles[2].document.components = Array(domain.PROFILE_MAX_COMPONENTS + 1).fill(c.profiles[2].document.components[0]),
    c => c.profiles[2].document.components[1].quantity = domain.PROFILE_MAX_INSTANCES + 1,
    c => c.profiles[2].document.components[1].order = 0,
    c => c.profiles[2].document.components[1].componentId = id(50),
    c => c.profiles[2].document.components[1].allowedOptions[0].optionIds.push(id(20)),
    c => c.profiles[2].document.components[1].allowedOptions[0].groupId = id(12)
  ]) { const f = fixture(); mutate(f.catalog); assert.equal(domain.validateProfileConfiguration(f.catalog).ok, false); }
  for (const mutate of [s => s.groups = Array(domain.PROFILE_MAX_GROUPS + 1).fill(s.groups[0]), s => s.groups[0].picks = Array(domain.PROFILE_MAX_PICKS + 1).fill(pick(20)), s => s.groups[0].picks[0].quantity = Number.MAX_SAFE_INTEGER + 1]) { const f = fixture(); mutate(f.pizza); reject(f.catalog, 1, f.pizza); }
  const cycle = {}; cycle.self = cycle; assert.equal(domain.parseProfileDocument(cycle).ok, false);
});
test('inclusive component boundary and real JSON byte/depth guards', () => {
  const g = fixture(); const first = g.catalog.profiles[2].document.components[0];
  g.catalog.profiles[2].document.components = Array.from({length: domain.PROFILE_MAX_COMPONENTS}, (_, n) => ({...structuredClone(first), componentId: id(100 + n), order: n}));
  assert.equal(domain.validateProfileConfiguration(g.catalog).ok, true);
  const doc = {schemaVersion: 1, kind: 'pizza', sizeGroupId: id(10), flavorGroupId: id(11), matrix: Array.from({length: 2000}, (_, n) => ({sizeOptionId: id(2000 + n), flavorOptionId: id(22), priceMinor: 10000, available: true}))};
  assert.ok(Buffer.byteLength(JSON.stringify(doc)) > domain.PROFILE_MAX_JSON_BYTES);
  assert.equal(domain.parseProfileDocument(doc).ok, false);
  doc.matrix = doc.matrix.slice(0, 1000); assert.equal(domain.parseProfileDocument(doc).ok, true);
  const deep = fixture(); let nested = null; for (let n = 0; n <= domain.PROFILE_MAX_DEPTH; n++) nested = {nested};
  deep.catalog.profiles[3].is_active = false; deep.catalog.profiles[3].document = nested;
  assert.equal(domain.validateProfileConfiguration(deep.catalog).ok, false);
});
test('strict bounded document/selection shape and canonical identity/version/order without mutation', () => {
  const {catalog, pizza} = fixture(); const doc = catalog.profiles[0].document;
  assert.equal(domain.parseProfileDocument(doc).ok, true);
  for (const bad of [null, {...doc, sql: true}, {...doc, schemaVersion: 2}, {...doc, sizeGroupId: 'bad'}, {...doc, matrix: Array(domain.PROFILE_MAX_MATRIX_ROWS + 1).fill(doc.matrix[0])}, ' '.repeat(domain.PROFILE_MAX_JSON_BYTES + 1)]) assert.equal(domain.parseProfileDocument(bad).ok, false);
  for (const mutate of [s => s.extra = 1, s => s.profileVersion = 0, s => s.groups.push(structuredClone(s.groups[0])), s => s.groups[0].picks[0].quantity = 0, s => s.groups[0].picks[0].extra = true]) { const f = fixture(); mutate(f.pizza); reject(f.catalog, 1, f.pizza); }
  const key = domain.canonicalProfileSelectionKey(request(catalog, 1, pizza)); assert.equal(key.ok, true);
  const reversed = structuredClone(pizza); reversed.groups.reverse(); reversed.groups[0].picks.reverse(); assert.deepEqual(domain.canonicalProfileSelectionKey(request(catalog, 1, reversed)), key);
  const upper = structuredClone(pizza); upper.groups.forEach(g => { g.groupId = g.groupId.toUpperCase(); g.picks.forEach(p => p.optionId = p.optionId.toUpperCase()); });
  assert.deepEqual(domain.canonicalProfileSelectionKey(request(catalog, 1, upper)), key);
  const c2 = structuredClone(catalog), s2 = structuredClone(pizza); c2.profiles[0].version = 2; s2.profileVersion = 2;
  assert.notEqual(domain.canonicalProfileSelectionKey(request(c2, 1, s2)).key, key.key);
  const f = fixture(), k1 = domain.canonicalProfileSelectionKey(request(f.catalog, 3, f.combo));
  [f.combo.components[1].selection, f.combo.components[2].selection] = [f.combo.components[2].selection, f.combo.components[1].selection];
  assert.notEqual(domain.canonicalProfileSelectionKey(request(f.catalog, 3, f.combo)).key, k1.key);
});
