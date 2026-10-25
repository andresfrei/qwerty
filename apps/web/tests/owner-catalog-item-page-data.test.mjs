import assert from 'node:assert/strict';
import test from 'node:test';
import { itemApi, fixture, businessId, itemId, recordId, foreignId, product, category, missingCapability } from './owner-resource-navigation-fixtures.mjs';
const read = (f, search = {}, view = {}) => itemApi().loadCatalogItemPage(f.client, search, { resource: 'items', ...view });
const setup = (config = {}) => fixture({ ...config, tables: { catalog_items: [product], ...config.tables } });
const profile = { business_id: businessId, item_id: itemId, version: 2, is_active: true, kind: 'pizza' };

test('Products invalid syntax performs zero reads or mutations', async () => {
  for (const search of [{ page: '01' }, { categoryId: 'bad' }, { itemId }, { q: ['x'] }]) {
    const f = setup(); const before = structuredClone(f.source);
    assert.deepEqual(await read(f, search), { kind: 'invalid' });
    assert.equal(f.calls.length, 0); assert.equal(f.authCalls, 0); assert.deepEqual(f.source, before);
  }
});

test('Products fresh owner default/explicit selection never falls back', async () => {
  for (const search of [{}, { businessId, storePage: '1' }]) {
    const f = setup(); const r = await read(f, search);
    assert.equal(r.kind, 'ready'); assert.equal(r.owner.business.id, businessId); assert.equal(f.authCalls, 3);
  }
  for (const [config, search, kind] of [[{}, { businessId: foreignId }, 'missing'], [{ businesses: [] }, {}, 'empty'], [{ user: { email_confirmed_at: null } }, {}, 'redirect']]) {
    const f = setup(config); assert.equal((await read(f, search)).kind, kind); assert.equal(f.catalogCalls().length, 0);
  }
});

test('Products bounded ordered count-certified list resolves only listed labels and explicit kind metadata', async () => {
  const rows = Array.from({ length: 27 }, (_, n) => ({ ...product, id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, sort_order: n }));
  const f = setup({ tables: { catalog_items: rows } }); const r = await read(f, { page: '1', q: '%_*', categoryId: recordId });
  assert.equal(r.kind, 'ready'); assert.equal(r.data.rows.length, 2);
  assert.deepEqual(r.data.pagination, { page: 1, pageSize: 25, total: 27, hasMore: false, pageComplete: true, collectionComplete: false });
  assert.deepEqual(r.data.parents.category, category); assert.deepEqual(r.data.rows[0].category, category);
  const call = f.catalogCalls().find(c => c.table === 'catalog_items');
  assert.deepEqual(call.range, [25, 49]); assert.deepEqual(call.search, ['name', '%\\%\\_\\%%']);
  assert.deepEqual(call.order.map(([key]) => key), ['sort_order', 'id']);
  assert.ok(call.eq.some(([k, v]) => k === 'category_id' && v === recordId));
  const metadata = f.catalogCalls().find(c => c.table === 'catalog_item_configurations');
  assert.deepEqual(metadata.in, ['item_id', r.data.rows.map(row => row.id)]); assert.equal(metadata.limit, 26);
  assert.equal(metadata.fields, 'business_id,item_id,version,is_active,kind:document->>kind');
  for (const c of f.catalogCalls()) { assert.equal(c.count, 'exact'); assert.ok(c.eq.some(([k, v]) => k === 'business_id' && v === businessId)); }
  assert.equal(f.catalogCalls().filter(c => c.table === 'catalog_categories').length, 1);
});

test('Products detail ignores category/list origin but new category must exist in selected business', async () => {
  const f = setup({ tables: { catalog_item_configurations: [profile] } });
  const r = await read(f, { categoryId: foreignId, q: 'absent', page: '99' }, { mode: 'detail', id: itemId });
  assert.equal(r.kind, 'ready'); assert.deepEqual(r.data.record, { ...product, category, profile: { kind: 'pizza', version: 2, isActive: true } });
  assert.ok(f.catalogCalls().every(c => !c.range && !c.search));
  assert.equal((await read(setup(), { categoryId: recordId }, { mode: 'new' })).data.parents.category.id, recordId);
  assert.deepEqual(await read(setup(), { categoryId: foreignId }, { mode: 'new' }), { kind: 'missing' });
  assert.deepEqual(await read(setup(), {}, { mode: 'detail', id: foreignId }), { kind: 'missing' });
});

