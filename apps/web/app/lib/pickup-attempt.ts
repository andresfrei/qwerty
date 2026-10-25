// Legacy references remain selector-only. The additive scoped v2 envelope below
// intentionally freezes the complete submitted intent, never receipt file bytes.
// @ts-expect-error Native Node tests require explicit extensions.
import { isCorrectableCode, pickupSlug, pickupUUID, type CorrectableCode, type AcceptedOrderIntent } from "./pickup-order-client.ts";
// @ts-expect-error Native Node tests require explicit extensions.
import { normalizeConfiguredPickupIntent } from "./configured-order-quote.ts";
// @ts-expect-error Native Node tests require explicit extensions.
import { normalizePickupIntent } from "./order-quote.ts";
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
  try {
    const storage = acquire();
    const configured = readConfiguredAttempt(storage, slug);
    if (!configured.ok) return { reference: null, unavailable: true };
    if (configured.attempt) return { reference: { businessId: configured.attempt.businessId, slug,
      requestId: configured.attempt.intent.requestId, receiptId: configured.attempt.intent.receiptId }, unavailable: false };
    raw = storage.getItem(key(slug));
  } catch { return { reference: null, unavailable: true }; }
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

export type ConfiguredAttempt = {
  version: 2; businessId: string; slug: string;
  status: "pending" | "unknown" | "correction" | "confirmed";
  intent: AcceptedOrderIntent; cartSnapshot: { key: string; value: string };
  correction?: CorrectableCode;
};
export const configuredAttemptKey = (slug: string) => `qwerty:pickup:v2:${slug}`;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
function parseConfiguredAttempt(value: unknown, slug: string): ConfiguredAttempt | null {
  try {
    if (!object(value) || value.version !== 2 || value.slug !== slug || !pickupSlug(slug) || !pickupUUID(value.businessId)
      || !["pending", "unknown", "correction", "confirmed"].includes(String(value.status))
      || Object.keys(value).some(k => !["version", "businessId", "slug", "status", "intent", "cartSnapshot", "correction"].includes(k))
      || (value.status === "correction" ? !isCorrectableCode(value.correction) : value.correction !== undefined)
      || !object(value.intent) || !object(value.cartSnapshot) || Object.keys(value.cartSnapshot).length !== 2
      || typeof value.cartSnapshot.value !== "string"
      || ![`qwerty:cart:v3:${value.businessId}:${slug}`, `qwerty:cart:v1:${value.businessId}`].includes(String(value.cartSnapshot.key))
      || new TextEncoder().encode(JSON.stringify(value)).length > 6 * 1048576) return null;
    const valid = value.intent.version === 2 ? normalizeConfiguredPickupIntent(value.intent, slug) : normalizePickupIntent(value.intent, slug);
    if (!valid.ok) return null;
    // Validation never replaces the frozen wire with a later quote's normalized
    // selection. In particular, duplicate identical halves remain original intent.
    return structuredClone(value) as ConfiguredAttempt;
  } catch { return null; }
}
export function readConfiguredAttempt(storage: StorageReader, slug: string): { ok: true; attempt: ConfiguredAttempt | null } | { ok: false } {
  try {
    const raw = storage.getItem(configuredAttemptKey(slug));
    if (raw === null) return { ok: true, attempt: null };
    const attempt = parseConfiguredAttempt(JSON.parse(raw), slug);
    return attempt ? { ok: true, attempt } : { ok: false };
  } catch { return { ok: false }; }
}
export function saveConfiguredAttempt(storage: StorageReader & StorageWriter, value: unknown): boolean {
  const attempt = object(value) && typeof value.slug === "string" ? parseConfiguredAttempt(value, value.slug) : null;
  if (!attempt) return false;
  try {
    const serialized = JSON.stringify(attempt);
    storage.setItem(configuredAttemptKey(attempt.slug), serialized);
    return storage.getItem(configuredAttemptKey(attempt.slug)) === serialized;
  } catch { return false; }
}
