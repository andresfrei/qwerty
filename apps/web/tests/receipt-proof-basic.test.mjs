import assert from 'node:assert/strict';
import test from 'node:test';
import {runBasicProof} from '../../../supabase/tests/storage/guest-receipts.test.mjs';
import {env} from './receipt-proof-fixtures.mjs';


// S15 regression: the existing public proof used to discard its failure phase.
test('basic proof retains diagnostic failure phase and still attempts exact cleanup', async () => {
  const stages = [], failures = [], calls = [];
  const diagnostics = { step: value => stages.push(value), fail: error => failures.push(error.name), wrapFetch: transport => transport };
  const transport = async (_url, init = {}) => {
    const method = init.method ?? 'GET'; calls.push(method);
    if (method === 'DELETE') return new Response(null, { status: 204 });
    return Response.json({ code: '42501', message: 'private-provider-sentinel' }, { status: 403 });
  };
  await assert.rejects(runBasicProof({ env: env(), transport, diagnostics }), error => {
    assert.equal(error.proofFailed, true); assert.deepEqual(error.cleanupFailures, []);
    assert.doesNotMatch(error.message, /private-provider-sentinel/); return true;
  });
  assert.deepEqual(calls, ['GET', 'DELETE', 'DELETE']);
  assert.deepEqual(stages, ['basic-preflight', 'basic-cleanup', 'basic-cleanup-complete']);
  assert.deepEqual(failures, ['AssertionError']);
});
