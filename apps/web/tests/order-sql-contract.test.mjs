import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { normalizePickupIntent, quotePickupOrder } from '../app/lib/order-quote.ts';

// SOURCE checks, not a PostgreSQL parser, permissions test or concurrency simulator.
const migration = readFileSync(new URL('../../../supabase/migrations/20261002120000_mvp_pickup_orders.sql', import.meta.url), 'utf8');
const proof = readFileSync(new URL('../../../supabase/tests/database/mvp_pickup_orders.remote.sql', import.meta.url), 'utf8');
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

test('SOURCE: effective RPC EXECUTE assertions distinguish ACL denial from downstream 42501 errors', () => {
  const proofSql = proof.replace(/--[^\n]*/g, '');
  const firstInvocation = proofSql.indexOf('catalog := public.pickup_order_catalog');
  for (const signature of ['public.pickup_order_catalog(uuid,text)', 'public.finalize_pickup_order(uuid,uuid,jsonb,jsonb)']) {
    for (const [role, allowed] of [['anon', false], ['authenticated', false], ['service_role', true]]) {
      const assertion = `IF has_function_privilege('${role}', '${signature}', 'EXECUTE') IS DISTINCT FROM ${allowed} THEN`;
      const position = proofSql.indexOf(assertion);
      assert.ok(position >= 0, `missing effective EXECUTE assertion: ${role}/${signature}=${allowed}`);
      assert.ok(position < firstInvocation, 'effective ACL assertion must precede function invocation');
      assert.match(proofSql.slice(position + assertion.length), /^\s*RAISE EXCEPTION '[^']+';\s*END IF;/);
    }
  }
  assert.equal((proofSql.match(/has_function_privilege\(/g) || []).length, 6);
  assert.doesNotMatch(proofSql, /has_function_privilege\(\s*'public'/i);
  // Invocation 42501 probes remain supplemental: INVOKER table reads can also
  // raise that SQLSTATE even when function EXECUTE was accidentally exposed.
  for (const call of ['PERFORM public.finalize_pickup_order(buyer, business, intent, quote);',
    "PERFORM public.pickup_order_catalog(business, 'proof-pickup-81000000');"]) {
    const position = proofSql.indexOf(call);
    assert.ok(position >= 0);
    assert.match(proofSql.slice(position + call.length), /^\s*EXCEPTION WHEN insufficient_privilege THEN denied := true;/);
  }
});

test('SOURCE: reader expectation keeps CASE parenthesized inside the PLpgSQL IF expression', () => {
  assert.ok(proof.includes('IF visible_count <> (CASE WHEN role_name = stranger::text THEN 0 ELSE 1 END) THEN'));
  assert.doesNotMatch(proof, /IF visible_count <> CASE WHEN/);
});

test('SOURCE: fixture hierarchy supplies required category and explicit settings columns', () => {
  const categoryInsert = proof.indexOf('INSERT INTO public.catalog_categories(id, business_id, name)');
  const itemInsert = proof.indexOf('INSERT INTO public.catalog_items(id, business_id, category_id, name, price_minor, currency)');
  assert.ok(categoryInsert >= 0 && itemInsert > categoryInsert, 'same-business category must precede item');
  assert.ok(proof.includes("category uuid := '81000000-0000-4000-8000-000000000031'"));
  assert.match(proof, /VALUES \(category, business, 'Proof category'\)/);
  assert.match(proof, /VALUES \(item, business, category, 'Proof item', 1000, 'ARS'\)/);
  assert.match(proof, /INSERT INTO public.business_catalog_settings\(business_id, two_flavor_surcharge_minor\)/);
  assert.doesNotMatch(proof, /INSERT INTO public\.\w+ VALUES/);
});

test('SOURCE: collision refusal and rollback both cover every exact fixture binding', () => {
  const before = proof.slice(proof.indexOf('IF EXISTS (SELECT 1 FROM auth.users'), proof.indexOf('SELECT count(*) INTO receipt_count'));
  const after = proof.slice(proof.lastIndexOf('IF EXISTS (SELECT 1 FROM auth.users'));
  for (const fragment of [
    'public.catalog_categories WHERE id = category OR business_id IN (business, other_business)',
    'public.catalog_items WHERE id = item OR business_id IN (business, other_business)',
    'public.catalog_option_groups WHERE id =', 'public.catalog_options WHERE id =',
    'public.business_catalog_settings WHERE business_id IN (business, other_business)',
    'public.business_storefronts WHERE business_id IN (business, other_business)',
    'public.guest_receipts WHERE id = receipt OR business_id IN (business, other_business)',
    'public.pickup_orders WHERE business_id IN (business, other_business)',
    "request_id IN ('81000000-0000-4000-8000-000000000040', '81000000-0000-4000-8000-000000000041')",
    "storage.objects WHERE bucket_id = 'guest-receipts' AND name =",
  ]) {
    assert.ok(before.includes(fragment), `prewrite collision: ${fragment}`);
    assert.ok(after.includes(fragment), `postrollback residue: ${fragment}`);
  }
});

test('SOURCE: receipt uniqueness probe cannot fail an unrelated actor FK first', () => {
  const start = proof.indexOf('-- Direct trusted-writer probes');
  const end = proof.indexOf("IF NOT denied THEN RAISE EXCEPTION 'receipt binding/uniqueness missing'", start);
  assert.match(proof.slice(start, end), /VALUES \(buyer, business, '81000000-0000-4000-8000-000000000041', receipt, intent, quote, 'ARS', 1000\);\s*EXCEPTION WHEN unique_violation/);
  assert.doesNotMatch(proof, /gen_random_uuid\(\)/);
});

test('SOURCE: owner identity mutation is denied as app role, not treated as an ownership-transfer feature', () => {
  assert.match(proof, /SET LOCAL ROLE authenticated;\s*denied := false;\s*BEGIN\s*UPDATE public.businesses SET owner_id = stranger WHERE id = business;\s*EXCEPTION WHEN insufficient_privilege THEN denied := true;/);
  assert.match(proof, /IF NOT denied THEN RAISE EXCEPTION 'owner identity UPDATE accepted'/);
  assert.match(proof, /owner_id FROM public.businesses WHERE id = business\) IS DISTINCT FROM owner_actor/);
  assert.ok(proof.includes('-- Operator-only synthetic ownership rewrite; not an app transfer feature.'));
  assert.ok(proof.includes("IF visible_count <> 0 THEN RAISE EXCEPTION 'former owner still authorized'"));
  assert.ok(proof.includes("IF visible_count <> 1 THEN RAISE EXCEPTION 'current confirmed owner not authorized'"));
  for (const column of ['fulfillment_state', 'payment_state']) {
    assert.ok(proof.includes(`UPDATE public.pickup_orders SET ${column} =`), `immutable ${column}`);
  }
});

test('SOURCE: future engine packet is bounded and rollback-only, not an execution runner', () => {
  assert.ok(proof.startsWith('-- NOT EXECUTED.'));
  assert.match(proof, /SET LOCAL statement_timeout = '20s'/);
  assert.match(proof, /fixture collision/);
  assert.match(proof, /RAISE SQLSTATE 'QW001'/);
  assert.match(proof, /rollback residue/);
  assert.ok(proof.trimEnd().endsWith('ROLLBACK;'));
  assert.doesNotMatch(proof, /\bCOMMIT\b|TRUNCATE|DROP\s|CREATE\s+(?:FUNCTION|EXTENSION)/i);
});
