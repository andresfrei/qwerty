import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { normalizePickupIntent, quotePickupOrder } from '../app/lib/order-quote.ts';

// SOURCE checks, not a PostgreSQL parser, permissions test or concurrency simulator.
const migration = readFileSync(new URL('../../../supabase/migrations/20261002120000_mvp_pickup_orders.sql', import.meta.url), 'utf8');
const sql = migration.replace(/--[^\n]*/g, '');
const id = n => `81000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('SOURCE: narrow invoker entrypoints and immutable receipt/order permission surfaces', () => {
  assert.equal((sql.match(/CREATE FUNCTION/g) || []).length, 2);
  assert.equal((sql.match(/SECURITY INVOKER/g) || []).length, 2);
  assert.doesNotMatch(sql, /SECURITY DEFINER|BYPASSRLS|ALTER DEFAULT PRIVILEGES|LOCK TABLE|ON CONFLICT|\bEXECUTE\s+'/i);
  for (const signature of ['pickup_order_catalog(uuid, text)', 'finalize_pickup_order(uuid, uuid, jsonb, jsonb)']) {
    assert.ok(sql.includes(`REVOKE EXECUTE ON FUNCTION public.${signature}\n  FROM PUBLIC, anon, authenticated;`));
    assert.ok(sql.includes(`GRANT EXECUTE ON FUNCTION public.${signature} TO service_role;`));
  }
  assert.match(sql, /FORCE ROW LEVEL SECURITY/);
  assert.match(sql, /GRANT SELECT, INSERT ON public.pickup_orders TO service_role/);
  assert.doesNotMatch(sql, /(?:UPDATE|DELETE FROM)\s+public.guest_receipts/i);
  assert.doesNotMatch(sql, /GRANT[^;]*(?:UPDATE|DELETE)/i);
  assert.match(sql, /private.owner_email_verified\(\)/);
  assert.doesNotMatch(sql, /user_metadata|auth.jwt|email\s*=/i);
});

test('SOURCE: immediate nonnull durable keys, bound receipt and replay-before-fence ordering', () => {
  for (const column of ['actor_id', 'business_id', 'request_id', 'receipt_id']) {
    assert.ok(sql.includes(`${column} uuid NOT NULL`));
  }
  assert.match(sql, /UNIQUE \(actor_id, business_id, request_id\)/);
  assert.match(sql, /UNIQUE \(receipt_id\)/);
  assert.match(sql, /REFERENCES public.guest_receipts\(actor_id, business_id, id\) ON DELETE RESTRICT/);
  assert.doesNotMatch(sql, /DEFERRABLE/);
  assert.ok(sql.indexOf("'replayed'") < sql.indexOf('catalog := public.pickup_order_catalog'));
  assert.match(sql, /VOLATILE SECURITY INVOKER/);
  assert.match(sql, /transaction_isolation[^\n]*read committed/);
  assert.equal((sql.match(/pg_advisory_xact_lock/g) || []).length, 2);
  assert.match(sql, /EXCEPTION WHEN unique_violation THEN[\s\S]*SELECT \* INTO existing/);
});

test('SOURCE: canonical snapshot carries every quote input, defaults and publication', () => {
  const snapshot = sql.slice(sql.indexOf('WITH snapshot AS'), sql.indexOf('FROM snapshot;'));
  for (const key of ['version', 'businessId', 'slug', 'surchargeMinor', 'items', 'groups', 'options',
    'name', 'currency', 'is_available', 'price_minor', 'price_delta_minor', 'selection_mode',
    'min_select', 'max_select', 'sort_order', 'business_id', 'item_id', 'group_id']) {
    assert.ok(snapshot.includes(`'${key}'`), key);
  }
  assert.match(snapshot, /s.is_published/);
  assert.match(snapshot, /sha256\(convert_to\(payload::text, 'UTF8'\)\)/);
  assert.match(snapshot, /ORDER BY i.id/);
  assert.match(snapshot, /ORDER BY g.id/);
  assert.match(snapshot, /ORDER BY o.id/);
});

test('behavior: future SQL fixture agrees with existing trusted Node version-1 quote', () => {
  const input = { requestId: id(40), receiptId: id(20),
    contact: { name: 'Proof buyer', email: 'contact@fixture.invalid', telephone: '+54 111' },
    expected: { currency: 'ARS', totalMinor: 1000 },
    lines: [{ itemId: id(30), quantity: 1, selection: [] }] };
  const before = structuredClone(input);
  const normalized = normalizePickupIntent(input, 'proof-pickup-81000000');
  assert.equal(normalized.ok, true);
  const catalog = { version: 1, fingerprint: 'a'.repeat(64), businessId: id(10), slug: 'proof-pickup-81000000',
    surchargeMinor: 0,
    items: [{ id: id(30), business_id: id(10), name: 'Proof item', price_minor: 1000, currency: 'ARS', is_available: true }],
    groups: [{ id: id(50), business_id: id(10), item_id: id(30), name: 'Optional', selection_mode: 'distinct', min_select: 0, max_select: 1, sort_order: 0 }],
    options: [{ id: id(51), business_id: id(10), group_id: id(50), name: 'Extra', price_delta_minor: 100, is_available: true, sort_order: 0 }] };
  const result = quotePickupOrder(normalized.intent, catalog);
  assert.equal(result.ok, true);
  assert.equal(result.quote.totalMinor, 1000);
  assert.equal(result.quote.lines[0].selectionText, '');
  assert.deepEqual(input, before);
  assert.equal(normalized.intent.version, result.quote.version);
  assert.equal(Object.hasOwn(normalized.intent, 'snapshotFingerprint'), false);
});

