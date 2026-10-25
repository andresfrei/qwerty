import test from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { harness, load, nodes, text } from './owner-first-store-fixtures.mjs';
import { business, item, owner, foreign } from './owner-catalog-configuration-fixtures.mjs';
const scope = { accountId: owner, businessId: business, itemId: item };
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const root = { id: item, business_id: business, name: 'Padre', price_minor: 1200, currency: 'ARS', is_available: false };
const child = { ...root, id: foreign, name: 'Hijo fuera de página' };
const component = (n = 1) => ({ componentId: id(n), itemId: foreign, quantity: 1, order: n - 1, fixedGroupPicks: [], allowedOptions: [] });
const combo = (components = [component()]) => ({ schemaVersion: 1, kind: 'combo', components });
const profile = (document, is_active = true, itemId = item) => ({ business_id: business, item_id: itemId, version: 4, is_active, document });
const catalog = (items = [root], profiles = [], groups = [], options = []) => ({ businessId: business, surchargeMinor: 0, items, groups, options, profiles });
const json = (value, status = 200) => new Response(JSON.stringify(value), { status });
function fixture(initial = catalog(), paged = true) {
  const previous = { fetch: globalThis.fetch, window: globalThis.window }, calls = [], store = new Map();
  let read = () => json({ capability: 'ready', catalog: initial });
  globalThis.window = { sessionStorage: { getItem: k => store.get(k) ?? null, setItem: (k,v) => store.set(k,v), removeItem: k => store.delete(k) } };
  globalThis.fetch = async (path, init) => { calls.push({ path, init }); return init.method === 'POST' ? json({ error: 'configuration_rejected' }, 422) : read(path); };
  const props = paged ? { scope: { ...scope }, pagedComponents: true } : { scope: { ...scope }, products: [root, child, { ...child, id: id(9), currency: 'USD' }] };
  const h = harness('catalog/catalog-profile-editor-client.tsx', props, {
    './catalog-choice-picker': load('apps/web/app/owner/catalog/catalog-choice-picker.tsx'),
  }, 'CatalogProfileEditor');
  const field = label => nodes(h.render()).find(n => n.props?.['aria-label'] === label);
  const picker = () => nodes(h.render()).find(n => n.type?.name === 'CatalogChoicePicker');
  return { h, props, calls, field, picker, setRead: fn => read = fn,
    async open() { await field('Consultar configuración avanzada').props.onClick(); await h.tick(); },
    change(label, value) { field(label).props.onChange({ target: { value, checked: value } }); },
    select(row = { id: foreign, label: child.name, itemKind: 'legacy', isAvailable: false }) { picker().props.onSelect(row); },
    async add() { await field('Agregar producto fijo').props.onClick(); await h.tick(); },
    components() { return nodes(h.render()).filter(n => n.props?.['data-component-id']); },
    close() { h.unmount(); globalThis.fetch = previous.fetch; if (previous.window === undefined) delete globalThis.window; else globalThis.window = previous.window; },
  };
}

test('baseline inactive recognized combo with unresolved references fails clearly without dropping components or writing', async () => {
  const f = fixture(catalog([root], [profile(combo(), false)]), false);
  try {
    await f.open(); f.change('Tipo de configuración', 'combo');
    assert.equal(f.components().length, 1);
    await f.field('Guardar configuración').props.onClick();
    assert.match(text(f.h.render()), /Revisá los grupos/); assert.equal(f.components()[0].props['data-component-id'], id(1));
    assert.equal(f.calls.filter(c => c.init.method === 'POST').length, 0);
    assert.equal(f.calls.length, 1); // No implicit dependency fetch, write or silent drop.
    assert.match(renderToStaticMarkup(f.h.render()), /Versión actual:\s*4/);
  } finally { f.close(); }
});

test('legacy default remains manual and keeps the exact array/currency candidate dropdown', async () => {
  const f = fixture(catalog(), false);
  try {
    f.h.render(); assert.equal(f.calls.length, 0);
    await f.open(); f.change('Tipo de configuración', 'combo');
    assert.equal(f.picker(), undefined);
    const select = f.field('Producto fijo para agregar');
    assert.deepEqual(nodes(select).filter(n => n.type === 'option').map(n => n.props.value), ['', foreign]);
    assert.equal(f.calls.length, 1);
  } finally { f.close(); }
});

