import test from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { load, harness } from './owner-first-store-fixtures.mjs';
import { taxonomy, businessId, itemId, groupId, recordId, foreignId, group, fields, descendants } from './owner-resource-taxonomy-fixtures.mjs';
const search = { businessId, itemId, storePage: '2', q: 'Gustos', page: '0' };
const optionSearch = { ...search, groupId };

test('Groups public list/new/detail use fresh owner and checked product ancestry with explicit return context', async () => {
  const f = taxonomy();
  const list = await f.render('groups-list', search);
  assert.match(list, /Producto/); assert.match(list, /Gustos/); assert.match(list, /Abrir grupo/);
  assert.match(list, /groups\/new\?/); assert.match(list, /itemId=/); assert.match(list, /storePage=2/);
  assert.equal(f.frames.length, 0);
  await f.render('groups-new', search);
  const detail = await f.render('groups-detail', { ...search, q: 'No coincide', page: '8' }, groupId);
  assert.match(detail, /Volver a grupos/); assert.match(detail, /page=8/); assert.match(detail, /q=No\+coincide/);
  assert.equal(f.clients, 3); assert.equal(f.sdk.authCalls, 9);
  assert.deepEqual(f.forms.map(f => f.identity.action), ['create_option_group', 'update_option_group']);
  assert.equal(f.forms[1].identity.target.id, groupId);
  assert.match(detail, /Opciones del grupo/);
  assert.ok(f.frames.every(f => f.page.businessId === businessId && f.page.readKey));
  for (const c of f.sdk.catalogCalls()) assert.ok(c.eq.some(([k,v]) => k === 'business_id' && v === businessId));
});

test('only absent new parent gets distinct fresh chooser; explicit invalid/foreign/mismatched parents fail closed', async () => {
  const f = taxonomy();
  assert.match(await f.render('groups-new', { businessId }), /Elegí un producto/);
  assert.equal(f.forms.length, 0); assert.equal(f.frames.length, 1); assert.equal(f.sdk.authCalls, 3);
  assert.equal(f.sdk.catalogCalls().length, 0);
  for (const [mode, query, id] of [
    ['groups-new', { businessId, itemId: 'bad' }, groupId],
    ['groups-new', { businessId, itemId: foreignId }, groupId],
    ['groups-new', { businessId: foreignId }, groupId],
    ['groups-list', { businessId }, groupId],
    ['groups-detail', { businessId, itemId: foreignId }, groupId],
    ['groups-detail', { businessId }, foreignId],
    ['groups-new', { businessId, itemId: '' }, groupId],
  ]) {
    const bad = taxonomy(); const html = await bad.render(mode, query, id);
    assert.equal(bad.frames.length, 0); assert.equal(bad.forms.length, 0); assert.doesNotMatch(html, /Elegí un producto/);
  }
  const mismatch = taxonomy();
  mismatch.sdk.source.catalog_items.push({ id: foreignId, business_id: businessId, name: 'Otro producto' });
  assert.match(await mismatch.render('groups-detail', { businessId, itemId: foreignId }, groupId), /No encontramos/);
  assert.equal(mismatch.forms.length, 0); assert.equal(mismatch.frames.length, 0);
  const actual = taxonomy();
  actual.sdk.source.catalog_option_groups.push({ ...group, id: foreignId, name: 'Otro grupo' });
  const selected = await actual.render('groups-detail', { businessId, page: '7', q: 'Otra cosa' }, groupId);
  assert.doesNotMatch(selected, /Otro grupo/); assert.match(selected, /Producto/);
  assert.equal(actual.forms.length, 1); assert.equal(actual.forms[0].identity.target.id, groupId);
  const denied = taxonomy({ user: { email_confirmed_at: null } });
  assert.match(await denied.render('groups-new', { businessId }), /redirect/); assert.equal(denied.frames.length, 0);
});

