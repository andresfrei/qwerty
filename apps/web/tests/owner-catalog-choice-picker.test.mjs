import test from 'node:test';
import assert from 'node:assert/strict';
import { load, harness, nodes, text } from './owner-first-store-fixtures.mjs';
import { renderToStaticMarkup } from 'react-dom/server';
import { businessId, itemId, recordId } from './owner-resource-products-fixtures.mjs';
const api = () => load('apps/web/app/owner/catalog/catalog-choice-state.ts');
const scope = { scopeKey: 'owner:record', selectedBusinessId: businessId, kind: 'categories' };
const row = { id: recordId, label: 'Carta' };
const dto = (s = scope, q = '', page = 0, rows = [row], total = rows.length) => ({
  selectedBusinessId: s.selectedBusinessId, kind: s.kind, ...(s.kind === 'groups' ? { itemId: s.itemId } : {}), q, rows,
  pagination: { page, pageSize: 25, total, hasMore: (page + 1) * 25 < total, pageComplete: true, collectionComplete: page === 0 && total <= 25 },
});
const response = value => ({ status: 200, json: async () => value });

test('public choices controller uses explicit certified GET pages and never autoselects', async () => {
  const calls = [];
  const c = api().createCatalogChoiceController(scope, null, async (url, options) => {
    calls.push({ url, options }); return response(dto());
  });
  await c.load(' Carta ', 0);
  assert.equal(c.snapshot().status, 'unavailable'); // response q mismatch is not a valid empty page
  await c.load('', 0);
  assert.equal(c.snapshot().selected, null); assert.deepEqual(c.snapshot().rows, [row]);
  assert.ok(c.select(recordId)); assert.deepEqual(c.snapshot().selected, row);
  assert.equal(calls[1].url, `/owner/catalog/choices?selectedBusinessId=${businessId}&kind=categories&q=&page=0`);
  assert.deepEqual(calls[1].options, { method: 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'error' });
});

