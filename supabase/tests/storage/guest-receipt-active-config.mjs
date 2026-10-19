// Operator-only configuration adapter. No environment reads, files or network.
import { getSupabaseConfig } from '../../../apps/web/app/lib/supabase/config.ts';
import { REMOTE_ORIGIN, PROJECT, remoteConfig } from './guest-receipt-remote.mjs';

export function prepareRemoteRunEnvironment(environment, passwords) {
  const active = getSupabaseConfig(environment);
  if (!active || active.url !== REMOTE_ORIGIN) throw new Error('REFUSED: active backend configuration');
  // Resolve exactly the app's active pair, then pass only canonical proof fields.
  // An unused legacy fallback must not override a valid official pair. The active
  // origin and explicit proof target still fail closed; no file is rewritten.
  if ((environment.RECEIPT_REMOTE_URL && environment.RECEIPT_REMOTE_URL !== REMOTE_ORIGIN) ||
      (environment.RECEIPT_REMOTE_PROJECT && environment.RECEIPT_REMOTE_PROJECT !== PROJECT)) {
    throw new Error('REFUSED: explicit proof target');
  }
  const serviceKey = environment.RECEIPT_REMOTE_SERVICE_KEY?.trim() ||
    environment.SUPABASE_SERVICE_ROLE_KEY?.trim() || environment.SUPABASE_SECRET_KEY?.trim();
  const result = {
    RECEIPT_REMOTE_URL: active.url,
    RECEIPT_REMOTE_PROJECT: PROJECT,
    RECEIPT_REMOTE_ANON_KEY: active.anonKey,
    RECEIPT_REMOTE_SERVICE_KEY: serviceKey,
    RECEIPT_S12_REVIEWED: environment.RECEIPT_S12_REVIEWED,
    RECEIPT_OWNER_GUARD_VERIFIED: environment.RECEIPT_OWNER_GUARD_VERIFIED,
    RECEIPT_OWNER_A_PASSWORD: passwords?.[0],
    RECEIPT_OWNER_B_PASSWORD: passwords?.[1],
  };
  remoteConfig(result, 'run');
  return result;
}
