// Invented values only; no environment reads or live effects.
import {REMOTE_ORIGIN} from '../../../supabase/tests/storage/guest-receipt-remote.mjs';
export const env = () => ({ RECEIPT_REMOTE_URL: REMOTE_ORIGIN, RECEIPT_REMOTE_PROJECT: 'jxebudqzcmxgdsegrrqw', RECEIPT_S12_REVIEWED: 'yes', RECEIPT_OWNER_GUARD_VERIFIED: 'yes', RECEIPT_REMOTE_ANON_KEY: 'public-sentinel', RECEIPT_REMOTE_SERVICE_KEY: 'private-sentinel', RECEIPT_OWNER_A_PASSWORD: 'owner-a-sentinel', RECEIPT_OWNER_B_PASSWORD: 'owner-b-sentinel' });
export const fixtureIds = {
  business: '11111111-1111-4111-8111-111111111111',
  actor: '22222222-2222-4222-8222-222222222222',
  receipt: '33333333-3333-4333-8333-333333333333',
  foreign: '44444444-4444-4444-8444-444444444444',
};
