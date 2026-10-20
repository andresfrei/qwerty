// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { validateCatalogAction } from "./catalog-actions.ts";

/** Decimal text to safe minor units; never multiply a floating-point major amount. */
export function moneyMinor(value: string): number {
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(value)) return Number.NaN;
  const [whole, fraction = ""] = value.replace(",", ".").split(".");
  const amount = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
  return amount <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(amount) : Number.NaN;
}
export function moneyText(value: number): string {
  return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;
}
export function suggestedSlug(name: string): string {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 63).replace(/^-+|-+$/g, "");
}
export type MutationResult = { kind: "saved"; data: Record<string, unknown> } | { kind: "rejected"; message: string } | { kind: "unknown" };
const messages: Record<string, string> = {
  slug_unavailable: "Esa dirección no está disponible",
  invalid_request: "Revisá los datos ingresados.",
  unauthorized: "Volvé a iniciar sesión con tu cuenta confirmada.",
  request_rejected: "No pudimos autorizar esta solicitud.",
  business_missing: "Actualizá la página para configurar tu primer negocio.",
  not_found: "El registro cambió. Actualizá la página.",
  storefront_missing: "Primero configurá tu vidriera.",
};
export async function sendOwnerMutation(path: "/owner/onboarding" | "/owner/catalog/actions", payload: unknown, fetcher: typeof fetch = fetch): Promise<MutationResult> {
  try {
    const response = await fetcher(path, { method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const data = await response.json();
    if (!data || typeof data !== "object" || Array.isArray(data)) return { kind: "unknown" };
    if (response.ok) {
      const valid = path === "/owner/catalog/actions" ? data.ok === true : payload && typeof payload === "object" && "action" in payload && payload.action === "create_business"
        ? typeof data.business?.id === "string" && typeof data.business?.name === "string"
        : typeof data.storefront?.slug === "string" && typeof data.storefront?.is_published === "boolean";
      return valid ? { kind: "saved", data } : { kind: "unknown" };
    }
    // Only explicit no-write denials permit retry; provider/network/5xx outcomes are unknown.
    if ([400, 401, 403, 404, 409].includes(response.status) && typeof data.error === "string") {
      const message = messages[data.error] ?? (data.error.startsWith("invalid_") ? "Revisá los datos ingresados." : null);
      if (message) return { kind: "rejected", message };
    }
  } catch { /* A response can be lost after the provider committed the write. */ }
  return { kind: "unknown" };
}

export function catalogFormPayload(form: FormData): unknown {
  const data: Record<string, unknown> = Object.fromEntries(form.entries());
  for (const field of ["sortOrder", "minSelect", "maxSelect"]) if (field in data) data[field] = /^\d+$/.test(String(data[field])) ? Number(data[field]) : Number.NaN;
  for (const field of ["priceMinor", "priceDeltaMinor", "twoFlavorSurchargeMinor"]) if (field in data) data[field] = moneyMinor(String(data[field]));
  for (const field of ["isAvailable", "isPublished"]) if (field in data) data[field] = data[field] === "true";
  const result = validateCatalogAction(data);
  return result.ok ? result.action : null;
}
