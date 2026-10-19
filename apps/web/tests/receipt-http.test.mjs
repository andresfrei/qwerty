import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server.js';
import { makePng } from './receipt-file-fixtures.mjs';

const actor = '11111111-1111-4111-8111-111111111111';
const business = '22222222-2222-4222-8222-222222222222';
const receipt = '33333333-3333-4333-8333-333333333333';
const origin = 'https://shop.test';
const bytes = Uint8Array.from(makePng());
const load = () => import('../app/lib/receipt-http.ts');
function setup(overrides = {}) {
  const calls = [], stored = [];
  const deps = {
    getConfig: () => ({ url: 'https://backend.test', anonKey: 'sb_publishable_test', serviceKey: 'sb_secret_test' }),
    getOrigin: () => origin,
    readBusiness: async () => { calls.push('publication'); return { status: 'ok', businessId: business }; },
    getUser: async () => { calls.push('auth'); return { data: { user: { id: actor, is_anonymous: true } }, error: null }; },
    staging: () => ({
      stage: async (a, b, value) => { calls.push('stage'); stored.push({ actor: a, business: b, bytes: value }); return receipt; },
      download: async (a, b, id) => { calls.push(['download', a, b, id]); return { bytes, contentType: 'image/png' }; },
    }),
    ...overrides,
  };
  return { deps, calls, stored };
}
function request({ method = 'POST', headers = {}, body = bytes, query = '?slug=pizza' } = {}) {
  return new NextRequest(`${origin}/api/checkout/receipts${query}`, { method, headers: { host: 'shop.test', origin, 'content-type': 'application/octet-stream', ...headers }, ...(method === 'GET' || method === 'HEAD' ? {} : { body, duplex: 'half' }) });
}
async function invoke(req, state, id) { return (await load()).handleReceiptRequest(req, id, state.deps); }
async function error(response, status, message) {
  assert.equal(response.status, status);
  assert.deepEqual(await response.json(), { error: message });
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('set-cookie'), null);
}

test('POST stages only the server identity/business and original bounded bytes', async () => {
  const state = setup(); const response = await invoke(request(), state);
  assert.equal(response.status, 201); assert.deepEqual(await response.json(), { receiptId: receipt });
  assert.deepEqual(state.calls, ['publication', 'auth', 'stage']);
  assert.deepEqual(state.stored, [{ actor, business, bytes }]);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
});
for (const method of ['PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD', 'GET']) {
  test(`collection ${method} has no effects`, async () => {
    const state = setup(); const response = await invoke(request({ method }), state);
    await error(response, 405, 'Method not allowed'); assert.equal(response.headers.get('allow'), 'POST'); assert.deepEqual(state.calls, []);
  });
}
for (const headers of [{ origin: 'https://evil.test' }, { host: 'evil.test' }, { 'x-forwarded-host': 'evil.test' }, { 'content-type': 'multipart/form-data' }, { 'content-encoding': 'gzip' }, { 'content-length': '10485761' }, { 'content-length': '-1' }]) {
  test(`rejects request headers before effects: ${JSON.stringify(headers)}`, async () => {
    const state = setup(); await error(await invoke(request({ headers }), state), headers['content-length'] === '10485761' ? 413 : 400, headers['content-length'] === '10485761' ? 'Receipt exceeds 10 MiB' : 'Request rejected'); assert.deepEqual(state.calls, []);
  });
}
for (const query of ['', '?slug=pizza&actor=spoof', '?slug=pizza&slug=other', '?slug=../private']) {
  test(`rejects non-contract query ${query}`, async () => { const state = setup(); await error(await invoke(request({ query }), state), 400, 'Request rejected'); assert.deepEqual(state.calls, []); });
}
for (const [label, overrides, status, message, calls] of [
  ['configuration', { getConfig: () => null }, 503, 'Receipt unavailable', []],
  ['unpublished', { readBusiness: async () => ({ status: 'not_found' }) }, 404, 'Receipt not found', []],
  ['provider failure', { readBusiness: async () => ({ status: 'unavailable' }) }, 503, 'Receipt unavailable', []],
  ['missing session', { getUser: async () => ({ data: { user: null }, error: null }) }, 401, 'Session required', ['publication']],
  ['unverified session', { getUser: async () => ({ data: { user: { id: actor } }, error: { message: 'secret' } }) }, 401, 'Session required', ['publication']],
  ['invalid actor', { getUser: async () => ({ data: { user: { id: 'email@example.test' } }, error: null }) }, 401, 'Session required', ['publication']],
]) {
  test(`${label} prevents body read and storage`, async () => {
    const state = setup(overrides); let read = 0;
    const body = new ReadableStream({ pull(controller) { read++; controller.enqueue(bytes); controller.close(); } }, { highWaterMark: 0 });
    await error(await invoke(request({ body }), state), status, message); assert.equal(read, 0); assert.deepEqual(state.calls, calls); assert.deepEqual(state.stored, []);
  });
}
for (const length of [undefined, '1']) {
  test(`actual streaming cap works with ${length ?? 'absent'} length`, async () => {
    const state = setup(); let cancelled = false;
    const body = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(10_485_760)); c.enqueue(new Uint8Array(1)); }, cancel() { cancelled = true; } });
    await error(await invoke(request({ body, headers: length ? { 'content-length': length } : {} }), state), 413, 'Receipt exceeds 10 MiB');
    assert.equal(cancelled, true); assert.deepEqual(state.calls, ['publication', 'auth']); assert.deepEqual(state.stored, []);
  });
}
test('declared length mismatch and empty body are rejected before staging', async () => {
  for (const options of [{ headers: { 'content-length': '1' } }, { body: new Uint8Array() }]) {
    const state = setup(); await error(await invoke(request(options), state), 400, 'Request rejected'); assert.deepEqual(state.stored, []);
  }
});
test('storage failure is opaque, retry works, and neither creates orders', async () => {
  const state = setup(); let count = 0;
  state.deps.staging = () => ({ stage: async () => { if (!count++) throw new Error('service secret'); return receipt; } });
  await error(await invoke(request(), state), 503, 'Receipt unavailable');
  const retry = await invoke(request(), state); assert.equal(retry.status, 201); assert.deepEqual(await retry.json(), { receiptId: receipt });
  assert.deepEqual(state.stored, []);
});
test('authorized GET delivers only attachment bytes, never URLs', async () => {
  const state = setup(); const response = await invoke(request({ method: 'GET' }), state, receipt);
  assert.equal(response.status, 200); assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.equal(response.headers.get('content-disposition'), 'attachment; filename="receipt.png"');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(state.calls, ['publication', 'auth', ['download', actor, business, receipt]]);
});
test('unknown, foreign actor/business and invalid IDs use the same opaque 404', async () => {
  for (const id of [receipt, 'not-a-uuid']) {
    const state = setup({ staging: () => ({ download: async () => null }) });
    await error(await invoke(request({ method: 'GET' }), state, id), 404, 'Receipt not found');
  }
});
test('GET rejects Origin when supplied cross-origin; no origin is allowed for navigation', async () => {
  const state = setup(); await error(await invoke(request({ method: 'GET', headers: { origin: 'https://evil.test' } }), state, receipt), 400, 'Request rejected'); assert.deepEqual(state.calls, []);
  const req = request({ method: 'GET' }); req.headers.delete('origin'); assert.equal((await invoke(req, state, receipt)).status, 200);
});
