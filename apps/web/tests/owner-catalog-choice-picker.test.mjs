import test from 'node:test';
import assert from 'node:assert/strict';
import { load, harness, nodes } from './owner-first-store-fixtures.mjs';
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
