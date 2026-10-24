/** A URL selection is navigation input, never proof of ownership. */
export type OwnerBusiness = { id: string; name: string };
export type BusinessSelection = { ok: true; businessId?: string } | { ok: false };
export type OwnerModule = "home" | "orders" | "catalog" | "store";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Boundary queries accept only one optional businessId, including on legacy APIs. */
export function parseBusinessSelection(params: URLSearchParams): BusinessSelection {
  if ([...params.keys()].some(key => key !== "businessId")) return { ok: false };
  const values = params.getAll("businessId");
  if (!values.length) return { ok: true };
  if (values.length !== 1 || !UUID.test(values[0])) return { ok: false };
  return { ok: true, businessId: values[0].toLowerCase() };
}

/** Fixed local destinations prevent redirect injection; omit selection for legacy links. */
export function ownerHref(module: OwnerModule, businessId?: string): string {
  const path = { home: "/owner", orders: "/owner/orders", catalog: "/owner/catalog", store: "/owner/store" }[module];
  if (businessId === undefined) return path;
  if (!UUID.test(businessId)) throw new Error("invalid_business_selection");
  return `${path}?businessId=${businessId.toLowerCase()}`;
}
