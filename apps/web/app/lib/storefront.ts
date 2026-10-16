// @ts-expect-error Node's native TypeScript runner resolves explicit .ts imports.
import { describeSelection, priceSelection, type GroupSelection, type SelectionRequest } from "./catalog-selection.ts";

export const MAX_CART_QUANTITY = 99;

export type CatalogItem = {
  id: string;
  business_id: string;
  category_id: string;
  name: string;
  description: string | null;
  price_minor: number;
  currency: string;
  is_available: boolean;
  sort_order: number;
};

export type CartItem = {
  id: string;
  key: string;
  name: string;
  unitPriceMinor: number;
  currency: string;
  quantity: number;
  selection: GroupSelection[];
  selectionText: string;
};

export type CartState = { businessId: string; items: CartItem[] };

export type SelectionCartRequest = SelectionRequest & {
  item: SelectionRequest["item"] & { name: string; currency: string };
};

export function createCart(businessId: string): CartState {
  return { businessId, items: [] };
}

export function formatMoney(minor: number, currency: string): string {
  const formatter = new Intl.NumberFormat("es-AR", { style: "currency", currency });
  const fractionDigits = formatter.resolvedOptions().maximumFractionDigits ?? 0;
  return formatter.format(minor / 10 ** fractionDigits);
}

function clampQuantity(quantity: number): number {
  return Number.isFinite(quantity) ? Math.min(MAX_CART_QUANTITY, Math.max(1, Math.floor(quantity))) : 1;
}

function snapshot(item: CatalogItem, quantity: number): CartItem {
  return {
    id: item.id,
    key: item.id,
    name: item.name,
    unitPriceMinor: item.price_minor,
    currency: item.currency,
    quantity: clampQuantity(quantity),
    selection: [],
    selectionText: "",
  };
}

export function addCartItem(cart: CartState, item: CatalogItem): CartState {
  if (cart.businessId !== item.business_id || !item.is_available) return cart;
  const found = cart.items.findIndex((entry) => entry.key === item.id);
  if (found < 0) return { ...cart, items: [...cart.items, snapshot(item, 1)] };
  const items = cart.items.slice();
  items[found] = snapshot(item, items[found].quantity + 1);
  return { ...cart, items };
}

function canonicalSelection(request: SelectionRequest, selection: GroupSelection[]): GroupSelection[] {
  const groupsById = new Map(request.groups.map((group) => [group.id, group]));
  const optionsById = new Map(request.options.map((option) => [option.id, option]));
  return selection
    .filter((entry) => groupsById.has(entry.groupId))
    .map((entry) => ({
      groupId: entry.groupId,
      picks: entry.picks
        .filter((pick) => {
          const option = optionsById.get(pick.optionId);
          return option !== undefined && option.group_id === entry.groupId;
        })
        .slice()
        .sort((left, right) => {
          const leftOption = optionsById.get(left.optionId);
          const rightOption = optionsById.get(right.optionId);
          return (leftOption?.sort_order ?? 0) - (rightOption?.sort_order ?? 0) || left.optionId.localeCompare(right.optionId);
        }),
    }))
    .sort((left, right) => {
      const leftGroup = groupsById.get(left.groupId);
      const rightGroup = groupsById.get(right.groupId);
      return (leftGroup?.sort_order ?? 0) - (rightGroup?.sort_order ?? 0) || left.groupId.localeCompare(right.groupId);
    });
}

function canonicalKey(itemId: string, selection: GroupSelection[]): string {
  if (selection.length === 0) return itemId;
  const parts = selection.map((entry) => `${entry.groupId}:${entry.picks.map((pick) => `${pick.optionId}*${pick.quantity}`).join(",")}`);
  return `${itemId}#${parts.join("|")}`;
}

export function addSelectedCartItem(cart: CartState, request: SelectionCartRequest, selections: GroupSelection[]): CartState {
  const selection = canonicalSelection(request, selections);
  const priced = priceSelection({ ...request, selections: selection });
  if (!priced.ok) return cart;

  const line: CartItem = {
    id: request.item.id,
    key: canonicalKey(request.item.id, selection),
    name: request.item.name,
    unitPriceMinor: priced.unitPriceMinor,
    currency: request.item.currency,
    quantity: 1,
    selection,
    selectionText: describeSelection({ ...request, selections: selection }),
  };

  const found = cart.items.findIndex((entry) => entry.key === line.key);
  if (found < 0) return { ...cart, items: [...cart.items, line] };
  const items = cart.items.slice();
  items[found] = { ...line, quantity: clampQuantity(items[found].quantity + 1) };
  return { ...cart, items };
}