test('opt-in paged mode has no array dropdown; selection alone does not read configuration or write', async () => {
  const f = fixture();
  try {
    f.h.render(); assert.equal(f.calls.length, 0);
    await f.open(); f.change('Tipo de configuración', 'combo');
    assert.equal(f.field('Producto fijo para agregar'), undefined);
    assert.equal(f.picker().props.scope.kind, 'items');
    assert.equal(f.picker().props.scope.selectedBusinessId, business);
    assert.match(f.picker().props.scope.scopeKey, new RegExp(owner));
    f.select(); assert.equal(f.calls.length, 1); assert.equal(f.components().length, 0);
    assert.equal(f.field('Agregar producto fijo').props.disabled, false);
    f.select({ id: item, label: root.name, itemKind: 'legacy', isAvailable: false });
    await f.add(); assert.equal(f.calls.length, 1); assert.equal(f.components().length, 0);
  } finally { f.close(); }
});

test('paged explicit Add freshly validates currency/kind without metadata availability bans; repeated instances stay independent', async () => {
  const f = fixture();
  f.setRead(path => json({ capability: 'ready', catalog: path.includes(`itemId=${foreign}`) ? catalog([child]) : catalog() }));
  try {
    await f.open(); f.change('Tipo de configuración', 'combo');
    f.select({ id: foreign, label: 'Nombre no autoriza', itemKind: 'combo', isAvailable: false });
    await f.add(); await f.add();
    assert.equal(f.components().length, 2);
    const ids = f.components().map(n => n.props['data-component-id']); assert.notEqual(ids[0], ids[1]);
    assert.match(text(f.h.render()), /Hijo fuera de página/);
    assert.equal(f.calls.filter(c => c.path.includes(`itemId=${foreign}`)).length, 2);
    assert.equal(f.calls.filter(c => c.init.method === 'POST').length, 0);
    assert.deepEqual(f.picker().props.seed, { id: foreign, label: child.name, itemKind: 'legacy', isAvailable: false });
    f.change(`Cantidad del componente ${ids[0]}`, '2');
    await f.field('Guardar configuración').props.onClick();
    const payload = JSON.parse(f.calls.at(-1).init.body);
    assert.equal(payload.expectedVersion, 0);
    assert.deepEqual(payload.document.components.map(c => c.quantity), [2, 1]);
    assert.deepEqual(payload.document.components.map(c => c.componentId), ids);
  } finally { f.close(); }
});

test('paged Add rejects actual foreign/currency/nested child responses without changing document or counters', async () => {
  for (const invalid of ['foreign', 'currency', 'nested']) {
    const f = fixture();
    const leaf = { ...child, id: id(30), name: 'Leaf' };
    const nested = { ...combo(), components: [{ ...component(), itemId: leaf.id }] };
    const bad = invalid === 'foreign' ? { ...child, business_id: id(50) } : invalid === 'currency' ? { ...child, currency: 'USD' } : child;
    f.setRead(path => json({ capability: 'ready', catalog: path.includes(`itemId=${foreign}`)
      ? catalog(invalid === 'nested' ? [bad, leaf] : [bad], invalid === 'nested' ? [profile(nested, true, foreign)] : []) : catalog() }));
    try {
      await f.open(); f.change('Tipo de configuración', 'combo'); f.select(); await f.add();
      assert.equal(f.components().length, 0); assert.equal(f.calls.length, 2);
      assert.equal(f.calls.filter(c => c.init.method === 'POST').length, 0);
      assert.match(text(f.h.render()), /No pudimos|Elegí un producto/);
    } finally { f.close(); }
  }
});

test('active hierarchy labels and controls survive outside choice pages using scoped catalog metadata', async () => {
  const groupId = id(20), optionId = id(21);
  const group = { id: groupId, business_id: business, item_id: foreign, name: 'Extras del hijo', selection_mode: 'distinct', min_select: 0, max_select: 1, sort_order: 0 };
  const option = { id: optionId, business_id: business, group_id: groupId, name: 'Opción agotada', price_delta_minor: 0, is_available: false, sort_order: 0 };
  const f = fixture(catalog([root, child], [profile(combo([component(1), component(2)])),
    profile({ schemaVersion: 1, kind: 'standard' }, true, foreign)], [group], [option]));
  try {
    await f.open(); assert.equal(f.components().length, 2);
    assert.match(text(f.h.render()), /Hijo fuera de página/); assert.match(text(f.h.render()), /Extras del hijo/);
    assert.equal(f.picker().props.seed, null); // Never auto-select the first existing reference.
    const html = renderToStaticMarkup(f.h.render());
    assert.match(html, /Hijo fuera de página/); assert.match(html, /Extras del hijo/);
    assert.match(html, /Buscar opciones/); assert.doesNotMatch(html, /<form/);
    f.select({ id: foreign, label: 'No usar etiqueta de página', itemKind: 'combo', isAvailable: true });
    assert.deepEqual(f.picker().props.seed, { id: foreign, label: child.name, itemKind: 'standard', isAvailable: false });
    assert.equal(f.calls.length, 1);
    f.change(`Restringir opciones ${id(1)}:${groupId}`, true);
    f.change(`Opción permitida ${id(1)}:${optionId}`, true);
    await f.field('Guardar configuración').props.onClick();
    const doc = JSON.parse(f.calls.at(-1).init.body).document;
    assert.deepEqual(doc.components[0].allowedOptions, [{ groupId, optionIds: [optionId] }]);
    assert.deepEqual(doc.components[1].allowedOptions, []);
  } finally { f.close(); }
});

