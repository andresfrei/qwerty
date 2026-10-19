import { NextRequest } from 'next/server.js';
import { normalizePickupIntent, quotePickupOrder } from '../app/lib/order-quote.ts';
export const actor = '11111111-1111-4111-8111-111111111111';
export const business = '22222222-2222-4222-8222-222222222222';
export const requestId = '33333333-3333-4333-8333-333333333333';
export const receiptId = '44444444-4444-4444-8444-444444444444';
export const itemId = '55555555-5555-4555-8555-555555555555';
export const id = '66666666-6666-4666-8666-666666666666';
export const other = '77777777-7777-4777-8777-777777777777';
export const config = { url: 'https://synthetic.test', anonKey: 'sb_publishable_synthetic', serviceKey: 'sb_secret_synthetic' };
export const input = { requestId, receiptId, contact: { name: 'Buyer', email: 'buyer@fixture.invalid', telephone: '1123456789' }, expected: { currency: 'ARS', totalMinor: 100 }, lines: [{ itemId, quantity: 1, selection: [] }] };
export const intent = normalizePickupIntent(input, 'pizza').intent;
export const catalog = { version: 1, fingerprint: 'a'.repeat(64), businessId: business, slug: 'pizza', surchargeMinor: 0, items: [{ id: itemId, business_id: business, name: 'Pizza', price_minor: 100, currency: 'ARS', is_available: true }], groups: [], options: [] };
export const quote = quotePickupOrder(intent, catalog).quote;
export const row = { id, actor_id: actor, business_id: business, request_id: requestId, receipt_id: receiptId, intent, quote, currency: 'ARS', total_minor: 100, fulfillment_state: 'pendiente_de_pago', payment_state: 'pendiente', created_at: '2026-10-20T00:00:00+00:00' };
export const dto = { id, requestId, receiptId, currency: 'ARS', totalMinor: 100, fulfillmentState: 'pendiente_de_pago', paymentState: 'pendiente', createdAt: row.created_at, contact: input.contact, lines: [{ itemId, name: 'Pizza', quantity: 1, unitPriceMinor: 100, lineTotalMinor: 100, selectionText: '' }] };
export function request(method = 'POST', query = '?slug=pizza', body = input, headers = {}) {
  return new NextRequest(`https://shop.test/api/checkout/orders${query}`, { method, headers: { host: 'shop.test', ...(method === 'POST' ? { origin: 'https://shop.test', 'content-type': 'application/json' } : {}), ...headers }, ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) });
}
export function fixture(overrides = {}) {
  const calls = [], rows = [], counters = { writes: 0, receiptChanges: 0 };
  const repository = {
    async resolveBusiness(slug) { calls.push(['business', slug]); return business; },
    async findAttempt(a, b, r) { calls.push(['attempt', a, b, r]); return rows.find(x => x.actor_id === a && x.business_id === b && x.request_id === r) ?? null; },
    async catalog(b, slug) { calls.push(['catalog', b, slug]); return structuredClone(catalog); },
    async finalize(a, b, i, q) { calls.push(['finalize', a, b, i, q]); counters.writes++; rows.push(structuredClone(row)); return { code: 'created', order: rows[0] }; },
    ...overrides.repository,
  };
  const connection = {
    async getUser() { calls.push(['user']); return { data: { user: { id: actor, is_anonymous: true } }, error: null }; },
    service() { calls.push(['service']); return repository; },
    async findOrder(orderId) { calls.push(['read', orderId]); return null; },
    async queue(a, b) { calls.push(['queue', a, b]); return []; },
    ...overrides.connection,
  };
  const dependencies = { getConfig: () => config, getOrigin: () => 'https://shop.test', connect: (_config, state) => { calls.push(['connect']); connection.state = state; return connection; }, ...overrides.dependencies };
  return { dependencies, connection, repository, rows, counters, calls };
}
