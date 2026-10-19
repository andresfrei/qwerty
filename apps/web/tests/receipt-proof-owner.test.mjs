import assert from 'node:assert/strict';
import test from 'node:test';
import {cleanupOwned,ownedLedger} from '../../../supabase/tests/storage/guest-receipt-remote.mjs';
import * as remoteProof from '../../../supabase/tests/storage/guest-receipt-remote.mjs';
import * as ownerProof from '../../../supabase/tests/storage/guest-receipt-owner.test.mjs';
import {makePng,makePdf} from './receipt-file-fixtures.mjs';
import {fixtureIds} from './receipt-proof-fixtures.mjs';

function namespaceBackend(ledger, { discoveryFails = false } = {}) {
  const { business, actor, receipt, foreign } = fixtureIds;
  const row = (business_id, actor_id, id) => ({ id, business_id, actor_id, object_path: `${business_id}/${actor_id}/${id}` });
  const rows = [row(business, foreign, foreign), row(foreign, actor, foreign)];
  const paths = new Set(rows.map(row => row.object_path));
  const sentinels = structuredClone(rows);
  const commitOwned = () => { const own = row(business, actor, receipt); rows.unshift(own); paths.add(own.object_path); };
  const calls = [];
  const admin = {
    from: table => ({
      select: () => {
        const filters = {};
        const query = {
          eq: (key, value) => { filters[key] = value; return query; },
          order: () => query,
          limit: () => query,
          then: (resolve, reject) => {
            try {
              assert.equal(table, 'guest_receipts');
              assert.deepEqual(filters, { business_id: business, actor_id: actor });
              calls.push('discover-metadata');
              resolve(discoveryFails ? { error: {} } : { error: null, data: rows.filter(row => row.business_id === business && row.actor_id === actor) });
            } catch (error) { reject(error); }
          },
        };
        return query;
      },
      delete: () => ({ eq: async (key, value) => {
        calls.push(`${table}-delete`);
        if (table === 'guest_receipts') {
          assert.equal(key, 'id'); assert.equal(value, receipt);
          rows.splice(rows.findIndex(row => row.business_id === business && row.actor_id === actor && row.id === value), 1);
        }
        return { error: table === 'businesses' ? { code: '23503' } : null };
      } }),
    }),
    storage: { from: bucket => ({
      list: async prefix => {
        assert.equal(bucket, 'guest-receipts'); assert.equal(prefix, `${business}/${actor}`);
        calls.push('discover-objects');
        return { error: null, data: [...paths].filter(path => path.startsWith(`${prefix}/`)).map(path => ({ name: path.split('/')[2] })) };
      },
      remove: async selected => { calls.push('object-remove'); for (const path of selected) { assert.equal(path, `${business}/${actor}/${receipt}`); paths.delete(path); } return { error: null }; },
    }) },
    auth: { admin: { deleteUser: async id => { assert.equal(id, actor); calls.push('user-delete'); return { error: null }; } } },
  };
  ledger.businesses.add(business); ledger.users.add(actor);
  ledger.sessions.push({ auth: { signOut: async () => { calls.push('global-signout'); return { error: new Error('secret-provider-payload') }; } } });
  return { admin, rows, paths, calls, sentinels, commitOwned };
}
test('real POST response loss discovers only pre-registered business+actor; cleanup preserves foreign rows/objects and original failure', async () => {
  const ledger = ownedLedger(), backend = namespaceBackend(ledger);
  const { business, actor, receipt } = fixtureIds;
  let posted = false, postError;
  await assert.rejects(ownerProof.postReceipt({ ledger, business, actor, site: 'http://127.0.0.1:3000', slug: 'owned', cookie: 'secret-cookie', bytes: Buffer.from('original'), mime: 'image/png', request: async (_url, init) => {
    assert.equal(init.method, 'POST');
    assert.ok(ledger.namespaces.has(`${business}/${actor}`), 'namespace registered before request');
    backend.commitOwned(); posted = true; throw new Error('secret-provider-payload');
  } }), error => { postError = error; assert.equal(error.message, 'FAIL: receipt POST failed; details withheld'); return true; });
  assert.equal(posted, true);
  assert.equal(ledger.receipts.has(receipt), false, 'lost response cannot provide an ID');
  const result = await cleanupOwned(backend.admin, ledger, true);
  assert.equal(result.proofFailed, true);
  const failure = remoteProof.safeFailure(result, undefined, postError);
  assert.equal(failure.cause, postError, 'original sanitized POST failure retained alongside cleanup failures');
  assert.deepEqual(failure.cleanupFailures, ['session-global-signout', 'business-delete']);
  assert.doesNotMatch(remoteProof.safeDiagnostic(failure), /secret/);
  assert.deepEqual(result.cleanupFailures, ['session-global-signout', 'business-delete']);
  assert.deepEqual(backend.rows, backend.sentinels);
  assert.deepEqual([...backend.paths], backend.sentinels.map(row => row.object_path));
  assert.equal(ledger.receipts.has(receipt), true);
  assert.ok(backend.calls.indexOf('guest_receipts-delete') < backend.calls.indexOf('businesses-delete'));
  assert.ok(backend.calls.includes('user-delete'));
  assert.doesNotMatch(JSON.stringify(result), /secret/);
});
test('ordinary POST then GET preserves original PNG/PDF bytes and exact headers; no staging substitution', async () => {
  for (const mime of ['image/png', 'application/pdf']) {
    const ledger = ownedLedger(), { business, actor, receipt } = fixtureIds;
    ledger.businesses.add(business); ledger.users.add(actor);
    const bytes = mime === 'image/png' ? makePng() : makePdf(), methods = [];
    const id = await ownerProof.postReceipt({ ledger, business, actor, site: 'http://127.0.0.1:3000', slug: 'owned', cookie: 'secret-cookie', bytes, mime, request: async (url, init) => {
      methods.push(init.method ?? 'GET');
      assert.equal(init.headers.Cookie, 'secret-cookie');
      if (init.method === 'POST') {
        assert.equal(url, 'http://127.0.0.1:3000/api/checkout/receipts?slug=owned');
        assert.deepEqual(init.body, bytes);
        return Response.json({ receiptId: receipt }, { status: 201 });
      }
      assert.match(url, new RegExp(`/receipts/${receipt}\\?slug=owned$`));
      return new Response(bytes, { headers: { 'content-type': mime, 'content-disposition': 'attachment; filename="receipt"', 'x-content-type-options': 'nosniff', 'cache-control': 'private, no-store' } });
    } });
    assert.equal(id, receipt); assert.deepEqual(methods, ['POST', 'GET']);
    assert.ok(ledger.paths.has(`${business}/${actor}/${receipt}`));
  }
});
test('failed namespace metadata discovery does not skip object cleanup, revocation or remaining known resources', async () => {
  const ledger = ownedLedger(), backend = namespaceBackend(ledger, { discoveryFails: true });
  const { business, actor } = fixtureIds;
  assert.equal(typeof ledger.registerNamespace, 'function');
  ledger.registerNamespace(business, actor); backend.commitOwned();
  const result = await cleanupOwned(backend.admin, ledger, true);
  assert.ok(result.cleanupFailures.includes('namespace-metadata-discovery'));
  assert.ok(backend.calls.includes('object-remove')); assert.ok(backend.calls.includes('user-delete'));
  assert.equal(backend.rows.length, 3); assert.equal(backend.paths.size, 2);
});
