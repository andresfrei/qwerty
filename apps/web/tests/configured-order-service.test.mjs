import assert from 'node:assert/strict';
import test from 'node:test';
import { createPickupOrderRuntime } from '../app/lib/supabase/pickup-order-runtime.ts';
import { handlePickupOrderRequest } from '../app/lib/pickup-order-http.ts';
import { normalizeConfiguredPickupIntent, quoteConfiguredPickupOrder } from '../app/lib/configured-order-quote.ts';
import { configuredFixture } from './configured-order-fixtures.mjs';
import { config, actor, row, request, input, catalog, intent as oldIntent, quote as oldQuote } from './pickup-order-fixtures.mjs';

function runtime(mode = 'ready', wireVersion = 2) {
  const f = configuredFixture();
  const intent = normalizeConfiguredPickupIntent(f.wire, 'pizza').intent;
  const quote = quoteConfiguredPickupOrder(intent, f.snapshot).quote;
  const business = wireVersion === 2 ? f.snapshot.businessId : row.business_id;
  const expiry = Math.floor(Date.now() / 1000) + 3600;
  const token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: actor, exp: expiry })).toString('base64url')}.synthetic`;
  const session = { access_token: token, refresh_token: 'synthetic', token_type: 'bearer', expires_at: expiry, expires_in: 3600, user: { id: actor } };
  const headers = { cookie: `sb-synthetic-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}` };
  const calls = [], counts = { writes: 0, receiptChanges: 0, attempts: 0 }; let stored = null;
  const dependencies = createPickupOrderRuntime({ getConfig: () => config, getOrigin: () => 'https://shop.test', fetch: async (value, init) => {
    const url = new URL(String(value)); calls.push(url.pathname);
    assert.equal(url.origin, config.url); assert.equal(init.cache, 'no-store');
    if (url.pathname === '/auth/v1/user') return Response.json({ id: actor, is_anonymous: true });
    assert.equal(new Headers(init.headers).get('authorization'), `Bearer ${config.serviceKey}`);
    if (url.pathname.endsWith('/business_storefronts')) return Response.json({ business_id: business, slug: 'pizza' });
    if (url.pathname.endsWith('/pickup_orders')) { counts.attempts++; return Response.json(stored); }
    if (url.pathname.endsWith('/catalog_configuration_capabilities')) {
      assert.deepEqual(JSON.parse(init.body), {});
      if (mode === 'missing') return Response.json({ code: 'PGRST202', message: 'Could not find the function public.catalog_configuration_capabilities without parameters in the schema cache', details: 'Searched for the function public.catalog_configuration_capabilities without parameters, but no matches were found in the schema cache.' }, { status: 404 });
      if (mode === 'permission') return Response.json({ code: '42501', message: 'private' }, { status: 403 });
      if (mode === 'malformed') return Response.json([{ version: '2', schemaVersion: 1 }]);
      if (mode === 'transport') throw Error('private transport');
      return Response.json([{ version: 2, schemaVersion: 1 }]);
    }
    if (url.pathname.endsWith('/pickup_order_catalog_v2')) {
      assert.deepEqual(JSON.parse(init.body), { p_business: business, p_slug: 'pizza' });
      if (mode === 'missing-snapshot') return Response.json({ code: 'PGRST202', message: 'private' }, { status: 404 });
      return Response.json(wireVersion === 2 ? f.snapshot : { ...catalog, version: 2, schemaVersion: 1, profiles: [], fingerprint: 'b'.repeat(64) });
    }
    if (url.pathname.endsWith('/pickup_order_catalog')) { assert.equal(wireVersion, 1); return Response.json(catalog); }
    if (url.pathname.endsWith('/finalize_pickup_order_v2') || url.pathname.endsWith('/finalize_pickup_order')) {
      counts.writes++;
      assert.deepEqual(JSON.parse(init.body), { p_actor: actor, p_business: business, p_intent: wireVersion === 2 ? intent : oldIntent, p_quote: wireVersion === 2 ? quote : oldQuote });
      if (mode === 'missing-finalize') return Response.json({ code: 'PGRST202', message: 'private missing finalizer' }, { status: 404 });
      if (mode === 'activation-race') return Response.json({ code: '23514', message: 'profile_required' }, { status: 400 });
      stored = wireVersion === 2 ? { ...row, business_id: business, request_id: intent.requestId, receipt_id: intent.receiptId, intent, quote, total_minor: quote.totalMinor } : row;
      counts.receiptChanges++;
      if (mode === 'lost') throw Error('private lost response');
      return Response.json({ code: 'created', order: stored });
    }
    assert.fail(url.pathname);
  } });
  return { f, dependencies, counts, calls, headers };
}
for (const mode of ['ready', 'lost', 'missing', 'permission', 'malformed', 'transport', 'missing-snapshot', 'missing-finalize']) test(`actual runtime v2 ${mode}: exact RPC composition, no fallback/retry`, async () => {
  const f = runtime(mode);
  const response = await handlePickupOrderRequest(request('POST', '?slug=pizza', f.f.wire, f.headers), 'collection', f.dependencies);
  const body = await response.json();
  assert.equal(response.status, mode === 'ready' ? 201 : mode === 'lost' ? 200 : 503);
  assert.equal(f.counts.writes, ['ready', 'lost', 'missing-finalize'].includes(mode) ? 1 : 0);
  assert.equal(f.counts.receiptChanges, ['ready', 'lost'].includes(mode) ? 1 : 0);
  assert.equal(f.calls.some(c => c.endsWith('/pickup_order_catalog') || c.endsWith('/finalize_pickup_order')), false);
  assert.equal(JSON.stringify(body).includes('private'), false);
  if (mode === 'missing-finalize') { assert.equal(body.code, 'outcome_unknown'); assert.equal(f.counts.attempts, 2); }
  if (mode === 'ready' || mode === 'lost') { assert.equal(body.order.version, 2); assert.equal(body.order.totalMinor, 1_200_000); }
});
for (const mode of ['ready', 'missing', 'activation-race']) test(`actual runtime v1 ${mode} retains old quote and writer`, async () => {
  const f = runtime(mode, 1);
  const response = await handlePickupOrderRequest(request('POST', '?slug=pizza', input, f.headers), 'collection', f.dependencies);
  assert.equal(response.status, mode === 'activation-race' ? 503 : 201);
  assert.equal(f.counts.writes, 1); assert.equal(f.counts.receiptChanges, mode === 'activation-race' ? 0 : 1);
  assert.equal(f.calls.filter(c => c.endsWith('/finalize_pickup_order_v2')).length, 0);
  if (mode === 'activation-race') { assert.equal((await response.json()).code, 'outcome_unknown'); assert.equal(f.counts.attempts, 2); }
});
