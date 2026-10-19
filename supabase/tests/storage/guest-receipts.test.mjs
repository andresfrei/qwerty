// SOURCE ONLY: independent review + scoped S12 remote apply must precede execution.
// No .env reads, CLI/Docker calls, owner-grant changes or live execution on import
// of the separate pure assertion module.
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { assertMetadataDenied, assertStorageWriteDenied, assertStorageReadDenied, assertOwnedStateUnchanged, createOwnedStateVerifier } from './guest-receipt-assertions.mjs';
import { remoteConfig, boundedRemoteFetch, ownedLedger, cleanupOwned, safeFailure, cliMode, safeDiagnostic, signInKnownAnonymous } from './guest-receipt-remote.mjs';

export async function runBasicProof({ env, signal, transport = globalThis.fetch, diagnostics }) {
  const { url, anonKey, serviceKey, passwords } = remoteConfig(env, 'run');
  const { createClient } = createRequire(new URL('../../../apps/web/package.json', import.meta.url))('@supabase/supabase-js');
  let activeSignal = signal ?? AbortSignal.timeout(90000);
  const observed = diagnostics?.wrapFetch(transport) ?? transport;
  const request = (input, init) => boundedRemoteFetch(observed, activeSignal)(input, init);
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: request } };
  const admin = createClient(url, serviceKey, options), guest = createClient(url, anonKey, options), other = createClient(url, anonKey, options);
  const ledger = ownedLedger();
  ledger.sessions.push(guest, other);
  const { users, paths: objectPaths, receipts: receiptIds } = ledger;
  const prefixes = new Set();
  const business = randomUUID(), storefrontId = business, slug = `receipt-${randomUUID()}`;
  ledger.businesses.add(business); ledger.storefronts.add(storefrontId);
  const own = client => signInKnownAnonymous(client, ledger);
  const track = (business, actor, id) => {
    const path = ledger.recordReceipt(business, actor, id);
    prefixes.add(`${business}/${actor}`); return path;
  };
  const snapshot = async () => {
    const metadata = await admin.from('guest_receipts').select('*').in('id', [...receiptIds]).order('id');
    assert.equal(metadata.error, null);
    const objects = [];
    for (const prefix of [...prefixes].sort()) {
      const listed = await admin.storage.from('guest-receipts').list(prefix, { limit: 1000, sortBy: { column: 'name', order: 'asc' } });
      assert.equal(listed.error, null); assert.ok(listed.data.length < 1000, 'fixture listing must not truncate');
      for (const object of listed.data) {
        const path = `${prefix}/${object.name}`;
        assert.ok(objectPaths.has(path), 'only this run owns these newly created actor prefixes');
        const downloaded = await admin.storage.from('guest-receipts').download(path);
        assert.equal(downloaded.error, null);
        const bytes = Buffer.from(await downloaded.data.arrayBuffer());
        objects.push({ path, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
      }
    }
    return { metadataCount: metadata.data.length, objectCount: objects.length, metadata: metadata.data, objects };
  };
  const unchangedAfter = createOwnedStateVerifier(snapshot);
  let failure = false, gap;
  try {
    diagnostics?.step('basic-preflight');
    // Read-only matching-key/capability preflight before any Auth/fixture write.
    assert.equal((await admin.from('guest_receipts').select('id').eq('id', randomUUID())).error, null);
    assert.equal((await guest.from('business_storefronts').select('business_id').eq('business_id', business)).error, null);
    diagnostics?.step('basic-anonymous');
    const actor = await own(guest), otherActor = await own(other);
    const email = `receipt-${randomUUID()}@example.invalid`, password = passwords[0], userId = randomUUID();
    users.add(userId);
    diagnostics?.step('basic-account');
    const account = await admin.auth.admin.createUser({ id: userId, email, password, email_confirm: true });
    assert.equal(account.error, null); assert.equal(account.data.user.id, userId);
    const registered = createClient(url, anonKey, options);
    ledger.sessions.push(registered);
    assert.equal((await registered.auth.signInWithPassword({ email, password })).error, null);
    const verified = await registered.auth.getUser();
    assert.equal(verified.error, null); assert.equal(verified.data.user.id, account.data.user.id); assert.ok(verified.data.user.email_confirmed_at);
    diagnostics?.step('basic-business');
    assert.equal((await admin.from('businesses').insert({ id: business, owner_id: userId, name: slug })).error, null);
    assert.equal((await admin.from('business_storefronts').insert({ business_id: business, slug, display_name: slug, is_published: true })).error, null);
    const storefront = await guest.from('business_storefronts').select('business_id').eq('slug', slug).eq('is_published', true).single();
    assert.equal(storefront.error, null); assert.equal(storefront.data.business_id, business);
    const root = resolve(import.meta.dirname, '../../..');
    const { makePng } = await import(pathToFileURL(`${root}/apps/web/tests/receipt-file-fixtures.mjs`));
    const { createReceiptStaging } = await import(pathToFileURL(`${root}/apps/web/app/lib/receipt-staging.ts`));
    const { createSupabaseReceiptRepository } = await import(pathToFileURL(`${root}/apps/web/app/lib/receipt-staging-supabase.ts`));
    const id = randomUUID(), path = track(business, actor, id);
    const service = createReceiptStaging(createSupabaseReceiptRepository(admin), { randomId: () => id });
    const bytes = makePng(), changedBytes = makePng({ idatLookalike: true });
    diagnostics?.step('basic-stage');
    assert.equal(await service.stage(actor, business, bytes), id);
    assert.deepEqual(Buffer.from((await service.download(actor, business, id)).bytes), bytes);
    assert.equal(await service.download(otherActor, business, id), null);
    assert.equal(await service.download(account.data.user.id, business, id), null);
    assert.equal(await service.download(actor, randomUUID(), id), null);
    const canonical = await admin.from('guest_receipts').select('*').eq('id', id).single();
    assert.equal(canonical.error, null);
    for (const [client, fixtureActor] of [[createClient(url, anonKey, options), actor], [guest, actor], [other, otherActor], [registered, account.data.user.id]]) {
      diagnostics?.step('basic-metadata-read');
      assertMetadataDenied(await unchangedAfter(() => client.from('guest_receipts').select('*').eq('id', id)));
      const candidateId = randomUUID(), candidatePath = track(business, fixtureActor, candidateId);
      const candidate = { id: candidateId, actor_id: fixtureActor, business_id: business, object_path: candidatePath,
        content_type: canonical.data.content_type, size_bytes: canonical.data.size_bytes, sha256: canonical.data.sha256, state: 'staged' };
      // Existing fixture actor/business/object; new row ID avoids PK collisions.
      // Positive service insert/delete proves constraints accept this exact row.
      diagnostics?.step('basic-positive-control');
      unchangedAfter.invalidate(); // Trusted candidate writes change the snapshot.
      assert.equal((await admin.storage.from('guest-receipts').upload(candidatePath, bytes, { contentType: candidate.content_type, upsert: false })).error, null);
      assert.equal((await admin.from('guest_receipts').insert(candidate)).error, null);
      assert.equal((await admin.from('guest_receipts').delete().eq('id', candidateId)).error, null);
      const absent = await admin.from('guest_receipts').select('id').eq('id', candidateId);
      assert.equal(absent.error, null); assert.deepEqual(absent.data, []);
      diagnostics?.step('basic-metadata-insert');
      assertMetadataDenied(await unchangedAfter(() => client.from('guest_receipts').insert(candidate)));
      const storage = client.storage.from('guest-receipts');
      const uploadPath = track(business, fixtureActor, randomUUID());
      diagnostics?.step('basic-storage-upload');
      assertStorageWriteDenied(await unchangedAfter(() => storage.upload(uploadPath, bytes, { contentType: 'image/png', upsert: false })));
      diagnostics?.step('basic-storage-upsert');
      assertStorageWriteDenied(await unchangedAfter(() => storage.upload(path, changedBytes, { contentType: 'image/png', upsert: true })));
      // snapshots download the same known-existing object with service authority
      // before AND after; an actor's exact Object-not-found response is hidden access.
      diagnostics?.step('basic-storage-download');
      assertStorageReadDenied(await unchangedAfter(() => storage.download(path)));
      diagnostics?.step('basic-storage-sign');
      assertStorageReadDenied(await unchangedAfter(() => storage.createSignedUrl(path, 60)));
      diagnostics?.step('basic-storage-list');
      const listed = await unchangedAfter(() => storage.list(`${business}/${actor}`));
      if (listed.error) assertStorageReadDenied(listed);
      else assert.deepEqual(listed.data, [], 'successful private listing must contain no objects');
    }
    diagnostics?.step('basic-public');
    const publicBefore = await snapshot();
    const publicResponse = await request(`${url}/storage/v1/object/public/guest-receipts/${path}`);
    const publicBody = await publicResponse.json();
    assert.ok([400, 404].includes(publicResponse.status));
    assert.equal(String(publicBody.statusCode), '404'); assert.match(publicBody.message, /^(?:Bucket|Object) not found\.?$/i);
    assertOwnedStateUnchanged(publicBefore, await snapshot());
  } catch (error) { diagnostics?.fail(error); failure = true; if (/^GAP: RECEIPT_[A-Z_]+$/.test(error?.message)) gap = error.message; }
  diagnostics?.step('basic-cleanup');
  activeSignal = AbortSignal.timeout(30000); // reserve cleanup even after proof abort
  const result = await cleanupOwned(admin, ledger, failure);
  diagnostics?.step('basic-cleanup-complete');
  if (result.proofFailed || result.cleanupFailures.length) throw safeFailure(result, gap);
  return { basicProof: true, cleanupCompleted: true };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const mode = cliMode(process.argv.slice(2));
    remoteConfig(process.env, mode);
    if (mode === 'plan') console.log('PLAN: exact remote basic receipt proof; no network or writes');
    else await runBasicProof({ env: process.env, signal: AbortSignal.timeout(120000) });
  } catch (error) { console.error(safeDiagnostic(error)); process.exitCode = 2; }
}
