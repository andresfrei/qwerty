import type { Contact } from "./checkout-draft";
import type { LeafSelection, ProfileSelection } from "./catalog-profiles";
import type { ConfiguredCatalogSnapshot } from "./catalog-configuration-runtime";
import type { ProfileComponentSnapshot, ProfileGroupSnapshot } from "./catalog-profile-pricing";
// @ts-expect-error Native Node tests require explicit extensions.
import { normalizePickupIntent, ORDER_MAX_LINES, ORDER_MAX_PICKS } from "./order-quote.ts";
// @ts-expect-error Native Node tests require explicit extensions.
import { parseProfileSelection, validateProfileSelection } from "./catalog-profiles.ts";
// @ts-expect-error Native Node tests require explicit extensions.
import { priceProfileSelection, describeProfileSelection } from "./catalog-profile-pricing.ts";
// @ts-expect-error Native Node tests require explicit extensions.
import { validateConfiguredCatalogSnapshot, projectConfiguredCatalog } from "./catalog-configuration-runtime.ts";

export const CONFIGURED_ORDER_MAX_BYTES = 1024 * 1024;
export type ConfiguredIntentLine = { itemId: string; quantity: number; selection: ProfileSelection };
export type ConfiguredPickupIntent = {
  version: 2; slug: string; requestId: string; receiptId: string; contact: Contact;
  expected: { currency: string; totalMinor: number }; lines: ConfiguredIntentLine[];
};
export type ConfiguredQuoteLine = ConfiguredIntentLine & {
  name: string; currency: string; profileVersion: number;
  profileKind: "legacy" | "standard" | "pizza" | "dozen" | "combo";
  unitPriceMinor: number; lineTotalMinor: number; surchargeMinor: number;
  selectionText: string; groups: ProfileGroupSnapshot[]; components: ProfileComponentSnapshot[];
};
export type ConfiguredPickupQuote = {
  version: 2; snapshotFingerprint: string; businessId: string; currency: string;
  totalMinor: number; contact: Contact; lines: ConfiguredQuoteLine[];
};
export type ConfiguredOrderFailure = { ok: false; code: "invalid_request" | "invalid_selection" | "mixed_currency" | "unavailable" | "amount_out_of_range" };
export type ConfiguredQuoteResult = { ok: true; quote: ConfiguredPickupQuote } | ConfiguredOrderFailure | { ok: false; code: "quote_changed"; quote: ConfiguredPickupQuote };
const fail = (code: ConfiguredOrderFailure["code"]): ConfiguredOrderFailure => ({ ok: false, code });
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const keys = (v: Record<string, unknown>, expected: string[]) => Object.keys(v).length === expected.length && expected.every(k => Object.hasOwn(v, k));
const money = (v: number) => Number.isSafeInteger(v) && v >= 0;

// Reject non-JSON/cycles/deep input before serialization. Pretty JSON is a
// conservative upper bound for SQL jsonb::text's separator spaces at 1 MiB.
function bounded(value: unknown): boolean {
  const ancestors = new Set<object>();
  let nodes = 0, chars = 0;
  function visit(v: unknown, depth: number): boolean {
    if (depth > 24 || ++nodes > CONFIGURED_ORDER_MAX_BYTES || chars > CONFIGURED_ORDER_MAX_BYTES) return false;
    if (typeof v === "string") { chars += v.length; return chars <= CONFIGURED_ORDER_MAX_BYTES; }
    if (v === null || typeof v === "boolean" || typeof v === "number" && Number.isFinite(v)) return true;
    if (!v || typeof v !== "object" || ancestors.has(v)) return false;
    if (!Array.isArray(v) && Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null) return false;
    ancestors.add(v);
    const valid = Object.entries(v).every(([k, child]) => { chars += k.length; return visit(child, depth + 1); });
    ancestors.delete(v);
    return valid;
  }
  return visit(value, 0) && new TextEncoder().encode(JSON.stringify(value, null, 1)).length <= CONFIGURED_ORDER_MAX_BYTES;
}
function orderedLeaf(s: LeafSelection): LeafSelection {
  return { ...s, groups: s.groups.map(g => ({ groupId: g.groupId, picks: g.picks.map(p => ({ ...p })).sort((a, b) => a.optionId.localeCompare(b.optionId)) })).sort((a, b) => a.groupId.localeCompare(b.groupId)) };
}
function orderedSelection(s: ProfileSelection): ProfileSelection {
  return s.kind === "combo" ? { ...s, components: s.components.map(c => ({ ...c, selection: orderedLeaf(c.selection) })).sort((a, b) => a.componentId.localeCompare(b.componentId) || a.instanceIndex - b.instanceIndex) } : orderedLeaf(s);
}

