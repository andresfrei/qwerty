import assert from 'node:assert/strict';
import test from 'node:test';
import { api, fixture, businessId, itemId, groupId, recordId, foreignId, category, group, option } from './owner-resource-navigation-fixtures.mjs';
const read = (f, resource = 'categories', search = {}, view = {}) => api().loadCatalogTaxonomyPage(f.client, search, { resource, ...view });

test('invalid input and missing required contextual parents perform zero queries and preserve state', async () => {
  for (const [resource, input, view] of [
    ['categories', { page: '01' }, {}], ['categories', { q: ['x'] }, {}],
    ['groups', {}, {}], ['options', {}, { mode: 'new' }],
    ['categories', {}, { mode: 'detail', id: 'bad' }], ['items', {}, {}],
  ]) {
    const f = fixture(); const before = structuredClone(f.source); Object.freeze(input);
    assert.deepEqual(await read(f, resource, input, view), { kind: 'invalid' });
    assert.equal(f.calls.length, 0); assert.equal(f.authCalls, 0); assert.deepEqual(f.source, before);
  }
});

test('fresh selection remains independent of switcher page; foreign business never falls back', async () => {
  const f = fixture();
  const result = await read(f, 'categories', { businessId, storePage: '1' });
  assert.equal(result.kind, 'ready'); assert.equal(result.owner.business.id, businessId);
  assert.deepEqual(result.owner.businesses, []); assert.equal(f.authCalls, 3);
  const other = fixture();
  assert.deepEqual(await read(other, 'categories', { businessId: foreignId }), { kind: 'missing' });
  assert.equal(other.catalogCalls().length, 0);
  const unconfirmed = fixture({ user: { email_confirmed_at: null } });
  assert.equal((await read(unconfirmed)).kind, 'redirect'); assert.equal(unconfirmed.catalogCalls().length, 0);
});

test('category pages are exact-count certified, bounded and deterministically ordered with safe search', async () => {
  const rows = Array.from({ length: 27 }, (_, n) => ({ ...category, id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, sort_order: n }));
  const f = fixture({ tables: { catalog_categories: rows } });
  const result = await read(f, 'categories', { page: '1', q: ' %_*,x\\ ' });
  assert.equal(result.kind, 'ready');
  assert.deepEqual(result.data.pagination, { page: 1, pageSize: 25, total: 27, hasMore: false, pageComplete: true, collectionComplete: false });
  assert.equal(result.data.rows.length, 2);
  const call = f.catalogCalls()[0];
  assert.deepEqual(call.range, [25, 49]); assert.equal(call.count, 'exact');
  assert.deepEqual(call.order, [['sort_order', { ascending: true }], ['id', { ascending: true }]]);
  assert.deepEqual(call.search, ['name', '%\\%\\_\\%,x\\\\%']);
  assert.deepEqual(call.eq, [['business_id', businessId]]);
  assert.equal((await read(fixture(), 'categories', { page: '1000000' })).data.rows.length, 0);
});

test('missing counts, row caps, duplicate/foreign/malformed rows and query failures fail closed', async () => {
  for (const change of [
    r => ({ ...r, count: null }), r => ({ ...r, count: 2 }),
    r => ({ ...r, data: [], count: 1 }), r => ({ ...r, error: { code: '42501', detail: 'private' } }),
    r => ({ ...r, data: [{ ...category, business_id: foreignId }] }),
    r => ({ ...r, data: [{ ...category, sort_order: '0' }] }),
    r => ({ ...r, data: [category, category], count: 2 }),
  ]) {
    const f = fixture({ change: (r, c) => c.table === 'catalog_categories' ? change(r) : r });
    assert.deepEqual(await read(f), { kind: 'unavailable' });
  }
});

test('contextual group and option pages check all supplied ancestry with scoped bounded reads', async () => {
  for (const [resource, search] of [['groups', { itemId }], ['options', { itemId, groupId }]]) {
    const f = fixture(); const result = await read(f, resource, search);
    assert.equal(result.kind, 'ready'); assert.equal(result.data.rows.length, 1);
    for (const c of f.catalogCalls()) {
      assert.ok(c.eq.some(([key, value]) => key === 'business_id' && value === businessId));
      assert.equal(c.count, 'exact'); assert.ok(c.limit === 2 || c.in?.[0] === 'id' && c.limit === 25 || c.range?.[1] === 24);
    }
    assert.deepEqual(result.data.pagination.collectionComplete, true);
  }
  for (const search of [{ itemId: foreignId }, { groupId: foreignId }, { groupId, itemId: foreignId }]) {
    const f = fixture();
    assert.deepEqual(await read(f, search.groupId ? 'options' : 'groups', search), { kind: 'missing' });
    assert.ok(!f.catalogCalls().some(c => c.range));
  }
});

