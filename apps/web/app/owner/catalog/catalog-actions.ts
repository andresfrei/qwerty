// @ts-expect-error Native Node tests require an explicit TypeScript extension.
import { getTrustedSiteOrigin, isTrustedCallbackRequest } from "../../lib/supabase/confirm.ts";
// @ts-expect-error Native Node tests require an explicit TypeScript extension.
import { parseBusinessSelection } from "../owner-context.ts";
// The pure selection module supplies the mode type used by option groups.
import type { SelectionMode } from "../../lib/catalog-selection.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CURRENCY = /^[A-Z]{3}$/;

export type CatalogErrorCode =
  | "invalid_request" | "invalid_action" | "invalid_name" | "invalid_price" | "invalid_currency"
  | "invalid_category" | "invalid_availability" | "invalid_publication" | "invalid_sort_order"
  | "invalid_id" | "invalid_selection_mode" | "invalid_min_select" | "invalid_max_select"
  | "invalid_price_delta" | "invalid_surcharge"
  | "request_rejected" | "unauthorized" | "not_found" | "storefront_missing"
  | "method_not_allowed" | "unavailable";

export type ItemFields = {
  categoryId: string;
  name: string;
  description: string | null;
  priceMinor: number;
  currency: string;
  isAvailable: boolean;
  sortOrder: number;
};

export type OptionGroupFields = {
  name: string;
  selectionMode: SelectionMode;
  minSelect: number;
  maxSelect: number;
  sortOrder: number;
};

export type OptionFields = {
  name: string;
  priceDeltaMinor: number;
  isAvailable: boolean;
  sortOrder: number;
};

export type CatalogWrite =
  | { kind: "insert_category"; businessId: string; name: string; sortOrder: number }
  | { kind: "update_category"; businessId: string; categoryId: string; name?: string; sortOrder?: number }
  | ({ kind: "insert_item"; businessId: string } & ItemFields)
  | ({ kind: "update_item"; businessId: string; itemId: string } & ItemFields)
  | { kind: "update_storefront"; businessId: string; isPublished: boolean }
  | ({ kind: "insert_option_group"; businessId: string; itemId: string } & OptionGroupFields)
  | ({ kind: "update_option_group"; businessId: string; groupId: string } & OptionGroupFields)
  | ({ kind: "insert_option"; businessId: string; groupId: string } & OptionFields)
  | ({ kind: "update_option"; businessId: string; optionId: string } & OptionFields)
  | { kind: "upsert_settings"; businessId: string; twoFlavorSurchargeMinor: number };

/**
 * The session is the only ownership source. A request never carries an owner or
 * business identifier, and every read through this port is RLS-scoped.
 */
export interface CatalogGateway {
  ownerBusinessId(businessId?: string): Promise<string | null>;
  categoryOwnedBy(businessId: string, categoryId: string): Promise<boolean>;
  itemOwnedBy(businessId: string, itemId: string): Promise<boolean>;
  // Optional so the pre-existing category/product gateway stays valid; the option
  // actions below fail closed when a lookup is absent.
  groupOwnedBy?(businessId: string, groupId: string): Promise<boolean>;
  optionOwnedBy?(businessId: string, optionId: string): Promise<boolean>;
  write(write: CatalogWrite): Promise<void>;
}

export class CatalogWriteError extends Error {
  readonly code: CatalogErrorCode;

  constructor(code: CatalogErrorCode) {
    super(code);
    this.name = "CatalogWriteError";
    this.code = code;
  }
}

export type CatalogAction =
  | { action: "create_category"; name: string; sortOrder: number }
  | { action: "rename_category"; categoryId: string; name: string }
  | { action: "reorder_category"; categoryId: string; sortOrder: number }
  | ({ action: "create_product" } & ItemFields)
  | ({ action: "update_product"; itemId: string } & ItemFields)
  | { action: "set_published"; isPublished: boolean }
  | ({ action: "create_option_group"; itemId: string } & OptionGroupFields)
  | ({ action: "update_option_group"; groupId: string } & OptionGroupFields)
  | ({ action: "create_option"; groupId: string } & OptionFields)
  | ({ action: "update_option"; optionId: string } & OptionFields)
  | { action: "set_two_flavor_surcharge"; twoFlavorSurchargeMinor: number };

