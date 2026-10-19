import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareRemoteRunEnvironment } from '../../../supabase/tests/storage/guest-receipt-active-config.mjs';
const remote = 'https://jxebudqzcmxgdsegrrqw.supabase.co';
const base = {
  NEXT_PUBLIC_SUPABASE_URL: remote,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
  SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_fixture',
  RECEIPT_S12_REVIEWED: 'yes', RECEIPT_OWNER_GUARD_VERIFIED: 'yes',
};
const passwords = ['fixture-password-a', 'fixture-password-b'];

test('operator uses active app pair, not an unused legacy URL', () => {
  const input = { ...base, SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_ANON_KEY: 'sb_publishable_old' };
  const before = { ...input };
  const actual = prepareRemoteRunEnvironment(input, passwords);
  assert.equal(actual.RECEIPT_REMOTE_URL, remote);
  assert.equal(actual.RECEIPT_REMOTE_ANON_KEY, base.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  assert.equal(actual.RECEIPT_REMOTE_SERVICE_KEY, base.SUPABASE_SERVICE_ROLE_KEY);
  assert.deepEqual(input, before);
  assert.deepEqual(Object.keys(actual).sort(), ['RECEIPT_REMOTE_URL', 'RECEIPT_REMOTE_PROJECT', 'RECEIPT_REMOTE_ANON_KEY', 'RECEIPT_REMOTE_SERVICE_KEY', 'RECEIPT_S12_REVIEWED', 'RECEIPT_OWNER_GUARD_VERIFIED', 'RECEIPT_OWNER_A_PASSWORD', 'RECEIPT_OWNER_B_PASSWORD'].sort());
});
test('active foreign target is rejected even when legacy fallback is correct', () => {
  assert.throws(() => prepareRemoteRunEnvironment({ ...base, NEXT_PUBLIC_SUPABASE_URL: 'https://other.supabase.co', SUPABASE_URL: remote }, passwords), { message: 'REFUSED: active backend configuration' });
});
test('incomplete official pair cannot silently fall back to legacy pair', () => {
  assert.throws(() => prepareRemoteRunEnvironment({ ...base, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined, SUPABASE_URL: remote, SUPABASE_ANON_KEY: 'sb_publishable_legacy' }, passwords), { message: 'REFUSED: active backend configuration' });
});
test('server-only active pair keeps the existing app behavior', () => {
  const actual = prepareRemoteRunEnvironment({ SUPABASE_URL: remote, SUPABASE_ANON_KEY: 'sb_publishable_server', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_fixture', RECEIPT_S12_REVIEWED: 'yes', RECEIPT_OWNER_GUARD_VERIFIED: 'yes' }, passwords);
  assert.equal(actual.RECEIPT_REMOTE_URL, remote);
  assert.equal(actual.RECEIPT_REMOTE_ANON_KEY, 'sb_publishable_server');
});
test('explicit contradictory proof target is rejected', () => {
  assert.throws(() => prepareRemoteRunEnvironment({ ...base, RECEIPT_REMOTE_URL: 'https://other.supabase.co' }, passwords), { message: 'REFUSED: explicit proof target' });
});
test('missing reviewed guard attestation still refuses run', () => {
  assert.throws(() => prepareRemoteRunEnvironment({ ...base, RECEIPT_OWNER_GUARD_VERIFIED: undefined }, passwords), { message: 'GAP: RECEIPT_OWNER_GUARD_VERIFIED' });
});
