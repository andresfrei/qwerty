// S12 remote-only source. No environment reads or I/O on import.
// Exact UUID service fixtures; public owner/receipt assertions. No SQL callbacks.
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { assertMetadataDenied, assertStorageReadDenied, assertOwnedStateUnchanged } from './guest-receipt-assertions.mjs';
import { remoteConfig, boundedRemoteFetch, ownedLedger, cleanupOwned, safeFailure, cliMode, safeDiagnostic, namespaceMetadata, namespacePaths, signInKnownAnonymous } from './guest-receipt-remote.mjs';
const uuid = value => { assert.match(value, /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/); return value; };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function loopback(value) {
  const url = new URL(value);
  assert.ok(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash);
  return url.origin;
}

// This trusted proof seam calls the unchanged production HTTP contract. The
// namespace, not a guessed server UUID, is recorded before the attempted POST.
export async function postReceipt({ ledger, business, actor, site, slug, cookie, bytes, mime, request, diagnostics }) {
  ledger.registerNamespace(business, actor);
  let phase = 'POST';
  try {
    diagnostics?.step('receipt-post');
    const response = await request(`${site}/api/checkout/receipts?slug=${slug}`, {
      method: 'POST', headers: { Cookie: cookie, Origin: site, 'Content-Type': 'application/octet-stream' }, body: bytes,
    });
    assert.equal(response.status, 201);
    const id = uuid((await response.json()).receiptId);
    ledger.recordReceipt(business, actor, id);
    phase = 'GET'; diagnostics?.step('receipt-get');
    const positive = await request(`${site}/api/checkout/receipts/${id}?slug=${slug}`, { headers: { Cookie: cookie } });
    assert.equal(positive.status, 200);
    assert.equal(positive.headers.get('content-type'), mime);
    assert.match(positive.headers.get('content-disposition'), /^attachment;/);
    assert.equal(positive.headers.get('x-content-type-options'), 'nosniff');
    assert.match(positive.headers.get('cache-control'), /private.*no-store/);
    assert.deepEqual(Buffer.from(await positive.arrayBuffer()), bytes);
    return id;
  } catch (error) {
    diagnostics?.fail(error);
    // Preserve the originating failure phase, never the provider/body/cookie.
    throw new Error(`FAIL: receipt ${phase} failed; details withheld`);
  }
}

