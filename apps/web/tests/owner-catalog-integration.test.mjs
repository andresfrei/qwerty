import assert from 'node:assert/strict';
import test from 'node:test';
import { integration, shellProps, businessId, foreignId } from './owner-resource-integration-fixtures.mjs';
import { itemId, groupId, recordId } from './owner-resource-navigation-fixtures.mjs';
import { load } from './owner-first-store-fixtures.mjs';
const { catalogHref, catalogStoreHref, catalogSectionQuery } = load('apps/web/app/owner/catalog/catalog-navigation.ts');
const hrefs = html => [...html.matchAll(/href="([^"]+)"/g)].map(m => m[1].replaceAll('&amp;', '&'));

test('legacy public root redirects fresh selection to Products without any catalog read', async () => {
  for (const search of [{}, { businessId: businessId.toUpperCase(), storePage: '2' }]) {
    const f = integration();
    await assert.rejects(f.entry(search), e => e.status === 307 && e.href === catalogHref('items', { businessId, storePage: Number(search.storePage ?? 0) }));
    assert.ok(f.sdk.authCalls >= 3);
    assert.equal(f.sdk.catalogCalls().length, 0);
  }
});

test('root preserves strict query and fresh owner failure envelopes, with no foreign fallback', async () => {
  const cases = [
    [{ businessId: [businessId] }, {}, 'invalid'], [{ q: 'Pizza' }, {}, 'invalid'],
    [{ storePage: '01' }, {}, 'invalid'], [{ businessId: foreignId }, {}, 'missing'],
    [new URLSearchParams(`businessId=${businessId}&businessId=${businessId}`), {}, 'invalid'],
    [{}, { clientNull: true }, 'redirect'], [{}, { user: { id: null } }, 'unavailable'],
    [{}, { businesses: [] }, 'empty'], [{}, { user: { email_confirmed_at: null } }, 'redirect'],
    [{}, { user: { is_anonymous: true } }, 'redirect'],
    [{}, { change: () => ({ data: null, error: { message: 'private failure' } }) }, 'unavailable'],
  ];
  for (const [search, options, kind] of cases) {
    const f = integration(options);
    const html = await f.entry(search);
    assert.equal(f.failures[0].kind, kind);
    assert.doesNotMatch(html, /private failure|<form|Secciones de catálogo/);
    assert.equal(f.sdk.catalogCalls().length, 0);
    if (kind === 'invalid') assert.equal(f.sdk.authCalls, 0);
  }
});

test('Catalog business switch clears context but selector paging preserves complete view/query', () => {
  const f = integration();
  for (const [resource, view, parents] of [
    ['items', { mode: 'detail', id: itemId }, { categoryId: recordId }],
    ['items', { mode: 'new' }, { categoryId: recordId }],
    ['groups', { mode: 'new' }, { itemId }],
    ['options', { mode: 'detail', id: recordId }, { itemId, groupId }],
    ['categories', {}, {}], ['settings', {}, {}],
  ]) {
    const query = { businessId, storePage: 1, page: resource === 'settings' ? 0 : 3, q: resource === 'settings' ? '' : 'Pizza & salsa', ...parents };
    const before = structuredClone(query);
    const links = hrefs(f.html({ ...shellProps, catalogContext: { view: { resource, ...view }, query } }));
    assert.ok(links.includes(catalogStoreHref(resource, foreignId)));
    for (const storePage of [0, 2]) assert.ok(links.includes(catalogHref(resource, { ...query, storePage }, view)));
    assert.deepEqual(query, before);
  }
});

test('actual adapters mount four projected subsections only after ready fresh context, including creation choosers', async () => {
  for (const [resource, view, search, active] of [
    ['items', {}, { categoryId: recordId }, 'items'],
    ['items', { mode: 'detail', id: itemId }, { categoryId: recordId, q: 'Pizza', page: '3' }, 'items'],
    ['options', { mode: 'detail', id: recordId }, { itemId, groupId, q: 'Uno', page: '2' }, 'options'],
    ['categories', {}, {}, 'categories'],
    ['settings', {}, {}, 'settings'], ['options', {}, { itemId, groupId }, 'options'],
    ['groups', {}, { itemId }, 'items'], ['groups', { mode: 'new' }, {}, 'items'],
    ['options', { mode: 'new' }, {}, 'options'],
  ]) {
    const f = integration();
    const html = await f.page(resource, { ...search, storePage: '1' }, view);
    const context = f.shells[0]?.catalogContext;
    assert.ok(context, resource);
    assert.equal(context.query.businessId, businessId);
    assert.deepEqual(context.view, { resource, mode: view.mode ?? 'list', ...(view.id ? { id: view.id } : {}) });
    assert.equal(f.sdk.authCalls, 3);
    for (const call of f.sdk.catalogCalls()) {
      assert.ok(call.eq.some(([key, value]) => key === 'business_id' && value === businessId));
      assert.ok(call.single || call.range || call.limit, 'No unbounded full-catalog reads for navigation');
    }
    assert.match(html, /Secciones de catálogo/);
    const nav = html.match(/<nav aria-label="Secciones de catálogo"[\s\S]*?<\/nav>/)?.[0];
    const links = hrefs(nav);
    assert.equal(links.length, 4);
    for (const section of ['items', 'categories', 'options', 'settings']) {
      const href = catalogHref(section, catalogSectionQuery(section, context.query));
      assert.ok(links.includes(href));
      if (section === active) assert.ok(nav.includes(`href="${href.replaceAll('&', '&amp;')}" aria-current="page"`));
    }
    assert.doesNotMatch(html, /Caja|Cocina|Repartos|Operaciones/);
  }
  for (const resource of ['items', 'categories', 'groups', 'options', 'settings']) {
    for (const [search, options] of [
      [{ businessId: foreignId }, {}], [{ businessId: 'bad' }, {}],
      [{}, { businesses: [] }], [{}, { user: { email_confirmed_at: null } }],
      [{}, { change: () => ({ data: null, error: { message: 'private error' } }) }],
    ]) {
      const f = integration(options);
      const view = resource === 'groups' || resource === 'options' ? { mode: 'new' } : {};
      assert.doesNotMatch(await f.page(resource, search, view), /Secciones de catálogo|private error/);
      assert.equal(f.shells.length, 0);
      assert.equal(f.sdk.catalogCalls().length, 0);
    }
  }
});

test('optional catalog context never changes default shell or other actual modules', () => {
  const f = integration();
  const context = { view: { resource: 'items', mode: 'detail', id: itemId }, query: { businessId, storePage: 1, page: 3, q: 'Pizza' } };
  for (const activeModule of ['home', 'orders', 'store']) {
    const props = { ...shellProps, activeModule };
    assert.equal(f.html({ ...props, catalogContext: context }), f.html(props));
  }
  assert.doesNotMatch(f.html(shellProps), /Secciones de catálogo/);
  assert.doesNotMatch(f.html({ ...shellProps, selectedBusiness: null, catalogContext: context }), /Secciones de catálogo/);
  assert.equal(f.html({ ...shellProps, catalogContext: { ...context, query: { ...context.query, businessId: foreignId } } }), f.html(shellProps));
});
