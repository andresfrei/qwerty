// Effect-free build-only instrumentation. Never attach this to runtime output.
// Raw output stays bounded in memory until secret screening has completed.
import assert from 'node:assert/strict';

function containsSecret(buffers, secrets) {
  const text = Buffer.concat(buffers).toString('utf8');
  for (const secret of secrets.filter(Boolean)) {
    const encoded = Buffer.from(secret);
    for (const form of [secret, JSON.stringify(secret).slice(1, -1), encodeURIComponent(secret), encoded.toString('base64'), encoded.toString('base64url')]) {
      if (text.includes(form)) return true;
    }
  }
  return /sb_(?:secret|publishable)_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|\bBearer\s+\S+|\b(?:access_token|refresh_token|service_role_key|password|cookie)\s*[=:]\s*\S+/i.test(text);
}

export async function buildBeforeProof({ launch, stop, save, runProof, secrets = [], signal, timeoutMs = 240000, outputLimitBytes = 4 * 1024 * 1024 }) {
  assert.ok(Number.isSafeInteger(outputLimitBytes) && outputLimitBytes > 0);
  assert.ok(Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 240000);
  assert.equal(typeof save, 'function');
  signal?.throwIfAborted();
  const started = Date.now();
  const child = launch();
  const buffers = { stdout: [], stderr: [] }, bytes = { stdout: 0, stderr: 0 };
  let terminationReason = 'none', cleanupStarted = false, cleanupFailed = false, spawnFailed = false;
  let observedExit, streamsClosed = false, interrupt;
  const interrupted = new Promise(resolve => { interrupt = resolve; });
  const requestStop = reason => {
    if (terminationReason === 'none') { terminationReason = reason; interrupt(); }
  };
  const readers = {};
  for (const fd of ['stdout', 'stderr']) {
    readers[fd] = chunk => {
      const data = Buffer.from(chunk); bytes[fd] += data.length;
      if (bytes.stdout + bytes.stderr > outputLimitBytes) {
        requestStop('output-budget');
        return; // fail explicitly; no truncated raw log will be persisted
      }
      buffers[fd].push(data);
    };
    child[fd].on('data', readers[fd]);
  }
  child.once('error', () => { spawnFailed = true; }); // no raw spawn exception
  child.once('exit', (code, exitSignal) => {
    observedExit = { code, signal: exitSignal, beforeCleanup: !cleanupStarted };
  });
  const closed = new Promise(resolve => child.once('close', (code, exitSignal) => {
    streamsClosed = true;
    observedExit ??= { code, signal: exitSignal, beforeCleanup: !cleanupStarted };
    resolve();
  }));
  const onAbort = () => requestStop('overall-timeout');
  signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => requestStop('build-timeout'), timeoutMs);
  try {
    await Promise.race([closed, interrupted]);
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', onAbort);
    // Even after natural exit, close the owned process tree. Keep the FIRST
    // observed exit separate from later TERM/KILL cleanup of descendants.
    cleanupStarted = true;
    let shutdownTimer;
    try {
      await Promise.race([
        Promise.all([stop(child), closed]),
        new Promise((_, reject) => { shutdownTimer = setTimeout(() => reject(new Error('shutdown budget')), 3000); }),
      ]);
    } catch { cleanupFailed = true; }
    finally { clearTimeout(shutdownTimer); }
    for (const fd of ['stdout', 'stderr']) child[fd].removeListener('data', readers[fd]);
  }
  const outputBudgetExceeded = bytes.stdout + bytes.stderr > outputLimitBytes;
  const secretDetected = containsSecret([...buffers.stdout, ...buffers.stderr], secrets);
  const outputDisposition = outputBudgetExceeded ? 'withheld-output-budget' : secretDetected ? 'withheld-secret' : 'retained';
  const failed = observedExit?.code !== 0 || observedExit?.signal != null || spawnFailed || cleanupFailed || !streamsClosed || terminationReason !== 'none' || outputDisposition !== 'retained';
  const ended = Date.now();
  const evidence = {
    status: failed ? 'FAIL' : 'PASS',
    exitCode: observedExit?.code ?? null, signal: observedExit?.signal ?? null,
    exitBeforeCleanup: observedExit?.beforeCleanup ?? false,
    terminationReason, spawnFailed, streamsClosed, cleanupFailed,
    startedAt: new Date(started).toISOString(), endedAt: new Date(ended).toISOString(), durationMs: ended - started,
    timeoutMs, shutdownBudgetMs: 3000, outputLimitBytes,
    stdoutBytes: bytes.stdout, stderrBytes: bytes.stderr,
    outputDisposition, secretDetected, outputBudgetExceeded,
  };
  try {
    // A withheld log is EMPTY and explicitly marked, never silently truncated or
    // redacted into something that could be mistaken for the original evidence.
    for (const fd of ['stdout', 'stderr']) await save(`build.${fd}.log`, outputDisposition === 'retained' ? Buffer.concat(buffers[fd]) : Buffer.alloc(0));
    await save('build.result.json', JSON.stringify(evidence, null, 2));
  } catch {
    const error = new Error('REFUSED: build evidence persistence failed');
    error.buildEvidence = { ...evidence, status: 'FAIL', persistenceFailed: true };
    throw error;
  }
  if (failed) {
    const error = new Error('REFUSED: build failed');
    error.buildEvidence = evidence;
    throw error;
  }
  return runProof(); // No frontend, fixture import or SDK call before this gate.
}