export type CatalogValidation =
  | { ok: true; action: CatalogAction }
  | { ok: false; error: CatalogErrorCode };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const validName = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
// Prices and sort orders share the same non-negative safe-integer rule.
const validInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const validCurrency = (value: unknown): value is string =>
  typeof value === "string" && CURRENCY.test(value);
const validId = (value: unknown): value is string =>
  typeof value === "string" && UUID.test(value);
const validDescription = (value: unknown): value is string | null =>
  value === undefined || value === null || typeof value === "string";

function validateProduct(payload: Record<string, unknown>, withItem: boolean): CatalogValidation {
  if (!validName(payload.name)) return { ok: false, error: "invalid_name" };
  if (!validDescription(payload.description)) return { ok: false, error: "invalid_request" };
  if (!validInteger(payload.priceMinor)) return { ok: false, error: "invalid_price" };
  if (!validCurrency(payload.currency)) return { ok: false, error: "invalid_currency" };
  if (!validId(payload.categoryId)) return { ok: false, error: "invalid_category" };
  if (typeof payload.isAvailable !== "boolean") return { ok: false, error: "invalid_availability" };
  if (!validInteger(payload.sortOrder)) return { ok: false, error: "invalid_sort_order" };
  if (withItem && !validId(payload.itemId)) return { ok: false, error: "invalid_id" };

  const fields: ItemFields = {
    categoryId: payload.categoryId,
    name: payload.name.trim(),
    description: typeof payload.description === "string" ? payload.description : null,
    priceMinor: payload.priceMinor,
    currency: payload.currency,
    isAvailable: payload.isAvailable,
    sortOrder: payload.sortOrder,
  };
  if (!withItem) return { ok: true, action: { action: "create_product", ...fields } };
  return { ok: true, action: { action: "update_product", itemId: payload.itemId as string, ...fields } };
}

function groupFields(action: OptionGroupFields): OptionGroupFields {
  return {
    name: action.name,
    selectionMode: action.selectionMode,
    minSelect: action.minSelect,
    maxSelect: action.maxSelect,
    sortOrder: action.sortOrder,
  };
}

function optionFields(action: OptionFields): OptionFields {
  return {
    name: action.name,
    priceDeltaMinor: action.priceDeltaMinor,
    isAvailable: action.isAvailable,
    sortOrder: action.sortOrder,
  };
}

/** Mirrors the database checks on `catalog_option_groups`: a name, one of the two modes and
 *  `minSelect <= maxSelect`, all non-negative. */
function validateOptionGroup(payload: Record<string, unknown>, withGroup: boolean): CatalogValidation {
  if (!validName(payload.name)) return { ok: false, error: "invalid_name" };
  if (payload.selectionMode !== "distinct" && payload.selectionMode !== "quantity") {
    return { ok: false, error: "invalid_selection_mode" };
  }
  if (!validInteger(payload.minSelect)) return { ok: false, error: "invalid_min_select" };
  if (!validInteger(payload.maxSelect) || payload.maxSelect < payload.minSelect) {
    return { ok: false, error: "invalid_max_select" };
  }
  if (!validInteger(payload.sortOrder)) return { ok: false, error: "invalid_sort_order" };
  if (withGroup && !validId(payload.groupId)) return { ok: false, error: "invalid_id" };
  if (!withGroup && !validId(payload.itemId)) return { ok: false, error: "invalid_id" };

  const fields: OptionGroupFields = {
    name: payload.name.trim(),
    selectionMode: payload.selectionMode,
    minSelect: payload.minSelect,
    maxSelect: payload.maxSelect,
    sortOrder: payload.sortOrder,
  };
  if (!withGroup) {
    return { ok: true, action: { action: "create_option_group", itemId: payload.itemId as string, ...fields } };
  }
  return { ok: true, action: { action: "update_option_group", groupId: payload.groupId as string, ...fields } };
}

