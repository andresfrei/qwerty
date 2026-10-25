import assert from 'node:assert/strict';
import test from 'node:test';
import * as runtime from '../app/lib/catalog-configuration-runtime.ts';
import { createPickupOrderRuntime } from '../app/lib/supabase/pickup-order-runtime.ts';
import { fixture, id } from './catalog-profiles-fixtures.mjs';
const ids = { business: id(99), other: id(98), pizza: id(1), dozen: id(2), combo: id(3), muzza: id(22) };
const catalog = () => fixture().catalog;

const missing = { code: 'PGRST202', message: 'Could not find the function public.catalog_configuration_capabilities without parameters in the schema cache', details: 'Searched for the function public.catalog_configuration_capabilities without parameters, but no matches were found in the schema cache.', hint: null };
const snapshot = () => ({ version: 2, schemaVersion: 1, slug: 'pizza', ...catalog(), fingerprint: 'a'.repeat(64) });

test('capability accepts only exact singleton and narrowly typed no-args absence', async () => {
  assert.equal(typeof runtime.readCatalogConfigurationCapability, 'function');
  const call = async (result) => runtime.readCatalogConfigurationCapability({ rpc: async (name, args) => {
    assert.equal(name, 'catalog_configuration_capabilities'); assert.deepEqual(args, {}); return result;
  } });
  assert.equal(await call({ data: [{ version: 2, schemaVersion: 1 }], error: null }), 'ready');
  assert.equal(await call({ data: null, error: missing }), 'legacy_only');
  assert.equal(await call({ data: null, error: { ...missing, details: missing.details.replace('without parameters,', 'without parameters or with a single unnamed json/jsonb parameter,') } }), 'legacy_only');
  for (const data of [null, [], {}, { version: 2, schemaVersion: 1 }, [{ version: 2, schemaVersion: 1 }, { version: 2, schemaVersion: 1 }], [{ version: '2', schemaVersion: 1 }], [{ version: 2, schemaVersion: 1, private: true }], [{ version: 2, schemaVersion: 2 }]]) {
    assert.equal(await call({ data, error: null }), 'unavailable');
  }
  for (const error of [{ ...missing, code: '42501' }, { ...missing, message: missing.message.replace('catalog_configuration_capabilities', 'pickup_order_catalog_v2') }, { ...missing, message: missing.message.replace('without parameters', 'with parameters p_business') }, { ...missing, details: missing.details.replace('without parameters', 'with parameters p_business') }, { code: 'PGRST202' }, { code: '403', message: 'Forbidden' }]) {
    assert.equal(await call({ data: null, error }), 'unavailable');
  }
  assert.equal(await runtime.readCatalogConfigurationCapability({ rpc: async () => { throw Error('transport'); } }), 'unavailable');
});

test('snapshot validates exact wrapper, bindings and transport budget', () => {
  assert.equal(typeof runtime.validateConfiguredCatalogSnapshot, 'function');
  const original = snapshot(), copy = structuredClone(original);
  assert.ok(runtime.validateConfiguredCatalogSnapshot(original, ids.business, 'pizza'));
  assert.deepEqual(original, copy);
  for (const mutate of [s => { s.version = 1; }, s => { s.schemaVersion = 2; }, s => { s.slug = 'other'; }, s => { s.businessId = ids.other; }, s => { s.fingerprint = 'bad'; }, s => { s.private = true; }, s => { s.profiles = null; }, s => { s.items[0].business_id = ids.other; }, s => { s.items.push(s.items[0]); }, s => { s.items[0].name = 'x'.repeat(16 * 1024 * 1024); }]) {
    const value = snapshot(); mutate(value);
    assert.equal(runtime.validateConfiguredCatalogSnapshot(value, ids.business, 'pizza'), null);
  }
});

test('projection strips wrappers and unrelated rows and uses exact T1 validation', () => {
  assert.equal(typeof runtime.projectConfiguredCatalog, 'function');
  const value = snapshot();
  const result = runtime.projectConfiguredCatalog(value, ids.combo);
  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(result.value).sort(), ['businessId', 'surchargeMinor', 'items', 'groups', 'options', 'profiles'].sort());
  assert.deepEqual(result.value.items.map(i => i.id).sort(), [ids.combo, ids.pizza, ids.dozen].sort());
  assert.equal(Object.hasOwn(result.value, 'fingerprint'), false);
  result.value.items[0].name = 'changed';
  assert.notEqual(value.items[0].name, 'changed');
  const bad = snapshot(); bad.profiles.find(p => p.item_id === ids.pizza).document = { schemaVersion: 1, kind: 'unknown' };
  assert.equal(runtime.projectConfiguredCatalog(bad, ids.pizza).ok, false);
});

test('unavailable fixed choice does not poison an unrelated dozen projection', () => {
  const value = snapshot(); value.options.find(o => o.id === ids.muzza).is_available = false;
  assert.equal(runtime.projectConfiguredCatalog(value, ids.dozen).ok, true);
  assert.equal(runtime.projectConfiguredCatalog(value, ids.combo).ok, true);
});

