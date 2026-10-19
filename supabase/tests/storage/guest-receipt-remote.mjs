// Source-only S12 executor primitives. No environment reads or I/O on import.
import assert from 'node:assert/strict';
export const REMOTE_ORIGIN = 'https://jxebudqzcmxgdsegrrqw.supabase.co';
export const PROJECT = 'jxebudqzcmxgdsegrrqw';
const uuid = value => { assert.match(value, /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/); return value; };
export function remoteConfig(env, mode = 'plan') {
  if (!['plan', 'run'].includes(mode)) throw new Error('REFUSED: mode');
  const requireField = key => { if (!env[key]) throw new Error(`GAP: ${key}`); return env[key]; };
  if (requireField('RECEIPT_REMOTE_URL') !== REMOTE_ORIGIN) throw new Error('REFUSED: RECEIPT_REMOTE_URL');
  if (requireField('RECEIPT_REMOTE_PROJECT') !== PROJECT) throw new Error('REFUSED: RECEIPT_REMOTE_PROJECT');
  for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL', 'RECEIPT_LOCAL_URL']) {
    if (env[key] && env[key] !== REMOTE_ORIGIN) throw new Error('REFUSED: overridden backend URL');
  }
  const config = { url: REMOTE_ORIGIN, project: PROJECT };
  if (mode === 'run') {
    for (const key of ['RECEIPT_S12_REVIEWED', 'RECEIPT_OWNER_GUARD_VERIFIED']) {
      if (requireField(key) !== 'yes') throw new Error(`GAP: ${key}`);
    }
    config.anonKey = requireField('RECEIPT_REMOTE_ANON_KEY');
    config.serviceKey = requireField('RECEIPT_REMOTE_SERVICE_KEY');
    config.passwords = [requireField('RECEIPT_OWNER_A_PASSWORD'), requireField('RECEIPT_OWNER_B_PASSWORD')];
  }
  return config;
}
export function boundedRemoteFetch(transport = globalThis.fetch, globalSignal) {
  return async (input, init = {}) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (url.origin !== REMOTE_ORIGIN || url.username || url.password || url.hash || (init.redirect && init.redirect !== 'error')) throw new Error('REFUSED: request target');
    const signals = [AbortSignal.timeout(8000), globalSignal, init.signal].filter(Boolean);
    return transport(input, { ...init, redirect: 'error', signal: AbortSignal.any(signals) });
  };
}
export function ownedLedger() {
  const ledger = { sessions: [], users: new Set(), businesses: new Set(), storefronts: new Set(), receipts: new Set(), paths: new Set(), namespaces: new Map() };
  ledger.registerNamespace = (business, actor) => {
    const prefix = `${uuid(business)}/${uuid(actor)}`;
    assert.ok(ledger.businesses.has(business) && ledger.users.has(actor), 'both namespace identities must already belong to this run');
    ledger.namespaces.set(prefix, Object.freeze({ business, actor, prefix }));
    return prefix;
  };
  ledger.recordReceipt = (business, actor, id) => {
    const path = `${uuid(business)}/${uuid(actor)}/${uuid(id)}`;
    ledger.receipts.add(id); ledger.paths.add(path); return path;
  };
  return ledger;
}
export async function namespaceMetadata(admin, scope) {
  const result = await admin.from('guest_receipts').select('*')
    .eq('business_id', scope.business).eq('actor_id', scope.actor).order('id').limit(1000);
  assert.equal(result.error, null);
  assert.ok(Array.isArray(result.data) && result.data.length < 1000, 'bounded complete namespace metadata required');
  for (const row of result.data) {
    assert.equal(row.business_id, scope.business); assert.equal(row.actor_id, scope.actor);
    assert.equal(row.object_path, `${scope.prefix}/${uuid(row.id)}`);
  }
  return result.data;
}
export async function namespacePaths(admin, scope) {
  const result = await admin.storage.from('guest-receipts').list(scope.prefix, { limit: 1000, sortBy: { column: 'name', order: 'asc' } });
  assert.equal(result.error, null);
  assert.ok(Array.isArray(result.data) && result.data.length < 1000, 'bounded complete namespace listing required');
  return result.data.map(object => `${scope.prefix}/${uuid(object.name)}`);
}
export async function signInKnownAnonymous(client, ledger) {
  // Register the client before the call so any known in-memory session is revoked
  // even when the provider response is missing/ambiguous. Never scan Auth users.
  if (!ledger.sessions.includes(client)) ledger.sessions.push(client);
  let response;
  try { response = await client.auth.signInAnonymously(); }
  catch { throw new Error('GAP: RECEIPT_ANONYMOUS_ACTOR_CREATION_OR_REVOCATION_UNKNOWN'); }
  const id = response.data?.user?.id ?? response.data?.session?.user?.id;
  try { if (id) ledger.users.add(uuid(id)); }
  catch { throw new Error('GAP: RECEIPT_ANONYMOUS_ACTOR_CREATION_OR_REVOCATION_UNKNOWN'); }
  if (response.error?.code === 'anonymous_provider_disabled') throw new Error('GAP: RECEIPT_ANONYMOUS_AUTH_CAPABILITY');
  if (response.error || !id || !response.data?.session?.access_token || response.data?.user?.is_anonymous !== true) {
    throw new Error('GAP: RECEIPT_ANONYMOUS_ACTOR_CREATION_OR_REVOCATION_UNKNOWN');
  }
  return id;
}
export async function cleanupOwned(admin, ledger, proofFailed) {
  const cleanupFailures = [];
  const step = async (label, operation) => {
    try { const result = await operation(); if (result?.error) throw new Error('cleanup'); }
    catch { cleanupFailures.push(label); }
  };
  for (const client of ledger.sessions) await step('session-global-signout', () => client.auth.signOut({ scope: 'global' }));
  // A successful signup and fresh business establish the exclusive tuple before
  // production POST. Discover only that tuple, including a lost POST response or
  // Storage orphan. Metadata and object discovery fail independently.
  for (const scope of ledger.namespaces.values()) {
    await step('namespace-metadata-discovery', async () => {
      for (const row of await namespaceMetadata(admin, scope)) ledger.recordReceipt(scope.business, scope.actor, row.id);
    });
    await step('namespace-object-discovery', async () => {
      for (const path of await namespacePaths(admin, scope)) ledger.paths.add(path);
    });
  }
  // Independently attempt every exact recorded resource, including negative writes.
  for (const path of ledger.paths) await step('object-remove', () => admin.storage.from('guest-receipts').remove([path]));
  for (const id of ledger.receipts) await step('receipt-delete', () => admin.from('guest_receipts').delete().eq('id', id));
  for (const id of ledger.storefronts) await step('storefront-delete', () => admin.from('business_storefronts').delete().eq('business_id', id));
  for (const id of ledger.businesses) await step('business-delete', () => admin.from('businesses').delete().eq('id', id));
  for (const id of ledger.users) await step('user-delete', () => admin.auth.admin.deleteUser(id));
  return { proofFailed, cleanupFailures };
}
export function safeFailure(result, gap, proofError) {
  // Preserve both failure classes without serializing exceptions/provider payloads.
  const namedGap = /^GAP: RECEIPT_[A-Z_]+$/.test(gap ?? '') ? gap : null;
  const safeCause = /^FAIL: receipt (?:POST|GET) failed; details withheld$/.test(proofError?.message)
    ? proofError : result.proofFailed ? new Error(namedGap ?? 'FAIL: proof phase failed; details withheld') : undefined;
  const error = new Error(namedGap ?? 'FAIL: remote proof or exact owned cleanup; details withheld', { cause: safeCause });
  error.proofFailed = result.proofFailed;
  error.cleanupFailures = result.cleanupFailures;
  return error;
}
export function cliMode(args) {
  if (args.length === 0 || (args.length === 1 && args[0] === '--plan')) return 'plan';
  if (args.length === 1 && args[0] === '--run') return 'run';
  throw new Error('REFUSED: mode');
}
export function safeDiagnostic(error) {
  return /^(?:GAP: RECEIPT_[A-Z_]+|REFUSED: [a-zA-Z_ ]+)$/.test(error?.message) ? error.message : 'REFUSED: proof failed; details withheld';
}
