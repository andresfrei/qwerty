// @ts-expect-error Native Node tests require an explicit TypeScript extension.
import { describeSelection, priceSelection, type Option, type OptionGroup, type SelectionRequest } from "../../lib/catalog-selection.ts";

export type GroupBehavior = {
  ok: boolean;
  description: string;
  unitPriceMinor: number | null;
};

/**
 * Builds a representative customer selection for one group and hands it to the
 * pure selection helpers, so the owner sees the real customer-facing text and
 * price instead of a second copy of the rules. An invalid sample stays honest:
 * `ok` is false and `unitPriceMinor` is null.
 */
export function describeGroupBehavior(
  item: { id: string; price_minor: number },
  group: OptionGroup,
  options: Option[],
  surchargeMinor: number,
): GroupBehavior {
  const available = options
    .filter((option) => option.group_id === group.id && option.is_available)
    .sort((left, right) => left.sort_order - right.sort_order || left.id.localeCompare(right.id));

  const picks = group.min_select <= 0
    ? []
    : group.selection_mode === "distinct"
      ? available.slice(0, group.min_select).map((option) => ({ optionId: option.id, quantity: 1 }))
      : available.slice(0, 1).map((option) => ({ optionId: option.id, quantity: group.min_select }));

  const request: SelectionRequest = {
    item: { id: item.id, price_minor: item.price_minor },
    groups: [group],
    options: available,
    selections: [{ groupId: group.id, picks }],
    surchargeMinor,
  };
  const priced = priceSelection(request);
  return {
    ok: priced.ok,
    description: describeSelection(request),
    unitPriceMinor: priced.ok ? priced.unitPriceMinor : null,
  };
}
