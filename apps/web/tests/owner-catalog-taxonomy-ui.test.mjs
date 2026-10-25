import test from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { load, harness } from './owner-first-store-fixtures.mjs';
import { taxonomy, businessId, recordId, foreignId, category, storefront, fields, descendants } from './owner-resource-taxonomy-fixtures.mjs';

const origin = { businessId, storePage: '2', page: '8', q: 'No coincide' };

test('public category list/new/detail and singleton settings await promises and fresh request-local authority', async () => {
  const f = taxonomy();
  for (const mode of ['list', 'new', 'detail', 'settings']) await f.render(mode);
  assert.equal(f.clients, 4); assert.equal(f.sdk.authCalls, 12);
  assert.equal(f.frames.length, 3); assert.equal(f.forms.length, 4); // no storefront: surcharge only
  const previous = f.frames[1].page.readKey;
  await f.render('detail'); assert.notEqual(f.frames[3].page.readKey, previous);
  for (const frame of f.frames) {
    assert.equal(frame.page.businessId, businessId); assert.ok(frame.page.accountId); assert.ok(frame.page.readKey);
  }
  for (const call of f.sdk.catalogCalls()) assert.ok(call.eq.some(([k,v]) => k === 'business_id' && v === businessId));
});

test('category list is bounded summaries with real new/detail links and preserved origin, never fake counts', async () => {
  const rows = Array.from({ length: 27 }, (_, i) => ({ ...category, id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, sort_order: i }));
  const f = taxonomy({ tables: { catalog_categories: rows } });
  const first = await f.render('list', { businessId, storePage: '2', q: 'Carta' });
  assert.match(first, /27 categorías/); assert.match(first, /Nueva categoría/); assert.match(first, /categories\/new\?/);
  assert.equal((first.match(/Abrir categoría/g) ?? []).length, 25);
  assert.match(first, /storePage=2/); assert.match(first, /q=Carta/); assert.match(first, /page=1/);
  assert.doesNotMatch(first, /productos|<form/); assert.equal(f.frames.length, 0);
  const second = await f.render('list', { businessId, storePage: '2', page: '1', q: 'Carta' });
  assert.equal((second.match(/Abrir categoría/g) ?? []).length, 2); assert.doesNotMatch(second, /Siguiente/);
  assert.deepEqual(f.sdk.catalogCalls().map(c => c.range), [[0,24], [25,49]]);
  assert.deepEqual(f.sdk.catalogCalls()[0].search, ['name', '%Carta%']);
});

test('new category uses real business parent and classic defaults; detail edits actual path record only', async () => {
  const f = taxonomy();
  f.sdk.source.catalog_categories.push({ ...category, id: foreignId, name: 'Otra categoría', sort_order: 3 });
  await f.render('new', origin);
  assert.equal(f.forms.length, 1);
  assert.deepEqual(f.forms[0].identity, { action: 'create_category', target: { kind: 'parent', id: businessId } });
  assert.deepEqual([...fields(f.forms[0])], [['action', 'create_category'], ['name', ''], ['sortOrder', '0']]);
  const html = await f.render('detail', origin);
  assert.match(html, /page=8/); assert.match(html, /q=No\+coincide/); assert.match(html, /storePage=2/);
  assert.doesNotMatch(html, /Otra categoría/);
  const forms = f.forms.slice(1);
  assert.deepEqual(forms.map(f => f.identity.action), ['rename_category', 'reorder_category']);
  for (const form of forms) {
    assert.deepEqual(form.identity.target, { kind: 'record', id: recordId });
    assert.equal(fields(form).get('categoryId'), recordId);
  }
  assert.equal(fields(forms[0]).get('name'), category.name);
  assert.equal(fields(forms[1]).get('sortOrder'), String(category.sort_order));
  assert.equal(f.sdk.catalogCalls().filter(c => c.eq.some(([k]) => k === 'id')).every(c => !c.search && !c.range), true);
});