test('Groups bounded pages show checked parent and actual counts without unrelated editors or partial selectors', async () => {
  const rows = Array.from({ length: 27 }, (_, i) => ({ ...group, id: `00000000-0000-4000-8000-${String(i).padStart(12,'0')}`, sort_order: i }));
  const f = taxonomy({ tables: { catalog_option_groups: rows } });
  const first = await f.render('groups-list', search);
  assert.match(first, /27 grupos/); assert.equal((first.match(/Abrir grupo/g) ?? []).length, 25);
  const second = await f.render('groups-list', { ...search, page: '1' });
  assert.equal((second.match(/Abrir grupo/g) ?? []).length, 2); assert.doesNotMatch(second, /Siguiente/);
  assert.equal(f.forms.length, 0);
  const calls = f.sdk.catalogCalls().filter(c => c.table === 'catalog_option_groups');
  assert.deepEqual(calls.map(c => c.range), [[0,24],[25,49]]); assert.deepEqual(calls[0].search, ['name','%Gustos%']);
  const failed = taxonomy({ change: (r,c) => c.table === 'catalog_option_groups' ? { ...r, error: {} } : r });
  assert.match(await failed.render('groups-list', search), /No pudimos cargar/); assert.equal(failed.forms.length, 0);
});

test('rendered create/update group fields reach exact old payload/POST with shared lock and rejection retention', async () => {
  const f = taxonomy(); await f.render('groups-new', search);
  f.sdk.source.catalog_option_groups[0] = { ...group, selection_mode: 'quantity', min_select: 12, max_select: 12, sort_order: 7 };
  await f.render('groups-detail', search, groupId);
  const { createCatalogFormSession } = load('apps/web/app/owner/catalog/catalog-form-session.ts');
  const { sendOwnerMutation } = load('apps/web/app/owner/catalog/catalog-editor.ts');
  for (const [i, form] of f.forms.entries()) {
    const values = fields(form); values.set('name', 'Conservar'); const before = structuredClone(f.sdk.source);
    const calls = []; let status = 400, writes = 0;
    const session = createCatalogFormSession((payload,business) => sendOwnerMutation('/owner/catalog/actions', payload, async (url,options) => {
      calls.push({ url, options }); if (status === 200) writes++;
      return new Response(JSON.stringify(status === 200 ? { ok: true } : { error: 'invalid_request' }), { status });
    },business));
    const a = session.mount(f.frames[i].page, form.identity), b = session.mount(f.frames[i].page, form.identity);
    const pending = a.submit(values); await b.submit(values); await pending;
    assert.equal(calls.length, 1); assert.equal(writes, 0); assert.equal(session.snapshot().state, 'idle');
    assert.equal(values.get('name'), 'Conservar'); assert.deepEqual(f.sdk.source, before);
    assert.deepEqual(JSON.parse(calls[0].options.body), { action: i ? 'update_option_group' : 'create_option_group',
      [i ? 'groupId' : 'itemId']: i ? groupId : itemId, name: 'Conservar', selectionMode: i ? 'quantity' : 'distinct', minSelect: i ? 12 : 1, maxSelect: i ? 12 : 1, sortOrder: i ? 7 : 0 });
    assert.equal(calls[0].url, `/owner/catalog/actions?businessId=${businessId}`);
    assert.equal(calls[0].options.method, 'POST'); assert.equal(calls[0].options.cache, 'no-store');
    assert.equal(calls[0].options.credentials, 'same-origin'); assert.equal(calls[0].options.redirect, 'error');
    status = 200; await a.submit(values); await b.submit(values); assert.equal(calls.length, 2); assert.equal(session.snapshot().state, 'saved');
    const unknown = createCatalogFormSession(async () => ({ kind: 'unknown' }));
    const u = unknown.mount(f.frames[i].page, form.identity); await u.submit(values); await u.submit(values);
    assert.equal(unknown.snapshot().state, 'unknown'); assert.equal(values.get('name'), 'Conservar');
  }
});

