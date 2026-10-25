import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { createPickupOrderRuntime } from '../app/lib/supabase/pickup-order-runtime.ts';
import { handlePickupOrderRequest } from '../app/lib/pickup-order-http.ts';
import { actor, business, requestId, id, other, config, input, intent, catalog, quote, row, dto, request } from './pickup-order-fixtures.mjs';

// Execute actual route exports from TypeScript's in-memory CJS output. Only the
// server-owned runtime dependency is replaced; no generated files or app server.
function route(path, dependencies) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('require', 'exports', compiled)(specifier => {
    if (specifier.endsWith('/pickup-order-http')) return { handlePickupOrderRequest };
    if (specifier.endsWith('/supabase/pickup-order-runtime')) return { pickupOrderRuntime: dependencies };
    assert.fail(`Unexpected production dependency ${specifier}`);
  }, exports);
  return exports;
}
function sdk({ user = { id: actor, is_anonymous: true }, dispatch } = {}) {
  const calls = [], expiry = Math.floor(Date.now() / 1000) + 3600;
  const token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: actor, exp: expiry })).toString('base64url')}.synthetic`;
  const session = { access_token: token, refresh_token: 'synthetic-refresh', token_type: 'bearer', expires_at: expiry, expires_in: 3600, user: { id: actor } };
  const cookie = `sb-synthetic-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;
  const dependencies = createPickupOrderRuntime({ getConfig: () => config, getOrigin: () => 'https://shop.test', fetch: async (urlValue, init) => {
    const url = new URL(String(urlValue)); calls.push({ url, init });
    assert.equal(url.origin, config.url); assert.equal(init.cache, 'no-store'); assert.ok(init.signal);
    const authorization = new Headers(init.headers).get('authorization');
    if (url.pathname === '/auth/v1/user') { assert.equal(init.method, 'GET'); assert.equal(authorization, `Bearer ${token}`); return Response.json(user); }
    assert.ok(calls.some(call => call.url.pathname === '/auth/v1/user'));
    if (url.pathname === '/rest/v1/rpc/catalog_configuration_capabilities') return Response.json({ code: 'PGRST202', message: 'Could not find the function public.catalog_configuration_capabilities without parameters in the schema cache', details: 'Searched for the function public.catalog_configuration_capabilities without parameters, but no matches were found in the schema cache.' }, { status: 404 });
    return dispatch(url, init, authorization, token);
  } });
  return { dependencies, calls, headers: { cookie } };
}
const collectionPath = '../app/api/checkout/orders/route.ts';
const knownPath = '../app/api/checkout/orders/[id]/route.ts';
const queuePath = '../app/api/business/orders/route.ts';
test('public POST route uses installed SSR getUser and exact service RPC names/parameters', async () => {
  let attemptReads = 0, writes = 0;
  const f = sdk({ dispatch(url, init, authorization) {
    assert.equal(authorization, `Bearer ${config.serviceKey}`);
    if (url.pathname === '/rest/v1/business_storefronts') { assert.equal(url.searchParams.get('slug'), 'eq.pizza'); assert.equal(url.searchParams.has('is_published'), false); return Response.json({ business_id: business, slug: 'pizza' }); }
    if (url.pathname === '/rest/v1/pickup_orders') {
      attemptReads++; for (const [key, value] of Object.entries({ actor_id: actor, business_id: business, request_id: requestId })) assert.equal(url.searchParams.get(key), `eq.${value}`);
      assert.equal(init.method, 'GET'); return Response.json(null);
    }
    if (url.pathname === '/rest/v1/rpc/pickup_order_catalog') { assert.equal(init.method, 'POST'); assert.deepEqual(JSON.parse(init.body), { p_business: business, p_slug: 'pizza' }); return Response.json(catalog); }
    if (url.pathname === '/rest/v1/rpc/finalize_pickup_order') { writes++; assert.deepEqual(JSON.parse(init.body), { p_actor: actor, p_business: business, p_intent: intent, p_quote: quote }); return Response.json({ code: 'created', order: row }); }
    assert.fail(url.pathname);
  } });
  const response = await route(collectionPath, f.dependencies).POST(request('POST', '?slug=pizza', input, f.headers));
  assert.equal(response.status, 201); assert.deepEqual(await response.json(), { order: dto }); assert.equal(attemptReads, 1); assert.equal(writes, 1); assert.equal(f.calls.length, 6);
});
test('installed SDK transport failure recovers freshly committed winner, never retries RPC', async () => {
  let attempts = 0, writes = 0;
  const f = sdk({ dispatch(url, init, authorization) {
    assert.equal(authorization, `Bearer ${config.serviceKey}`);
    if (url.pathname.endsWith('/business_storefronts')) return Response.json({ business_id: business, slug: 'pizza' });
    if (url.pathname.endsWith('/pickup_orders')) { attempts++; return Response.json(attempts > 1 ? row : null); }
    if (url.pathname.endsWith('/pickup_order_catalog')) return Response.json(catalog);
    if (url.pathname.endsWith('/finalize_pickup_order')) { writes++; throw new TypeError('synthetic lost response'); }
    assert.fail(url.pathname);
  } });
  const response = await route(collectionPath, f.dependencies).POST(request('POST', '?slug=pizza', input, f.headers));
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { order: dto }); assert.equal(attempts, 2); assert.equal(writes, 1);
});
test('public GET recovery route stays actor/business/key scoped and bypasses catalog', async () => {
  const f = sdk({ dispatch(url, init, authorization) {
    assert.equal(authorization, `Bearer ${config.serviceKey}`); assert.equal(init.method, 'GET');
    if (url.pathname.endsWith('/business_storefronts')) return Response.json({ business_id: business, slug: 'pizza' });
    assert.equal(url.pathname, '/rest/v1/pickup_orders');
    assert.equal(url.searchParams.get('actor_id'), `eq.${actor}`); assert.equal(url.searchParams.get('business_id'), `eq.${business}`); assert.equal(url.searchParams.get('request_id'), `eq.${requestId}`);
    return Response.json(row);
  } });
  const response = await route(collectionPath, f.dependencies).GET(request('GET', `?slug=pizza&requestId=${requestId}`, undefined, f.headers));
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { order: dto }); assert.equal(f.calls.length, 3);
});
for (const visible of [false, true]) test(`known-ID route reads with caller RLS token only (visible=${visible})`, async () => {
  const f = sdk({ dispatch(url, init, authorization, token) {
    assert.equal(authorization, `Bearer ${token}`); assert.equal(url.pathname, '/rest/v1/pickup_orders'); assert.equal(init.method, 'GET'); assert.equal(url.searchParams.get('id'), `eq.${id}`);
    return Response.json(visible ? row : null);
  } });
  const response = await route(knownPath, f.dependencies).GET(request('GET', '', undefined, f.headers), { params: Promise.resolve({ id }) });
  assert.equal(response.status, visible ? 200 : 404); assert.deepEqual(await response.json(), visible ? { order: dto } : { error: 'Order not found' }); assert.equal(f.calls.length, 2);
});
for (const owned of [true, false]) test(`owner queue uses single inner RLS statement, not service precheck (owned=${owned})`, async () => {
  const f = sdk({ user: { id: actor, is_anonymous: false, email_confirmed_at: '2026-01-01' }, dispatch(url, init, authorization, token) {
    assert.equal(authorization, `Bearer ${token}`); assert.equal(url.pathname, '/rest/v1/pickup_orders'); assert.equal(init.method, 'GET');
    assert.match(url.searchParams.get('select'), /businesses!inner\(id,owner_id\)/);
    assert.equal(url.searchParams.get('business_id'), `eq.${business}`); assert.equal(url.searchParams.get('businesses.id'), `eq.${business}`); assert.equal(url.searchParams.get('businesses.owner_id'), `eq.${actor}`);
    assert.equal(url.searchParams.get('limit'), '100'); assert.equal(url.searchParams.get('order'), 'created_at.desc,id.desc');
    return Response.json(owned ? [{ ...row, actor_id: other, businesses: { id: business, owner_id: actor } }] : []);
  } });
  const response = await route(queuePath, f.dependencies).GET(request('GET', `?businessId=${business}`, undefined, f.headers));
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { orders: owned ? [dto] : [] }); assert.equal(f.calls.length, 2);
});
test('route IDs cannot alias collection/queue commands; methods never perform writes', async () => {
  const f = sdk({ dispatch() { assert.fail('must reject before SDK'); } });
  for (const value of ['queue', 'collection', 'not-uuid']) {
    const response = await route(knownPath, f.dependencies).GET(request('GET', '', undefined, f.headers), { params: Promise.resolve({ id: value }) });
    assert.equal(response.status, 404); assert.deepEqual(await response.json(), { error: 'Order not found' });
  }
  for (const path of [knownPath, collectionPath, queuePath]) {
    const response = await route(path, f.dependencies).PATCH(request('PATCH', '', undefined, f.headers), { params: Promise.resolve({ id }) });
    assert.equal(response.status, 405); assert.deepEqual(await response.json(), { error: 'Method not allowed' });
  }
  assert.deepEqual(f.calls, []);
});
test('missing session causes no signup/token/table request in actual SDK', async () => {
  const f = sdk({ dispatch() { assert.fail('no DB without session'); } });
  const response = await route(collectionPath, f.dependencies).POST(request());
  assert.equal(response.status, 401); assert.deepEqual(await response.json(), { error: 'Session required' }); assert.deepEqual(f.calls, []);
});
