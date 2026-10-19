import assert from 'node:assert/strict';

// Pure assertions: importing this module performs no environment access or I/O.
export function assertMetadataDenied(result) {
  assert.ok(result.error && result.error.code === '42501' && [401, 403].includes(result.status), 'PostgREST42501 with HTTP401/403 required; success/null-data and constraint/provider errors are not authorization proof');
}

export function assertStorageWriteDenied(result) {
  const error = result.error;
  // Storage can transport a logical403 inside an HTTP400 JSON response.
  const status = String(error?.statusCode ?? error?.status);
  assert.ok(error && status === '403' && /row.level security|permission denied/i.test(error.message), 'Storage403 with an explicit RLS/permission denial required');
}

export function assertStorageReadDenied(result) {
  const error = result.error;
  const status = String(error?.statusCode ?? error?.status);
  assert.ok(error && ((status === '403' && /row.level security|permission denied/i.test(error.message)) ||
    (status === '404' && /^Object not found\.?$/i.test(error.message))), 'explicit Storage permission denial or hidden known-existing object required');
}

export function assertOwnedStateUnchanged(before, after) {
  assert.deepEqual(after, before, 'denied operation must not mutate own metadata/object counters, identities or bytes');
}

// Serial proof operations own an exclusive fixture namespace. A checked AFTER
// is the next BEFORE only until a trusted write explicitly invalidates it.
// Every operation still gets a fresh complete AFTER, including original hashes.
export function createOwnedStateVerifier(snapshot) {
  let previous;
  const verify = async operation => {
    const before = previous ?? structuredClone(await snapshot());
    previous = undefined; // A thrown operation/snapshot/assertion cannot seed reuse.
    const result = await operation(), after = await snapshot();
    assertOwnedStateUnchanged(before, after);
    previous = structuredClone(after);
    return result;
  };
  verify.invalidate = () => { previous = undefined; };
  return verify;
}
