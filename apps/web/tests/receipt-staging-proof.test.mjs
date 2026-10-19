import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { assertMetadataDenied, assertStorageWriteDenied, assertStorageReadDenied, assertOwnedStateUnchanged } from '../../../supabase/tests/storage/guest-receipt-assertions.mjs';

const actor = '11111111-1111-4111-8111-111111111111';
const business = '22222222-2222-4222-8222-222222222222';
const id = '33333333-3333-4333-8333-333333333333';
// Constraint-valid payload; real proof additionally uses existing fixture FKs
// and validator-derived type/size/hash. No deliberately forged object path.
const row = { id, actor_id: actor, business_id: business, object_path: `${business}/${actor}/${id}`, content_type: 'image/png', size_bytes: 70, sha256: 'a'.repeat(64), state: 'staged' };
function sdk(status, body) {
  const stored = [], calls = [];
  const client = createClient('https://synthetic.test', 'sb_publishable_synthetic', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      calls.push({ input: String(input), method: init.method });
      assert.equal(new URL(String(input)).pathname, '/rest/v1/guest_receipts');
      const payload = JSON.parse(init.body); assert.deepEqual(payload, row);
      if (status === 201) stored.push(payload);
      return new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    } },
  });
  return { client, calls, stored };
}

test('successful installed-SDK INSERT201/error-null/data-null is never denial evidence', async () => {
  const { client, calls, stored } = sdk(201, null);
  const result = await client.from('guest_receipts').insert(row);
  assert.equal(result.status, 201); assert.equal(result.error, null); assert.equal(result.data, null);
  assert.equal(stored.length, 1); assert.equal(calls.length, 1);
  assert.throws(() => assertMetadataDenied(result), { name: 'AssertionError' });
});
for (const status of [401, 403]) {
  test(`only installed-SDK PostgREST42501/${status} proves metadata denial`, async () => {
    const { client, calls, stored } = sdk(status, { code: '42501', message: 'permission denied for table guest_receipts', details: null, hint: null });
    const result = await client.from('guest_receipts').insert(row);
    assertMetadataDenied(result); assert.equal(stored.length, 0); assert.equal(calls.length, 1);
  });
}
for (const [status, code] of [[400, '23514'], [400, '23503'], [409, '23505'], [400, 'PGRST102'], [500, 'XX000'], [403, '23514'], [400, '42501']]) {
  test(`SDK ${status}/${code} validation/provider error cannot masquerade as authorization denial`, async () => {
    const { client, stored } = sdk(status, { code, message: 'synthetic non-authorization response' });
    const result = await client.from('guest_receipts').insert(row);
    assert.throws(() => assertMetadataDenied(result), { name: 'AssertionError' }); assert.equal(stored.length, 0);
  });
}
test('installed Storage SDK distinguishes explicit RLS, known-object hiding and validation failures', async () => {
  for (const [statusCode, message, operation, assertion, permitted] of [
    [403, 'new row violates row-level security policy', 'upload', assertStorageWriteDenied, true],
    [400, 'mime type not supported', 'upload', assertStorageWriteDenied, false],
    [404, 'Object not found', 'download', assertStorageReadDenied, true],
    [500, 'backend unavailable', 'download', assertStorageReadDenied, false],
  ]) {
    let requests = 0;
    const client = createClient('https://synthetic.test', 'sb_publishable_synthetic', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: async () => { requests++; return Response.json({ statusCode: String(statusCode), error: 'synthetic', message }, { status: 400 }); } },
    });
    const storage = client.storage.from('guest-receipts');
    const result = operation === 'upload' ? await storage.upload(row.object_path, new Uint8Array([1]), { upsert: false }) : await storage.download(row.object_path);
    if (permitted) assertion(result);
    else assert.throws(() => assertion(result), { name: 'AssertionError' });
    assert.equal(requests, 1);
  }
});
test('successful Storage writes and arbitrary errors never prove denial; counters and byte changes fail', () => {
  for (const result of [{ data: null, error: null }, { data: null, error: new Error('network') }, { data: null, error: { statusCode: '403', message: 'unsupported MIME' } }]) {
    assert.throws(() => assertStorageWriteDenied(result), { name: 'AssertionError' });
    assert.throws(() => assertStorageReadDenied(result), { name: 'AssertionError' });
  }
  const before = { metadataCount: 1, objectCount: 1, objects: [{ path: row.object_path, sha256: row.sha256 }] };
  assertOwnedStateUnchanged(before, structuredClone(before));
  for (const after of [{ ...before, metadataCount: 2 }, { ...before, objectCount: 2 }, { ...before, objects: [{ path: row.object_path, sha256: 'b'.repeat(64) }] }]) {
    assert.throws(() => assertOwnedStateUnchanged(before, after), { name: 'AssertionError' });
  }
});
test('empty successful reads and missing transport status are not metadata denial', () => {
  for (const result of [{ error: null, data: [], status: 200 }, { error: { code: '42501' }, data: null }, { error: new Error('network failed'), data: null, status: 0 }]) {
    assert.throws(() => assertMetadataDenied(result), { name: 'AssertionError' });
  }
});