test('new Group requires explicit item, parent changes remount draft and stale actor/business callbacks cannot repollute', () => {
  const props = { scopeKey: 'actor:request', businessId, item: null };
  const h = harness('catalog/catalog-option-forms.tsx', props, {
    './catalog-form-scope': { CatalogScopedForm: function CatalogScopedForm() {} },
    './catalog-form-navigation': { CatalogInspectionLink() {} },
  }, 'CatalogGroupForm');
  let tree = h.render();
  const picker = () => descendants(tree).find(n => n.type?.name === 'CatalogChoicePicker');
  const form = () => descendants(tree).find(n => n.type?.name === 'CatalogScopedForm');
  assert.equal(form(), undefined); assert.equal(picker().props.scope.kind, 'items');
  picker().props.onSelect({ id: itemId, label: 'Producto', itemKind: 'legacy', isAvailable: true }); tree = h.render();
  assert.equal(form().props.identity.target.id, itemId); const key = form().key;
  picker().props.onSelect({ id: foreignId, label: 'Otro', itemKind: 'standard', isAvailable: true }); tree = h.render();
  assert.notEqual(form().key, key);
  props.item = { id: itemId, name: 'Verificado', business_id: businessId }; tree = h.render();
  const { createCatalogChoiceController } = load('apps/web/app/owner/catalog/catalog-choice-state.ts');
  assert.doesNotThrow(() => createCatalogChoiceController(picker().props.scope, picker().props.seed));
  const stale = picker().props.onSelect;
  props.businessId = foreignId; props.item = null; tree = h.render(); stale({ id: itemId, label: 'Viejo' }); tree = h.render(); assert.equal(form(), undefined);
  props.scopeKey = 'other-actor'; props.item = { id: itemId, name: 'Real' }; props.group = group; tree = h.render();
  assert.equal(picker(), undefined); assert.equal(form().props.identity.target.id, groupId);
  assert.equal(fields(form().props).get('groupId'), groupId); h.unmount();
});

test('Group list search preserves product context; new/detail read-only arrival mounts zero forms or pickers', async () => {
  for (const mode of ['groups-new', 'groups-detail']) {
    const f = taxonomy({ readOnly: true }); assert.doesNotMatch(await f.render(mode, search, groupId), /<input|<form|<button|<select/);
    assert.equal(f.forms.length, 0);
    const { createCatalogFormSession } = load('apps/web/app/owner/catalog/catalog-form-session.ts');
    const session = createCatalogFormSession(async () => ({ kind: 'unknown' }));
    const p = { ...f.frames[0].page, readKey: 'origin' };
    await session.mount(p, { action: 'create_option_group', target: { kind: 'parent', id: itemId } }).submit(new Map(Object.entries({ action: 'create_option_group', itemId, name: 'X', selectionMode: 'distinct', minSelect: '1', maxSelect: '1', sortOrder: '0' })));
    const hooks = { ...React, useContext: () => session, useSyncExternalStore: (_s,get) => get() };
    const { CatalogFormFrame } = load('apps/web/app/owner/catalog/catalog-form-scope.tsx', { react: hooks });
    assert.doesNotMatch(f.markup(React.createElement(CatalogFormFrame, f.frames[0])), /<input|<form|<button/);
  }
  const props = { scopeKey: 'actor:list', businessId, resource: 'groups', query: { businessId, itemId, q: '', page: 8, storePage: 2 } };
  const h = harness('catalog/catalog-taxonomy-controls.tsx', props, {
    './catalog-form-navigation': { CatalogSessionContext: {}, CatalogLink() {}, CatalogInspectionLink() {} },
  }, 'CatalogCategorySearch');
  const tree = h.render(); assert.equal(tree.type, 'fieldset');
  const link = descendants(tree).find(n => n.type?.name === 'CatalogProductReadLink');
  assert.match(link.props.href, /itemId=/); assert.doesNotMatch(link.props.href, /page=8/); h.unmount();
});

test('Options public directory/new/detail await fresh scope, checked labels and preserve origin without redefining identity', async () => {
  const f = taxonomy();
  for (const query of [{ businessId }, search, optionSearch]) {
    const html = await f.render('options-list', query);
    assert.match(html, /Producto/); assert.match(html, /Gustos/); assert.match(html, /Abrir opción/); assert.match(html, /options\/new\?/);
  }
  await f.render('options-new', optionSearch);
  const html = await f.render('options-detail', { ...optionSearch, q: 'No coincide', page: '8' });
  assert.match(html, /Volver a opciones/); assert.match(html, /page=8/); assert.match(html, /q=No\+coincide/);
  assert.equal(f.clients, 5); assert.equal(f.sdk.authCalls, 15);
  assert.equal(f.forms.length, 2); assert.equal(f.forms[1].identity.target.id, recordId);
  for (const c of f.sdk.catalogCalls()) assert.ok(c.eq.some(([k,v]) => k === 'business_id' && v === businessId));
});