test('Products capability three states are strict; only typed missing supports old schema', async () => {
  const legacy = setup({ capability: missingCapability }); const r = await read(legacy);
  assert.equal(r.kind, 'ready'); assert.equal(r.data.capability, 'legacy_only'); assert.equal(r.data.rows[0].profile.kind, 'legacy');
  assert.ok(!legacy.catalogCalls().some(c => c.table === 'catalog_item_configurations'));
  for (const capability of [{ data: null, error: { code: 'PGRST202' } }, { data: [{ version: 2 }], error: null }, { data: null, error: { code: '42501' } }, () => { throw Error('transport'); }]) {
    assert.deepEqual(await read(setup({ capability })), { kind: 'unavailable' });
  }
  const named = setup({ tables: { catalog_items: [{ ...product, name: 'Pizza combo' }] } });
  assert.equal((await read(named)).data.rows[0].profile.kind, 'legacy');
});

test('Products malformed active kind, truncated metadata/labels/items and foreign payloads fail closed', async () => {
  for (const row of [{ ...profile, kind: null }, { ...profile, kind: 'future' }, { ...profile, business_id: foreignId }, { ...profile, item_id: foreignId }, { ...profile, version: 0 }]) {
    const f = setup({ change: (r, c) => c.table === 'catalog_item_configurations' ? { ...r, data: [row], count: 1 } : r });
    assert.deepEqual(await read(f), { kind: 'unavailable' });
  }
  for (const table of ['catalog_items', 'catalog_categories', 'catalog_item_configurations']) {
    const f = setup({ change: (r, c) => c.table === table ? { ...r, count: 2 } : r });
    const before = structuredClone(f.source); assert.deepEqual(await read(f), { kind: 'unavailable' }); assert.deepEqual(f.source, before);
  }
  for (const changed of [{ ...product, business_id: foreignId }, { ...product, price_minor: -1 }, { ...product, photo_version: '01' }]) {
    assert.deepEqual(await read(setup({ change: (r, c) => c.table === 'catalog_items' ? { ...r, data: [changed] } : r })), { kind: 'unavailable' });
  }
});

test('Products all page category labels are resolved with bounded ID reads and inactive profiles stay legacy', async () => {
  const categories = Array.from({ length: 27 }, (_, n) => ({ ...category, id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, name: `Category ${n}` }));
  const items = categories.map((c, n) => ({ ...product, id: c.id, category_id: c.id, sort_order: n }));
  const f = setup({ tables: { catalog_items: items, catalog_categories: categories } });
  const r = await read(f, { page: '1' }); assert.equal(r.kind, 'ready');
  assert.deepEqual(r.data.rows.map(row => row.category.name), ['Category 25', 'Category 26']);
  const labels = f.catalogCalls().filter(c => c.table === 'catalog_categories');
  assert.equal(labels.length, 1, 'at most one category label batch per list page');
  assert.deepEqual(labels[0].in, ['id', categories.slice(25).map(c => c.id)]);
  assert.equal(labels[0].limit, 25); assert.equal(labels[0].count, 'exact');
  for (const change of [
    r => ({ ...r, data: r.data.slice(0, 1) }),
    r => ({ ...r, data: [r.data[0], r.data[0]] }),
    r => ({ ...r, data: [r.data[0], { ...r.data[1], id: foreignId }] }),
  ]) {
    const bad = setup({ tables: { catalog_items: items, catalog_categories: categories }, change: (r, c) => c.table === 'catalog_categories' && c.in ? change(r) : r });
    assert.deepEqual(await read(bad, { page: '1' }), { kind: 'unavailable' });
  }
  const inactive = setup({ tables: { catalog_item_configurations: [{ ...profile, is_active: false, kind: null }] } });
  assert.deepEqual((await read(inactive)).data.rows[0].profile, { kind: 'legacy', version: 2, isActive: false });
  const photo = setup({ tables: { catalog_items: [{ ...product, description: 'Detalle', photo_path: `${businessId}/${itemId}/image.webp`, photo_version: '9223372036854775807' }] } });
  assert.equal((await read(photo)).data.rows[0].photo_version, '9223372036854775807');
});

test('Products empty page skips metadata and never returns private raw fields', async () => {
  const empty = setup({ tables: { catalog_items: [] } }); const result = await read(empty);
  assert.equal(result.data.pagination.collectionComplete, true); assert.ok(!empty.catalogCalls().some(c => c.table === 'catalog_item_configurations'));
  const f = setup({ tables: { catalog_items: [{ ...product, secret: 'private' }], catalog_item_configurations: [{ ...profile, document: { secret: 'private' } }] } });
  assert.equal(JSON.stringify(await read(f)).includes('private'), false);
});
