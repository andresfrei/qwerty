import assert from 'node:assert/strict';
import test from 'node:test';
import {remoteConfig,REMOTE_ORIGIN,cleanupOwned,ownedLedger,boundedRemoteFetch} from '../../../supabase/tests/storage/guest-receipt-remote.mjs';
import * as remoteProof from '../../../supabase/tests/storage/guest-receipt-remote.mjs';
import {createOwnedStateVerifier} from '../../../supabase/tests/storage/guest-receipt-assertions.mjs';
import {env,fixtureIds} from './receipt-proof-fixtures.mjs';

for (const target of ['http://127.0.0.1:54321', 'https://other.supabase.co', `${REMOTE_ORIGIN}/rest/v1`, `${REMOTE_ORIGIN}?x=1`, 'https://user:pass@jxebudqzcmxgdsegrrqw.supabase.co']) {
  test(`reject target before any fetch/client: ${target}`, () => {
    let calls = 0;
    assert.throws(() => remoteConfig({ ...env(), RECEIPT_REMOTE_URL: target }, 'run', () => calls++));
    assert.equal(calls, 0);
  });
}
test('exact origin and explicit reviewed/owner gates; no implicit fallback', () => {
  assert.equal(remoteConfig(env(), 'run').url, REMOTE_ORIGIN);
  for (const field of ['RECEIPT_REMOTE_URL', 'RECEIPT_REMOTE_PROJECT', 'RECEIPT_S12_REVIEWED', 'RECEIPT_OWNER_GUARD_VERIFIED', 'RECEIPT_REMOTE_ANON_KEY', 'RECEIPT_REMOTE_SERVICE_KEY', 'RECEIPT_OWNER_A_PASSWORD', 'RECEIPT_OWNER_B_PASSWORD']) {
    assert.throws(() => remoteConfig({ ...env(), [field]: '' }, 'run'), new RegExp(field));
  }
  assert.throws(() => remoteConfig({ ...env(), NEXT_PUBLIC_SUPABASE_URL: 'https://other.supabase.co' }, 'run'));
  assert.throws(() => remoteConfig(env(), 'unknown'));
});
test('bounded fetch refuses redirect/overrides before transport; no retries', async () => {
  let calls = 0;
  const request = boundedRemoteFetch(async (_url, init) => { calls++; assert.equal(init.redirect, 'error'); assert.ok(init.signal); throw new Error('private-sentinel'); });
  await assert.rejects(request('http://localhost/'));
  await assert.rejects(request(`${REMOTE_ORIGIN}/rest/v1/x`, { redirect: 'follow' }));
  assert.equal(calls, 0);
  await assert.rejects(request(`${REMOTE_ORIGIN}/rest/v1/x`));
  assert.equal(calls, 1);
});
test('owned cleanup globally revokes, continues all independent steps, exact IDs, FK order and aggregates failures', async () => {
  const ledger = ownedLedger();
  ledger.sessions.push({ auth: { signOut: async options => { assert.deepEqual(options, { scope: 'global' }); calls.push('signout'); throw Error('private-sentinel'); } } });
  const id = '11111111-1111-4111-8111-111111111111';
  ledger.users.add(id); ledger.businesses.add(id); ledger.storefronts.add(id); ledger.receipts.add(id); ledger.paths.add(`${id}/${id}/${id}`);
  const calls = [];
  const admin = {
    storage: { from: bucket => ({ remove: async paths => { calls.push('storage'); assert.equal(bucket, 'guest-receipts'); assert.deepEqual(paths, [`${id}/${id}/${id}`]); return { error: new Error('private-sentinel') }; } }) },
    from: table => ({ delete: () => ({ eq: async (column, value) => { calls.push(table); assert.equal(column, table === 'business_storefronts' ? 'business_id' : 'id'); assert.equal(value, id); return { error: table === 'guest_receipts' ? {} : null }; } }) }),
    auth: { admin: { deleteUser: async value => { calls.push('user'); assert.equal(value, id); return { error: null }; } } },
  };
  const result = await cleanupOwned(admin, ledger, true);
  assert.deepEqual(calls, ['signout', 'storage', 'guest_receipts', 'business_storefronts', 'businesses', 'user']);
  assert.deepEqual(result, { proofFailed: true, cleanupFailures: ['session-global-signout', 'object-remove', 'receipt-delete'] });
  assert.doesNotMatch(JSON.stringify(result), /private-sentinel/);
});
test('ambiguous anonymous signup returns named unknown-creation/revocation gap and never scans unknown users', async () => {
  const ledger = ownedLedger();
  let revoked = 0;
  const client = { auth: { signInAnonymously: async () => { throw new Error('secret-provider-payload'); }, signOut: async () => { revoked++; return { error: null }; } } };
  await assert.rejects(remoteProof.signInKnownAnonymous(client, ledger), error => {
    assert.equal(remoteProof.safeDiagnostic(error), 'GAP: RECEIPT_ANONYMOUS_ACTOR_CREATION_OR_REVOCATION_UNKNOWN');
    assert.doesNotMatch(error.message, /secret/); return true;
  });
  assert.equal(ledger.users.size, 0);
  const result = await cleanupOwned({}, ledger, true);
  assert.equal(revoked, 1); assert.equal(result.proofFailed, true);
});
test('namespace registration requires both known run identities; malformed discovery cannot grant cleanup authority', async () => {
  const ledger = ownedLedger(), { business, actor, receipt, foreign } = fixtureIds;
  assert.throws(() => ledger.registerNamespace(business, actor));
  ledger.businesses.add(business); assert.throws(() => ledger.registerNamespace(business, actor));
  ledger.users.add(actor); ledger.registerNamespace(business, actor);
  const scope = ledger.namespaces.get(`${business}/${actor}`);
  for (const row of [
    { id: receipt, business_id: foreign, actor_id: actor, object_path: `${foreign}/${actor}/${receipt}` },
    { id: receipt, business_id: business, actor_id: foreign, object_path: `${business}/${foreign}/${receipt}` },
    { id: receipt, business_id: business, actor_id: actor, object_path: `${business}/${actor}/${foreign}` },
  ]) {
    const query = { eq: () => query, order: () => query, limit: async () => ({ error: null, data: [row] }) };
    await assert.rejects(remoteProof.namespaceMetadata({ from: () => ({ select: () => query }) }, scope));
  }
  const admin = { storage: { from: () => ({ list: async () => ({ error: null, data: [{ name: '../foreign' }] }) }) } };
  await assert.rejects(remoteProof.namespacePaths(admin, scope));
  assert.equal(ledger.receipts.size, 0); assert.equal(ledger.paths.size, 0);
});
test('successful anonymous session is recorded; sessionless/disabled responses fail safely and clean known users only', async () => {
  const { actor } = fixtureIds;
  for (const variant of ['success', 'sessionless', 'disabled']) {
    const ledger = ownedLedger(), removed = [];
    let revoked = 0;
    const client = { auth: {
      signInAnonymously: async () => variant === 'disabled' ? { error: { code: 'anonymous_provider_disabled' } } : { error: null, data: { user: { id: actor, is_anonymous: true }, session: variant === 'success' ? { access_token: 'secret-token' } : null } },
      signOut: async options => { assert.equal(options.scope, 'global'); revoked++; return { error: null }; },
    } };
    if (variant === 'success') assert.equal(await remoteProof.signInKnownAnonymous(client, ledger), actor);
    else await assert.rejects(remoteProof.signInKnownAnonymous(client, ledger), error => {
      assert.equal(remoteProof.safeDiagnostic(error), variant === 'disabled' ? 'GAP: RECEIPT_ANONYMOUS_AUTH_CAPABILITY' : 'GAP: RECEIPT_ANONYMOUS_ACTOR_CREATION_OR_REVOCATION_UNKNOWN'); return true;
    });
    const result = await cleanupOwned({ auth: { admin: { deleteUser: async id => { removed.push(id); return { error: null }; } } } }, ledger, variant !== 'success');
    assert.deepEqual(removed, variant === 'disabled' ? [] : [actor]);
    assert.equal(revoked, 1); assert.deepEqual(result.cleanupFailures, []);
  }
});
test('cleanup rejects unrecordable paths/IDs; empty ledger touches nothing', async () => {
  const ledger = ownedLedger();
  assert.throws(() => ledger.recordReceipt('foreign', 'foreign', 'foreign'));
  assert.equal(ledger.paths.size, 0); assert.equal(ledger.receipts.size, 0);
  assert.deepEqual(await cleanupOwned({}, ledger, false), { proofFailed: false, cleanupFailures: [] });
});