test('detail identity ignores search/page origins but rejects foreign or contradictory ancestry', async () => {
  for (const [resource, id, expected] of [['categories', recordId, category], ['groups', groupId, group], ['options', recordId, option]]) {
    const f = fixture(); const result = await read(f, resource, { q: 'not matching', page: '9' }, { mode: 'detail', id });
    assert.equal(result.kind, 'ready'); assert.deepEqual(result.data.record, expected);
    assert.ok(f.catalogCalls().every(c => !c.search && !c.range));
  }
  for (const [resource, search, view] of [
    ['options', { groupId: foreignId }, { mode: 'detail', id: recordId }],
    ['groups', { itemId: foreignId }, { mode: 'detail', id: groupId }],
    ['categories', {}, { mode: 'detail', id: foreignId }],
  ]) assert.deepEqual(await read(fixture(), resource, search, view), { kind: 'missing' });
});

test('ancestry truncation, foreign payloads and transport exceptions never expose a ready record', async () => {
  for (const change of [
    r => ({ ...r, data: [], count: 1 }),
    r => ({ ...r, data: [{ ...group, business_id: foreignId }] }),
    r => ({ ...r, data: [{ ...group, item_id: foreignId }] }),
    () => { throw Error('private transport information'); },
  ]) {
    const f = fixture({ change: (r, c) => c.table === 'catalog_option_groups' ? change(r) : r });
    const before = structuredClone(f.source);
    const result = await read(f, 'options', { groupId }, { mode: 'detail', id: recordId });
    assert.ok(['missing', 'unavailable'].includes(result.kind));
    assert.deepEqual(Object.keys(result), ['kind']); assert.deepEqual(f.source, before);
  }
  const f = fixture({ change: (r, c) => c.table === 'catalog_options' ? { ...r, data: [{ ...option, group_id: foreignId }] } : r });
  assert.deepEqual(await read(f, 'options', { groupId }), { kind: 'unavailable' });
});

test('default owner selection and successful empty lists preserve exact metadata', async () => {
  const f = fixture({ tables: { catalog_categories: [] } });
  const result = await read(f);
  assert.equal(result.kind, 'ready'); assert.equal(result.owner.business.id, businessId);
  assert.deepEqual(result.data.pagination, { page: 0, pageSize: 25, total: 0, hasMore: false, pageComplete: true, collectionComplete: true });
  const absent = fixture({ businesses: [] });
  assert.equal((await read(absent)).kind, 'empty'); assert.equal(absent.catalogCalls().length, 0);
});

test('new-mode context is checked before returning readiness, with no writable operations', async () => {
  for (const [resource, search] of [['categories', {}], ['groups', { itemId }], ['options', { groupId, itemId }]]) {
    const f = fixture(); const before = structuredClone(f.source);
    const result = await read(f, resource, search, { mode: 'new' });
    assert.equal(result.kind, 'ready'); assert.equal(result.data.kind, 'new'); assert.deepEqual(f.source, before);
  }
  assert.deepEqual(await read(fixture(), 'options', { groupId: foreignId }, { mode: 'new' }), { kind: 'missing' });
});

test('central Options directory and item filter return checked product/group labels without shared varieties', async () => {
  for (const search of [{}, { itemId }, { groupId }]) {
    const f = fixture(); const r = await read(f, 'options', search);
    assert.equal(r.kind, 'ready'); assert.deepEqual(r.data.rows[0], { ...option, group, item: { id: itemId, business_id: businessId, name: 'Producto' } });
    for (const c of f.catalogCalls()) { assert.equal(c.count, 'exact'); assert.ok(c.eq.some(([k, v]) => k === 'business_id' && v === businessId)); assert.ok(c.limit === 2 || c.in?.[0] === 'id' && c.limit === 25 || c.range?.[1] === 24); }
  }
  const f = fixture({ tables: { catalog_option_groups: [{ ...group, item_id: foreignId }] } });
  const filtered = await read(f, 'options', { itemId });
  assert.equal(filtered.kind, 'ready'); assert.deepEqual(filtered.data.rows, []); assert.equal(filtered.data.pagination.total, 0);
});

