import assert from 'node:assert/strict';
import test from 'node:test';
import { handlePickupOrderRequest } from '../app/lib/pickup-order-http.ts';
import { normalizeConfiguredPickupIntent, quoteConfiguredPickupOrder } from '../app/lib/configured-order-quote.ts';
import { configuredFixture, id } from './configured-order-fixtures.mjs';
import { fixture, request, row as oldRow, input, catalog } from './pickup-order-fixtures.mjs';

function setup(kind = 'pizza', change = () => {}) {
  const c = configuredFixture(kind); change(c);
  const normalized = normalizeConfiguredPickupIntent(c.wire, 'pizza');
  assert.equal(normalized.ok, true);
  const intent = normalized.intent;
  const priced = quoteConfiguredPickupOrder(intent, c.snapshot);
  const f = fixture();
  const actor = oldRow.actor_id, business = c.snapshot.businessId;
  let stored = null;
  Object.assign(f.repository, {
    async resolveBusiness() { return business; },
    async findAttempt() { f.calls.push(['attempt']); return stored; },
    async configurationCapability() { f.calls.push(['capability']); return 'ready'; },
    async configuredCatalog(b, slug) { f.calls.push(['configuredCatalog', b, slug]); return c.snapshot; },
    async catalog() { assert.fail('v2 cannot read v1 catalog'); },
    async finalizeConfigured(a, b, i, q) {
      f.calls.push(['finalizeConfigured', a, b, i, q]); f.counters.writes++; f.counters.receiptChanges++;
      assert.equal(a, actor); assert.equal(b, business); assert.deepEqual(i, intent); assert.deepEqual(q, priced.quote);
      stored = { ...oldRow, business_id: business, request_id: i.requestId, receipt_id: i.receiptId, intent: i, quote: q, currency: q.currency, total_minor: q.totalMinor };
      return { code: 'created', order: stored };
    },
  });
  return { ...f, c, intent, priced, setStored(v) { stored = v; }, stored: () => stored };
}
async function post(f, wire = f.c.wire) {
  const response = await handlePickupOrderRequest(request('POST', '?slug=pizza', wire), 'collection', f.dependencies);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  return { response, body: await response.json() };
}
for (const kind of ['pizza', 'dozen', 'combo', 'extras']) test(`HTTP v2 trusted ${kind} quote, immutable replay and history`, async () => {
  const f = setup(kind);
  const created = await post(f);
  assert.equal(created.response.status, 201); assert.equal(created.body.order.version, 2);
  assert.equal(created.body.order.totalMinor, f.c.wire.expected.totalMinor);
  assert.deepEqual(created.body.order.lines[0].components, f.priced.quote.lines[0].components);
  assert.equal(JSON.stringify(created.body).includes('matrix'), false);
  assert.equal(JSON.stringify(created.body).includes('snapshotFingerprint'), false);
  assert.equal(f.counters.writes, 1); assert.equal(f.counters.receiptChanges, 1);
  f.repository.configurationCapability = f.repository.configuredCatalog = async () => assert.fail('replay before capability/catalog');
  const replay = await post(f); assert.equal(replay.response.status, 200); assert.deepEqual(replay.body, created.body);
  const recovered = await handlePickupOrderRequest(request('GET', `?slug=pizza&requestId=${f.intent.requestId}`), 'collection', f.dependencies);
  assert.equal(recovered.status, 200); assert.deepEqual(await recovered.json(), created.body);
  f.connection.findOrder = async () => f.stored();
  const history = await handlePickupOrderRequest(request('GET', ''), { id: oldRow.id }, f.dependencies);
  assert.equal(history.status, 200); assert.deepEqual(await history.json(), created.body); assert.equal(f.counters.writes, 1);
});
for (const capability of ['legacy_only', 'unavailable']) test(`v2 ${capability} never downgrades or consumes receipt`, async () => {
  const f = setup(); f.repository.configurationCapability = async () => capability;
  f.repository.configuredCatalog = async () => assert.fail('no snapshot without capability');
  const { response, body } = await post(f); assert.equal(response.status, 503); assert.equal(body.code, 'unavailable');
  assert.equal(f.counters.writes, 0); assert.equal(f.counters.receiptChanges, 0);
});
for (const scenario of ['expected', 'version', 'child', 'missing-rpc']) test(`v2 ${scenario} rejects without write`, async () => {
  const f = setup(scenario === 'child' ? 'combo' : 'pizza');
  if (scenario === 'expected') f.c.wire.expected.totalMinor++;
  if (scenario === 'version') f.c.wire.lines[0].selection.profileVersion++;
  if (scenario === 'child') f.c.snapshot.items.find(i => i.id === id(2)).is_available = false;
  if (scenario === 'missing-rpc') f.repository.configuredCatalog = async () => { throw Error('private missing RPC'); };
  const { response, body } = await post(f); assert.equal(response.status, scenario === 'version' ? 422 : scenario === 'missing-rpc' ? 503 : 409);
  assert.equal(body.code, ({ expected: 'quote_changed', version: 'invalid_selection', child: 'unavailable', 'missing-rpc': 'unavailable' })[scenario]);
  assert.equal(f.counters.writes, 0); assert.equal(f.counters.receiptChanges, 0);
});
test('same request different canonical contact conflicts without capability or write', async () => {
  const f = setup(); assert.equal((await post(f)).response.status, 201);
  f.repository.configurationCapability = async () => assert.fail('no capability');
  f.c.wire.contact.telephone = '987654321';
  const result = await post(f); assert.equal(result.response.status, 409); assert.equal(result.body.code, 'idempotency_conflict'); assert.equal(f.counters.writes, 1);
});
test('v1 active profile fence precedes v1 catalog and write', async () => {
  const f = fixture(); const snapshot = { ...catalog, version: 2, schemaVersion: 1, profiles: [{ business_id: oldRow.business_id, item_id: input.lines[0].itemId, version: 1, is_active: true, document: { schemaVersion: 1, kind: 'standard' } }] };
  f.repository.configurationCapability = async () => 'ready'; f.repository.configuredCatalog = async () => snapshot;
  f.repository.catalog = async () => assert.fail('profile fence before v1 price');
  const result = await post({ ...f, c: { wire: input } }); assert.equal(result.response.status, 422); assert.equal(result.body.code, 'invalid_selection'); assert.equal(f.counters.writes, 0);
});
test('ready v1 unprofiled request uses actual old fingerprint and finalizer', async () => {
  const f = fixture(); f.repository.configurationCapability = async () => 'ready'; f.repository.configuredCatalog = async () => ({ ...catalog, version: 2, schemaVersion: 1, fingerprint: 'b'.repeat(64), profiles: [] });
  const result = await post({ ...f, c: { wire: input } }); assert.equal(result.response.status, 201);
  assert.equal(f.calls.find(c => c[0] === 'finalize')[4].snapshotFingerprint, catalog.fingerprint); assert.equal(f.calls.find(c => c[0] === 'finalize')[3].version, 1);
});
test('v2 unknown finalization rereads once and never resubmits', async () => {
  const f = setup(); const finalize = f.repository.finalizeConfigured;
  f.repository.finalizeConfigured = async (...args) => { await finalize(...args); throw Error('response lost'); };
  const result = await post(f); assert.equal(result.response.status, 200); assert.equal(f.counters.writes, 1); assert.equal(f.calls.filter(c => c[0] === 'attempt').length, 2);
});
for (const code of ['invalid_receipt', 'receipt_used', 'idempotency_conflict', 'catalog_changed']) test(`v2 ${code} rechecks attempt with no receipt consume`, async () => {
  const f = setup(); f.repository.finalizeConfigured = async () => { f.counters.writes++; return { code }; };
  const result = await post(f); assert.equal(result.response.status, 409); assert.equal(result.body.code, code);
  assert.equal(f.counters.writes, 1); assert.equal(f.counters.receiptChanges, 0); assert.equal(f.calls.filter(c => c[0] === 'attempt').length, 2);
});
for (const field of ['actor_id', 'business_id', 'request_id', 'receipt_id']) test(`v2 foreign ${field} never adopted`, async () => {
  const f = setup(); const finalize = f.repository.finalizeConfigured;
  f.repository.finalizeConfigured = async (...args) => { const result = await finalize(...args); f.setStored(null); result.order[field] = id(98); return result; };
  const result = await post(f); assert.equal(result.response.status, 503); assert.equal(result.body.code, 'outcome_unknown'); assert.equal(f.counters.writes, 1);
});
for (const status of [409, 503, 404]) test(`verified refresh survives later ${status} without authorizing failure`, async () => {
  const f = setup();
  f.connection.getUser = async function () { this.state.setAll([{ name: 'refresh', value: 'synthetic', options: { httpOnly: true } }]); return { data: { user: { id: oldRow.actor_id } }, error: null }; };
  let response;
  if (status === 404) response = await handlePickupOrderRequest(request('GET', ''), { id: oldRow.id }, f.dependencies);
  else { if (status === 409) f.c.wire.expected.totalMinor++; else f.repository.configurationCapability = async () => 'unavailable'; response = (await post(f)).response; }
  assert.equal(response.status, status); assert.match(response.headers.get('set-cookie'), /refresh=synthetic/); assert.equal(f.counters.writes, 0);
});
for (const field of ['actorId', 'businessId', 'price']) test(`invalid ingress ${field} rejects before identity verification`, async () => {
  const f = setup(); f.c.wire[field] = oldRow.actor_id;
  const result = await post(f); assert.equal(result.response.status, 400); assert.deepEqual(f.calls, []); assert.equal(f.counters.writes, 0);
});
