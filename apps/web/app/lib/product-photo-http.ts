import { parseBusinessSelection } from "../owner/owner-context";
import { PhotoNormalizationError } from "./product-photo-normalizer";
import { PhotoChangeError, type PhotoReference } from "./product-photo-service";
import { PhotoSupabaseError } from "./product-photo-supabase";
import type { PhotoRuntime } from "./product-photo-runtime";

export type ProductPhotoHttpOptions = {
  trustedOrigin?: string | null;
  createRuntime?: (request: Request) => PhotoRuntime;
};

const MAX_INPUT_BYTES = 4 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const VERSION = /^(0|[1-9][0-9]{0,18})$/;
const MAX_VERSION = BigInt("9223372036854775807");

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  if (normalized === "localhost" || normalized === "[::1]") return true;
  const octets = normalized.split(".");
  return octets.length === 4 && octets[0] === "127" && octets.slice(1).every((octet) => {
    const value = Number(octet);
    return /^\d{1,3}$/.test(octet) && value >= 0 && value <= 255;
  });
}

function validTrustedOrigin(value: string | null): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    const safeProtocol = url.protocol === "https:"
      || (url.protocol === "http:" && isLoopbackHostname(url.hostname));
    if (
      !safeProtocol
      || url.username
      || url.password
      || url.pathname !== "/"
      || url.search
      || url.hash
    ) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function configuredTrustedOrigin(): string | null {
  return validTrustedOrigin(process.env.QWERTY_SITE_URL ?? null);
}

function isTrustedPhotoRequest(request: Request, trustedOrigin: string): boolean {
  try {
    const trusted = new URL(trustedOrigin);
    const host = request.headers.get("host");
    const forwardedHost = request.headers.get("x-forwarded-host");
    const forwardedProto = request.headers.get("x-forwarded-proto");
    if (request.headers.get("origin") !== trusted.origin) return false;
    if (!host || host.trim().toLowerCase() !== trusted.host.toLowerCase()) return false;
    if (forwardedHost !== null && forwardedHost.trim().toLowerCase() !== trusted.host.toLowerCase()) return false;
    if (
      forwardedProto !== null
      && forwardedProto.trim().toLowerCase() !== trusted.protocol.slice(0, -1)
    ) return false;

    const requestUrl = new URL(request.url);
    if (requestUrl.origin === trusted.origin) return true;
    const hasValidatedForwardedOrigin = forwardedHost !== null && forwardedProto !== null;
    return requestUrl.protocol === trusted.protocol
      && isLoopbackHostname(requestUrl.hostname)
      && (requestUrl.port === trusted.port || hasValidatedForwardedOrigin);
  } catch {
    return false;
  }
}

function privateHeaders(): Headers {
  const headers = new Headers();
  headers.set("cache-control", "private, no-store");
  headers.set("expires", "0");
  headers.set("pragma", "no-cache");
  headers.set("referrer-policy", "no-referrer");
  headers.set("content-type", "application/json");
  return headers;
}

function responseFor(
  request: Request,
  status: number,
  body: { error: string },
  extraHeaders?: HeadersInit,
): Response {
  const headers = privateHeaders();
  if (extraHeaders) {
    for (const [name, value] of new Headers(extraHeaders)) headers.set(name, value);
  }
  return new Response(request.method === "HEAD" ? null : JSON.stringify(body), {
    status,
    headers,
  });
}

function successResponse(request: Request, reference: PhotoReference): Response {
  return new Response(request.method === "HEAD" ? null : JSON.stringify(reference), {
    status: 200,
    headers: privateHeaders(),
  });
}

function mappedError(error: unknown): { status: number; code: string } {
  if (error instanceof PhotoChangeError) {
    if (error.code === "unauthorized") return { status: 401, code: "unauthorized" };
    if (error.code === "not_found") return { status: 404, code: "not_found" };
    if (error.code === "conflict") return { status: 409, code: "conflict" };
    return { status: 400, code: "invalid_input" };
  }
  if (error instanceof PhotoNormalizationError) {
    if (error.code === "input_too_large") return { status: 413, code: "input_too_large" };
    return { status: 422, code: "invalid_image" };
  }
  if (error instanceof PhotoSupabaseError) return { status: 503, code: "unavailable" };
  return { status: 503, code: "unavailable" };
}

function isPhotoReference(value: unknown): value is PhotoReference {
  if (typeof value !== "object" || value === null) return false;
  const reference = value as { photoPath?: unknown; photoVersion?: unknown };
  return (
    (reference.photoPath === null || typeof reference.photoPath === "string")
    && typeof reference.photoVersion === "string"
    && VERSION.test(reference.photoVersion)
    && BigInt(reference.photoVersion) <= MAX_VERSION
  );
}

type BodyError = "invalid_input" | "input_too_large" | "unavailable";
type BodyReadResult = { bytes: Uint8Array } | { error: BodyError };

