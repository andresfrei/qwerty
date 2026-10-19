// Reviewed S12 preparation ONLY. Default plan performs no filesystem/network writes.
// No dotenv, CLI, Docker, migration application or Auth provider configuration.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir, readdir, lstat, readFile, copyFile, symlink, realpath, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { remoteConfig, cliMode, safeDiagnostic, REMOTE_ORIGIN } from './guest-receipt-remote.mjs';

import { buildBeforeProof } from './guest-receipt-build-evidence.mjs';
export { buildBeforeProof };

const root = resolve(import.meta.dirname, '../../..');
const receiptMigration = 'supabase/migrations/20261001090000_mvp_guest_receipts.sql';
const receiptHash = '84d0d5d6c57925e1728868bb0b47825421c7dfbed15e7fe4b39f0db3136b196b';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const excluded = name => name.split('/').some(part => part.startsWith('.env') || ['node_modules', '.next', '.git'].includes(part));
export function childEnvironment({ workspace, config, site, runtime = false }) {
  const env = { PATH: `${dirname(process.execPath)}:/usr/bin:/bin`, HOME: `${workspace}/home`, TMPDIR: `${workspace}/tmp`, LANG: 'C.UTF-8', NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' };
  // No credential is supplied during compilation. Runtime server-only fallback
  // avoids Next's NEXT_PUBLIC compile-time key serialization. No source rewrite.
  if (runtime) Object.assign(env, { SUPABASE_URL: config.url, SUPABASE_ANON_KEY: config.anonKey, SUPABASE_SERVICE_ROLE_KEY: config.serviceKey, QWERTY_SITE_URL: site });
  return env;
}
async function manifest() {
  const result = {};
  async function walk(name) {
    if (excluded(name)) return;
    const path = `${root}/${name}`, stat = await lstat(path);
    assert.ok(!stat.isSymbolicLink());
    if (stat.isDirectory()) for (const entry of await readdir(path)) await walk(`${name}/${entry}`);
    else { assert.ok(stat.isFile()); result[name] = hash(await readFile(path)); }
  }
  await walk('apps/web/app');
  for (const name of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'apps/web/package.json', 'apps/web/next.config.mjs', 'apps/web/next-env.d.ts', 'apps/web/tsconfig.json', 'apps/web/postcss.config.mjs', 'apps/web/proxy.ts']) await walk(name);
  try { await walk('apps/web/public'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  for (const name of [receiptMigration, 'supabase/migrations/20260929054538_mvp_owner_verified_email.sql', 'supabase/migrations/20260929120000_mvp_pu2_catalog_options.sql', 'supabase/tests/storage/guest-receipt-remote.mjs', 'supabase/tests/storage/guest-receipt-active-config.mjs', 'supabase/tests/storage/guest-receipt-diagnostics.mjs', 'supabase/tests/storage/guest-receipts.test.mjs', 'supabase/tests/storage/guest-receipt-owner.test.mjs', 'supabase/tests/storage/guest-receipt-driver.mjs', 'supabase/tests/storage/guest-receipt-runtime-guard.mjs', 'supabase/tests/storage/guest-receipt-build-evidence.mjs']) await walk(name);
  assert.equal(result[receiptMigration], receiptHash);
  return result;
}
async function reservePort() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve)); return port;
}
export async function runRemoteProof(env, { diagnostics } = {}) {
  diagnostics?.step('driver-start');
  const config = remoteConfig(env, 'run'); // before SDK, directory, server or build
  const before = await manifest();
  const workspace = `${root}/.pi/receipt-staging/remote-workspace-${randomUUID()}`;
  const children = new Set();
  const overall = AbortSignal.timeout(420000);
  const secrets = [config.anonKey, config.serviceKey, ...config.passwords];
  let proofFailed = false, cleanupFailed = false, failure;
  const stop = async child => {
    if (!children.has(child)) return;
    const kill = signal => { try { process.kill(-child.pid, signal); } catch (error) { if (error.code !== 'ESRCH') throw error; } };
    if (!child.pid) { await child.done; children.delete(child); return; }
    kill('SIGTERM');
    await Promise.race([child.done, new Promise(resolve => { const timer = setTimeout(resolve, 2000); timer.unref(); })]);
    kill('SIGKILL'); await child.done; children.delete(child);
  };
  const launch = (args, childEnv, captureBuild = false) => {
    const child = spawn(process.execPath, args, { cwd: `${workspace}/apps/web`, env: childEnv, detached: true, stdio: captureBuild ? ['ignore', 'pipe', 'pipe'] : 'ignore' });
    children.add(child);
    child.done = new Promise(resolve => { child.once('error', () => resolve(-1)); child.once('exit', code => resolve(code)); });
    return child;
  };
  const abort = () => { for (const child of children) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} } };
  overall.addEventListener('abort', abort, { once: true });
  try {
    await mkdir(workspace, { mode: 0o700 }); // refuse reuse; never replace/delete an existing path
    for (const [name, expected] of Object.entries(before)) {
      // Proof/migration selectors are hashed but do not belong in the Next copy.
      if (!(name.startsWith('apps/web/') || ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml'].includes(name))) continue;
      const bytes = await readFile(`${root}/${name}`);
      assert.equal(hash(bytes), expected);
      for (const secret of secrets) assert.ok(!bytes.includes(Buffer.from(secret)), 'credential in source');
      await mkdir(dirname(`${workspace}/${name}`), { recursive: true });
      await copyFile(`${root}/${name}`, `${workspace}/${name}`);
    }
    for (const name of ['home', 'tmp']) await mkdir(`${workspace}/${name}`);
    for (const name of ['node_modules', 'apps/web/node_modules']) await symlink(await realpath(`${root}/${name}`), `${workspace}/${name}`, 'dir');
    const port = await reservePort(), site = `http://127.0.0.1:${port}`;
    const next = `${workspace}/apps/web/node_modules/next/dist/bin/next`;
    console.log(`RUN: isolated actual Next build; evidence ${workspace}/build.result.json`);
    diagnostics?.step('driver-build');
    await buildBeforeProof({
      launch: () => launch([next, 'build', '--webpack'], childEnvironment({ workspace, config, site }), true),
      stop, secrets, signal: overall,
      save: (name, bytes) => writeFile(`${workspace}/${name}`, bytes, { flag: 'wx', mode: 0o600 }),
      runProof: async () => {
        assert.deepEqual(await manifest(), before);
        const preload = `import { installRemoteRuntimeGuard } from ${JSON.stringify(pathToFileURL(`${root}/supabase/tests/storage/guest-receipt-runtime-guard.mjs`).href)}; installRemoteRuntimeGuard();`;
        const app = launch(['--import', `data:text/javascript,${encodeURIComponent(preload)}`, next, 'start', '--hostname', '127.0.0.1', '--port', String(port)], childEnvironment({ workspace, config, site, runtime: true }));
        // No readiness retries: one bounded delay, then one bounded request.
        await new Promise(resolve => setTimeout(resolve, 2000));
        diagnostics?.step('driver-readiness');
        const readinessFetch = diagnostics?.wrapFetch(globalThis.fetch) ?? globalThis.fetch;
        const ready = await readinessFetch(`${site}/api/checkout/receipts`, { redirect: 'error', signal: AbortSignal.any([overall, AbortSignal.timeout(8000)]) });
        assert.equal(ready.status, 405); assert.equal(app.exitCode, null);
        const { runBasicProof } = await import('./guest-receipts.test.mjs');
        const { runOwnerProof } = await import('./guest-receipt-owner.test.mjs');
        diagnostics?.step('driver-basic');
        await runBasicProof({ env, diagnostics, signal: AbortSignal.any([overall, AbortSignal.timeout(60000)]) });
        diagnostics?.step('driver-owner');
        await runOwnerProof({ env, diagnostics, siteUrl: site, signal: AbortSignal.any([overall, AbortSignal.timeout(60000)]), quiesceFrontend: () => stop(app) });
      },
    });
  } catch (error) { diagnostics?.fail(error); proofFailed = true; failure = error; }
  finally {
    diagnostics?.step('driver-cleanup');
    for (const child of [...children]) { try { await stop(child); } catch { cleanupFailed = true; } }
    overall.removeEventListener('abort', abort);
    try { assert.deepEqual(await manifest(), before); } catch { cleanupFailed = true; }
  }
  if (proofFailed || cleanupFailed) {
    const buildFailure = failure?.buildEvidence;
    const message = buildFailure ? failure.message : /^GAP: RECEIPT_[A-Z_]+$/.test(failure?.message) ? failure.message : 'REFUSED: proof or cleanup failed';
    const error = new Error(message);
    if (buildFailure) {
      error.buildEvidence = buildFailure;
      error.buildArtifacts = `${workspace}/build.result.json`;
    }
    if (/^FAIL: receipt (?:POST|GET) failed; details withheld$/.test(failure?.cause?.message)) error.cause = failure.cause;
    error.proofFailed = proofFailed;
    error.cleanupFailures = [...(failure?.cleanupFailures ?? []), ...(cleanupFailed ? ['owned-process-or-source-check'] : [])];
    throw error;
  }
  return { sourceUnchanged: true, ownedProcessesClosed: true, backend: REMOTE_ORIGIN, remotePostProven: true };
}
export async function main(args, env) {
  const mode = cliMode(args); remoteConfig(env, mode);
  if (mode === 'plan') {
    console.log('PLAN: jxebudqzcmxgdsegrrqw only; no network, build, directories or writes; parent review/application and verified owner guard required');
    return;
  }
  await runRemoteProof(env);
  console.log('PASS: remote PNG PDF POST GET and owned fixture proof; no hosted publication');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { await main(process.argv.slice(2), process.env); }
  catch (error) { console.error(safeDiagnostic(error)); process.exitCode = 2; }
}
