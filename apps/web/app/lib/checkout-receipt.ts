// UX guard only; the private API independently validates bytes and authority.
export const CHECKOUT_RECEIPT_MAX_BYTES = 10 * 1024 * 1024;
export type ReceiptUploadResult = { status: "staged"; receiptId: string } | { status: "error" | "session" | "too_large" };
type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

export async function uploadCheckoutReceipt(slug: string, file: Blob, fetcher: Fetcher = fetch): Promise<ReceiptUploadResult> {
  if (file.size > CHECKOUT_RECEIPT_MAX_BYTES) return { status: "too_large" };
  if (file.size === 0) return { status: "error" };
  try {
    const response = await fetcher(`/api/checkout/receipts?slug=${encodeURIComponent(slug)}`, {
      method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error",
      headers: { "Content-Type": "application/octet-stream" }, body: file,
    });
    if (response.status === 401) return { status: "session" };
    if (response.status === 413) return { status: "too_large" };
    if (response.status !== 201) return { status: "error" };
    const body: unknown = await response.json();
    if (body === null || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1 || !("receiptId" in body) || typeof body.receiptId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.receiptId)) return { status: "error" };
    // A reference is not authority: private GET and later submission recheck it.
    return { status: "staged", receiptId: body.receiptId };
  } catch {
    return { status: "error" };
  }
}
