export type SelectionMode = "distinct" | "quantity";

export type OptionGroup = {
  id: string;
  item_id: string;
  name: string;
  selection_mode: SelectionMode;
  min_select: number;
  max_select: number;
  sort_order: number;
};

export type Option = {
  id: string;
  group_id: string;
  name: string;
  price_delta_minor: number;
  is_available: boolean;
  sort_order: number;
};

export type OptionPick = { optionId: string; quantity: number };

export type GroupSelection = { groupId: string; picks: OptionPick[] };

export type SelectionRequest = {
  item: { id: string; price_minor: number };
  groups: OptionGroup[];
  options: Option[];
  selections: GroupSelection[];
  surchargeMinor: number;
};

export type SelectionError =
  | { code: "unknown_group"; groupId: string }
  | { code: "unknown_option"; groupId: string; optionId: string }
  | { code: "unavailable_option"; groupId: string; optionId: string }
  | { code: "invalid_quantity"; groupId: string; optionId: string }
  | { code: "repeated_option"; groupId: string; optionId: string }
  | { code: "too_few"; groupId: string; selected: number; min: number }
  | { code: "too_many"; groupId: string; selected: number; max: number }
  | { code: "missing_selection"; groupId: string }
  | { code: "negative_price"; itemId: string };

export type PriceResult =
  | { ok: true; unitPriceMinor: number; surchargeMinor: number }
  | { ok: false; errors: SelectionError[] };

function indexOptions(options: Option[]): Map<string, Option> {
  return new Map(options.map((option) => [option.id, option]));
}

function indexGroups(groups: OptionGroup[]): Map<string, OptionGroup> {
  return new Map(groups.map((group) => [group.id, group]));
}

function resolvePicks(group: OptionGroup, selection: GroupSelection, optionsById: Map<string, Option>): OptionPick[] {
  return selection.picks.filter((pick) => {
    const option = optionsById.get(pick.optionId);
    return option !== undefined && option.group_id === group.id;
  });
}

export function validateSelections(request: SelectionRequest): SelectionError[] {
  const errors: SelectionError[] = [];
  const groupsById = indexGroups(request.groups);
  const optionsById = indexOptions(request.options);
  const covered = new Set<string>();

  for (const selection of request.selections) {
    const group = groupsById.get(selection.groupId);
    if (!group) {
      errors.push({ code: "unknown_group", groupId: selection.groupId });
      continue;
    }
    const seen = new Set<string>();
    let units = 0;
    let rejected = 0;
    for (const pick of selection.picks) {
      const option = optionsById.get(pick.optionId);
      if (!option || option.group_id !== group.id) {
        errors.push({ code: "unknown_option", groupId: group.id, optionId: pick.optionId });
        rejected += 1;
        continue;
      }
      if (!option.is_available) {
        errors.push({ code: "unavailable_option", groupId: group.id, optionId: option.id });
        rejected += 1;
        continue;
      }
      if (!Number.isSafeInteger(pick.quantity) || pick.quantity < 1) {
        errors.push({ code: "invalid_quantity", groupId: group.id, optionId: option.id });
        rejected += 1;
        continue;
      }
      if (group.selection_mode === "distinct" && seen.has(option.id)) {
        errors.push({ code: "repeated_option", groupId: group.id, optionId: option.id });
        rejected += 1;
        continue;
      }
      seen.add(option.id);
      units += pick.quantity;
    }

    covered.add(group.id);
    if (rejected > 0) continue;
    const selected = group.selection_mode === "distinct" ? seen.size : units;
    if (selected < group.min_select) {
      errors.push({ code: "too_few", groupId: group.id, selected, min: group.min_select });
    } else if (selected > group.max_select) {
      errors.push({ code: "too_many", groupId: group.id, selected, max: group.max_select });
    }
  }

  const ordered = request.groups.slice().sort((left, right) => left.sort_order - right.sort_order);
  for (const group of ordered) {
    if (group.min_select > 0 && !covered.has(group.id)) {
      errors.push({ code: "missing_selection", groupId: group.id });
    }
  }

  return errors;
}

export function priceSelection(request: SelectionRequest): PriceResult {
  const errors = validateSelections(request);
  if (errors.length > 0) return { ok: false, errors };

  const groupsById = indexGroups(request.groups);
  const optionsById = indexOptions(request.options);
  let unitPriceMinor = request.item.price_minor;
  let hasTwoFlavors = false;

  for (const selection of request.selections) {
    const group = groupsById.get(selection.groupId);
    if (!group) continue;
    const distinct = new Set<string>();
    for (const pick of resolvePicks(group, selection, optionsById)) {
      const option = optionsById.get(pick.optionId);
      if (!option) continue;
      unitPriceMinor += option.price_delta_minor * pick.quantity;
      distinct.add(option.id);
    }
    if (group.selection_mode === "distinct" && distinct.size > 1) hasTwoFlavors = true;
  }

  if (unitPriceMinor < 0) return { ok: false, errors: [{ code: "negative_price", itemId: request.item.id }] };

  const surchargeMinor = hasTwoFlavors ? request.surchargeMinor : 0;
  return { ok: true, unitPriceMinor: unitPriceMinor + surchargeMinor, surchargeMinor };
}

export function describeSelection(request: SelectionRequest): string {
  const groupsById = indexGroups(request.groups);
  const optionsById = indexOptions(request.options);
  const byGroup = new Map(request.selections.map((selection) => [selection.groupId, selection]));
  const ordered = request.groups.slice().sort((left, right) => left.sort_order - right.sort_order);
  const parts: string[] = [];

  for (const group of ordered) {
    const selection = byGroup.get(group.id);
    if (!selection || groupsById.get(group.id) !== group) continue;
    const picks = resolvePicks(group, selection, optionsById).flatMap((pick) => {
      const option = optionsById.get(pick.optionId);
      return option ? [{ name: option.name, quantity: pick.quantity }] : [];
    });
    if (picks.length === 0) continue;
    if (group.selection_mode === "quantity") {
      parts.push(picks.map((pick) => `${pick.quantity} ${pick.name}`).join(" + "));
      continue;
    }
    parts.push(picks.length === 1
      ? picks[0].name
      : `Mitad ${picks[0].name} / mitad ${picks.slice(1).map((pick) => pick.name).join(" / mitad ")}`);
  }

  return parts.join(" · ");
}
