import assert from 'node:assert/strict';
import test from 'node:test';
import {spawnSync} from 'node:child_process';
import {remoteConfig} from '../../../supabase/tests/storage/guest-receipt-remote.mjs';
import {runBasicProof} from '../../../supabase/tests/storage/guest-receipts.test.mjs';
import {runOwnerProof} from '../../../supabase/tests/storage/guest-receipt-owner.test.mjs';
import {childEnvironment,excluded} from '../../../supabase/tests/storage/guest-receipt-driver.mjs';
import {env} from './receipt-proof-fixtures.mjs';

test('imports are effect-free; CLI refuses safely without keys or network', () => {
  for (const file of ['supabase/tests/storage/guest-receipts.test.mjs', 'supabase/tests/storage/guest-receipt-owner.test.mjs', 'supabase/tests/storage/guest-receipt-driver.mjs']) {
    const imported = spawnSync(process.execPath, ['--input-type=module', '-e', `globalThis.fetch=()=>{throw Error('NETWORK')}; await import('./${file}');`], { encoding: 'utf8', env: { PATH: process.env.PATH } });
    assert.equal(imported.status, 0, imported.stderr); assert.equal(imported.stdout, ''); assert.equal(imported.stderr, '');
    for (const args of [[], ['--plan'], ['--run'], ['--wrong']]) {
      const child = spawnSync(process.execPath, [file, ...args], { encoding: 'utf8', env: { PATH: process.env.PATH, RECEIPT_REMOTE_SERVICE_KEY: 'private-sentinel' } });
      assert.equal(child.status, 2, child.stderr);
      assert.doesNotMatch(child.stdout + child.stderr, /private-sentinel|NETWORK|Error:|at file:/);
      assert.match(child.stdout + child.stderr, /GAP|REFUSED/);
    }
  }
});
test('configured default/explicit plans are read-only and wrong-target run exits before transport', () => {
  const hook = `import fs from 'node:fs/promises';import {syncBuiltinESMExports} from 'node:module';let writes=0,calls=0;for(const name of ['mkdir','writeFile','appendFile','copyFile','symlink','open'])fs[name]=()=>{writes++;throw Error('WRITE')};syncBuiltinESMExports();globalThis.fetch=()=>{calls++;throw Error('NETWORK')};process.on('exit',()=>console.log('FETCH_COUNT='+calls+' WRITE_COUNT='+writes));`;
  for (const file of ['supabase/tests/storage/guest-receipts.test.mjs', 'supabase/tests/storage/guest-receipt-owner.test.mjs', 'supabase/tests/storage/guest-receipt-driver.mjs']) {
    for (const args of [[], ['--plan'], ['--run']]) {
      const child = spawnSync(process.execPath, ['--import', `data:text/javascript,${encodeURIComponent(hook)}`, file, ...args], { encoding: 'utf8', env: { PATH: process.env.PATH, ...env(), ...(args[0] === '--run' ? { RECEIPT_REMOTE_URL: 'http://localhost:54321' } : {}) } });
      assert.equal(child.status, args[0] === '--run' ? 2 : 0, child.stderr);
      assert.match(child.stdout, /FETCH_COUNT=0 WRITE_COUNT=0/);
      assert.doesNotMatch(child.stdout + child.stderr, /sentinel|NETWORK|Error:|at file:/);
      if (args[0] !== '--run') { assert.match(child.stdout, /PLAN:/); assert.equal(child.stderr, ''); }
      else assert.equal(child.stderr, 'REFUSED: RECEIPT_REMOTE_URL\n');
    }
  }
});
test('public proof entrypoints refuse before all fake transport calls', async () => {
  let calls = 0;
  const transport = async () => { calls++; throw Error('private-sentinel'); };
  for (const run of [runBasicProof, runOwnerProof]) {
    for (const bad of [{ ...env(), RECEIPT_REMOTE_URL: 'http://localhost:54321' }, { ...env(), RECEIPT_S12_REVIEWED: '' }, { ...env(), RECEIPT_OWNER_GUARD_VERIFIED: '' }]) {
      await assert.rejects(run({ env: bad, siteUrl: 'http://127.0.0.1:3000', transport }));
    }
  }
  assert.equal(calls, 0);
});
test('driver build never receives keys; runtime keys stay server-only; all dotenv paths excluded', () => {
  const config = remoteConfig(env(), 'run');
  const build = childEnvironment({ workspace: '/owned', config, site: 'http://127.0.0.1:3000' });
  assert.doesNotMatch(JSON.stringify(build), /sentinel/);
  assert.equal(build.NODE_ENV, 'production');
  const runtime = childEnvironment({ workspace: '/owned', config, site: 'http://127.0.0.1:3000', runtime: true });
  assert.equal(runtime.SUPABASE_SERVICE_ROLE_KEY, 'private-sentinel');
  assert.equal(runtime.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, undefined);
  assert.equal(runtime.RECEIPT_OWNER_A_PASSWORD, undefined);
  for (const path of ['.env', 'apps/web/.env.production', 'apps/web/app/.env.local', '.env-secret/file', '.git/config', 'apps/web/.next/server.js']) assert.equal(excluded(path), true);
  assert.equal(excluded('apps/web/app/page.tsx'), false);
});

test('persisted driver resolves repository source root and refuses all writes/network in a guarded probe', () => {
  const hook = `import fs from 'node:fs/promises';import {syncBuiltinESMExports} from 'node:module';const real=fs.lstat;let first=null,fetches=0,writes=0;fs.lstat=async(...args)=>{first??=String(args[0]);return real(...args)};fs.mkdir=async()=>{writes++;throw Error('stop-before-writes')};syncBuiltinESMExports();globalThis.fetch=()=>{fetches++;throw Error('NETWORK')};process.on('exit',()=>console.log('ROOT_PROBE='+JSON.stringify({first,fetches,writes})));`;
  const result = spawnSync(process.execPath, ['--import', `data:text/javascript,${encodeURIComponent(hook)}`, 'supabase/tests/storage/guest-receipt-driver.mjs', '--run'], {
    encoding: 'utf8', env: { PATH: process.env.PATH, ...env() },
  });
  assert.equal(result.status, 2);
  const expected = JSON.stringify({ first: `${process.cwd()}/apps/web/app`, fetches: 0, writes: 1 });
  assert.equal(result.stdout, `ROOT_PROBE=${expected}\n`);
  assert.equal(result.stderr, 'REFUSED: proof or cleanup failed\n');
});