test('settings is fresh publication/surcharge singleton, successful absence alone means zero', async () => {
  const f = taxonomy({ tables: { business_storefronts: [storefront], business_catalog_settings: [{ business_id: businessId, two_flavor_surcharge_minor: 1250 }] } });
  const html = await f.render('settings', { businessId, storePage: '2' });
  assert.match(html, /Publicada/); assert.match(html, /Vidriera/); assert.doesNotMatch(html, /Abrir ajuste|Nuevo ajuste/);
  assert.deepEqual(f.forms.map(f => f.identity.action), ['set_published', 'set_two_flavor_surcharge']);
  for (const form of f.forms) assert.deepEqual(form.identity.target, { kind: 'singleton', id: businessId });
  assert.equal(fields(f.forms[0]).get('isPublished'), 'false');
  assert.equal(fields(f.forms[1]).get('twoFlavorSurchargeMinor'), '12.50');
  f.sdk.source.business_storefronts[0] = { ...storefront, is_published: false };
  await f.render('settings'); assert.equal(fields(f.forms[2]).get('isPublished'), 'true');
  const absent = taxonomy(); await absent.render('settings');
  assert.equal(absent.forms.length, 1); assert.equal(fields(absent.forms[0]).get('twoFlavorSurchargeMinor'), '0.00');
  const failed = taxonomy({ change: (r,c) => c.table === 'business_catalog_settings' ? { ...r, error: {} } : r });
  assert.match(await failed.render('settings'), /No pudimos cargar/); assert.equal(failed.forms.length, 0);
});

test('invalid/foreign/missing/denied/provider errors never mount widgets or default to empty success', async () => {
  for (const [options, mode, search, id, text] of [
    [{}, 'detail', { businessId: [businessId] }, recordId, 'no es válida'],
    [{}, 'detail', { businessId }, ['bad'], 'no es válida'],
    [{}, 'new', { businessId: foreignId }, recordId, 'No encontramos'],
    [{}, 'detail', { businessId }, foreignId, 'No encontramos'],
    [{ user: { email_confirmed_at: null } }, 'settings', { businessId }, recordId, 'redirect'],
    [{ change: (r,c) => c.table === 'catalog_categories' ? { ...r, error: {} } : r }, 'list', { businessId }, recordId, 'No pudimos cargar'],
    [{}, 'settings', { businessId, q: 'forbidden' }, recordId, 'no es válida'],
  ]) {
    const f = taxonomy(options), before = structuredClone(f.sdk.source);
    assert.match(await f.render(mode, search, id), new RegExp(text));
    assert.equal(f.forms.length, 0); assert.equal(f.frames.length, 0); assert.deepEqual(f.sdk.source, before);
  }
  const empty = taxonomy({ tables: { catalog_categories: [] } });
  assert.match(await empty.render('list'), /No hay categorías en esta página/);
});

test('every mutating widget belongs only to N6 editable; locked arrivals select summary before mounting', async () => {
  const { createCatalogFormSession } = load('apps/web/app/owner/catalog/catalog-form-session.ts');
  let settle;
  const session = createCatalogFormSession(() => new Promise(resolve => { settle = resolve; }));
  const page = { accountId: 'owner', businessId, readKey: 'origin' };
  const mounted = session.mount(page, { action: 'rename_category', target: { kind: 'record', id: recordId } });
  const pending = mounted.submit(new Map(Object.entries({ action: 'rename_category', categoryId: recordId, name: 'Intento' })));
  const hooks = { ...React, useContext: () => session, useSyncExternalStore: (_s,get) => get() };
  const { CatalogFormFrame } = load('apps/web/app/owner/catalog/catalog-form-scope.tsx', { react: hooks });
  const arrivals = [];
  for (const mode of ['new', 'detail', 'settings']) {
    const f = taxonomy({ readOnly: true, tables: { business_storefronts: [storefront] } });
    assert.doesNotMatch(await f.render(mode), /<form|<input|<select|<button/); assert.equal(f.forms.length, 0);
    const props = f.frames[0]; arrivals.push({ f, props });
    assert.doesNotMatch(f.markup(React.createElement(CatalogFormFrame, props)), /<form|<input|<button/);
    const retained = CatalogFormFrame({ ...props, page });
    const fieldset = descendants(retained).find(n => n.type === 'fieldset');
    assert.equal(fieldset.props.disabled, true); assert.equal(fieldset.props.children, props.editable);
  }
  settle({ kind: 'unknown' }); await pending; assert.equal(session.snapshot().state, 'unknown');
  for (const { f, props } of arrivals) {
    assert.doesNotMatch(f.markup(React.createElement(CatalogFormFrame, props)), /<form|<input|<button/);
    const retained = CatalogFormFrame({ ...props, page });
    assert.equal(descendants(retained).find(n => n.type === 'fieldset').props.children, props.editable);
  }
});

