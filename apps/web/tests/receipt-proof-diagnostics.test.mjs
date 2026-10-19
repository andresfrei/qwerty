import assert from 'node:assert/strict';
import test from 'node:test';
import {ownedLedger} from '../../../supabase/tests/storage/guest-receipt-remote.mjs';
import {runOwnerProof} from '../../../supabase/tests/storage/guest-receipt-owner.test.mjs';
import * as ownerProof from '../../../supabase/tests/storage/guest-receipt-owner.test.mjs';
import {createProofDiagnostics} from '../../../supabase/tests/storage/guest-receipt-diagnostics.mjs';
import {env,fixtureIds} from './receipt-proof-fixtures.mjs';


test('diagnostics preserve only fixed stages, numeric statuses and error kinds through cleanup', async () => {
  const diagnostic = createProofDiagnostics();
  diagnostic.step('receipt-post');
  const response = { status: 403, url: 'https://secret-sentinel.invalid', body: 'secret-sentinel' };
  const request = diagnostic.wrapFetch(async (_url, init) => { assert.equal(init.headers.Cookie, 'secret-sentinel'); return response; });
  assert.equal(await request('https://secret-sentinel.invalid', { headers: { Cookie: 'secret-sentinel' }, body: 'secret-sentinel' }), response);
  const failure = new Error('secret-sentinel'); failure.name = 'AssertionError'; failure.cause = { access_token: 'secret-sentinel' };
  diagnostic.fail(failure);
  diagnostic.step('owner-cleanup');
  await diagnostic.wrapFetch(async () => ({ status: 204 }))('secret-sentinel');
  diagnostic.fail(new Error('secret-sentinel'));
  const snapshot = diagnostic.snapshot();
  assert.deepEqual(snapshot.failure, { stage: 'receipt-post', kind: 'assertion', httpStatus: 403, transportErrorKind: null, requests: 1, stageRequests: 1 });
  assert.equal(snapshot.requests, 2); assert.equal(snapshot.httpStatus, 204);
  assert.doesNotMatch(JSON.stringify(snapshot), /secret-sentinel|access_token|Cookie|cause/);
  assert.throws(() => diagnostic.step('secret-sentinel'), { message: 'REFUSED: diagnostic stage' });
  snapshot.failure.stage = 'secret-sentinel'; assert.equal(diagnostic.snapshot().failure.stage, 'receipt-post');
  const aborted = createProofDiagnostics(); aborted.step('basic-anonymous');
  const transportError = new DOMException('secret-sentinel', 'TimeoutError');
  await assert.rejects(aborted.wrapFetch(async () => { throw transportError; })('secret-sentinel'), error => error === transportError);
  aborted.fail(new Error('secret-sentinel'));
  assert.equal(aborted.snapshot().failure.transportErrorKind, 'timeout');
  assert.equal(aborted.snapshot().failure.httpStatus, null);
  assert.doesNotMatch(JSON.stringify(aborted.snapshot()), /secret-sentinel/);
});
test('owner preflight diagnostics do not skip owned frontend quiescence or change failure privacy', async () => {
  const diagnostic = createProofDiagnostics(); let requests = 0, quiesced = 0;
  await assert.rejects(runOwnerProof({ env: env(), siteUrl: 'http://127.0.0.1:3000', diagnostics: diagnostic,
    transport: async () => { requests++; return Response.json({ code: '42501', message: 'secret-sentinel' }, { status: 403 }); },
    quiesceFrontend: async () => { quiesced++; },
  }), error => { assert.equal(error.proofFailed, true); assert.deepEqual(error.cleanupFailures, []); assert.doesNotMatch(error.message, /secret-sentinel/); return true; });
  assert.equal(requests, 1); assert.equal(quiesced, 1);
  const snapshot = diagnostic.snapshot();
  assert.equal(snapshot.failure.stage, 'owner-preflight'); assert.equal(snapshot.failure.httpStatus, 403);
  assert.deepEqual(snapshot.history, ['owner-preflight', 'owner-quiesce', 'owner-cleanup', 'owner-cleanup-complete']);
  assert.doesNotMatch(JSON.stringify(snapshot), /secret-sentinel/);
});
test('receipt POST and GET failures retain their exact safe phase without exposing response bodies', async () => {
  for (const failedPhase of ['POST', 'GET']) {
    const diagnostic = createProofDiagnostics(), ledger = ownedLedger();
    const { business, actor, receipt } = fixtureIds; ledger.businesses.add(business); ledger.users.add(actor);
    const request = diagnostic.wrapFetch(async (_url, init) => init.method === 'POST' && failedPhase === 'GET'
      ? Response.json({ receiptId: receipt }, { status: 201 }) : Response.json({ message: 'secret-sentinel' }, { status: 403 }));
    await assert.rejects(postReceiptCall(), { message: `FAIL: receipt ${failedPhase} failed; details withheld` });
    function postReceiptCall() { return ownerProof.postReceipt({ ledger, business, actor, site: 'http://127.0.0.1:3000', slug: 'owned', cookie: 'secret-sentinel', bytes: Buffer.from('original'), mime: 'image/png', request, diagnostics: diagnostic }); }
    diagnostic.step('owner-cleanup'); diagnostic.fail(new Error('secret-sentinel'));
    const snapshot = diagnostic.snapshot();
    assert.equal(snapshot.failure.stage, failedPhase === 'POST' ? 'receipt-post' : 'receipt-get');
    assert.equal(snapshot.failure.httpStatus, 403); assert.equal(snapshot.failure.kind, 'assertion');
    assert.equal(ledger.receipts.has(receipt), failedPhase === 'GET');
    assert.doesNotMatch(JSON.stringify(snapshot), /secret-sentinel/);
  }
});