export async function runOwnerProof({ env, siteUrl, signal, transport = globalThis.fetch, quiesceFrontend, diagnostics }) {
  const { url: api, anonKey, serviceKey, passwords } = remoteConfig(env, 'run');
  const site = loopback(siteUrl);
  assert.equal(typeof quiesceFrontend, 'function', 'owned frontend quiescence required before cleanup');
  const require = createRequire(new URL('../../../apps/web/package.json', import.meta.url));
  const { createClient } = require('@supabase/supabase-js');
  const { createServerClient } = require('@supabase/ssr');
  let activeSignal = signal ?? AbortSignal.timeout(90000);
  const observed = diagnostics?.wrapFetch(transport) ?? transport;
  const remoteFetch = (input, init) => boundedRemoteFetch(observed, activeSignal)(input, init);
  const boundedFetch = (input, init = {}) => {
    const url = new URL(input);
    assert.equal(url.origin, site);
    return observed(input, { ...init, redirect: 'error', signal: AbortSignal.any([AbortSignal.timeout(8000), signal].filter(Boolean)) });
  };
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: remoteFetch } };
  const admin = createClient(api, serviceKey, options);
  const ledger = ownedLedger();
  const { users } = ledger;
  let ownerIndex = 0;
  const run = randomUUID(), name = `receipt-proof-${run}`;
  const session = () => {
    const jar = new Map();
    const client = createServerClient(api, anonKey, { auth: { autoRefreshToken: false }, global: { fetch: remoteFetch },
      cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })),
        setAll: cookies => { for (const { name, value } of cookies) jar.set(name, value); } } });
    const entry = { client, cookie: () => [...jar].map(([name, value]) => `${name}=${value}`).join('; ') };
    ledger.sessions.push(client); return entry;
  };
  const owner = async () => {
    const email = `receipt-${randomUUID()}@example.invalid`, password = passwords[ownerIndex++];
    const id = uuid(randomUUID()); users.add(id);
    const created = await admin.auth.admin.createUser({ id, email, password, email_confirm: true });
    assert.equal(created.error, null); assert.equal(created.data.user.id, id);
    const entry = session();
    assert.equal((await entry.client.auth.signInWithPassword({ email, password })).error, null);
    const verified = await entry.client.auth.getUser();
    assert.equal(verified.error, null); assert.equal(verified.data.user.id, id);
    assert.ok(verified.data.user.email_confirmed_at && !verified.data.user.is_anonymous);
    return { ...entry, id };
  };
  const business = async (owner, suffix) => {
    const id = uuid(randomUUID()), storefrontId = id, slug = `${name}-${suffix}`;
    ledger.businesses.add(id); ledger.storefronts.add(storefrontId);
    assert.equal((await admin.from('businesses').insert({ id, owner_id: owner.id, name })).error, null);
    assert.equal((await admin.from('business_storefronts').insert({ business_id: id, slug, display_name: name, is_published: true })).error, null);
    const visible = await owner.client.from('businesses').select('id,owner_id,name').eq('id', id).single();
    assert.equal(visible.error, null); assert.equal(visible.data.owner_id, owner.id); assert.equal(visible.data.name, name);
    return { id, slug };
  };
  // Only newly created actor/business prefixes are inspected/cleaned; never scan
  // a bucket or delete old data. Upload failures can leave a private orphan.
  const objects = async () => {
    const found = [];
    for (const scope of ledger.namespaces.values()) found.push(...await namespacePaths(admin, scope));
    return found.sort();
  };
  const metadata = async () => {
    const rows = [];
    for (const scope of ledger.namespaces.values()) rows.push(...await namespaceMetadata(admin, scope));
    return rows.sort((a, b) => a.id.localeCompare(b.id));
  };
  const snapshot = async () => {
    const rows = await metadata(), blobs = [];
    for (const path of await objects()) {
      const result = await admin.storage.from('guest-receipts').download(path);
      assert.equal(result.error, null);
      const bytes = Buffer.from(await result.data.arrayBuffer());
      blobs.push({ path, size: bytes.length, sha256: sha(bytes) });
    }
    return { metadataCount: rows.length, objectCount: blobs.length, metadata: rows, objects: blobs };
  };
  const get = (actor, shop, id) => boundedFetch(`${site}/api/checkout/receipts/${id}?slug=${shop.slug}`, { headers: { Cookie: actor.cookie() } });
  let failure, gap;
  try {
    diagnostics?.step('owner-preflight');
    assert.equal((await admin.from('guest_receipts').select('id').eq('id', randomUUID())).error, null);
    diagnostics?.step('owner-accounts');
    const a = await owner(), b = await owner();
    diagnostics?.step('owner-businesses');
    const shopA = await business(a, 'a'), shopB = await business(b, 'b');
    // Assert actual ownerB authority over B via the public API, not an email claim.
    diagnostics?.step('owner-bounds');
    const ownsB = await b.client.from('businesses').select('id,owner_id').eq('id', shopB.id).single();
    assert.equal(ownsB.error, null); assert.equal(ownsB.data.owner_id, b.id);
    const cannotOwnA = await b.client.from('businesses').select('id').eq('id', shopA.id);
    assert.equal(cannotOwnA.error, null); assert.deepEqual(cannotOwnA.data, []);
    diagnostics?.step('owner-anonymous');
    const actor = session();
    const actorId = await signInKnownAnonymous(actor.client, ledger);
    const { makePng, makePdf } = await import('../../../apps/web/tests/receipt-file-fixtures.mjs');
    const bytes = makePng();
    const upload = (entry, actorId, original, mime) => postReceipt({
      ledger, business: shopA.id, actor: actorId, site, slug: shopA.slug,
      cookie: entry.cookie(), bytes: original, mime, request: boundedFetch, diagnostics,
    });
    diagnostics?.step('owner-post-png');
    const id = await upload(actor, actorId, bytes, 'image/png');
    diagnostics?.step('owner-post-pdf');
    await upload(actor, actorId, makePdf(), 'application/pdf');
    diagnostics?.step('owner-post-self');
    await upload(a, a.id, bytes, 'image/png'); // Confirmed owner/self remains a valid buyer in A.
    diagnostics?.step('owner-denials');
    const before = await snapshot();
    assert.equal(before.metadataCount, 3); assert.equal(before.objectCount, 3);
    const denied = await get(b, shopA, id);
    assert.equal(denied.status, 404); assert.deepEqual(await denied.json(), { error: 'Receipt not found' });
    assert.match(denied.headers.get('cache-control'), /private.*no-store/);
    const wrongBusiness = await get(actor, shopB, id);
    assert.equal(wrongBusiness.status, 404);
    assertMetadataDenied(await b.client.from('guest_receipts').select('*').eq('id', id));
    assertStorageReadDenied(await b.client.storage.from('guest-receipts').download(`${shopA.id}/${actorId}/${id}`));
    assertOwnedStateUnchanged(before, await snapshot());
    diagnostics?.step('owner-positive');
    const stillOwn = await get(actor, shopA, id);
    assert.equal(stillOwn.status, 200); assert.deepEqual(Buffer.from(await stillOwn.arrayBuffer()), bytes);
  } catch (error) { diagnostics?.fail(error); failure = error; if (/^GAP: RECEIPT_[A-Z_]+$/.test(error?.message)) gap = error.message; }
  // Stop the driver's owned Next process before discovery: a failed POST must
  // not continue writing behind the cleanup snapshot. Never stop a foreign app.
  diagnostics?.step('owner-quiesce');
  let quiesceFailed = false;
  try { await quiesceFrontend(); } catch { quiesceFailed = true; }
  diagnostics?.step('owner-cleanup');
  activeSignal = AbortSignal.timeout(30000); // independent cleanup deadline
  const cleanup = await cleanupOwned(admin, ledger, Boolean(failure));
  diagnostics?.step('owner-cleanup-complete');
  if (quiesceFailed) cleanup.cleanupFailures.unshift('owned-frontend-quiesce');
  if (cleanup.proofFailed || cleanup.cleanupFailures.length) throw safeFailure(cleanup, gap, failure);
  return { ownerBConfirmed: true, ownerBReallyOwnsB: true, ownerBReceiptADenied: true,
    actorAndOwnerSelfPositive: true, originalPngPdfPostGet: true, ownedBytesAndCountersUnchanged: true, ownCleanupCompleted: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const mode = cliMode(process.argv.slice(2)); remoteConfig(process.env, mode);
    if (mode === 'run') throw new Error('GAP: RECEIPT_OWNED_NEXT_DRIVER');
    console.log('PLAN: remote owner A/B proof; use reviewed remote-proof driver; no network or writes');
  } catch (error) { console.error(safeDiagnostic(error)); process.exitCode = 2; }
}
