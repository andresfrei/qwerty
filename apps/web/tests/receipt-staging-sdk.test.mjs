import assert from 'node:assert/strict';
import test from 'node:test';
import { createServerClient } from '@supabase/ssr';
import { NextRequest } from 'next/server.js';
import { makePng } from './receipt-file-fixtures.mjs';
const actor = '11111111-1111-4111-8111-111111111111', business = '22222222-2222-4222-8222-222222222222', id = '33333333-3333-4333-8333-333333333333';
const path = `${business}/${actor}/${id}`, bytes = makePng();

test('installed SDK composes binary Storage and scoped REST without signed URLs/upsert', async () => {
  const { receiptServiceClient, createSupabaseReceiptRepository } = await import('../app/lib/receipt-staging-supabase.ts');
  const { createReceiptStaging } = await import('../app/lib/receipt-staging.ts');
  const requests = []; let metadata, uploaded;
  const client = receiptServiceClient({ url: 'https://synthetic.test', anonKey: 'sb_publishable_test', serviceKey: 'sb_secret_synthetic' }, async (input, init) => {
    const url = new URL(String(input)); requests.push({ url, init });
    assert.equal(new Headers(init.headers).get('authorization'), 'Bearer sb_secret_synthetic');
    assert.equal(init.cache, 'no-store');
    if (url.pathname === `/storage/v1/object/guest-receipts/${path}` && init.method === 'POST') {
      assert.equal(new Headers(init.headers).get('x-upsert'), 'false');
      assert.equal(new Headers(init.headers).get('content-type'), 'image/png');
      uploaded = Buffer.from(init.body); return Response.json({ Key: path });
    }
    if (url.pathname === '/rest/v1/guest_receipts' && init.method === 'POST') { metadata = JSON.parse(init.body); return new Response(null, { status: 201 }); }
    if (url.pathname === '/rest/v1/guest_receipts') {
      for (const [key, value] of Object.entries({ actor_id: actor, business_id: business, id, state: 'staged' })) assert.equal(url.searchParams.get(key), `eq.${value}`);
      return Response.json(metadata);
    }
    if (url.pathname === `/storage/v1/object/guest-receipts/${path}` && init.method === 'GET') return new Response(uploaded);
    assert.fail(`Unexpected SDK request ${url.pathname}`);
  });
  const service = createReceiptStaging(createSupabaseReceiptRepository(client), { randomId: () => id });
  assert.equal(await service.stage(actor, business, bytes), id); assert.deepEqual(uploaded, bytes);
  assert.deepEqual(Buffer.from((await service.download(actor, business, id)).bytes), bytes);
  assert.equal(requests.length, 4); assert.equal(requests.some(({ url }) => /sign|public/.test(url.pathname)), false);
});

test('installed SSR SDK verifies existing anonymous and registered identities with getUser only', async () => {
  const { handleReceiptRequest } = await import('../app/lib/receipt-http.ts');
  for (const anonymous of [true, false]) {
    const calls = []; const expires = Math.floor(Date.now() / 1000) + 3600;
    const token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: actor, exp: expires })).toString('base64url')}.synthetic`;
    const session = { access_token: token, refresh_token: 'synthetic-refresh', token_type: 'bearer', expires_at: expires, expires_in: 3600, user: { id: actor } };
    const cookie = `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;
    const request = new NextRequest('https://shop.test/api/checkout/receipts?slug=pizza', { method: 'POST', headers: { host: 'shop.test', origin: 'https://shop.test', 'content-type': 'application/octet-stream', cookie: `sb-synthetic-auth-token=${cookie}` }, body: bytes });
    const response = await handleReceiptRequest(request, undefined, {
      getConfig: () => ({ url: 'https://synthetic.test', anonKey: 'sb_publishable_test', serviceKey: 'sb_secret_test' }), getOrigin: () => 'https://shop.test',
      readBusiness: async () => ({ status: 'ok', businessId: business }),
      getUser: async (config, state) => createServerClient(config.url, config.anonKey, { cookies: { getAll: state.getAll, setAll: state.setAll }, global: { fetch: async (input, init) => {
        calls.push(String(input)); assert.equal(new Headers(init.headers).get('authorization'), `Bearer ${token}`);
        assert.equal(new URL(String(input)).pathname, '/auth/v1/user');
        return Response.json({ id: actor, is_anonymous: anonymous, aud: 'authenticated', role: 'authenticated' });
      } } }).auth.getUser(),
      staging: () => ({ stage: async (a, b) => { assert.equal(a, actor); assert.equal(b, business); return id; } }),
    });
    assert.equal(response.status, 201); assert.deepEqual(await response.json(), { receiptId: id }); assert.equal(calls.length, 1);
  }
});