function validateOption(payload: Record<string, unknown>, withOption: boolean): CatalogValidation {
  if (!validName(payload.name)) return { ok: false, error: "invalid_name" };
  if (!validInteger(payload.priceDeltaMinor)) return { ok: false, error: "invalid_price_delta" };
  if (typeof payload.isAvailable !== "boolean") return { ok: false, error: "invalid_availability" };
  if (!validInteger(payload.sortOrder)) return { ok: false, error: "invalid_sort_order" };
  if (withOption && !validId(payload.optionId)) return { ok: false, error: "invalid_id" };
  if (!withOption && !validId(payload.groupId)) return { ok: false, error: "invalid_id" };

  const fields: OptionFields = {
    name: payload.name.trim(),
    priceDeltaMinor: payload.priceDeltaMinor,
    isAvailable: payload.isAvailable,
    sortOrder: payload.sortOrder,
  };
  if (!withOption) {
    return { ok: true, action: { action: "create_option", groupId: payload.groupId as string, ...fields } };
  }
  return { ok: true, action: { action: "update_option", optionId: payload.optionId as string, ...fields } };
}

export function validateCatalogAction(payload: unknown): CatalogValidation {
  if (!isRecord(payload) || typeof payload.action !== "string") {
    return { ok: false, error: "invalid_request" };
  }

  switch (payload.action) {
    case "create_category":
      if (!validName(payload.name)) return { ok: false, error: "invalid_name" };
      if (!validInteger(payload.sortOrder)) return { ok: false, error: "invalid_sort_order" };
      return { ok: true, action: { action: "create_category", name: payload.name.trim(), sortOrder: payload.sortOrder } };
    case "rename_category":
      if (!validId(payload.categoryId)) return { ok: false, error: "invalid_id" };
      if (!validName(payload.name)) return { ok: false, error: "invalid_name" };
      return { ok: true, action: { action: "rename_category", categoryId: payload.categoryId, name: payload.name.trim() } };
    case "reorder_category":
      if (!validId(payload.categoryId)) return { ok: false, error: "invalid_id" };
      if (!validInteger(payload.sortOrder)) return { ok: false, error: "invalid_sort_order" };
      return { ok: true, action: { action: "reorder_category", categoryId: payload.categoryId, sortOrder: payload.sortOrder } };
    case "create_product":
      return validateProduct(payload, false);
    case "update_product":
      return validateProduct(payload, true);
    case "create_option_group":
      return validateOptionGroup(payload, false);
    case "update_option_group":
      return validateOptionGroup(payload, true);
    case "create_option":
      return validateOption(payload, false);
    case "update_option":
      return validateOption(payload, true);
    case "set_two_flavor_surcharge":
      if (!validInteger(payload.twoFlavorSurchargeMinor)) return { ok: false, error: "invalid_surcharge" };
      return { ok: true, action: { action: "set_two_flavor_surcharge", twoFlavorSurchargeMinor: payload.twoFlavorSurchargeMinor } };
    case "set_published":
      if (typeof payload.isPublished !== "boolean") return { ok: false, error: "invalid_publication" };
      return { ok: true, action: { action: "set_published", isPublished: payload.isPublished } };
    default:
      return { ok: false, error: "invalid_action" };
  }
}

export type CatalogPlan = { write: CatalogWrite } | { error: CatalogErrorCode };

function productFields(action: ItemFields): ItemFields {
  return {
    categoryId: action.categoryId,
    name: action.name,
    description: action.description,
    priceMinor: action.priceMinor,
    currency: action.currency,
    isAvailable: action.isAvailable,
    sortOrder: action.sortOrder,
  };
}