// V2 is explicit on the wire. Route/query slug, never a body-supplied authority.
// Calling the unchanged v1 normalizer with ONE empty-selection line reuses the
// actual common envelope/quantity rules without flattening or downgrading v2.
export function normalizeConfiguredPickupIntent(input: unknown, slug: string): { ok: true; intent: ConfiguredPickupIntent } | ConfiguredOrderFailure {
  if (!bounded(input) || !record(input) || !keys(input, ["version", "requestId", "receiptId", "contact", "expected", "lines"]) || input.version !== 2
    || !Array.isArray(input.lines) || !input.lines.length || input.lines.length > ORDER_MAX_LINES) return fail("invalid_request");
  const lines: ConfiguredIntentLine[] = [], variants = new Set<string>();
  let picksUsed = 0, groupsUsed = 0;
  let envelope: ReturnType<typeof normalizePickupIntent> | undefined;
  for (const line of input.lines) {
    if (!record(line) || !keys(line, ["itemId", "quantity", "selection"])) return fail("invalid_request");
    const common = normalizePickupIntent({ requestId: input.requestId, receiptId: input.receiptId, contact: input.contact, expected: input.expected, lines: [{ itemId: line.itemId, quantity: line.quantity, selection: [] }] }, slug);
    if (!common.ok) return common;
    envelope = common;
    const parsed = parseProfileSelection(line.selection);
    if (!parsed.ok) return fail("invalid_selection");
    const selection = orderedSelection(parsed.value);
    const leaves = selection.kind === "combo" ? selection.components.map(c => c.selection) : [selection];
    if (selection.kind === "combo" && !selection.components.length) return fail("invalid_selection");
    if ((selection.kind === "legacy") !== (selection.profileVersion === 0)) return fail("invalid_selection");
    for (const leaf of leaves) {
      if ((leaf.kind === "legacy") !== (leaf.profileVersion === 0)) return fail("invalid_selection");
      for (const group of leaf.groups) {
        groupsUsed++; picksUsed += group.picks.length;
        if (groupsUsed > ORDER_MAX_PICKS || picksUsed > ORDER_MAX_PICKS) return fail("invalid_selection");
        if (leaf.kind === "legacy" && new Set(group.picks.map(p => p.optionId)).size !== group.picks.length) return fail("invalid_selection");
      }
    }
    const { itemId, quantity } = common.intent.lines[0];
    const variant = `${itemId}:${JSON.stringify(selection)}`;
    if (variants.has(variant)) return fail("invalid_request");
    variants.add(variant); lines.push({ itemId, quantity, selection });
  }
  if (!envelope?.ok) return fail("invalid_request");
  lines.sort((a, b) => `${a.itemId}:${JSON.stringify(a.selection)}`.localeCompare(`${b.itemId}:${JSON.stringify(b.selection)}`));
  const intent: ConfiguredPickupIntent = { ...envelope.intent, version: 2, lines };
  return bounded(intent) ? { ok: true, intent } : fail("invalid_request");
}

// Pure server boundary: no writes, actor authority, replay or freshness claim.
// The service must replay before fetching catalog; SQL rechecks freshness later.
export function quoteConfiguredPickupOrder(input: unknown, snapshot: ConfiguredCatalogSnapshot): ConfiguredQuoteResult {
  if (!record(input) || !keys(input, ["version", "slug", "requestId", "receiptId", "contact", "expected", "lines"]) || typeof input.slug !== "string") return fail("invalid_request");
  const normalized = normalizeConfiguredPickupIntent({ version: input.version, requestId: input.requestId, receiptId: input.receiptId, contact: input.contact, expected: input.expected, lines: input.lines }, input.slug);
  if (!normalized.ok) return normalized;
  const intent = normalized.intent;
  const checked = validateConfiguredCatalogSnapshot(snapshot, snapshot?.businessId, intent.slug);
  if (!checked) return fail("unavailable");
  const lines: ConfiguredQuoteLine[] = [];
  let currency: string | undefined, totalMinor = 0;
  for (const line of intent.lines) {
    const projected = projectConfiguredCatalog(checked, line.itemId);
    if (!projected.ok) return fail("unavailable");
    const request = { catalog: projected.value, itemId: line.itemId, selection: line.selection };
    const resolved = validateProfileSelection(request);
    if (!resolved.ok) return fail(resolved.errors.some(e => e.code === "unavailable") ? "unavailable" : "invalid_selection");
    const { item, document, selection } = resolved.value;
    if (currency && currency !== item.currency) return fail("mixed_currency");
    currency = item.currency;
    // The old order boundary's distinct-quantity guard still applies to wrapped
    // legacy selections; never use permissive descriptions as acceptance.
    if (selection.kind === "legacy" && selection.groups.some(g => projected.value.groups.find(row => row.id === g.groupId)?.selection_mode === "distinct" && g.picks.some(p => p.quantity !== 1))) return fail("invalid_selection");
    const price = priceProfileSelection(request);
    if (!price.ok) return fail(price.errors.some(e => e.code === "amount_out_of_range") ? "amount_out_of_range" : "invalid_selection");
    const lineTotalMinor = price.unitPriceMinor * line.quantity;
    if (!money(price.unitPriceMinor) || !money(price.surchargeMinor) || !money(lineTotalMinor) || !money(totalMinor + lineTotalMinor)) return fail("amount_out_of_range");
    const description = describeProfileSelection(request);
    if (!description.ok) return fail("invalid_selection");
    totalMinor += lineTotalMinor;
    // Only explicit accepted snapshot fields cross the private catalog boundary.
    // T1 returns fresh groups/children/selection with immutable kitchen names and
    // instance identities. Child prices are deliberately not billed or exposed.
    lines.push({ itemId: item.id, quantity: line.quantity, selection, name: item.name,
      currency: item.currency, profileVersion: selection.profileVersion, profileKind: document?.kind ?? "legacy",
      unitPriceMinor: price.unitPriceMinor, lineTotalMinor, surchargeMinor: price.surchargeMinor,
      selectionText: description.text, groups: description.groups, components: description.components });
    if (!bounded(lines)) return fail("amount_out_of_range");
  }
  if (!currency) return fail("invalid_request");
  const quote: ConfiguredPickupQuote = { version: 2, snapshotFingerprint: checked.fingerprint, businessId: checked.businessId, currency, totalMinor, contact: { ...intent.contact }, lines };
  if (!bounded(quote)) return fail("amount_out_of_range");
  return intent.expected.currency === currency && intent.expected.totalMinor === totalMinor ? { ok: true, quote } : { ok: false, code: "quote_changed", quote };
}
