import test from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { load, harness } from './owner-first-store-fixtures.mjs';
import { taxonomy, businessId, itemId, groupId, foreignId, group, fields, descendants } from './owner-resource-taxonomy-fixtures.mjs';
const search = { businessId, itemId, storePage: '2', q: 'Gustos', page: '0' };

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