test('old picker selection and late Add response cannot affect replacement actor/business/item', async () => {
  for (const key of ['accountId', 'businessId', 'itemId']) {
    const f = fixture(); let finish;
    try {
      await f.open(); f.change('Tipo de configuración', 'combo'); const oldSelect = f.picker().props.onSelect;
      f.select(); f.setRead(() => new Promise(resolve => { finish = resolve; })); const adding = f.add();
      f.props.scope = { ...scope, [key]: id(40) }; f.h.render();
      finish(json({ capability: 'ready', catalog: catalog([child]) })); await adding;
      oldSelect({ id: foreign, label: child.name, itemKind: 'legacy', isAvailable: false });
      assert.equal(f.components().length, 0); assert.equal(f.field('Agregar producto fijo'), undefined);
      assert.equal(f.calls.filter(c => c.init.method === 'POST').length, 0);
    } finally { f.close(); }
  }
});

test('mounted paged profile picker displays fresh child metadata after Add, not only a changed seed prop', async () => {
  const f = fixture(); let pickerHarness;
  f.setRead(path => json({ capability: 'ready', catalog: path.includes(`itemId=${foreign}`) ? catalog([child]) : catalog() }));
  try {
    await f.open(); f.change('Tipo de configuración', 'combo');
    const stale = { id: foreign, label: 'Etiqueta vieja de choices', itemKind: 'combo', isAvailable: true };
    const choiceCalls = [], callbacks = [];
    const fetcher = async (url, options) => {
      choiceCalls.push({ url, options }); return { status: 200, json: async () => ({
        selectedBusinessId: business, kind: 'items', q: '', rows: [stale],
        pagination: { page: 0, pageSize: 25, total: 1, hasMore: false, pageComplete: true, collectionComplete: true },
      }) };
    };
    const pickerProps = {};
    function sync() {
      const upstream = f.picker().props;
      Object.assign(pickerProps, upstream, { fetcher, onSelect: value => { callbacks.push(value); upstream.onSelect(value); } });
    }
    sync(); pickerHarness = harness('catalog/catalog-choice-picker.tsx', pickerProps, {}, 'CatalogChoicePicker');
    pickerHarness.render(); nodes(pickerHarness.render()).find(n => n.type === 'button').props.onClick();
    await pickerHarness.tick();
    nodes(pickerHarness.render()).find(n => n.props?.['aria-pressed'] === false).props.onClick(); sync();
    assert.match(renderToStaticMarkup(pickerHarness.render()), /Etiqueta vieja de choices/);
    assert.equal(f.calls.length, 1); await f.add(); sync();
    const tree = pickerHarness.render(), html = renderToStaticMarkup(tree);
    assert.match(html, /Hijo fuera de página/); assert.doesNotMatch(html, /Etiqueta vieja de choices/);
    assert.equal(nodes(tree).find(n => n.props?.['aria-pressed'] === true).props.children, child.name);
    assert.deepEqual(pickerProps.selectedMetadata.scope, pickerProps.scope);
    assert.deepEqual(pickerProps.selectedMetadata.choice, { id: foreign, label: child.name, itemKind: 'legacy', isAvailable: false });
    assert.equal(choiceCalls.length, 1); assert.equal(f.calls.length, 2); assert.equal(callbacks.length, 1);
    nodes(tree).find(n => n.props?.['aria-pressed'] === true).props.onClick(); sync();
    assert.equal(callbacks[1].label, child.name); assert.equal(callbacks[1].itemKind, 'legacy');
    assert.equal(choiceCalls.length, 1); assert.equal(f.calls.filter(c => c.init.method === 'POST').length, 0);
  } finally { pickerHarness?.unmount(); f.close(); }
});

test('public static initial paged editor is truthful/manual without any candidate library or dispatch', () => {
  const { CatalogProfileEditor } = load('apps/web/app/owner/catalog/catalog-profile-editor-client.tsx');
  const html = renderToStaticMarkup(React.createElement(CatalogProfileEditor, { scope, pagedComponents: true }));
  assert.match(html, /Configuración avanzada/); assert.match(html, /Consultar configuración/);
  assert.doesNotMatch(html, /Producto fijo para agregar|Guardar configuración|<select/);
});
