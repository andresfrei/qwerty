import assert from 'node:assert/strict';
import test from 'node:test';
import { handlePickupOrderRequest } from '../app/lib/pickup-order-http.ts';
import { normalizeConfiguredPickupIntent, quoteConfiguredPickupOrder } from '../app/lib/configured-order-quote.ts';
import { validateOrder, requestOrder } from '../app/lib/pickup-order-client.ts';
import { configuredFixture, id } from './configured-order-fixtures.mjs';
import { fixture, row, request } from './pickup-order-fixtures.mjs';
function stored(kind = 'combo') {
  const f = configuredFixture(kind);
  const intent = normalizeConfiguredPickupIntent(f.wire, 'pizza').intent;
  const quote = quoteConfiguredPickupOrder(intent, f.snapshot).quote;
  return { ...row, business_id: f.snapshot.businessId, request_id: intent.requestId, receipt_id: intent.receiptId, intent, quote, total_minor: quote.totalMinor };
}
async function history(value) {
  const f = fixture(); f.connection.findOrder = async () => value;
  f.repository.configurationCapability = f.repository.configuredCatalog = f.repository.catalog = async () => assert.fail('history must not consult current catalog');
  const response = await handlePickupOrderRequest(request('GET', ''), { id: row.id }, f.dependencies);
  assert.equal(f.counters.writes, 0); assert.equal(f.counters.receiptChanges, 0);
  return { status: response.status, body: await response.json() };
}
for (const kind of ['pizza', 'dozen', 'combo', 'extras']) test(`stored ${kind} public history and client retain accepted snapshots`, async () => {
  const value = stored(kind), result = await history(value);
  assert.equal(result.status, 200);
  assert.deepEqual(validateOrder(result.body.order), result.body.order);
  const recovered = await requestOrder({ kind: 'recover', slug: 'pizza', requestId: value.request_id, intent: value.intent }, async (_url, init) => {
    assert.equal(init.method, 'GET'); return Response.json(result.body);
  });
  assert.equal(recovered.status, 'confirmed'); assert.deepEqual(recovered.order.lines, value.quote.lines);
  assert.equal(JSON.stringify(result.body).includes('business_id'), false);
  assert.equal(JSON.stringify(result.body).includes('fingerprint'), false);
});
const mutations = {
  contact: v => { v.quote.contact.name = 'Wrong'; },
  currency: v => { v.quote.lines[0].currency = 'USD'; },
  multiplication: v => { v.quote.lines[0].unitPriceMinor++; },
  total: v => { v.total_minor++; },
  kind: v => { v.quote.lines[0].profileKind = 'legacy'; },
  version: v => { v.quote.lines[0].profileVersion++; },
  selection: v => { v.quote.lines[0].selection.components[0].instanceIndex = 99; },
  component: v => { v.quote.lines[0].components[0].instanceIndex = 99; },
  childVersion: v => { v.quote.lines[0].components[0].profileVersion++; },
  missingComponent: v => { v.quote.lines[0].components.pop(); },
  optionBinding: v => { v.quote.lines[0].components[0].groups[0].picks[0].optionId = id(98); },
  privateField: v => { v.quote.lines[0].profiles = [{ private: true }]; },
  receipt: v => { v.receipt_id = id(98); },
  business: v => { v.business_id = id(98); },
  fingerprint: v => { v.quote.snapshotFingerprint = 'bad'; },
};
for (const [name, mutate] of Object.entries(mutations)) test(`history rejects malformed accepted ${name} without current pricing`, async () => {
  const value = stored(); mutate(value);
  const result = await history(value); assert.equal(result.status, 503); assert.deepEqual(result.body, { error: 'Order unavailable', code: 'unavailable' });
});
test('intent keeps identical halves while accepted quote selection deduplicates', async () => {
  const f = configuredFixture('pizza');
  const flavors = f.wire.lines[0].selection.groups.find(g => g.groupId === id(11));
  flavors.picks = [flavors.picks[0], { ...flavors.picks[0] }];
  f.wire.expected.totalMinor = 1_000_000;
  const intent = normalizeConfiguredPickupIntent(f.wire, 'pizza').intent;
  const priced = quoteConfiguredPickupOrder(intent, f.snapshot); assert.equal(priced.ok, true);
  const value = { ...row, business_id: f.snapshot.businessId, request_id: intent.requestId, receipt_id: intent.receiptId, intent, quote: priced.quote, total_minor: priced.quote.totalMinor };
  const result = await history(value); assert.equal(result.status, 200);
  assert.equal(intent.lines[0].selection.groups.find(g => g.groupId === id(11)).picks.length, 2);
  assert.ok(validateOrder(result.body.order, { intent }));
});
test('client submits explicit v2 once and never retries a correction', async () => {
  const f = configuredFixture(), { slug: _slug, ...intent } = normalizeConfiguredPickupIntent(f.wire, 'pizza').intent;
  let calls = 0;
  const result = await requestOrder({ kind: 'submit', slug: 'pizza', intent }, async (_url, init) => {
    calls++; assert.deepEqual(JSON.parse(init.body), intent);
    return Response.json({ error: 'Order unavailable', code: 'quote_changed' }, { status: 409 });
  });
  assert.deepEqual(result, { status: 'correctable', code: 'quote_changed' }); assert.equal(calls, 1);
});
test('client rejects v2 child metadata corruption rather than flattening it', async () => {
  const result = await history(stored()); assert.equal(result.status, 200);
  result.body.order.lines[0].components[0].groups[0].picks[0].quantity++;
  assert.equal(validateOrder(result.body.order), null);
});