test('all five rendered form rules feed exact unchanged model/POST, shared same-tick gate and retained rejected inputs', async () => {
  const f = taxonomy({ tables: { business_storefronts: [storefront] } });
  for (const mode of ['new', 'detail', 'settings']) await f.render(mode);
  assert.equal(f.forms.length, 5);
  const expected = [
    { action: 'create_category', name: 'Conservar intento', sortOrder: 0 },
    { action: 'rename_category', categoryId: recordId, name: 'Conservar intento' },
    { action: 'reorder_category', categoryId: recordId, sortOrder: 0 },
    { action: 'set_published', isPublished: false },
    { action: 'set_two_flavor_surcharge', twoFlavorSurchargeMinor: 1250 },
  ];
  const { createCatalogFormSession } = load('apps/web/app/owner/catalog/catalog-form-session.ts');
  const { sendOwnerMutation } = load('apps/web/app/owner/catalog/catalog-editor.ts');
  for (const [index, form] of f.forms.entries()) {
    const values = fields(form); if (values.has('name')) values.set('name', 'Conservar intento');
    if (values.has('twoFlavorSurchargeMinor')) values.set('twoFlavorSurchargeMinor', '12,50');
    const before = structuredClone(f.sdk.source), calls = []; let changes = 0, status = 400;
    const session = createCatalogFormSession((payload,business) => sendOwnerMutation('/owner/catalog/actions', payload, async (url,options) => {
      calls.push({ url, options }); if (status === 200) changes++;
      return new Response(JSON.stringify(status === 200 ? { ok: true } : { error: 'invalid_request' }), { status });
    },business));
    const page = f.frames[index === 0 ? 0 : index < 3 ? 1 : 2].page;
    const mounted = session.mount(page, form.identity);
    const sibling = session.mount(page, f.forms[index === 1 ? 2 : 1].identity);
    const pending = mounted.submit(values); await sibling.submit(fields(f.forms[index === 1 ? 2 : 1])); await pending;
    assert.equal(calls.length, 1); assert.equal(session.snapshot().state, 'idle'); assert.equal(changes, 0);
    assert.deepEqual(f.sdk.source, before); assert.equal(values.get('name') ?? 'Conservar intento', 'Conservar intento');
    const { url, options } = calls[0];
    assert.equal(url, `/owner/catalog/actions?businessId=${businessId}`);
    assert.equal(options.method, 'POST'); assert.equal(options.credentials, 'same-origin'); assert.equal(options.cache, 'no-store'); assert.equal(options.redirect, 'error');
    assert.deepEqual(JSON.parse(options.body), expected[index]);
    status = 200; await mounted.submit(values); await sibling.submit(fields(f.forms[index === 1 ? 2 : 1]));
    assert.equal(calls.length, 2); assert.equal(changes, 1); assert.equal(session.snapshot().state, 'saved');
    const unknown = createCatalogFormSession(async () => ({ kind: 'unknown' }));
    const u = unknown.mount(page, form.identity); await u.submit(values); await u.submit(values);
    assert.equal(unknown.snapshot().state, 'unknown'); assert.equal(values.get('name') ?? 'Conservar intento', 'Conservar intento');
  }
});

test('category search uses standalone semantic unnamed controls and guarded read links; no native form escape', () => {
  const props = { scopeKey: 'request', businessId, query: { businessId, storePage: 2, page: 8, q: 'old' } };
  const h = harness('catalog/catalog-taxonomy-controls.tsx', props, {
    './catalog-form-navigation': { CatalogSessionContext: {}, CatalogLink() {}, CatalogInspectionLink() {} },
  }, 'CatalogCategorySearch');
  let tree = h.render(); assert.equal(tree.type, 'fieldset');
  const input = descendants(tree).find(n => n.type === 'input'); assert.equal(input.props.name, undefined);
  input.props.onChange({ target: { value: ' nueva ' } }); tree = h.render();
  const link = descendants(tree).find(n => n.type?.name === 'CatalogProductReadLink');
  const url = new URL(link.props.href, 'https://qwerty.invalid');
  assert.equal(url.searchParams.get('q'), 'nueva'); assert.equal(url.searchParams.get('page'), null);
  assert.equal(url.searchParams.get('businessId'), businessId); assert.equal(url.searchParams.get('storePage'), '2');
  assert.equal(descendants(tree).filter(n => n.type === 'form').length, 0);
  props.businessId = foreignId; tree = h.render();
  assert.equal(descendants(tree).find(n => n.type === 'input').props.value, 'old');
  h.unmount();
});
