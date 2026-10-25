import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server.js';
import { load } from './owner-first-store-fixtures.mjs';
import { fixture, businessId, itemId, groupId, recordId, foreignId, category, product, group } from './owner-resource-navigation-fixtures.mjs';
const origin = 'https://owner.fixture.invalid';
const base = `selectedBusinessId=${businessId}&kind=categories`;
function setup(options = {}, configured = true) {
  const f = fixture({ tables: { catalog_items: [product] }, ...options });
  let creations = 0;
  const mod = load('apps/web/app/owner/catalog/choices/route.ts', {
    'server-only': {},
    '@supabase/ssr': { createServerClient(url, key, sdk) {
      creations++;
      assert.equal(url, 'https://database.fixture.invalid'); assert.equal(key, 'fake-publishable');
      const getUser = f.client.auth.getUser;
      f.client.auth.getUser = async () => {
        sdk.cookies.setAll([{ name: 'fixture-session', value: 'refreshed', options: { httpOnly: true, sameSite: 'lax', path: '/' } }]);
        return getUser();
      };
      return f.client;
    } },
    '../../../lib/supabase/config': { getSupabaseConfig: () => configured ? { url: 'https://database.fixture.invalid', anonKey: 'fake-publishable' } : null },
    '../../lib/supabase/confirm': {
      getTrustedSiteOrigin: () => origin,
      // Keep the installed origin/forwarding validator real, while avoiding env reads.
      isTrustedCallbackRequest: load('apps/web/app/lib/supabase/confirm.ts').isTrustedCallbackRequest,
    },
  });
  return { ...f, get identity() { return f.authCalls; }, get creations() { return creations; }, mod };
}
function request(query = base, headers = {}, path = '/owner/catalog/choices') {
  return new NextRequest(`${origin}${path}?${query}`, { headers: { host: new URL(origin).host, ...headers } });
}
function secure(response, status, cookie = false) {
  assert.equal(response.status, status);
  for (const [key, value] of Object.entries({ 'content-type': 'application/json', 'cache-control': 'private, no-store', pragma: 'no-cache', expires: '0', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff' })) assert.equal(response.headers.get(key), value);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  if (cookie) assert.match(response.headers.get('set-cookie'), /fixture-session=refreshed; Path=\/; HttpOnly; SameSite=lax/i);
  else assert.equal(response.headers.get('set-cookie'), null);
}
async function failure(f, req, status, error, cookie = false, method = 'GET') {
  const response = await f.mod[method](req); secure(response, status, cookie);
  assert.deepEqual(await response.json(), { error }); return response;
}
test('choices ingress: strict selection/kind/q/page/context before SDK creation', async () => {
  const invalid = ['', `kind=categories`, `${base}&selectedBusinessId=${businessId}`, `${base}&businessId=${businessId}`,
    `${base}&returnURL=/owner`, `${base}&table=catalog_items`, base.replace('categories', 'options'), base.replace(businessId, 'bad'),
    `${base}&q=a&q=b`, `${base}&q=${'a'.repeat(101)}`, `${base}&q=%00`, `${base}&page=01`, `${base}&page=-1`, `${base}&page=1000001`,
    `${base}&page=1.5`, `${base}&page=`, `${base}&itemId=${itemId}`, base.replace('categories', 'groups'),
    `${base.replace('categories', 'groups')}&itemId=bad`, `${base}&groupId=${groupId}`, `${base}&storePage=0`];
  for (const query of invalid) {
    const f = setup(); await failure(f, request(query), 400, 'invalid_request');
    assert.equal(f.creations, 0); assert.equal(f.identity, 0); assert.deepEqual(f.calls, []);
  }
});
test('choices ingress: target/origin/forwarding/method/body rejected without identity', async () => {
  const cases = [request(base, { origin: 'https://foreign.invalid' }), request(base, { origin: 'null' }),
    request(base, { host: 'foreign.invalid' }), request(base, { 'x-forwarded-host': 'foreign.invalid' }),
    request(base, { 'x-forwarded-proto': 'http' }), request(base, {}, '/owner/catalog/items'),
    request(base, { 'content-length': '1' }), request(base, { 'content-encoding': 'gzip' }), request(base, { 'content-length': '00' })];
  const bodyRequest = request(); Object.defineProperty(bodyRequest, 'body', { value: new ReadableStream() }); cases.push(bodyRequest);
  for (const req of cases) {
    const f = setup(); await failure(f, req, 400, cases.indexOf(req) < 6 ? 'request_rejected' : 'invalid_request');
    assert.equal(f.creations, 0); assert.deepEqual(f.calls, []);
  }
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) {
    const f = setup(); const req = new NextRequest(`${origin}/owner/catalog/choices?${base}`, { method });
    const response = await failure(f, req, 405, 'method_not_allowed', false, method);
    assert.equal(response.headers.get('allow'), 'GET'); assert.equal(f.creations, 0);
  }
});
test('choices identity: unconfirmed/anonymous/missing/email/role/error never publish staged refresh', async () => {
  for (const user of [{ email_confirmed_at: null }, { is_anonymous: true }, { email: null }, { role: 'service_role' }]) {
    const f = setup({ user }); await failure(f, request(), 401, 'unauthorized');
    assert.equal(f.identity, 1); assert.deepEqual(f.calls, []);
  }
  for (const result of [{ data: { user: null }, error: null }, { data: { user: null }, error: { message: 'private error' } }]) {
    const f = setup(); f.client.auth.getUser = async () => result;
    await failure(f, request(), 401, 'unauthorized'); assert.deepEqual(f.calls, []);
  }
});
test('choices categories: exact private DTO, same-origin and omitted-Origin GET, no writes', async () => {
  for (const headers of [{}, { origin, 'content-length': '0' }]) {
    const f = setup({ tables: { catalog_items: [product], catalog_categories: [{ ...category, private: 'never' }] } });
    const before = JSON.stringify(f.source);
    const response = await f.mod.GET(request(base.replace(businessId, businessId.toUpperCase()), headers)); secure(response, 200, true);
    assert.deepEqual(await response.json(), { kind: 'categories', selectedBusinessId: businessId, q: '', rows: [{ id: recordId, label: 'Carta' }],
      pagination: { page: 0, pageSize: 25, total: 1, hasMore: false, pageComplete: true, collectionComplete: true } });
    assert.equal(JSON.stringify(f.source), before); assert.equal(f.calls.filter(c => c.rpc).length, 0);
    assert.equal(f.catalogCalls().length, 1);
    assert.deepEqual(f.catalogCalls()[0].eq, [['business_id', businessId]]);
  }
});
test('choices items: explicit kind/availability only, no profiles/photo/matrix/account DTO leakage or mutation RPC', async () => {
  const f = setup({ tables: { catalog_items: [{ ...product, photo_path: 'private/path', description: 'private description' }],
    catalog_item_configurations: [{ business_id: businessId, item_id: itemId, version: 1, is_active: true, kind: 'pizza', document: { private: 'matrix' } }] } });
  const before = JSON.stringify(f.source);
  const response = await f.mod.GET(request(base.replace('categories', 'items'))); secure(response, 200, true);
  const body = await response.json();
  assert.deepEqual(body, { kind: 'items', selectedBusinessId: businessId, q: '', rows: [{ id: itemId, label: 'Producto', itemKind: 'pizza', isAvailable: true }],
    pagination: { page: 0, pageSize: 25, total: 1, hasMore: false, pageComplete: true, collectionComplete: true } });
  assert.equal(JSON.stringify(f.source), before);
  assert.deepEqual(f.calls.filter(c => c.rpc).map(c => [c.rpc, c.args]), [['catalog_configuration_capabilities', {}]]);
  assert.equal(f.catalogCalls().length, 3);
  assert.equal(f.calls.find(c => c.table === 'catalog_item_configurations').fields, 'business_id,item_id,version,is_active,kind:document->>kind');
});
test('choices groups: required scoped item and exact parent verification, no foreign ancestry fallback', async () => {
  const query = `${base.replace('categories', 'groups')}&itemId=${itemId}`;
  const f = setup(); const response = await f.mod.GET(request(query)); secure(response, 200, true);
  assert.deepEqual(await response.json(), { kind: 'groups', selectedBusinessId: businessId, itemId, q: '', rows: [{ id: groupId, label: 'Gustos' }],
    pagination: { page: 0, pageSize: 25, total: 1, hasMore: false, pageComplete: true, collectionComplete: true } });
  assert.equal(f.catalogCalls().length, 2);
  assert.deepEqual(f.calls.find(c => c.table === 'catalog_option_groups').eq, [['business_id', businessId], ['item_id', itemId]]);
  for (const tables of [{ catalog_items: [] }, { catalog_items: [{ ...product, business_id: foreignId }] }]) {
    const denied = setup({ tables }); await failure(denied, request(query), 404, 'not_found', true);
    assert.equal(denied.calls.some(c => c.table === 'catalog_option_groups'), false);
  }
  const wrong = setup({ change: (r, c) => c.table === 'catalog_option_groups' ? { ...r, data: [{ ...group, item_id: foreignId }] } : r });
  await failure(wrong, request(query), 503, 'unavailable', true);
});
test('choices pagination: 26+ bounds, later/empty page completeness, escaped search and truncation failures', async () => {
  const rows = Array.from({ length: 27 }, (_, n) => ({ ...category, id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, sort_order: n }));
  for (const [page, size, hasMore, collectionComplete] of [[0, 25, true, false], [1, 2, false, false], [2, 0, false, false]]) {
    const f = setup({ tables: { catalog_categories: rows } });
    const response = await f.mod.GET(request(`${base}&page=${page}&q=%20a%25_*%5C%20`)); secure(response, 200, true);
    const body = await response.json(); assert.equal(body.rows.length, size); assert.equal(body.q, 'a%_*\\');
    assert.deepEqual(body.pagination, { page, pageSize: 25, total: 27, hasMore, pageComplete: true, collectionComplete });
    const call = f.catalogCalls()[0]; assert.deepEqual(call.range, [page * 25, page * 25 + 24]); assert.equal(call.count, 'exact');
    assert.deepEqual(call.order, [['sort_order', { ascending: true }], ['id', { ascending: true }]]);
    assert.deepEqual(call.search, ['name', '%a\\%\\_\\%\\\\%']);
  }
  for (const change of [r => ({ ...r, count: null }), r => ({ ...r, data: [] }), r => ({ ...r, data: [category, category], count: 2 }),
    r => ({ ...r, data: [{ ...category, business_id: foreignId }] }), r => ({ ...r, error: { message: 'private' } })]) {
    const f = setup({ change: (r, c) => c.table === 'catalog_categories' ? change(r) : r });
    await failure(f, request(), 503, 'unavailable', true);
  }
  const empty = setup({ tables: { catalog_categories: [] } }); const body = await (await empty.mod.GET(request())).json();
  assert.equal(body.pagination.collectionComplete, true); assert.deepEqual(body.rows, []);
});
test('choices alternate failures: identity transport and late storefront/profile faults fail closed without writes', async () => {
  const transport = setup(); transport.client.auth.getUser = async () => { throw Error('private transport'); };
  await failure(transport, request(), 503, 'unavailable'); assert.deepEqual(transport.calls, []);
  const storefront = setup({ change: (r, c) => c.table === 'business_storefronts' ? { ...r, error: { message: 'private' } } : r });
  await failure(storefront, request(), 503, 'unavailable', true); assert.equal(storefront.catalogCalls().length, 0);
  const malformed = setup({ tables: { catalog_items: [product], catalog_item_configurations: [
    { business_id: businessId, item_id: itemId, version: 1, is_active: true, kind: 'guessed-by-name' },
  ] } });
  await failure(malformed, request(base.replace('categories', 'items')), 503, 'unavailable', true);
  assert.equal(malformed.calls.filter(c => c.rpc).length, 1);
  const legacy = setup(); const response = await legacy.mod.GET(request(base.replace('categories', 'items')));
  secure(response, 200, true); assert.deepEqual((await response.json()).rows, [{ id: itemId, label: 'Producto', itemKind: 'legacy', isAvailable: true }]);
  assert.equal(legacy.calls.filter(c => c.rpc).length, 1);
});
test('choices late 404/503 retain eligible cookies; missing configuration never creates SDK; no retries', async () => {
  const foreign = setup(); await failure(foreign, request(base.replace(businessId, foreignId)), 404, 'not_found', true);
  assert.equal(foreign.catalogCalls().length, 0);
  const unavailable = setup({ change: (r, c) => c.table === 'businesses' ? { ...r, error: { message: 'private failure' } } : r });
  await failure(unavailable, request(), 503, 'unavailable', true); assert.equal(unavailable.catalogCalls().length, 0);
  const missing = setup({}, false); await failure(missing, request(), 503, 'unavailable'); assert.equal(missing.creations, 0);
  const failedCapability = setup({ capability: { data: null, error: { code: '42501' } } });
  await failure(failedCapability, request(base.replace('categories', 'items')), 503, 'unavailable', true);
  assert.equal(failedCapability.calls.filter(c => c.rpc).length, 1);
});
