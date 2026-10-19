// Operator-only, effect-free diagnostics. Never retain requests, bodies or errors.
const stages = new Set([
  'driver-start', 'driver-build', 'driver-readiness', 'driver-basic', 'driver-owner', 'driver-cleanup',
  'basic-preflight', 'basic-anonymous', 'basic-account', 'basic-business', 'basic-stage',
  'basic-metadata-read', 'basic-positive-control', 'basic-metadata-insert', 'basic-storage-upload',
  'basic-storage-upsert', 'basic-storage-download', 'basic-storage-sign', 'basic-storage-list',
  'basic-public', 'basic-cleanup', 'basic-cleanup-complete',
  'owner-preflight', 'owner-accounts', 'owner-businesses', 'owner-bounds', 'owner-anonymous',
  'owner-post-png', 'owner-post-pdf', 'owner-post-self', 'owner-denials', 'owner-positive',
  'owner-quiesce', 'owner-cleanup', 'owner-cleanup-complete', 'receipt-post', 'receipt-get',
]);
function kind(error) {
  try {
    if (error?.name === 'AssertionError') return 'assertion';
    if (error?.name === 'TimeoutError') return 'timeout';
    if (error?.name === 'AbortError') return 'abort';
  } catch {}
  return 'other';
}
export function createProofDiagnostics() {
  const state = { stage: 'driver-start', history: [], requests: 0, stageRequests: 0,
    httpStatus: null, transportErrorKind: null, failure: null };
  return Object.freeze({
    step(stage) {
      if (!stages.has(stage)) throw new Error('REFUSED: diagnostic stage');
      state.stage = stage; state.history.push(stage);
      if (state.history.length > 64) state.history.shift();
      state.stageRequests = 0; state.httpStatus = null; state.transportErrorKind = null;
    },
    fail(error) {
      // Cleanup and outer privacy wrappers must not replace the first failure.
      state.failure ??= { stage: state.stage, kind: kind(error), httpStatus: state.httpStatus,
        transportErrorKind: state.transportErrorKind, requests: state.requests, stageRequests: state.stageRequests };
    },
    wrapFetch(transport) {
      return async (...args) => {
        state.requests++; state.stageRequests++; state.httpStatus = null; state.transportErrorKind = null;
        try {
          const response = await transport(...args);
          const status = response?.status;
          state.httpStatus = Number.isInteger(status) && status >= 100 && status <= 599 ? status : null;
          return response;
        } catch (error) { state.transportErrorKind = kind(error); throw error; }
      };
    },
    snapshot() { return structuredClone(state); },
  });
}