test('whole-business rows do not receive T1 projected row limits', () => {
  const value = snapshot();
  for (let i = 1; i <= 1001; i++) value.items.push({ ...value.items[0], id: `bbbbbbbb-0000-0000-0000-${String(i).padStart(12, '0')}` });
  const validated = runtime.validateConfiguredCatalogSnapshot(value, ids.business, 'pizza');
  assert.ok(validated);
  const projected = runtime.projectConfiguredCatalog(validated, ids.dozen);
  assert.equal(projected.ok, true); assert.equal(projected.value.items.length, 1);
});

test('actual runtime factory wires capability and v2 snapshot with service-only no-store SDK calls', async () => {
  const calls = [];
  const dependencies = createPickupOrderRuntime({ fetch: async (input, init) => {
    const url = new URL(String(input)); calls.push(url.pathname);
    assert.equal(new Headers(init.headers).get('authorization'), 'Bearer synthetic-service');
    assert.equal(init.cache, 'no-store'); assert.ok(init.signal);
    if (url.pathname.endsWith('/catalog_configuration_capabilities')) { assert.deepEqual(JSON.parse(init.body), {}); return Response.json([{ version: 2, schemaVersion: 1 }]); }
    assert.equal(url.pathname, '/rest/v1/rpc/pickup_order_catalog_v2');
    assert.deepEqual(JSON.parse(init.body), { p_business: ids.business, p_slug: 'pizza' });
    return Response.json(snapshot());
  } });
  const repository = dependencies.connect({ url: 'https://synthetic.supabase.co', anonKey: 'synthetic-anon', serviceKey: 'synthetic-service' }, { getAll: () => [], setAll: () => {} }).service();
  assert.equal(typeof repository.configurationCapability, 'function');
  assert.equal(await repository.configurationCapability(), 'ready');
  const value = await repository.configuredCatalog(ids.business, 'pizza');
  assert.equal(value.version, 2); assert.deepEqual(calls, ['/rest/v1/rpc/catalog_configuration_capabilities', '/rest/v1/rpc/pickup_order_catalog_v2']);
});

test('actual SDK snapshot transport refuses oversized declared bodies before JSON parsing', async () => {
  const dependencies = createPickupOrderRuntime({ fetch: async () => Response.json(snapshot(), { headers: { 'Content-Length': String(16 * 1024 * 1024 + 1) } }) });
  const repository = dependencies.connect({ url: 'https://synthetic.supabase.co', anonKey: 'synthetic-anon', serviceKey: 'synthetic-service' }, { getAll: () => [], setAll: () => {} }).service();
  await assert.rejects(repository.configuredCatalog(ids.business, 'pizza'), /unavailable/i);
});

test('actual runtime cancels chunked overflow without Content-Length or writes; inclusive boundary succeeds', async () => {
  const limit = runtime.CONFIGURED_SNAPSHOT_MAX_BYTES;
  for (const overflow of [false, true]) {
    let cancelled = false, calls = 0;
    const payload = new TextEncoder().encode(JSON.stringify(snapshot()));
    // Legal trailing JSON whitespace reaches the exact transport boundary.
    let sent = 0;
    const body = new ReadableStream({
      pull(controller) {
        if (sent === 0) { controller.enqueue(payload); sent += payload.length; return; }
        if (sent < limit) { const chunk = new Uint8Array(Math.min(65536, limit - sent)).fill(32); sent += chunk.length; controller.enqueue(chunk); return; }
        if (overflow) { controller.enqueue(new TextEncoder().encode(' PRIVATE_SENTINEL')); return; }
        controller.close();
      },
      cancel() { cancelled = true; },
    });
    const dependencies = createPickupOrderRuntime({ fetch: async (input, init) => {
      calls++; assert.equal(new URL(String(input)).pathname, '/rest/v1/rpc/pickup_order_catalog_v2');
      assert.equal(init.method, 'POST');
      const response = new Response(body, { headers: { 'content-type': 'application/json' } });
      assert.equal(response.headers.has('content-length'), false); return response;
    } });
    const repository = dependencies.connect({ url: 'https://synthetic.supabase.co', anonKey: 'synthetic-anon', serviceKey: 'synthetic-service' }, { getAll: () => [], setAll: () => { assert.fail('no app writes'); } }).service();
    if (overflow) await assert.rejects(repository.configuredCatalog(ids.business, 'pizza'), error => { assert.equal(error.message, 'Configured catalog unavailable'); assert.equal(String(error).includes('PRIVATE_SENTINEL'), false); return true; });
    else assert.equal((await repository.configuredCatalog(ids.business, 'pizza')).version, 2);
    assert.equal(cancelled, overflow); assert.equal(calls, 1);
  }
});

test('snapshot RPC absence after readiness throws rather than downgrade', async () => {
  assert.equal(typeof runtime.createCatalogConfigurationRuntime, 'function');
  const adapter = runtime.createCatalogConfigurationRuntime({ rpc: async (name) => name === 'catalog_configuration_capabilities' ? { data: [{ version: 2, schemaVersion: 1 }], error: null } : { data: null, error: missing } });
  assert.equal(await adapter.configurationCapability(), 'ready');
  await assert.rejects(adapter.configuredCatalog(ids.business, 'pizza'), /unavailable/i);
});
