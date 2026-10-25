import test from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { load } from './owner-first-store-fixtures.mjs';
import { products, businessId, itemId, recordId, descendants } from './owner-resource-products-fixtures.mjs';

test('public product pages await promises and authorize each request with a fresh SDK', async () => {
  const f = products();
  const list = f.page('list'), detail = f.page('detail');
  f.markup(await list({ searchParams: Promise.resolve(f.search) }));
  const first = f.frames[0]?.page;
  f.markup(await detail({ params: Promise.resolve({ itemId }), searchParams: Promise.resolve(f.search) }));
  assert.equal(f.clients, 2); assert.equal(f.sdk.authCalls, 6); // Existing reader re-verifies owner context three times per load.
  const current = f.frames[0].page;
  assert.equal(current.businessId, businessId); assert.ok(current.accountId);
  assert.ok(current.readKey); assert.notEqual(current.readKey, itemId);
  f.markup(await detail({ params: Promise.resolve({ itemId }), searchParams: Promise.resolve(f.search) }));
  assert.notEqual(f.frames[1].page.readKey, current.readKey);
  assert.equal(first, undefined); // Summary list has no writable frame/controllers.
  for (const call of f.sdk.catalogCalls()) assert.ok(call.eq.some(([k,v]) => k === 'business_id' && v === businessId));
});

test('list summaries open one item, preserve scoped origin and label reference prices', async () => {
  const f = products(); const html = f.markup(await f.page('list')({ searchParams: Promise.resolve(f.search) }));
  assert.match(html, /Productos/); assert.match(html, /Precio base de referencia/);
  assert.match(html, new RegExp(`/owner/catalog/items/${itemId}\\?`));
  assert.match(html, /storePage=2/); assert.match(html, /categoryId=/); assert.match(html, /q=Pizza/);
  assert.match(html, /name="q"/); assert.match(html, /1 productos/);
  assert.equal(f.editors.length, 0); assert.doesNotMatch(html, /photo-editor|\/items\/new/);
});

test('detail identity ignores origin category/search/page and mounts only its classic/photo editors', async () => {
  const f = products();
  f.sdk.source.catalog_items.push({ ...f.sdk.source.catalog_items[0], id: recordId, name: 'Otro producto' });
  const search = { ...f.search, categoryId: '99999999-9999-4999-8999-999999999999', page: '8', q: 'No coincide' };
  const html = f.markup(await f.page('detail')({ params: Promise.resolve({ itemId }), searchParams: Promise.resolve(search) }));
  assert.match(html, /Volver a productos/); assert.match(html, /page=8/); assert.match(html, /q=No\+coincide/);
  assert.equal(f.editors.filter(e => e.photo).length, 1);
  const form = f.editors.find(e => e.identity);
  assert.deepEqual(form.identity, { action: 'update_product', target: { kind: 'record', id: itemId } });
  const fields = descendants(form.children).filter(n => n.type === 'input');
  assert.equal(fields.find(n => n.props.name === 'itemId').props.value, itemId);
  assert.equal(fields.find(n => n.props.name === 'categoryId').props.value, recordId);
  assert.equal(f.editors.find(e => e.photo).photo.itemId, itemId);
  assert.doesNotMatch(html, /Otro producto/);
});

test('read-only arrival has no classic/photo/profile widget invocations', async () => {
  const f = products({ readOnly: true });
  const html = f.markup(await f.page('detail')({ params: Promise.resolve({ itemId }), searchParams: Promise.resolve(f.search) }));
  assert.equal(f.frames.length, 1); assert.equal(f.editors.length, 0);
  assert.match(html, /Producto/); assert.doesNotMatch(html, /<form|photo-editor/);
});

test('invalid/foreign/unconfirmed ingress never mounts editors or silently falls back', async () => {
  for (const [options, search, id, expected] of [
    [{}, { businessId: [businessId] }, itemId, 'invalid'],
    [{}, { businessId }, ['bad'], 'invalid'],
    [{}, { businessId: '99999999-9999-4999-8999-999999999999' }, itemId, 'missing'],
    [{}, { businessId }, '99999999-9999-4999-8999-999999999999', 'missing'],
    [{ user: { email_confirmed_at: null } }, { businessId }, itemId, 'redirect'],
  ]) {
    const f = products(options);
    const html = f.markup(await f.page('detail')({ params: Promise.resolve({ itemId: id }), searchParams: Promise.resolve(search) }));
    assert.equal(f.editors.length, 0); assert.equal(f.frames.length, 0);
    assert.match(html, new RegExp(expected === 'missing' ? 'No encontramos' : expected === 'invalid' ? 'no es válida' : 'redirect'));
    if (expected === 'invalid' || expected === 'redirect') assert.equal(f.sdk.catalogCalls().length, 0);
  }
});

test('unavailable and empty list are distinct and never manufacture empty success', async () => {
  const empty = products({ tables: { catalog_items: [] } });
  const emptyHTML = empty.markup(await empty.page('list')({ searchParams: Promise.resolve({ businessId }) }));
  assert.match(emptyHTML, /No hay productos en esta página/);
  const failed = products({ change: (r,c) => c.table === 'catalog_items' ? { ...r, error: {} } : r });
  const failedHTML = failed.markup(await failed.page('list')({ searchParams: Promise.resolve({ businessId }) }));
  assert.match(failedHTML, /No pudimos cargar/); assert.doesNotMatch(failedHTML, /No hay productos/);
});