test('Options New absent parent is distinct chooser, explicit item verifies first, foreign/mismatched input never falls back', async () => {
  const empty = taxonomy(); await empty.render('options-new', { businessId });
  assert.equal(empty.forms.length, 0); assert.equal(empty.sdk.authCalls, 3); assert.equal(empty.sdk.catalogCalls().length, 0);
  const product = taxonomy(); const html = await product.render('options-new', search);
  assert.match(html, /Producto/); assert.equal(product.forms.length, 0);
  assert.ok(product.sdk.catalogCalls().some(c => c.table === 'catalog_items' && c.eq.some(([k,v]) => k === 'id' && v === itemId)));
  assert.ok(product.sdk.catalogCalls().some(c => c.table === 'catalog_option_groups' && c.range));
  for (const query of [{ businessId, itemId: 'bad' }, { businessId, itemId: '' }, { businessId, itemId: foreignId },
    { businessId, groupId: foreignId }, { businessId, itemId: foreignId, groupId }, { businessId: foreignId }]) {
    const f = taxonomy(); await f.render('options-new', query); assert.equal(f.frames.length, 0); assert.equal(f.forms.length, 0);
  }
  const wrong = taxonomy(); wrong.sdk.source.catalog_items.push({ id: foreignId, business_id: businessId, name: 'Otro' });
  await wrong.render('options-detail', { businessId, itemId: foreignId, groupId }); assert.equal(wrong.frames.length, 0);
  const otherGroup = taxonomy(); otherGroup.sdk.source.catalog_option_groups.push({ ...group, id: foreignId, name: 'Otro grupo' });
  await otherGroup.render('options-detail', { businessId, groupId: foreignId }); assert.equal(otherGroup.frames.length, 0);
  const failed = taxonomy({ change: (r,c) => c.table === 'catalog_items' ? { ...r, error: {} } : r });
  assert.match(await failed.render('options-new', search), /No pudimos cargar/); assert.equal(failed.frames.length, 0);
});

test('Options directory pages are count-certified 25 with complete parent labels and no unrelated selected editors', async () => {
  const f = taxonomy(); const base = f.sdk.source.catalog_options[0];
  f.sdk.source.catalog_options = Array.from({ length: 27 }, (_, i) => ({ ...base, id: `00000000-0000-4000-8000-${String(i).padStart(12,'0')}`, sort_order: i }));
  const first = await f.render('options-list', { businessId });
  assert.match(first, /27 opciones/); assert.equal((first.match(/Abrir opción/g) ?? []).length, 25);
  const second = await f.render('options-list', { businessId, page: '1' });
  assert.equal((second.match(/Abrir opción/g) ?? []).length, 2); assert.doesNotMatch(second, /Siguiente/); assert.equal(f.forms.length, 0);
  const batches = f.sdk.catalogCalls().filter(c => c.in); assert.equal(batches.length, 4); assert.ok(batches.every(c => c.limit === 25 && c.count === 'exact'));
  const bad = taxonomy({ change: (r,c) => c.table === 'catalog_option_groups' ? { ...r, count: null } : r });
  assert.match(await bad.render('options-list', { businessId }), /No pudimos cargar/); assert.equal(bad.frames.length, 0);
  const selected = taxonomy(); selected.sdk.source.catalog_options.push({ ...base, id: foreignId, name: 'No montar' });
  assert.doesNotMatch(await selected.render('options-detail', { businessId }), /No montar/); assert.equal(selected.forms.length, 1);
});