test('exclusive verifier keeps every full after-check with only N plus one snapshot reads', async () => {
  let reads = 0, calls = 0;
  const original = { metadataCount: 1, objectCount: 1, metadata: [{ id: 'owned', sha256: 'metadata-hash' }], objects: [{ path: 'owned', size: 5, sha256: 'byte-hash' }] };
  const verify = createOwnedStateVerifier(async () => { reads++; return structuredClone(original); });
  for (let i = 0; i < 3; i++) {
    const denied = { error: { code: '42501' }, status: 403 };
    assert.equal(await verify(async () => { calls++; return denied; }), denied);
  }
  assert.equal(calls, 3); assert.equal(reads, 4);
});

test('snapshot reuse invalidates for trusted writes and still catches row, counter and byte mutations', async () => {
  const seed = () => ({ metadataCount: 1, objectCount: 1, metadata: [{ id: 'owned', actor_id: 'actor' }], objects: [{ path: 'owned', size: 5, sha256: 'original' }] });
  let state = seed(), reads = 0;
  const verify = createOwnedStateVerifier(async () => { reads++; return structuredClone(state); });
  await verify(async () => 'denied');
  state.objectCount++; state.objects.push({ path: 'positive-control', size: 2, sha256: 'trusted' });
  verify.invalidate();
  assert.equal(await verify(async () => 'denied'), 'denied');
  assert.equal(reads, 4); // Both sides refreshed across the trusted-write boundary.
  await verify(async () => 'denied'); assert.equal(reads, 5);
  for (const mutate of [
    value => { value.metadata[0].actor_id = 'foreign'; },
    value => { value.metadataCount++; value.metadata.push({ id: 'unexpected' }); },
    value => { value.objectCount++; value.objects.push({ path: 'unexpected', sha256: 'new' }); },
    value => { value.objects[0].sha256 = 'changed-bytes'; },
  ]) {
    state = seed();
    const checked = createOwnedStateVerifier(async () => structuredClone(state));
    await checked(async () => undefined); const before = structuredClone(state);
    await assert.rejects(checked(async () => { mutate(state); }), /denied operation must not mutate/);
    assert.notDeepEqual(state, before); // The verifier detects, never silently repairs, mutations.
  }
});
