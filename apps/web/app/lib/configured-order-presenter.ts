import type { ConfiguredQuoteLine } from "./configured-order-quote";
import type { LeafSelection, ProfileSelection } from "./catalog-profiles";
import type { ProfileGroupSnapshot, ProfileComponentSnapshot } from "./catalog-profile-pricing";
// @ts-expect-error Native Node tests require explicit extensions.
import { normalizeConfiguredPickupIntent } from "./configured-order-quote.ts";
// @ts-expect-error Native Node tests require explicit extensions.
import { parseProfileSelection } from "./catalog-profiles.ts";

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const money = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const text = (v: unknown): v is string => typeof v === "string" && v.length <= 1048576;
const named = (v: unknown): v is string => text(v) && !!v.trim();
const exact = (v: Record<string, unknown>, names: string[]) => Object.keys(v).length === names.length && names.every(k => Object.hasOwn(v, k));
// Compare JSON by value rather than provider object-key order. Inputs below are
// bounded parsed data; this is not a permissive acceptance parser.
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (object(v)) return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}`;
  return JSON.stringify(v);
}
function canonical(selection: ProfileSelection, collapseHalves: boolean): ProfileSelection {
  const leaf = (s: LeafSelection): LeafSelection => ({ ...s, groups: s.groups.map(g => ({ ...g,
    picks: (collapseHalves && s.kind === "leaf" && g.picks.length === 2 && g.picks.every(p => p.quantity === 1) && g.picks[0].optionId === g.picks[1].optionId ? g.picks.slice(0, 1) : g.picks)
      .map(p => ({ ...p })).sort((a, b) => a.optionId.localeCompare(b.optionId)),
  })).sort((a, b) => a.groupId.localeCompare(b.groupId)) });
  return selection.kind === "combo" ? { ...selection, components: selection.components.map(c => ({ ...c, selection: leaf(c.selection) })).sort((a, b) => a.componentId.localeCompare(b.componentId) || a.instanceIndex - b.instanceIndex) } : leaf(selection);
}
export function sameConfiguredSelection(accepted: ProfileSelection, intended: ProfileSelection, kind: ConfiguredQuoteLine["profileKind"]): boolean {
  return stable(canonical(accepted, false)) === stable(canonical(intended, kind === "pizza" || kind === "combo"));
}
function groups(value: unknown, selection: LeafSelection): ProfileGroupSnapshot[] | null {
  if (!Array.isArray(value) || value.length !== selection.groups.filter(g => g.picks.length).length) return null;
  const seen = new Set<string>(), result: ProfileGroupSnapshot[] = [];
  for (const g of value) {
    if (!object(g) || !exact(g, ["groupId", "name", "picks"]) || !uuid(g.groupId) || seen.has(g.groupId) || !named(g.name) || !Array.isArray(g.picks)) return null;
    seen.add(g.groupId);
    const selected = selection.groups.find(s => s.groupId === g.groupId);
    if (!selected || g.picks.length !== selected.picks.length) return null;
    const picks: ProfileGroupSnapshot["picks"] = [], options = new Set<string>();
    for (const p of g.picks) {
      if (!object(p) || !exact(p, ["optionId", "name", "quantity"]) || !uuid(p.optionId) || options.has(p.optionId) || !named(p.name)
        || !money(p.quantity) || !selected.picks.some(s => s.optionId === p.optionId && s.quantity === p.quantity)) return null;
      options.add(p.optionId); picks.push({ optionId: p.optionId, name: p.name, quantity: p.quantity });
    }
    result.push({ groupId: g.groupId, name: g.name, picks });
  }
  return result;
}
// Shared stored/public codec: explicit accepted snapshots only, no current
// catalog, profiles, pricing, service identifiers or invented price certificate.
export function validateConfiguredQuoteLine(value: unknown): ConfiguredQuoteLine | null {
  if (!object(value) || !exact(value, ["itemId", "quantity", "selection", "name", "currency", "profileVersion", "profileKind", "unitPriceMinor", "lineTotalMinor", "surchargeMinor", "selectionText", "groups", "components"])
    || !uuid(value.itemId) || !money(value.quantity) || value.quantity < 1 || value.quantity > 99 || !named(value.name)
    || typeof value.currency !== "string" || !/^[A-Z]{3}$/.test(value.currency) || !money(value.profileVersion)
    || !money(value.unitPriceMinor) || !money(value.lineTotalMinor) || !money(value.surchargeMinor)
    || value.surchargeMinor > value.unitPriceMinor || value.lineTotalMinor !== value.unitPriceMinor * value.quantity
    || !text(value.selectionText) || !Array.isArray(value.components) || !Array.isArray(value.groups)) return null;
  const parsed = parseProfileSelection(value.selection);
  if (!parsed.ok || stable(parsed.value) !== stable(value.selection)) return null;
  const selection = parsed.value;
  const kind = value.profileKind;
  if (selection.profileVersion !== value.profileVersion || !["legacy", "standard", "pizza", "dozen", "combo"].includes(String(kind))
    || (kind === "legacy") !== (selection.kind === "legacy") || (kind === "combo") !== (selection.kind === "combo")
    || (kind === "legacy") !== (value.profileVersion === 0)) return null;
  let rootGroups: ProfileGroupSnapshot[] = [];
  const components: ProfileComponentSnapshot[] = [];
  if (selection.kind !== "combo") {
    const checked = groups(value.groups, selection);
    if (!checked || value.components.length) return null;
    rootGroups = checked;
  } else {
    if (value.groups.length || value.components.length !== selection.components.length) return null;
    const seen = new Set<string>();
    for (const c of value.components) {
      if (!object(c) || !exact(c, ["componentId", "instanceIndex", "itemId", "name", "profileVersion", "text", "groups"])
        || !uuid(c.componentId) || !money(c.instanceIndex) || !uuid(c.itemId) || !named(c.name) || !money(c.profileVersion) || !text(c.text)) return null;
      const identity = `${c.componentId}:${c.instanceIndex}`;
      if (seen.has(identity)) return null;
      seen.add(identity);
      const selected = selection.components.find(s => s.componentId === c.componentId && s.instanceIndex === c.instanceIndex);
      if (!selected || selected.selection.profileVersion !== c.profileVersion) return null;
      const checked = groups(c.groups, selected.selection);
      if (!checked) return null;
      // All instances of a fixed component must describe the same child.
      if (components.some(previous => previous.componentId === c.componentId && (previous.itemId !== c.itemId || previous.name !== c.name || previous.profileVersion !== c.profileVersion))) return null;
      components.push({ componentId: c.componentId, instanceIndex: c.instanceIndex, itemId: c.itemId, name: c.name, profileVersion: c.profileVersion, text: c.text, groups: checked });
    }
  }
  return { itemId: value.itemId, quantity: value.quantity, selection, name: value.name, currency: value.currency,
    profileVersion: value.profileVersion, profileKind: kind as ConfiguredQuoteLine["profileKind"], unitPriceMinor: value.unitPriceMinor,
    lineTotalMinor: value.lineTotalMinor, surchargeMinor: value.surchargeMinor, selectionText: value.selectionText, groups: rootGroups, components };
}
export function presentConfiguredPickupOrder(value: unknown) {
  if (!object(value) || !uuid(value.id) || !uuid(value.actor_id) || !uuid(value.business_id) || !uuid(value.request_id) || !uuid(value.receipt_id)
    || !object(value.intent) || value.intent.version !== 2 || typeof value.intent.slug !== "string"
    || !object(value.quote) || !exact(value.quote, ["version", "snapshotFingerprint", "businessId", "currency", "totalMinor", "contact", "lines"])
    || value.quote.version !== 2 || value.quote.businessId !== value.business_id || typeof value.quote.snapshotFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(value.quote.snapshotFingerprint)
    || !money(value.total_minor) || value.quote.totalMinor !== value.total_minor || value.quote.currency !== value.currency
    || typeof value.currency !== "string" || !/^[A-Z]{3}$/.test(value.currency)
    || value.fulfillment_state !== "pendiente_de_pago" || value.payment_state !== "pendiente"
    || !text(value.created_at) || !Number.isFinite(Date.parse(value.created_at))) throw Error("Invalid stored order");
  const { slug, ...body } = value.intent;
  const normalized = normalizeConfiguredPickupIntent(body, slug);
  if (!normalized.ok || stable(normalized.intent) !== stable(value.intent) || normalized.intent.requestId !== value.request_id
    || normalized.intent.receiptId !== value.receipt_id || stable(value.quote.contact) !== stable(normalized.intent.contact)
    || value.currency !== normalized.intent.expected.currency || value.total_minor !== normalized.intent.expected.totalMinor
    || !Array.isArray(value.quote.lines) || value.quote.lines.length !== normalized.intent.lines.length
    || new TextEncoder().encode(JSON.stringify(value.quote, null, 1)).length > 1048576) throw Error("Invalid stored intent");
  const lines = value.quote.lines.map((raw: unknown, index: number) => {
    const line = validateConfiguredQuoteLine(raw), intended = normalized.intent.lines[index];
    if (!line || line.currency !== value.currency || line.itemId !== intended.itemId || line.quantity !== intended.quantity
      || !sameConfiguredSelection(line.selection, intended.selection, line.profileKind)) throw Error("Invalid stored line");
    return line;
  });
  const total = lines.reduce((sum, line) => sum + line.lineTotalMinor, 0);
  if (!money(total) || total !== value.total_minor) throw Error("Invalid stored total");
  return { version: 2 as const, id: value.id, requestId: value.request_id, receiptId: value.receipt_id, currency: value.currency, totalMinor: value.total_minor,
    fulfillmentState: "pendiente_de_pago" as const, paymentState: "pendiente" as const, createdAt: value.created_at, contact: { ...normalized.intent.contact }, lines };
}
