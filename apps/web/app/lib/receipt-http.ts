import { NextRequest, NextResponse } from "next/server.js";
import type { CallbackCookieState } from "./supabase/callback-cookies";
import type { ReceiptStaging } from "./receipt-staging";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { createCallbackCookieState } from "./supabase/callback-cookies.ts";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { isTrustedCallbackRequest } from "./supabase/confirm.ts";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { ReceiptFileError, RECEIPT_MAX_BYTES } from "./receipt-file.ts";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { RECEIPT_UUID } from "./receipt-staging.ts";

export type ReceiptConfig = { url: string; anonKey: string; serviceKey: string };
export type ReceiptDependencies = {
  getConfig(): ReceiptConfig | null;
  getOrigin(): string | null;
  readBusiness(config: ReceiptConfig, slug: string): Promise<{ status: "ok"; businessId: string } | { status: "not_found" | "unavailable" }>;
  getUser(config: ReceiptConfig, state: CallbackCookieState): Promise<{ data: { user: { id: string } | null }; error: unknown }>;
  staging(config: ReceiptConfig): ReceiptStaging;
};
function response(body: object, status: number, allow?: string) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", Pragma: "no-cache", Expires: "0", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", ...(allow ? { Allow: allow } : {}) } });
}
const rejected = () => response({ error: "Request rejected" }, 400);
const absent = () => response({ error: "Receipt not found" }, 404);
const unavailable = () => response({ error: "Receipt unavailable" }, 503);
const tooLarge = () => response({ error: "Receipt exceeds 10 MiB" }, 413);
async function readBytes(request: NextRequest, declared: number | null): Promise<Uint8Array | "large" | null> {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > RECEIPT_MAX_BYTES) { await reader.cancel(); return "large"; }
      chunks.push(value);
    }
    if (!size || (declared !== null && size !== declared)) return null;
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  } catch { return null; } finally { reader.releaseLock(); }
}

// No default dependency: route composition is explicit and never payload-selected.
export async function handleReceiptRequest(request: NextRequest, id: string | undefined, dependencies: ReceiptDependencies): Promise<NextResponse> {
  const method = id === undefined ? "POST" : "GET";
  if (request.method !== method) return response({ error: "Method not allowed" }, 405, method);
  try {
    const config = dependencies.getConfig(), origin = dependencies.getOrigin();
    if (!config || !origin) return unavailable();
    const suppliedOrigin = request.headers.get("origin");
    if (!isTrustedCallbackRequest(request, origin) || (method === "POST" ? suppliedOrigin !== origin : suppliedOrigin !== null && suppliedOrigin !== origin)) return rejected();
    const url = new URL(request.url), keys = [...url.searchParams.keys()], slug = url.searchParams.get("slug");
    if (keys.length !== 1 || keys[0] !== "slug" || !slug || slug.length > 63 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return rejected();
    if (id !== undefined && !RECEIPT_UUID.test(id)) return absent();
    let declared: number | null = null;
    if (method === "POST") {
      if (request.headers.get("content-type")?.trim().toLowerCase() !== "application/octet-stream" || request.headers.has("content-encoding")) return rejected();
      const length = request.headers.get("content-length");
      if (length !== null) {
        if (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length))) return rejected();
        declared = Number(length); if (declared > RECEIPT_MAX_BYTES) return tooLarge();
      }
    } else if (request.body || request.headers.has("content-encoding") || (request.headers.has("content-length") && request.headers.get("content-length") !== "0")) return rejected();
    const published = await dependencies.readBusiness(config, slug);
    if (published.status === "not_found") return absent();
    if (published.status !== "ok" || !RECEIPT_UUID.test(published.businessId)) return unavailable();
    // Refreshes are staged in a detached jar. Only successful authorized delivery
    // commits cookies; failures never clear or replace the caller's session.
    const state = createCallbackCookieState(new NextRequest(request.url, { headers: new Headers(request.headers) }));
    const verified = await dependencies.getUser(config, state);
    if (verified.error || !verified.data.user || !RECEIPT_UUID.test(verified.data.user.id)) return response({ error: "Session required" }, 401);
    const actor = verified.data.user.id;
    let result: NextResponse;
    if (method === "POST") {
      const bytes = await readBytes(request, declared);
      if (bytes === "large") return tooLarge();
      if (!bytes) return rejected();
      const receiptId = await dependencies.staging(config).stage(actor, published.businessId, bytes);
      result = response({ receiptId }, 201);
    } else {
      const file = id === undefined ? null : await dependencies.staging(config).download(actor, published.businessId, id);
      if (!file) return absent();
      const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" }[file.contentType];
      if (!extension) return unavailable();
      result = new NextResponse(Uint8Array.from(file.bytes), { status: 200, headers: {
        "Cache-Control": "private, no-store", Pragma: "no-cache", Expires: "0", "Referrer-Policy": "no-referrer",
        "Content-Type": file.contentType, "Content-Length": String(file.bytes.length),
        "Content-Disposition": `attachment; filename="receipt.${extension}"`, "X-Content-Type-Options": "nosniff",
      } });
    }
    state.cookies.forEach(({ name, value, options }) => { result.cookies.set(name, value, options); });
    return result;
  } catch (error) {
    if (error instanceof ReceiptFileError) return response({ error: "Receipt file rejected", code: error.code }, ["busy", "processing_timeout", "processing_failed"].includes(error.code) ? 503 : 422);
    return unavailable();
  }
}