test('paged search retains out-of-page scoped selection, flags and explicit item metadata', async () => {
  const seed = { id: itemId, label: 'Elegida fuera de página', itemKind: 'combo', isAvailable: false };
  const s = { ...scope, kind: 'items' };
  const rows = Array.from({ length: 25 }, (_, i) => ({ ...seed, id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}` }));
  const c = api().createCatalogChoiceController(s, seed, async url => {
    const p = new URL(url, 'https://qwerty.invalid').searchParams;
    return response(dto(s, p.get('q'), Number(p.get('page')), p.get('page') === '0' ? rows : [rows[0]], 26));
  });
  await c.load('combo', 0); assert.equal(c.snapshot().rows.length, 25);
  assert.equal(c.snapshot().pagination.collectionComplete, false);
  await c.load('combo', 1); assert.deepEqual(c.snapshot().selected, seed);
  assert.equal(c.snapshot().rows.length, 1); assert.equal(c.snapshot().pagination.hasMore, false);
});

test('actor/business/record/parent transitions fence stale reads and selections, not just abort', async () => {
  const deferred = []; const c = api().createCatalogChoiceController(scope, row, () => new Promise(resolve => deferred.push(resolve)));
  const a = c.load('', 0);
  const other = { scopeKey: 'other-owner:other-record', selectedBusinessId: itemId, kind: 'groups', itemId: recordId };
  c.reset(other, null); const b = c.load('', 0);
  deferred[1](response(dto(other))); await b;
  deferred[0](response(dto())); await a;
  assert.equal(c.snapshot().scopeKey, api().catalogChoiceScopeKey(other));
  assert.equal(c.snapshot().selected, null); assert.deepEqual(c.snapshot().rows, [row]);
  c.reset({ ...other, itemId }, null); assert.equal(c.select(recordId), false);
  assert.equal(c.snapshot().rows.length, 0);
});

test('same-scope older query cannot replace newer rows or selection', async () => {
  const deferred = []; const c = api().createCatalogChoiceController(scope, row, () => new Promise(resolve => deferred.push(resolve)));
  const a = c.load('old', 0), b = c.load('new', 0);
  deferred[1](response(dto(scope, 'new', 0, [], 0))); await b;
  deferred[0](response(dto(scope, 'old'))); await a;
  assert.equal(c.snapshot().q, 'new'); assert.equal(c.snapshot().rows.length, 0);
  assert.deepEqual(c.snapshot().selected, row);
});

test('malformed or truncated DTOs fail closed without clearing valid selection or claiming empty', async () => {
  for (const mutate of [
    d => ({ ...d, selectedBusinessId: itemId }), d => ({ ...d, kind: 'items' }),
    d => ({ ...d, itemId }), d => ({ ...d, secret: 'extra' }),
    d => ({ ...d, rows: [row, row] }), d => ({ ...d, rows: [{ ...row, id: 'bad' }] }),
    d => ({ ...d, pagination: { ...d.pagination, total: 27 } }),
    d => ({ ...d, pagination: { ...d.pagination, pageSize: 24 } }),
    d => ({ ...d, pagination: { ...d.pagination, hasMore: true } }),
    d => ({ ...d, pagination: { ...d.pagination, pageComplete: false } }),
    d => ({ ...d, pagination: { ...d.pagination, collectionComplete: false } }),
  ]) {
    const c = api().createCatalogChoiceController(scope, row, async () => response(mutate(dto())));
    await c.load('', 0); assert.equal(c.snapshot().status, 'unavailable');
    assert.deepEqual(c.snapshot().selected, row); assert.equal(c.select(itemId), false);
  }
  assert.throws(() => api().createCatalogChoiceController({ ...scope, kind: 'groups' }, null));
  assert.throws(() => api().createCatalogChoiceController({ ...scope, scopeKey: 42 }, null));
});

test('items reject non-string kind metadata and groups certify exact parent context', async () => {
  const s = { ...scope, kind: 'items' };
  const c = api().createCatalogChoiceController(s, null, async () => response(dto(s, '', 0,
    [{ ...row, itemKind: ['combo'], isAvailable: true }])));
  await c.load(); assert.equal(c.snapshot().status, 'unavailable');
  const g = { ...scope, kind: 'groups', itemId };
  const requests = [];
  const groups = api().createCatalogChoiceController(g, null, async url => {
    requests.push(url); return response({ ...dto(g), itemId: recordId });
  });
  await groups.load(); assert.equal(groups.snapshot().status, 'unavailable');
  assert.match(requests[0], new RegExp(`itemId=${itemId}`));
});

test('mounted picker scoped selectedMetadata updates header row and old callbacks without resetting query page or reads', async () => {
  const s = { ...scope, kind: 'items' }, stale = { ...row, label: 'Etiqueta anterior', itemKind: 'legacy', isAvailable: true };
  const fresh = { ...stale, label: 'Etiqueta validada', itemKind: 'standard', isAvailable: false };
  const rows = Array.from({ length: 25 }, (_, i) => ({ ...stale, id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}` }));
  const calls = [], picks = []; let finish;
  const props = { scope: s, seed: null, label: 'Producto', onSelect: choice => picks.push(choice), fetcher: async (url, options) => {
    calls.push({ url, options });
    const p = new URL(url, 'https://qwerty.invalid').searchParams;
    if (calls.length === 3) return new Promise(resolve => { finish = resolve; });
    return response(dto(s, p.get('q'), Number(p.get('page')), p.get('page') === '0' ? rows : [stale], 26));
  } };
  const h = harness('catalog/catalog-choice-picker.tsx', props, {}, 'CatalogChoicePicker');
  h.render(); let tree = h.render();
  props.selectedMetadata = { scope: s, choice: fresh };
  assert.match(text(h.render()), /Sin seleccionar/); assert.equal(calls.length, 0);
  props.selectedMetadata = null;
  nodes(tree).find(n => n.type === 'input').props.onChange({ target: { value: 'match' } }); tree = h.render();
  nodes(tree).find(n => n.type === 'button' && n.props.children === 'Buscar opciones').props.onClick(); await h.tick(); tree = h.render();
  nodes(tree).find(n => n.type === 'button' && n.props.children === 'Siguiente').props.onClick(); await h.tick(); tree = h.render();
  const oldRow = nodes(tree).find(n => n.props?.['aria-pressed'] === false); oldRow.props.onClick(); tree = h.render();
  assert.equal(picks[0].id, stale.id); assert.match(text(tree), /Etiqueta anterior/);
  props.selectedMetadata = { scope: s, choice: fresh }; tree = h.render();
  assert.match(text(tree), /Etiqueta validada/); assert.doesNotMatch(text(tree), /Etiqueta anterior/);
  assert.equal(nodes(tree).find(n => n.props?.['aria-pressed'] === true).props.children, fresh.label);
  assert.equal(nodes(tree).find(n => n.type === 'input').props.value, 'match');
  assert.match(renderToStaticMarkup(tree), /Página 2/); assert.equal(calls.length, 2); assert.equal(picks.length, 1);
  oldRow.props.onClick(); assert.deepEqual(picks[1], fresh); // Same-scope old closure uses current metadata.
  props.selectedMetadata = { scope: { ...s, scopeKey: 'foreign-record' }, choice: fresh };
  assert.match(text(h.render()), /Etiqueta anterior/);
  props.selectedMetadata = { scope: s, choice: { ...fresh, id: itemId } };
  assert.match(text(h.render()), /Etiqueta anterior/); // Cannot select or relabel another ID.
  props.selectedMetadata = { scope: s, choice: fresh }; tree = h.render();
  nodes(tree).find(n => n.type === 'button' && n.props.children === 'Buscar opciones').props.onClick(); tree = h.render();
  assert.match(text(tree), /Consultando opciones/);
  props.selectedMetadata = { scope: s, choice: { ...fresh, label: 'Validada durante lectura' } }; tree = h.render();
  assert.match(text(tree), /Validada durante lectura/); assert.match(text(tree), /Consultando opciones/);
  assert.equal(calls.length, 3); assert.equal(picks.length, 2);
  finish(response(dto(s, 'match', 0, rows, 26))); await h.tick(); tree = h.render();
  assert.match(text(tree), /Validada durante lectura/);
  const otherRows = nodes(tree).filter(n => n.props?.['aria-pressed'] !== undefined);
  assert.equal(otherRows.length, 25); assert.ok(otherRows.every(n => n.props['aria-pressed'] === false && n.props.children === stale.label));
  assert.equal(nodes(tree).find(n => n.type === 'input').props.value, 'match');
  props.scope = { ...s, selectedBusinessId: itemId, scopeKey: 'new-actor-record' }; h.render(); oldRow.props.onClick();
  assert.match(text(h.render()), /Sin seleccionar/); assert.equal(picks.length, 2); assert.equal(calls.length, 3); h.unmount();
});