export function setCartQuantity(cart: CartState, keyOrId: string, quantity: number): CartState {
  const matches = (item: CartItem) => item.key === keyOrId || item.id === keyOrId;
  const items = quantity <= 0
    ? cart.items.filter((item) => !matches(item))
    : cart.items.map((item) => matches(item) ? { ...item, quantity: clampQuantity(quantity) } : item);
  return { ...cart, items };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readSelection(value: unknown): GroupSelection[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const selection: GroupSelection[] = [];
  for (const rawGroup of value) {
    if (!isRecord(rawGroup) || typeof rawGroup.groupId !== "string" || !rawGroup.groupId || !Array.isArray(rawGroup.picks)) return null;
    const picks: GroupSelection["picks"] = [];
    for (const rawPick of rawGroup.picks) {
      if (!isRecord(rawPick) || typeof rawPick.optionId !== "string" || !rawPick.optionId ||
        typeof rawPick.quantity !== "number" || !Number.isSafeInteger(rawPick.quantity) || rawPick.quantity < 1) return null;
      picks.push({ optionId: rawPick.optionId, quantity: rawPick.quantity });
    }
    selection.push({ groupId: rawGroup.groupId, picks });
  }
  return selection;
}

function readLine(rawItem: unknown, allowSelection: boolean): CartItem | null {
  if (!isRecord(rawItem) || typeof rawItem.id !== "string" || !rawItem.id || typeof rawItem.name !== "string" || !rawItem.name ||
    typeof rawItem.unitPriceMinor !== "number" || !Number.isSafeInteger(rawItem.unitPriceMinor) || rawItem.unitPriceMinor < 0 ||
    typeof rawItem.currency !== "string" || !/^[A-Z]{3}$/.test(rawItem.currency) ||
    typeof rawItem.quantity !== "number" || !Number.isFinite(rawItem.quantity) || rawItem.quantity <= 0) return null;
  const selection = allowSelection ? readSelection(rawItem.selection) : [];
  if (selection === null) return null;
  const key = allowSelection && typeof rawItem.key === "string" && rawItem.key ? rawItem.key : rawItem.id;
  const selectionText = allowSelection && typeof rawItem.selectionText === "string" ? rawItem.selectionText : "";
  return {
    id: rawItem.id,
    key,
    name: rawItem.name,
    unitPriceMinor: rawItem.unitPriceMinor,
    currency: rawItem.currency,
    quantity: clampQuantity(rawItem.quantity),
    selection,
    selectionText,
  };
}

function normalizeCart(value: unknown, businessId: string, allowSelection: boolean): CartState {
  if (!isRecord(value) || value.businessId !== businessId || !Array.isArray(value.items)) return createCart(businessId);
  const items = new Map<string, CartItem>();
  for (const rawItem of value.items) {
    const line = readLine(rawItem, allowSelection);
    if (line) items.set(line.key, line);
  }
  return { businessId, items: [...items.values()] };
}

export function normalizePersistedCart(value: unknown, businessId: string): CartState {
  const version = isRecord(value) ? value.version : undefined;
  return normalizeCart(value, businessId, version === 2);
}

export function reconcileCart(cart: CartState, catalog: CatalogItem[], selectionData?: ReadonlyMap<string, SelectionRequest>): CartState {
  const safeCart = normalizeCart(cart, cart.businessId, true);
  const current = new Map(catalog.filter((item) => item.is_available).map((item) => [item.id, item]));
  return {
    businessId: safeCart.businessId,
    items: safeCart.items.flatMap((entry) => {
      const item = current.get(entry.id);
      if (!item || item.business_id !== safeCart.businessId) return [];
      if (entry.selection.length === 0) return [snapshot(item, entry.quantity)];
      const request = selectionData?.get(entry.id);
      if (!request) return [];
      const selection = canonicalSelection(request, entry.selection);
      const priced = priceSelection({ ...request, item: { id: item.id, price_minor: item.price_minor }, selections: selection });
      if (!priced.ok) return [];
      return [{
        id: item.id,
        key: canonicalKey(item.id, selection),
        name: item.name,
        unitPriceMinor: priced.unitPriceMinor,
        currency: item.currency,
        quantity: clampQuantity(entry.quantity),
        selection,
        selectionText: describeSelection({ ...request, item: { id: item.id, price_minor: item.price_minor }, selections: selection }),
      }];
    }),
  };
}

export function persistCart(write: (key: string, value: string) => void, key: string, cart: CartState): boolean {
  try {
    write(key, JSON.stringify({ version: 2, ...cart }));
    return true;
  } catch {
    return false;
  }
}

export function cartTotalsByCurrency(cart: CartState): Record<string, number> {
  return cart.items.reduce<Record<string, number>>((totals, item) => {
    totals[item.currency] = (totals[item.currency] ?? 0) + item.unitPriceMinor * item.quantity;
    return totals;
  }, {});
}