async function readPhotoBody(request: Request): Promise<BodyReadResult> {
  const declared = request.headers.get("content-length");
  let declaredLength: bigint | null = null;
  if (declared !== null) {
    if (!/^(0|[1-9][0-9]*)$/.test(declared.trim())) return { error: "invalid_input" };
    try {
      declaredLength = BigInt(declared.trim());
    } catch {
      return { error: "invalid_input" };
    }
    if (declaredLength > BigInt(MAX_INPUT_BYTES)) return { error: "input_too_large" };
  }

  if (!request.body) {
    if (declaredLength !== null && declaredLength !== BigInt(0)) return { error: "invalid_input" };
    return { bytes: new Uint8Array() };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      const chunk = result.value instanceof Uint8Array
        ? result.value
        : new Uint8Array(result.value);
      total += chunk.byteLength;
      if (total > MAX_INPUT_BYTES) {
        await reader.cancel("photo input too large");
        return { error: "input_too_large" };
      }
      chunks.push(chunk);
    }
  } catch {
    return { error: "unavailable" };
  } finally {
    reader.releaseLock();
  }

  if (declaredLength !== null && declaredLength !== BigInt(total)) return { error: "invalid_input" };
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes };
}

function withPrivateHeaders(response: Response): Response {
  for (const [name, value] of privateHeaders()) response.headers.set(name, value);
  return response;
}

async function applyVerifiedCookies(
  request: Request,
  runtime: PhotoRuntime,
  response: Response,
): Promise<Response> {
  try {
    const applied = runtime.applyCookies(response);
    return withPrivateHeaders(applied instanceof Response ? applied : response);
  } catch {
    return responseFor(request, 503, { error: "unavailable" });
  }
}

function bodyErrorResponse(request: Request, error: BodyError): Response {
  if (error === "input_too_large") return responseFor(request, 413, { error });
  if (error === "unavailable") return responseFor(request, 503, { error: "unavailable" });
  return responseFor(request, 400, { error });
}

export async function handleProductPhotoRequest(
  request: Request,
  itemId: string,
  options: ProductPhotoHttpOptions = {},
): Promise<Response> {
  if (request.method !== "PUT" && request.method !== "DELETE") {
    return responseFor(request, 405, { error: "method_not_allowed" }, { allow: "PUT, DELETE" });
  }

  const trustedOrigin = validTrustedOrigin(
    options.trustedOrigin === undefined ? configuredTrustedOrigin() : options.trustedOrigin,
  );
  if (!trustedOrigin) return responseFor(request, 503, { error: "unavailable" });
  if (!isTrustedPhotoRequest(request, trustedOrigin)) {
    return responseFor(request, 403, { error: "request_rejected" });
  }

  const selection = parseBusinessSelection(new URL(request.url).searchParams);
  if (!selection.ok) return responseFor(request, 400, { error: "invalid_input" });

  let runtime: PhotoRuntime;
  try {
    runtime = options.createRuntime
      ? options.createRuntime(request)
      : (await import("./product-photo-runtime")).createPhotoRuntime(request);
    const actor = await runtime.authenticate();
    if (typeof actor !== "string" || !actor) {
      return responseFor(request, 401, { error: "unauthorized" });
    }
  } catch {
    return responseFor(request, 503, { error: "unavailable" });
  }

  if (!UUID.test(itemId)) {
    return applyVerifiedCookies(request, runtime, responseFor(request, 400, { error: "invalid_input" }));
  }
  const expectedVersion = request.headers.get("x-photo-version");
  if (!expectedVersion || !VERSION.test(expectedVersion) || BigInt(expectedVersion) >= MAX_VERSION) {
    return applyVerifiedCookies(request, runtime, responseFor(request, 400, { error: "invalid_input" }));
  }

  const body = await readPhotoBody(request);
  if ("error" in body) {
    return applyVerifiedCookies(request, runtime, bodyErrorResponse(request, body.error));
  }
  if (
    (request.method === "PUT" && body.bytes.byteLength === 0)
    || (request.method === "DELETE" && body.bytes.byteLength !== 0)
  ) {
    return applyVerifiedCookies(request, runtime, responseFor(request, 400, { error: "invalid_input" }));
  }

  try {
    const reference = await runtime.change({
      itemId,
      expectedVersion,
      operation: request.method === "PUT" ? "replace" : "detach",
      ...(request.method === "PUT" ? { image: body.bytes } : {}),
    });
    if (!isPhotoReference(reference)) throw new Error("invalid photo reference");
    return applyVerifiedCookies(request, runtime, successResponse(request, reference));
  } catch (error) {
    const mapped = mappedError(error);
    return applyVerifiedCookies(request, runtime, responseFor(request, mapped.status, { error: mapped.code }));
  }
}

export type PhotoRouteContext = {
  params: Promise<{ itemId: string }>;
};

export function createPhotoRouteHandlers(options: ProductPhotoHttpOptions = {}) {
  const rejectMethod = (request: Request, _context: PhotoRouteContext) =>
    handleProductPhotoRequest(request, "", options);
  return {
    PUT: (request: Request, context: PhotoRouteContext) =>
      context.params.then(({ itemId }) => handleProductPhotoRequest(request, itemId, options)),
    DELETE: (request: Request, context: PhotoRouteContext) =>
      context.params.then(({ itemId }) => handleProductPhotoRequest(request, itemId, options)),
    GET: rejectMethod,
    HEAD: rejectMethod,
    POST: rejectMethod,
    PATCH: rejectMethod,
    OPTIONS: rejectMethod,
  };
}
