// Imported without effects. The reviewed driver's Node preload explicitly calls
// installRemoteRuntimeGuard before Next loads; never installed in product source.
import { boundedRemoteFetch } from './guest-receipt-remote.mjs';
export function installRemoteRuntimeGuard() {
  globalThis.fetch = boundedRemoteFetch(globalThis.fetch, AbortSignal.timeout(420000));
}