export async function planCatalogWrite(
  gateway: CatalogGateway,
  businessId: string,
  action: CatalogAction,
): Promise<CatalogPlan> {
  switch (action.action) {
    case "create_category":
      return { write: { kind: "insert_category", businessId, name: action.name, sortOrder: action.sortOrder } };
    case "rename_category":
      if (!(await gateway.categoryOwnedBy(businessId, action.categoryId))) return { error: "not_found" };
      return { write: { kind: "update_category", businessId, categoryId: action.categoryId, name: action.name } };
    case "reorder_category":
      if (!(await gateway.categoryOwnedBy(businessId, action.categoryId))) return { error: "not_found" };
      return { write: { kind: "update_category", businessId, categoryId: action.categoryId, sortOrder: action.sortOrder } };
    case "create_product":
      if (!(await gateway.categoryOwnedBy(businessId, action.categoryId))) return { error: "invalid_category" };
      return { write: { kind: "insert_item", businessId, ...productFields(action) } };
    case "update_product":
      if (!(await gateway.itemOwnedBy(businessId, action.itemId))) return { error: "not_found" };
      if (!(await gateway.categoryOwnedBy(businessId, action.categoryId))) return { error: "invalid_category" };
      return { write: { kind: "update_item", businessId, itemId: action.itemId, ...productFields(action) } };
    case "set_published":
      return { write: { kind: "update_storefront", businessId, isPublished: action.isPublished } };
    case "create_option_group":
      if (!(await gateway.itemOwnedBy(businessId, action.itemId))) return { error: "not_found" };
      return { write: { kind: "insert_option_group", businessId, itemId: action.itemId, ...groupFields(action) } };
    case "update_option_group":
      if (!gateway.groupOwnedBy || !(await gateway.groupOwnedBy(businessId, action.groupId))) return { error: "not_found" };
      return { write: { kind: "update_option_group", businessId, groupId: action.groupId, ...groupFields(action) } };
    case "create_option":
      if (!gateway.groupOwnedBy || !(await gateway.groupOwnedBy(businessId, action.groupId))) return { error: "not_found" };
      return { write: { kind: "insert_option", businessId, groupId: action.groupId, ...optionFields(action) } };
    case "update_option":
      if (!gateway.optionOwnedBy || !(await gateway.optionOwnedBy(businessId, action.optionId))) return { error: "not_found" };
      return { write: { kind: "update_option", businessId, optionId: action.optionId, ...optionFields(action) } };
    case "set_two_flavor_surcharge":
      return { write: { kind: "upsert_settings", businessId, twoFlavorSurchargeMinor: action.twoFlavorSurchargeMinor } };
  }
}

const SECURITY_HEADERS = {
  "cache-control": "private, no-store",
  expires: "0",
  pragma: "no-cache",
  "referrer-policy": "no-referrer",
  "content-type": "application/json",
} as const;

function catalogResponse(status: number, body: unknown, allow?: string): Response {
  const headers = new Headers(SECURITY_HEADERS);
  if (allow) headers.set("allow", allow);
  return new Response(JSON.stringify(body), { status, headers });
}

function statusForCode(code: CatalogErrorCode): number {
  if (code === "unavailable") return 503;
  if (code === "not_found") return 404;
  return 400;
}

export type CatalogHandlerDependencies = {
  trustedOrigin?: string | null;
  createGateway: (request: Request) => Promise<CatalogGateway | null>;
};

export async function handleCatalogPost(
  request: Request,
  dependencies: CatalogHandlerDependencies,
): Promise<Response> {
  if (request.method !== "POST") return catalogResponse(405, { error: "method_not_allowed" }, "POST");

  const environment = dependencies.trustedOrigin === undefined
    ? process.env
    : { QWERTY_SITE_URL: dependencies.trustedOrigin ?? undefined };
  const trustedOrigin = getTrustedSiteOrigin(environment);
  if (!trustedOrigin) return catalogResponse(503, { error: "unavailable" });
  if (request.headers.get("origin") !== trustedOrigin || !isTrustedCallbackRequest(request, trustedOrigin)) {
    return catalogResponse(400, { error: "request_rejected" });
  }

  const selection = parseBusinessSelection(new URL(request.url).searchParams);
  if (!selection.ok) return catalogResponse(400, { error: "invalid_request" });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return catalogResponse(400, { error: "invalid_request" });
  }
  const validation = validateCatalogAction(payload);
  if (!validation.ok) return catalogResponse(400, { error: validation.error });

  let gateway: CatalogGateway | null;
  try {
    gateway = await dependencies.createGateway(request);
  } catch {
    return catalogResponse(503, { error: "unavailable" });
  }
  if (!gateway) return catalogResponse(503, { error: "unavailable" });

  let businessId: string | null;
  try {
    businessId = await gateway.ownerBusinessId(selection.businessId);
  } catch {
    return catalogResponse(503, { error: "unavailable" });
  }
  if (!businessId) return catalogResponse(401, { error: "unauthorized" });

  try {
    const plan = await planCatalogWrite(gateway, businessId, validation.action);
    if ("error" in plan) return catalogResponse(statusForCode(plan.error), { error: plan.error });
    await gateway.write(plan.write);
    return catalogResponse(200, { ok: true });
  } catch (error) {
    if (error instanceof CatalogWriteError) return catalogResponse(statusForCode(error.code), { error: error.code });
    return catalogResponse(503, { error: "unavailable" });
  }
}