test('rendered create/update Option fields submit exact classic POST, reject without changed data and preserve saved/unknown locks', async () => {
  const f = taxonomy(); await f.render('options-new', optionSearch);
  f.sdk.source.catalog_options[0] = { ...f.sdk.source.catalog_options[0], price_delta_minor: 1250, is_available: false, sort_order: 7 };
  await f.render('options-detail', { businessId }); assert.equal(f.forms.length, 2);
  const { createCatalogFormSession } = load('apps/web/app/owner/catalog/catalog-form-session.ts');
  const { sendOwnerMutation } = load('apps/web/app/owner/catalog/catalog-editor.ts');
  for (const [i,form] of f.forms.entries()) {
    const values = fields(form); values.set('name', 'Conservar'); assert.equal(values.get('priceDeltaMinor'), i ? '12.50' : '0.00');
    if (i) values.set('priceDeltaMinor', '12,50');
    const calls = [], before = structuredClone(f.sdk.source); let status = 400, writes = 0;
    const session = createCatalogFormSession((payload,business) => sendOwnerMutation('/owner/catalog/actions', payload, async (url,options) => {
      calls.push({ url, options }); if (status === 200) writes++;
      return new Response(JSON.stringify(status === 200 ? { ok: true } : { error: 'invalid_request' }), { status });
    },business));
    const a = session.mount(f.frames[i].page, form.identity), b = session.mount(f.frames[i].page, form.identity);
    const p = a.submit(values); await b.submit(values); await p;
    assert.equal(calls.length, 1); assert.equal(writes, 0); assert.deepEqual(f.sdk.source, before); assert.equal(values.get('name'), 'Conservar');
    assert.equal(session.snapshot().state, 'idle');
    assert.deepEqual(JSON.parse(calls[0].options.body), { action: i ? 'update_option' : 'create_option', [i ? 'optionId' : 'groupId']: i ? recordId : groupId,
      name: 'Conservar', priceDeltaMinor: i ? 1250 : 0, isAvailable: !i, sortOrder: i ? 7 : 0 });
    assert.equal(calls[0].url, `/owner/catalog/actions?businessId=${businessId}`); assert.equal(calls[0].options.method, 'POST');
    assert.equal(calls[0].options.credentials, 'same-origin'); assert.equal(calls[0].options.cache, 'no-store'); assert.equal(calls[0].options.redirect, 'error');
    status = 200; await a.submit(values); await b.submit(values); assert.equal(calls.length, 2); assert.equal(session.snapshot().state, 'saved');
    const unknown = createCatalogFormSession(async () => ({ kind: 'unknown' })); const u = unknown.mount(f.frames[i].page, form.identity);
    await u.submit(values); await u.submit(values); assert.equal(unknown.snapshot().state, 'unknown'); assert.equal(values.get('name'), 'Conservar');
  }
});

const parentMocks = { './catalog-form-scope': { CatalogScopedForm: function CatalogScopedForm() {} },
  './catalog-form-navigation': { CatalogInspectionLink() {}, CatalogSessionContext: {}, CatalogLink() {} } };

test('Option parent chain has no automatic selection/form; parent changes reset draft and fence stale group callbacks', async () => {
  const props = { scopeKey: 'actor:request', businessId, item: null, group: null };
  const h = harness('catalog/catalog-option-forms.tsx', props, parentMocks, 'CatalogOptionForm'); let tree = h.render();
  const pickers = () => descendants(tree).filter(n => n.type?.name === 'CatalogChoicePicker');
  const form = () => descendants(tree).find(n => n.type?.name === 'CatalogScopedForm');
  assert.equal(pickers().length, 1); assert.equal(form(), undefined);
  pickers()[0].props.onSelect({ id: itemId, label: 'Producto', itemKind: 'legacy', isAvailable: true }); tree = h.render();
  assert.equal(pickers()[1].props.scope.itemId, itemId); assert.equal(form(), undefined);
  const stale = pickers()[1].props.onSelect;
  stale({ id: groupId, label: 'Gustos' }); tree = h.render(); const key = form().key;
  assert.equal(form().props.identity.target.id, groupId);
  pickers()[0].props.onSelect({ id: foreignId, label: 'Otro', itemKind: 'combo', isAvailable: false });
  stale({ id: groupId, label: 'Viejo' }); tree = h.render(); assert.equal(form(), undefined);
  pickers()[1].props.onSelect({ id: recordId, label: 'Otro grupo' }); tree = h.render(); assert.notEqual(form().key, key);
  const { createCatalogChoiceController } = load('apps/web/app/owner/catalog/catalog-choice-state.ts');
  const picker = pickers()[1].props, calls = []; let settle;
  const dto = { selectedBusinessId: businessId, kind: 'groups', itemId: foreignId, q: '', rows: [{ id: groupId, label: 'Fuera de selección' }],
    pagination: { page: 0, pageSize: 25, total: 1, hasMore: false, pageComplete: true, collectionComplete: true } };
  const controller = createCatalogChoiceController(picker.scope, picker.seed, async (url,options) => {
    calls.push({ url, options }); return new Response(JSON.stringify(dto), { status: 200 });
  });
  await controller.load(); assert.equal(controller.snapshot().selected.id, recordId); assert.equal(form().props.identity.target.id, recordId);
  const unselected = createCatalogChoiceController(picker.scope, null, async () => new Response(JSON.stringify(dto), { status: 200 }));
  await unselected.load(); assert.equal(unselected.snapshot().selected, null);
  assert.equal(calls.length, 1); assert.match(calls[0].url, new RegExp(`itemId=${foreignId}`));
  assert.deepEqual(calls[0].options, { method: 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'error' });
  const delayed = createCatalogChoiceController(picker.scope, null, () => new Promise(resolve => { settle = resolve; }));
  const pending = delayed.load(); delayed.reset({ ...picker.scope, itemId }, null);
  settle(new Response(JSON.stringify(dto), { status: 200 })); await pending;
  assert.equal(delayed.snapshot().selected, null); assert.equal(delayed.snapshot().rows.length, 0);
  props.businessId = foreignId; tree = h.render(); assert.equal(form(), undefined); h.unmount();
});