test('list paging exposes certified counts without mounting a full-catalog editor', async () => {
  const f = products(); const base = f.sdk.source.catalog_items[0];
  f.sdk.source.catalog_items = Array.from({ length: 27 }, (_, i) => ({ ...base,
    id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, sort_order: i }));
  const first = f.markup(await f.page('list')({ searchParams: Promise.resolve({ businessId, storePage: '2' }) }));
  assert.match(first, /27 productos/); assert.match(first, /page=1/);
  assert.equal((first.match(/Abrir producto/g) ?? []).length, 25);
  const second = f.markup(await f.page('list')({ searchParams: Promise.resolve({ businessId, storePage: '2', page: '1' }) }));
  assert.equal((second.match(/Abrir producto/g) ?? []).length, 2);
  assert.match(second, /Anterior/); assert.doesNotMatch(second, /Siguiente/);
  assert.equal(f.editors.length, 0);
  assert.deepEqual(f.sdk.catalogCalls().filter(c => c.table === 'catalog_items').map(c => c.range), [[0,24], [25,49]]);
});

test('rendered product fields feed unchanged public model/POST and retain rejected values', async () => {
  const f = products();
  f.markup(await f.page('detail')({ params: Promise.resolve({ itemId }), searchParams: Promise.resolve(f.search) }));
  const form = f.editors.find(e => e.identity), fields = new Map([['action', form.identity.action]]);
  function collect(tree) {
    for (const node of descendants(tree)) {
      if (typeof node.type === 'function') { collect(node.type(node.props)); continue; }
      if (node.props.name) fields.set(node.props.name, String(node.props.value ?? node.props.defaultValue ?? ''));
    }
  }
  collect(form.children); fields.set('name', 'Conservar intento'); fields.set('priceMinor', '12,50');
  const { sendOwnerMutation } = load('apps/web/app/owner/catalog/catalog-editor.ts');
  const calls = [];
  const { createCatalogFormSession } = load('apps/web/app/owner/catalog/catalog-form-session.ts');
  let status = 400;
  const session = createCatalogFormSession((payload, business) => sendOwnerMutation('/owner/catalog/actions', payload, async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify(status === 200 ? { ok: true } : { error: 'invalid_request' }), { status });
  }, business));
  const mounted = session.mount(f.frames[0].page, form.identity);
  await mounted.submit(fields);
  assert.equal(session.snapshot().state, 'idle'); assert.equal(fields.get('name'), 'Conservar intento');
  const { url, options } = calls[0];
  assert.equal(url, `/owner/catalog/actions?businessId=${businessId}`);
  assert.equal(options.method, 'POST'); assert.equal(options.credentials, 'same-origin');
  assert.equal(options.cache, 'no-store'); assert.equal(options.redirect, 'error');
  assert.deepEqual(JSON.parse(options.body), { action: 'update_product', itemId, categoryId: recordId,
    name: 'Conservar intento', description: '', priceMinor: 1250, currency: 'ARS', isAvailable: true, sortOrder: 0 });
  status = 200; await mounted.submit(fields); await mounted.submit(fields);
  assert.equal(session.snapshot().state, 'saved'); assert.equal(calls.length, 2);
});

test('actual N6 frame selects summary before mounting product editors on locked arrivals', async () => {
  const f = products({ readOnly: true });
  f.markup(await f.page('detail')({ params: Promise.resolve({ itemId }), searchParams: Promise.resolve(f.search) }));
  const props = f.frames[0];
  const { createCatalogFormSession } = load('apps/web/app/owner/catalog/catalog-form-session.ts');
  let settle;
  const session = createCatalogFormSession(() => new Promise(resolve => { settle = resolve; }));
  const origin = { ...props.page, readKey: 'origin' };
  const mounted = session.mount(origin, { action: 'update_product', target: { kind: 'record', id: itemId } });
  const sending = mounted.submit(new Map(Object.entries({ action: 'update_product', itemId, categoryId: recordId,
    name: 'Producto', description: '', priceMinor: '12', currency: 'ARS', isAvailable: 'true', sortOrder: '0' })));
  const hooks = { ...React, useContext: () => session, useSyncExternalStore: (_s, get) => get() };
  const { CatalogFormFrame } = load('apps/web/app/owner/catalog/catalog-form-scope.tsx', { react: hooks });
  for (const p of [props.page, { ...props.page, businessId: recordId }, { ...props.page, accountId: 'other' }]) {
    const html = f.markup(React.createElement(CatalogFormFrame, { ...props, page: p }));
    assert.doesNotMatch(html, /<form|photo-editor/);
  }
  const retained = CatalogFormFrame({ ...props, page: origin });
  const fieldset = descendants(retained).find(n => n.type === 'fieldset');
  assert.equal(fieldset.props.disabled, true); assert.equal(fieldset.props.children, props.editable);
  settle({ kind: 'unknown' }); await sending;
  assert.doesNotMatch(f.markup(React.createElement(CatalogFormFrame, props)), /<form|photo-editor/);
  assert.equal(f.editors.length, 0);
});