test('mounted picker without override keeps later selected page metadata above initial or replacement seed', async () => {
  const picks = [], props = { scope, seed: { ...row, label: 'Semilla anterior' }, label: 'Categoría',
    onSelect: value => picks.push(value), fetcher: async () => response(dto(scope, '', 0, [{ ...row, label: 'Página posterior' }])) };
  const h = harness('catalog/catalog-choice-picker.tsx', props, {}, 'CatalogChoicePicker'); h.render();
  nodes(h.render()).find(n => n.type === 'button').props.onClick(); await h.tick();
  nodes(h.render()).find(n => n.props?.['aria-pressed'] === true).props.onClick();
  props.seed = { ...row, label: 'Otra semilla antigua' };
  const tree = h.render(); assert.match(text(tree), /Página posterior/); assert.doesNotMatch(text(tree), /semilla/i);
  assert.equal(picks[0].label, 'Página posterior'); h.unmount();
});

test('picker has no nested forms/named search or accidental Enter submit, and GET retries only', async () => {
  const picks = [], calls = [];
  const props = { scope, seed: null, label: 'Categoría', onSelect: choice => picks.push(choice),
    fetcher: async (...args) => { calls.push(args); return response(dto()); } };
  const h = harness('catalog/catalog-choice-picker.tsx', props, {}, 'CatalogChoicePicker');
  h.render(); let tree = h.render();
  assert.equal(tree.type, 'fieldset');
  assert.equal(nodes(tree).filter(n => n.type === 'form').length, 0);
  assert.equal(nodes(tree).filter(n => n.props?.name).length, 0);
  assert.ok(nodes(tree).filter(n => n.type === 'button').every(n => n.props.type === 'button'));
  const input = nodes(tree).find(n => n.type === 'input'); let prevented = false;
  input.props.onKeyDown({ key: 'Enter', preventDefault() { prevented = true; } });
  await h.tick(); tree = h.render();
  assert.equal(prevented, true); assert.equal(calls.length, 1); assert.equal(picks.length, 0);
  const oldChoice = nodes(tree).find(n => n.props?.['aria-pressed'] === false);
  oldChoice.props.onClick(); assert.deepEqual(picks, [row]);
  props.scope = { ...scope, selectedBusinessId: itemId, scopeKey: 'other-owner:other-record' };
  h.render(); oldChoice.props.onClick();
  assert.deepEqual(picks, [row]); // stale A handler cannot set B's selection/payload.
  assert.equal(nodes(h.render()).filter(n => n.props?.['aria-pressed'] !== undefined).length, 0);
  h.unmount();
});