test('Option filters reset q/page on parent changes, clear descendants, omit empty IDs and never mutate query/native submit', () => {
  const query = Object.freeze({ businessId, itemId, groupId, storePage: 2, page: 8, q: 'old' });
  const props = { scopeKey: 'actor:list', businessId, query, item: { id: itemId, name: 'Producto' }, group };
  const h = harness('catalog/catalog-taxonomy-controls.tsx', props, parentMocks, 'CatalogOptionFilters'); let tree = h.render();
  const nodes = () => descendants(tree), pickers = () => nodes().filter(n => n.type?.name === 'CatalogChoicePicker');
  const link = () => nodes().find(n => n.type?.name === 'CatalogProductReadLink');
  assert.equal(tree.type, 'fieldset'); assert.equal(nodes().find(n => n.type === 'input').props.name, undefined);
  pickers()[0].props.onSelect({ id: foreignId, label: 'Otro', itemKind: 'legacy', isAvailable: true }); tree = h.render();
  let url = new URL(link().props.href, 'https://qwerty.invalid'); assert.equal(url.searchParams.has('q'), false); assert.equal(url.searchParams.has('page'), false); assert.equal(url.searchParams.has('groupId'), false);
  nodes().find(n => n.type === 'button' && n.props.children === 'Todos los productos').props.onClick(); tree = h.render();
  url = new URL(link().props.href, 'https://qwerty.invalid'); assert.equal(url.searchParams.has('itemId'), false); assert.equal(url.searchParams.has('groupId'), false);
  assert.equal(url.searchParams.get('storePage'), '2'); assert.equal(query.q, 'old'); assert.equal(query.page, 8);
  assert.equal(nodes().some(n => n.type === 'form'), false); h.unmount();
});

test('Options filter/new/detail pickers and forms only mount in N6 editable, zero widgets on locked readonly arrivals', async () => {
  for (const [mode, query] of [['options-list', { businessId }], ['options-new', { businessId }], ['options-new', search], ['options-new', optionSearch], ['options-detail', { businessId }]]) {
    const f = taxonomy({ readOnly: true }); const html = await f.render(mode, query); assert.equal(f.frames.length, 1);
    assert.doesNotMatch(html, /<form|<input|<select|<button/); assert.equal(f.forms.length, 0);
    const { createCatalogFormSession } = load('apps/web/app/owner/catalog/catalog-form-session.ts');
    const session = createCatalogFormSession(async () => ({ kind: 'unknown' })); const p = { ...f.frames[0].page, readKey: 'origin' };
    await session.mount(p, { action: 'rename_category', target: { kind: 'record', id: recordId } }).submit(new Map(Object.entries({ action: 'rename_category', categoryId: recordId, name: 'X' })));
    const hooks = { ...React, useContext: () => session, useSyncExternalStore: (_s,get) => get() };
    const { CatalogFormFrame } = load('apps/web/app/owner/catalog/catalog-form-scope.tsx', { react: hooks });
    assert.doesNotMatch(f.markup(React.createElement(CatalogFormFrame, f.frames[0])), /<form|<input|<button/);
  }
});