test('directory resolves every page parent beyond first 25 groups without truncating a selector', async () => {
  const groups = Array.from({ length: 30 }, (_, n) => ({ ...group, id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, name: `Group ${n}` }));
  const options = groups.map((g, n) => ({ ...option, id: g.id, group_id: g.id, sort_order: n }));
  const f = fixture({ tables: { catalog_option_groups: groups, catalog_options: options } });
  const r = await read(f, 'options', { page: '1', itemId });
  assert.equal(r.kind, 'ready'); assert.equal(r.data.pagination.total, 30); assert.equal(r.data.rows.length, 5);
  assert.deepEqual(r.data.rows.map(row => row.group.name), ['Group 25', 'Group 26', 'Group 27', 'Group 28', 'Group 29']);
  const labels = f.catalogCalls().filter(c => c.table === 'catalog_option_groups');
  assert.equal(labels.length, 1, 'at most one group label batch per list page');
  assert.deepEqual(labels[0].in, ['id', groups.slice(25).map(g => g.id)]);
  assert.equal(labels[0].limit, 25); assert.equal(labels[0].count, 'exact');
  assert.equal(f.catalogCalls().filter(c => c.table === 'catalog_items').length, 1);
  const readCall = f.catalogCalls().find(c => c.table === 'catalog_options');
  assert.ok(readCall.fields.includes('catalog_option_groups!inner(item_id)'));
  assert.ok(readCall.eq.some(([k, v]) => k === 'catalog_option_groups.item_id' && v === itemId));
  const distinctGroups = groups.map(g => ({ ...g, item_id: g.id }));
  const distinctItems = groups.map(g => ({ id: g.id, business_id: businessId, name: `Item ${g.name}` }));
  const directory = fixture({ tables: { catalog_option_groups: distinctGroups, catalog_items: distinctItems, catalog_options: options } });
  const page = await read(directory, 'options', { page: '1' });
  assert.equal(page.kind, 'ready'); assert.deepEqual(page.data.rows.map(row => row.item.name), groups.slice(25).map(g => `Item ${g.name}`));
  assert.equal(directory.catalogCalls().length, 3, 'one options page, one group batch, one item batch');
  for (const table of ['catalog_option_groups', 'catalog_items']) {
    const calls = directory.catalogCalls().filter(c => c.table === table);
    assert.equal(calls.length, 1); assert.deepEqual(calls[0].in, ['id', groups.slice(25).map(g => g.id)]);
    assert.equal(calls[0].count, 'exact'); assert.equal(calls[0].limit, 25);
    assert.deepEqual(calls[0].eq, [['business_id', businessId]]);
  }
  for (const table of ['catalog_option_groups', 'catalog_items']) {
    for (const change of [
      r => ({ ...r, data: r.data.slice(0, 1) }),
      r => ({ ...r, data: r.data.map((row, n) => n === 1 ? r.data[0] : row) }),
      r => ({ ...r, data: r.data.map((row, n) => n === 1 ? { ...row, id: foreignId } : row) }),
    ]) {
      const bad = fixture({ tables: { catalog_option_groups: distinctGroups, catalog_items: distinctItems, catalog_options: options }, change: (r, c) => c.table === table && c.in ? change(r) : r });
      assert.deepEqual(await read(bad, 'options', { page: '1' }), { kind: 'unavailable' });
    }
  }
  const mismatch = fixture({ tables: { catalog_items: [{ id: itemId, business_id: businessId, name: 'A' }, { id: foreignId, business_id: businessId, name: 'B' }] } });
  assert.deepEqual(await read(mismatch, 'options', { groupId, itemId: foreignId }), { kind: 'missing' });
});

test('directory parent labels fail closed on missing, truncated or foreign ancestry', async () => {
  for (const change of [r => ({ ...r, data: [], count: 0 }), r => ({ ...r, count: 2 }), r => ({ ...r, data: [{ ...group, business_id: foreignId }] })]) {
    const f = fixture({ change: (r, c) => c.table === 'catalog_option_groups' ? change(r) : r });
    assert.ok(['missing', 'unavailable'].includes((await read(f, 'options')).kind));
  }
});

test('Settings reuses storefront and certified singleton surcharge with successful absence default only', async () => {
  const f = fixture(); const result = await read(f, 'settings');
  assert.equal(result.kind, 'ready'); assert.deepEqual(result.data, { kind: 'settings', storefront: null, surchargeMinor: 0 });
  assert.deepEqual(f.catalogCalls()[0].eq, [['business_id', businessId]]);
  const settings = { business_id: businessId, two_flavor_surcharge_minor: 123 };
  assert.equal((await read(fixture({ tables: { business_catalog_settings: [settings] } }), 'settings')).data.surchargeMinor, 123);
  for (const rows of [[settings, settings], [{ ...settings, two_flavor_surcharge_minor: -1 }]]) {
    assert.deepEqual(await read(fixture({ tables: { business_catalog_settings: rows } }), 'settings'), { kind: 'unavailable' });
  }
});
