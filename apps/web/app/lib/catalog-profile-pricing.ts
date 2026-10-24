// @ts-expect-error Native Node tests require explicit extensions.
import { describeSelection, priceSelection } from "./catalog-selection.ts";
import type { GroupSelection, PriceResult } from "./catalog-selection";
import type { ProfileFailure, ResolvedProfileSelection } from "./catalog-profiles";
// @ts-expect-error Native Node tests require explicit extensions.
import { legacyProfileRequest, orderedProfileOptions, profileFailure, resolveProfileRequest, validateProfileSelection } from "./catalog-profiles.ts";

export function priceProfileSelection(request: unknown): PriceResult | ProfileFailure {
  const result = validateProfileSelection(request);
  if (!result.ok) return result;
  const r = result.value, d = r.document, s = r.selection;
  if (!d) return priceSelection(legacyProfileRequest(r));
  let price = BigInt(r.item.price_minor), surcharge = 0;
  if (d.kind === "pizza" && s.kind !== "combo") {
    const size = s.groups.find(g => g.groupId === d.sizeGroupId)?.picks[0]?.optionId;
    const flavors = s.groups.find(g => g.groupId === d.flavorGroupId)?.picks;
    if (!size || !flavors?.length) return profileFailure("invalid_selection", r.item.id);
    const prices: bigint[] = [];
    for (const flavor of flavors) {
      const row = d.matrix.find(row => row.sizeOptionId === size && row.flavorOptionId === flavor.optionId);
      if (!row) return profileFailure("invalid_reference", r.item.id);
      prices.push(BigInt(row.priceMinor));
    }
    price = prices.reduce((sum, value) => sum + value, BigInt(0)) / BigInt(prices.length);
    surcharge = flavors.length === 2 ? r.catalog.surchargeMinor : 0;
    price += BigInt(surcharge);
  } else if (d.kind === "standard" && s.kind !== "combo") {
    for (const group of s.groups) for (const pick of group.picks) {
      const option = r.catalog.options.find(o => o.id === pick.optionId);
      if (!option) return profileFailure("invalid_reference", pick.optionId);
      price += BigInt(option.price_delta_minor) * BigInt(pick.quantity);
    }
  }
  // Dozen and combo intentionally stop at the parent amount. In particular,
  // valid children are never priced (even their potential overflows/fees).
  if (price < BigInt(0) || price > BigInt(Number.MAX_SAFE_INTEGER)) return profileFailure("amount_out_of_range", r.item.id);
  return { ok: true, unitPriceMinor: Number(price), surchargeMinor: surcharge };
}

export type ProfileGroupSnapshot = { groupId: string; name: string; picks: { optionId: string; name: string; quantity: number }[] };
export type ProfileComponentSnapshot = {
  componentId: string; instanceIndex: number; itemId: string; name: string;
  profileVersion: number; text: string; groups: ProfileGroupSnapshot[];
};
export type ProfileDescription = { ok: true; text: string; groups: ProfileGroupSnapshot[]; components: ProfileComponentSnapshot[] };

function groupSnapshots(r: ResolvedProfileSelection): ProfileGroupSnapshot[] {
  if (r.selection.kind === "combo") return [];
  const selections: GroupSelection[] = r.selection.groups;
  return r.catalog.groups.filter(g => g.item_id === r.item.id).sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id)).flatMap(group => {
    const selection = selections.find(g => g.groupId === group.id);
    if (!selection) return [];
    const picks = orderedProfileOptions(r, group.id).flatMap(o => {
      const pick = selection.picks.find(p => p.optionId === o.id);
      return pick ? [{ optionId: o.id, name: o.name, quantity: pick.quantity }] : [];
    });
    return picks.length ? [{ groupId: group.id, name: group.name, picks }] : [];
  });
}
function leafText(r: ResolvedProfileSelection, snapshots: ProfileGroupSnapshot[]): string {
  if (!r.document) return describeSelection(legacyProfileRequest(r));
  return snapshots.map(group => {
    if (r.document?.kind === "pizza" && group.groupId === r.document.flavorGroupId && group.picks.length === 2) return `Mitad ${group.picks[0].name} / mitad ${group.picks[1].name}`;
    const quantity = r.catalog.groups.find(g => g.id === group.groupId)?.selection_mode === "quantity";
    return group.picks.map(p => quantity ? `${p.quantity} ${p.name}` : p.name).join(" + ");
  }).join(" · ");
}
export function describeProfileSelection(request: unknown): ProfileDescription | ProfileFailure {
  const result = resolveProfileRequest(request);
  if (!result.ok) return result;
  const r = result.value, groups = groupSnapshots(r);
  const components: ProfileComponentSnapshot[] = [];
  for (const child of r.children) {
    if (child.componentId === undefined || child.instanceIndex === undefined) return profileFailure("invalid_selection", r.item.id);
    const groups = groupSnapshots(child);
    components.push({ componentId: child.componentId, instanceIndex: child.instanceIndex, itemId: child.item.id, name: child.item.name, profileVersion: child.selection.profileVersion, text: leafText(child, groups), groups });
  }
  const text = r.selection.kind === "combo" ? components.map(c => `${c.name}: ${c.text}`).join(" · ") : leafText(r, groups);
  return { ok: true, text, groups, components };
}
