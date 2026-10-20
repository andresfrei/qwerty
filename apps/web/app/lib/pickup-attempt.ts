// No contact, intent, credential or receipt bytes are stored here.
// @ts-expect-error Native Node tests require explicit extensions.
import { isCorrectableCode, pickupSlug, pickupUUID, type CorrectableCode } from "./pickup-order-client.ts";
export type AttemptReference = { businessId: string; slug: string; requestId: string; receiptId?: string; correction?: CorrectableCode };
type StorageReader = { getItem(key: string): string | null };
type StorageWriter = { setItem(key: string, value: string): void };
const key = (slug: string) => `qwerty:pickup:v1:${slug}`;
function reference(value: unknown): AttemptReference | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (!pickupUUID(v.businessId) || !pickupSlug(v.slug) || !pickupUUID(v.requestId) || (v.receiptId !== undefined && !pickupUUID(v.receiptId)) || (v.correction !== undefined && !isCorrectableCode(v.correction))) return null;
  return { businessId: v.businessId, slug: v.slug, requestId: v.requestId, ...(v.receiptId ? { receiptId: v.receiptId as string } : {}), ...(isCorrectableCode(v.correction) ? { correction: v.correction } : {}) };
}
export function saveAttempt(storage: StorageWriter, value: unknown): boolean {
  const v = reference(value); if (!v) return false;
  try { storage.setItem(key(v.slug), JSON.stringify(v)); return true; } catch { return false; }
}
export function readAttemptState(acquire: () => StorageReader, slug: string): { reference: AttemptReference | null; unavailable: boolean } {
  let raw: string | null;
  try { raw = acquire().getItem(key(slug)); } catch { return { reference: null, unavailable: true }; }
  try {
    const parsed = JSON.parse(raw ?? "null");
    if (!pickupSlug(slug) || (parsed && Object.keys(parsed).some(k => !["businessId", "slug", "requestId", "receiptId", "correction"].includes(k)))) return { reference: null, unavailable: false };
    const v = reference(parsed);
    return { reference: v?.slug === slug ? v : null, unavailable: false };
  } catch { return { reference: null, unavailable: false }; }
}
export function readAttempt(storage: StorageReader, slug: string): AttemptReference | null {
  return readAttemptState(() => storage, slug).reference;
}
// Called only after actor-scoped POST/recovery, never a known-ID read.
export function clearSubmittedCartState(acquire: () => StorageReader & StorageWriter, businessId: string, snapshot: string): "cleared" | "changed" | "unavailable" {
  if (!pickupUUID(businessId)) return "changed";
  const cartKey = `qwerty:cart:v1:${businessId}`;
  try {
    const storage = acquire();
    if (storage.getItem(cartKey) !== snapshot) return "changed";
    storage.setItem(cartKey, JSON.stringify({ version: 2, businessId, items: [] }));
    return "cleared";
  } catch { return "unavailable"; }
}
export function clearSubmittedCart(storage: StorageReader & StorageWriter, businessId: string, snapshot: string): boolean {
  return clearSubmittedCartState(() => storage, businessId, snapshot) === "cleared";
}
