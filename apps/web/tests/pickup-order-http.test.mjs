import assert from 'node:assert/strict';
import test from 'node:test';
import { handlePickupOrderRequest as handle } from '../app/lib/pickup-order-http.ts';
import { actor, business, requestId, receiptId, id, other, input, intent, catalog, quote, row, dto, request, fixture } from './pickup-order-fixtures.mjs';
async function result(req, target, f, status, body) {
  const response = await handle(req, target === 'collection' || target === 'queue' ? target : { id: target }, f.dependencies);
  assert.equal(response.status, status); assert.deepEqual(await response.json(), body);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  return response;
}
const failed = code => ({ error: 'Order unavailable', code });
const unknown = { error: 'Order outcome unknown', code: 'outcome_unknown', requestId };
test('POST binds verified actor, quotes in Node and returns only whitelisted immutable data', async () => {
  const f = fixture(); await result(request(), 'collection', f, 201, { order: dto });
  assert.deepEqual(f.calls.find(x => x[0] === 'finalize'), ['finalize', actor, business, intent, quote]);
  assert.equal(f.counters.writes, 1); assert.equal(f.counters.receiptChanges, 0);
});
test('replay is full normalized JSON equality before publication or repricing', async () => {
  const f = fixture({ repository: { async catalog() { assert.fail('no replay pricing'); } } });
  // JSON object key order is immaterial, including nested objects.
  f.rows.push({ ...row, intent: { lines: intent.lines, expected: intent.expected, contact: { telephone: input.contact.telephone, email: input.contact.email, name: 'Buyer' }, receiptId, requestId, slug: 'pizza', version: 1 } });
  const trimmed = { ...input, contact: { ...input.contact, name: ' Buyer ' } };
  await result(request('POST', '?slug=pizza', trimmed), 'collection', f, 200, { order: dto });
  assert.equal(f.counters.writes, 0); assert.equal(f.calls.some(x => x[0] === 'catalog'), false);
});
for (const [name, change] of [
  ['contact', x => { x.contact.telephone = '1198765432'; }], ['receipt', x => { x.receiptId = other; }],
  ['expected', x => { x.expected.totalMinor = 101; }], ['lines', x => { x.lines[0].quantity = 2; }],
]) test(`same key changed ${name} conflicts without writing`, async () => {
  const f = fixture(); f.rows.push(row); const body = structuredClone(input); change(body);
  await result(request('POST', '?slug=pizza', body), 'collection', f, 409, failed('idempotency_conflict'));
  assert.equal(f.counters.writes, 0); assert.equal(f.rows.length, 1);
});
for (const [name, make] of [
  ['origin', () => request('POST', '?slug=pizza', input, { origin: 'https://evil.test' })],
  ['host', () => request('POST', '?slug=pizza', input, { host: 'evil.test' })],
  ['duplicate query', () => request('POST', '?slug=pizza&slug=pizza')],
  ['unknown query', () => request('POST', '?slug=pizza&actor=forged')],
  ['invalid slug', () => request('POST', '?slug=../pizza')],
  ['unknown field', () => request('POST', '?slug=pizza', { ...input, actor_id: other })],
  ['client price', () => request('POST', '?slug=pizza', { ...input, price: 1 })],
  ['bad UUID', () => request('POST', '?slug=pizza', { ...input, requestId: 'x' })],
  ['bad contact', () => request('POST', '?slug=pizza', { ...input, contact: { ...input.contact, email: 'x' } })],
  ['invalid JSON', () => request('POST', '?slug=pizza', '{')],
  ['wrong media', () => request('POST', '?slug=pizza', input, { 'content-type': 'text/plain' })],
  ['encoding', () => request('POST', '?slug=pizza', input, { 'content-encoding': 'gzip' })],
  ['length mismatch', () => request('POST', '?slug=pizza', input, { 'content-length': '1' })],
]) test(`rejects ${name} before Auth/reads/writes`, async () => {
  const f = fixture(); await result(make(), 'collection', f, 400, { error: 'Request rejected' });
  assert.deepEqual(f.calls, []); assert.equal(f.counters.writes, 0); assert.deepEqual(f.rows, []); assert.equal(f.counters.receiptChanges, 0);
});
for (const declared of [false, true]) test(`bounded JSON ${declared ? 'declared' : 'streamed'} oversize has no effects`, async () => {
  const f = fixture(); await result(request('POST', '?slug=pizza', ' '.repeat(1_048_577), declared ? { 'content-length': '1048577' } : {}), 'collection', f, 413, { error: 'Request too large' });
  assert.deepEqual(f.calls, []); assert.equal(f.counters.writes, 0);
});
for (const user of [null, { id: 'invalid' }]) test('missing prepared server identity cannot submit or sign up', async () => {
  const f = fixture({ connection: { async getUser() { return { data: { user }, error: null }; } } });
  await result(request(), 'collection', f, 401, { error: 'Session required' }); assert.equal(f.counters.writes, 0); assert.equal(f.calls.some(x => x[0] === 'service'), false);
});
test('getUser error does not disclose provider payload or commit staged clearing cookie', async () => {
  const f = fixture({ connection: { async getUser() { this.state.setAll([{ name: 'prior', value: '', options: { maxAge: 0 } }]); return { data: { user: { id: actor } }, error: { message: 'private provider details' } }; } } });
  const response = await result(request(), 'collection', f, 401, { error: 'Session required' }); assert.equal(response.headers.get('set-cookie'), null); assert.equal(f.counters.writes, 0);
});
test('verified staged refresh survives authorized success and unknown outcome', async () => {
  for (const lost of [false, true]) {
    const f = fixture({ connection: { async getUser() { this.state.setAll([{ name: 'refresh', value: 'synthetic', options: { httpOnly: true } }]); return { data: { user: { id: actor } }, error: null }; } } });
    if (lost) f.repository.finalize = async () => { throw new Error('private timeout'); };
    const response = await result(request(), 'collection', f, lost ? 503 : 201, lost ? unknown : { order: dto }); assert.match(response.headers.get('set-cookie'), /refresh=synthetic/);
  }
});
for (const code of ['invalid_request', 'idempotency_conflict', 'receipt_used', 'invalid_receipt', 'invalid_quote', 'mixed_currency', 'unavailable', 'catalog_changed']) test(`SQL ${code} is fixed public rejection after fresh scoped lookup`, async () => {
  const f = fixture({ repository: { async finalize() { return { code, secret: 'never expose' }; } } });
  await result(request(), 'collection', f, ['invalid_request', 'mixed_currency'].includes(code) ? 422 : code === 'invalid_quote' ? 503 : 409, failed(code === 'invalid_quote' ? 'unavailable' : code));
  assert.equal(f.calls.filter(x => x[0] === 'attempt').length, 2); assert.equal(f.counters.writes, 0);
});
for (const scenario of ['gate', 'price', 'rpc-rejection', 'rpc-throw']) test(`fresh winner recovers ${scenario} race without a second finalize`, async () => {
  const f = fixture();
  if (scenario === 'gate' || scenario === 'price') f.repository.catalog = async () => { f.rows.push(row); return scenario === 'gate' ? null : { ...catalog, items: [{ ...catalog.items[0], price_minor: 101 }] }; };
  else f.repository.finalize = async () => { f.rows.push(row); if (scenario === 'rpc-throw') throw Error('timeout'); return { code: 'receipt_used' }; };
  await result(request(), 'collection', f, 200, { order: dto }); assert.equal(f.rows.length, 1); assert.equal(f.counters.writes, 0);
});
test('lost finalization response is unknown until same-key recovery sees committed order', async () => {
  const f = fixture(); let visible = false;
  f.repository.findAttempt = async () => visible ? row : null;
  f.repository.finalize = async () => { f.counters.writes++; f.rows.push(row); throw Error('response lost'); };
  await result(request(), 'collection', f, 503, unknown); visible = true;
  await result(request('GET', `?slug=pizza&requestId=${requestId}`), 'collection', f, 200, { order: dto }); assert.equal(f.counters.writes, 1); assert.equal(f.rows.length, 1);
});
test('recovery miss is unknown, never a permanent absence or permission to replace key', async () => {
  const f = fixture(); await result(request('GET', `?slug=pizza&requestId=${requestId}`), 'collection', f, 503, unknown); assert.equal(f.counters.writes, 0);
});
for (const field of ['actor_id', 'business_id', 'request_id', 'receipt_id']) test(`privileged response cannot cross ${field} binding`, async () => {
  const f = fixture({ repository: { async finalize() { return { code: 'created', order: { ...row, [field]: other } }; } } });
  await result(request(), 'collection', f, 503, unknown);
});
test('new price and mixed currencies reject without RPC, never return trusted quote internals', async () => {
  for (const mixed of [false, true]) {
    const f = fixture(); const body = structuredClone(input);
    f.repository.catalog = async () => mixed ? { ...catalog, items: [...catalog.items, { ...catalog.items[0], id: other, currency: 'USD' }] } : { ...catalog, items: [{ ...catalog.items[0], price_minor: 101 }] };
    if (mixed) body.lines.push({ itemId: other, quantity: 1, selection: [] });
    await result(request('POST', '?slug=pizza', body), 'collection', f, mixed ? 422 : 409, failed(mixed ? 'mixed_currency' : 'quote_changed')); assert.equal(f.counters.writes, 0);
  }
});
test('known ID is authenticated RLS-only, minimal DTO; foreign/not visible gets indistinguishable 404', async () => {
  for (const found of [null, row]) {
    const f = fixture({ connection: { async findOrder(value) { assert.equal(value, id); return found; } } });
    await result(request('GET', ''), id, f, found ? 200 : 404, found ? { order: dto } : { error: 'Order not found' });
    assert.equal(f.calls.some(x => x[0] === 'service'), false); assert.equal(f.counters.writes, 0);
  }
});
for (const user of [{ id: actor, is_anonymous: true, email_confirmed_at: 'now' }, { id: actor, is_anonymous: false }, { id: actor, user_metadata: { email_confirmed_at: 'now' } }]) test('owner queue rejects anonymous/unconfirmed/metadata identity before rows', async () => {
  const f = fixture({ connection: { async getUser() { return { data: { user }, error: null }; } } });
  await result(request('GET', `?businessId=${business}`), 'queue', f, 403, { error: 'Owner access required' }); assert.equal(f.calls.some(x => x[0] === 'queue' || x[0] === 'service'), false);
});
test('confirmed-owner queue calls one authorized reader, cannot fall back to buyer reads', async () => {
  const f = fixture({ connection: { async getUser() { return { data: { user: { id: actor, is_anonymous: false, email_confirmed_at: '2026-01-01' } }, error: null }; }, async queue(a, b) { assert.equal(a, actor); assert.equal(b, business); return [{ ...row, businesses: { id: business, owner_id: actor } }]; } } });
  await result(request('GET', `?businessId=${business}`), 'queue', f, 200, { orders: [dto] }); assert.equal(f.calls.some(x => x[0] === 'service'), false);
});
test('empty queue does not disclose existence; malformed membership binding fails closed', async () => {
  for (const rows of [[], [{ ...row, businesses: { id: business, owner_id: other } }]]) {
    const f = fixture({ connection: { async getUser() { return { data: { user: { id: actor, is_anonymous: false, email_confirmed_at: 'now' } }, error: null }; }, async queue() { return rows; } } });
    await result(request('GET', `?businessId=${business}`), 'queue', f, rows.length ? 503 : 200, rows.length ? failed('unavailable') : { orders: [] });
  }
});
for (const [method, query, target] of [['GET', '?slug=pizza', 'collection'], ['GET', '?businessId=bad', 'queue'], ['GET', '?email=buyer@fixture.invalid', 'collection'], ['GET', '?slug=pizza', id], ['PATCH', '', id], ['POST', '', 'queue']]) test(`reject unsupported ${method} ${query} ${target}`, async () => {
  const f = fixture(), unsupported = method !== 'GET';
  const r = await result(request(method, query), target, f, unsupported ? 405 : 400, { error: unsupported ? 'Method not allowed' : 'Request rejected' });
  if (unsupported) assert.equal(r.headers.get('allow'), 'GET'); assert.deepEqual(f.calls, []);
});
test('fresh conflict winner compares entire intent rather than adopting its ID', async () => {
  const f = fixture(); f.repository.catalog = async () => { f.rows.push({ ...row, intent: { ...intent, contact: { ...intent.contact, telephone: '1198765432' } }, quote: { ...quote, contact: { ...intent.contact, telephone: '1198765432' } } }); return null; };
  await result(request(), 'collection', f, 409, failed('idempotency_conflict')); assert.equal(f.counters.writes, 0);
});
test('unpublished routing and unavailable/foreign catalog cannot create new orders', async () => {
  for (const value of [null, { ...catalog, businessId: other }]) {
    const f = fixture({ repository: { async catalog() { return value; } } });
    await result(request(), 'collection', f, 409, failed('unavailable')); assert.equal(f.counters.writes, 0); assert.equal(f.calls.filter(x => x[0] === 'attempt').length, 2);
  }
});
for (const value of [null, { code: 'unexpected-provider-status', credentials: 'private' }, { code: 'created', order: null }]) test('unrecognized/malformed RPC result remains unknown without resubmission', async () => {
  const f = fixture({ repository: { async finalize() { return value; } } });
  await result(request(), 'collection', f, 503, unknown); assert.equal(f.counters.writes, 0); assert.equal(f.calls.filter(x => x[0] === 'attempt').length, 2);
});
test('recovery verifies actor/business/request binding before disclosure', async () => {
  for (const field of ['actor_id', 'business_id', 'request_id']) {
    const f = fixture({ repository: { async findAttempt() { return { ...row, [field]: other }; } } });
    await result(request('GET', `?slug=pizza&requestId=${requestId}`), 'collection', f, 503, unknown); assert.equal(f.counters.writes, 0);
  }
});
test('known-ID nonbuyer access also requires verified nonanonymous owner identity', async () => {
  for (const user of [{ id: actor, is_anonymous: true, email_confirmed_at: 'now' }, { id: actor, is_anonymous: false }, { id: actor, is_anonymous: false, email_confirmed_at: 'now' }]) {
    const confirmed = user.is_anonymous === false && Boolean(user.email_confirmed_at);
    const f = fixture({ connection: { async getUser() { return { data: { user }, error: null }; }, async findOrder() { return { ...row, actor_id: other }; } } });
    await result(request('GET', ''), id, f, confirmed ? 200 : 404, confirmed ? { order: dto } : { error: 'Order not found' }); assert.equal(f.counters.writes, 0);
  }
});
test('registered unverified buyer may submit only as its current server actor', async () => {
  const f = fixture({ connection: { async getUser() { return { data: { user: { id: actor, is_anonymous: false } }, error: null }; } } });
  await result(request(), 'collection', f, 201, { order: dto }); assert.equal(f.counters.writes, 1);
});
test('read failures sanitize provider details; known ID must bind returned ID', async () => {
  for (const findOrder of [async () => { throw Error('private provider body'); }, async () => ({ ...row, id: other }), async () => ({ ...row, quote: { ...quote, lines: [{ ...quote.lines[0], lineTotalMinor: 99 }] } })]) {
    const f = fixture({ connection: { findOrder } }); await result(request('GET', ''), id, f, 503, failed('unavailable')); assert.equal(f.counters.writes, 0);
  }
});
test('verified refresh remains staged on forbidden owner queue but never authorizes it', async () => {
  const f = fixture({ connection: { async getUser() { this.state.setAll([{ name: 'refresh', value: 'synthetic', options: { httpOnly: true } }]); return { data: { user: { id: actor, is_anonymous: true } }, error: null }; } } });
  const r = await result(request('GET', `?businessId=${business}`), 'queue', f, 403, { error: 'Owner access required' }); assert.match(r.headers.get('set-cookie'), /refresh=synthetic/); assert.equal(f.counters.writes, 0);
});
test('missing configuration never invokes Auth or persistence', async () => {
  const f = fixture({ dependencies: { getConfig: () => null } }); await result(request(), 'collection', f, 503, failed('unavailable')); assert.deepEqual(f.calls, []);
});
test('dependency exceptions are sanitized and no writes occur before finalize', async () => {
  for (const name of ['resolveBusiness', 'findAttempt', 'catalog']) {
    const f = fixture({ repository: { async [name]() { throw Error('credentials and provider body'); } } });
    await result(request(), 'collection', f, 503, name === 'findAttempt' ? unknown : name === 'catalog' ? unknown : failed('unavailable')); assert.equal(f.counters.writes, 0);
  }
});
