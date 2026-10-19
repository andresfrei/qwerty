import assert from 'node:assert/strict';
import test from 'node:test';
import {EventEmitter} from 'node:events';
import {buildBeforeProof} from '../../../supabase/tests/storage/guest-receipt-build-evidence.mjs';

function fakeBuild({ code = 7, signal = null, stdout = ['public check stdout\n'], stderr = ['public check stderr\n'], hang = false } = {}) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
  let resolveDone;
  child.done = new Promise(resolve => { resolveDone = resolve; });
  let exited = false, stops = 0, launches = 0;
  const finish = (value, termination) => {
    if (exited) return;
    exited = true; resolveDone(value);
    child.emit('exit', value, termination); child.emit('close', value, termination);
  };
  return {
    launch: () => {
      launches++;
      queueMicrotask(() => {
        for (const chunk of stdout) child.stdout.emit('data', Buffer.from(chunk));
        for (const chunk of stderr) child.stderr.emit('data', Buffer.from(chunk));
        if (!hang) finish(code, signal);
      });
      return child;
    },
    stop: async () => { stops++; if (!exited) finish(null, 'SIGTERM'); },
    counts: () => ({ launches, stops }),
  };
}
test('failed public-check build retains exact stdout/stderr/exit7 and blocks all fixture work', async () => {
  const fake = fakeBuild(), artifacts = new Map();
  let fixtures = 0, sdkWrites = 0, failure;
  await assert.rejects(buildBeforeProof({ ...fake, save: async (name, bytes) => artifacts.set(name, bytes), secrets: ['private-sentinel'], runProof: async () => { fixtures++; sdkWrites++; } }), error => { failure = error; return true; });
  assert.equal(fixtures, 0); assert.equal(sdkWrites, 0);
  assert.equal(String(artifacts.get('build.stdout.log')), 'public check stdout\n');
  assert.equal(String(artifacts.get('build.stderr.log')), 'public check stderr\n');
  const metadata = JSON.parse(artifacts.get('build.result.json'));
  assert.equal(metadata.exitCode, 7); assert.equal(metadata.signal, null);
  assert.equal(metadata.exitBeforeCleanup, true); assert.equal(metadata.terminationReason, 'none');
  assert.equal(metadata.status, 'FAIL'); assert.ok(metadata.durationMs >= 0);
  assert.equal(failure.buildEvidence.exitCode, 7);
  assert.deepEqual(fake.counts(), { launches: 1, stops: 1 });
});
test('build evidence withholds detected secrets across chunks and encodings without leaking private values', async () => {
  for (const chunks of [['private-', 'sentinel'], [Buffer.from('private-sentinel').toString('base64')], ['sb_secret_not-a-real-key'], ['access_token=not-a-real-token']]) {
    const artifacts = new Map(), fake = fakeBuild({ code: 0, stdout: chunks });
    let fixtures = 0;
    await assert.rejects(buildBeforeProof({ ...fake, secrets: ['private-sentinel'], save: async (name, bytes) => artifacts.set(name, bytes), runProof: async () => fixtures++ }));
    const metadata = JSON.parse(artifacts.get('build.result.json'));
    assert.equal(metadata.secretDetected, true); assert.equal(metadata.outputDisposition, 'withheld-secret');
    assert.equal(metadata.status, 'FAIL'); assert.equal(fixtures, 0);
    assert.equal(String(artifacts.get('build.stdout.log')), ''); assert.equal(String(artifacts.get('build.stderr.log')), '');
    assert.doesNotMatch(JSON.stringify([...artifacts]), /private-sentinel|not-a-real/);
  }
});
test('build output budget and timeout fail without retry, retain exit/signal distinction, and close owned child', async () => {
  for (const mode of ['output-budget', 'build-timeout']) {
    const fake = fakeBuild({ code: 0, stdout: mode === 'output-budget' ? ['12345'] : [], stderr: [], hang: true });
    const artifacts = new Map(); let fixtures = 0;
    await assert.rejects(buildBeforeProof({ ...fake, outputLimitBytes: 4, timeoutMs: 5, save: async (name, bytes) => artifacts.set(name, bytes), runProof: async () => fixtures++ }));
    const metadata = JSON.parse(artifacts.get('build.result.json'));
    assert.equal(metadata.status, 'FAIL'); assert.equal(metadata.terminationReason, mode);
    assert.equal(metadata.exitCode, null); assert.equal(metadata.signal, 'SIGTERM'); assert.equal(metadata.exitBeforeCleanup, false);
    assert.equal(metadata.streamsClosed, true); assert.equal(fixtures, 0);
    assert.deepEqual(fake.counts(), { launches: 1, stops: 1 });
    if (mode === 'output-budget') {
      assert.equal(metadata.outputBudgetExceeded, true); assert.equal(metadata.stdoutBytes, 5);
      assert.equal(metadata.outputDisposition, 'withheld-output-budget'); assert.equal(String(artifacts.get('build.stdout.log')), '');
    }
  }
});
test('successful screened build gates proof; evidence persistence failure never starts fixtures', async () => {
  for (const persistenceFails of [false, true]) {
    const fake = fakeBuild({ code: 0 }); const artifacts = new Map(); let fixtures = 0;
    const options = { ...fake, save: async (name, bytes) => { if (persistenceFails) throw Error('private-sentinel'); artifacts.set(name, bytes); }, runProof: async () => { fixtures++; return 'proof-result'; } };
    if (persistenceFails) await assert.rejects(buildBeforeProof(options), error => {
      assert.equal(error.message, 'REFUSED: build evidence persistence failed');
      assert.equal(error.buildEvidence.exitCode, 0); assert.equal(error.buildEvidence.persistenceFailed, true); return true;
    });
    else assert.equal(await buildBeforeProof(options), 'proof-result');
    assert.equal(fixtures, persistenceFails ? 0 : 1);
  }
});
