import type { PhotoReference } from "../../lib/product-photo-service.ts";

export type PhotoState = { photoPath: string | null; photoVersion: string };
export type PhotoEditOperation = "replace" | "detach";

export type PhotoEditOutcome =
  | ({ kind: "replaced" } & PhotoReference)
  | ({ kind: "detached" } & PhotoReference)
  | { kind: "conflict" }
  | { kind: "unauthorized" }
  | { kind: "not_found" }
  | { kind: "input_too_large" }
  | { kind: "invalid_image" }
  | { kind: "invalid_input" }
  | { kind: "unavailable" };

export type PhotoEditPlan =
  | { ok: true; url: string; method: "PUT" | "DELETE"; headers: Record<string, string>; body?: BodyInit }
  | { ok: false; error: "invalid_input" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VERSION = /^(0|[1-9][0-9]{0,18})$/;

/**
 * Honest photo state for the owner editor: a missing photo stays a missing
 * photo. No placeholder image is invented for a product without a photo.
 */
export function describePhotoState(state: PhotoState): string {
  return state.photoPath === null
    ? `Sin foto (versión ${state.photoVersion})`
    : `Con foto (versión ${state.photoVersion})`;
}

/**
 * Builds the raw-bytes request the editor sends to the existing trusted photo
 * route. The expected version travels in `X-Photo-Version`; the business is
 * never carried by the caller, only resolved from the session by the endpoint.
 */
export function planPhotoEdit(input: {
  itemId: string;
  expectedVersion: string;
  operation: PhotoEditOperation;
  image?: BodyInit;
  origin?: string;
}): PhotoEditPlan {
  const hasImage = input.image !== undefined && input.image !== null;
  const validId = UUID.test(input.itemId);
  const validVersion = VERSION.test(input.expectedVersion);
  const validOperation = input.operation === "replace" || input.operation === "detach";
  const validImage =
    (input.operation === "replace" && hasImage) ||
    (input.operation === "detach" && !hasImage);
  if (!validId || !validVersion || !validOperation || !validImage) {
    return { ok: false, error: "invalid_input" };
  }

  const headers: Record<string, string> = { "x-photo-version": input.expectedVersion };
  if (input.operation === "replace") headers["content-type"] = "image/webp";
  return {
    ok: true,
    url: `${input.origin ?? ""}/owner/catalog/items/${input.itemId}/photo`,
    method: input.operation === "replace" ? "PUT" : "DELETE",
    headers,
    ...(input.operation === "replace" ? { body: input.image } : {}),
  };
}

/** Maps the endpoint response to the outcome the owner sees. */
export async function photoEditOutcome(response: Response): Promise<PhotoEditOutcome> {
  if (response.status === 200) {
    const reference = (await response.json()) as PhotoReference;
    return reference.photoPath === null
      ? { kind: "detached", ...reference }
      : { kind: "replaced", ...reference };
  }

  let code = "";
  try {
    code = ((await response.json()) as { error?: string }).error ?? "";
  } catch {
    // Keep the status-based mapping when the body is not JSON.
  }
  if (response.status === 401 || code === "unauthorized") return { kind: "unauthorized" };
  if (response.status === 404 || code === "not_found") return { kind: "not_found" };
  if (response.status === 409 || code === "conflict") return { kind: "conflict" };
  if (response.status === 413 || code === "input_too_large") return { kind: "input_too_large" };
  if (response.status === 422 || code === "invalid_image") return { kind: "invalid_image" };
  if (response.status === 400 || code === "invalid_input") return { kind: "invalid_input" };
  return { kind: "unavailable" };
}

/** Clear owner-facing text for every outcome, especially a lost compare-and-swap. */
export function photoEditMessage(outcome: PhotoEditOutcome): string {
  switch (outcome.kind) {
    case "replaced":
      return `Foto actualizada (versión ${outcome.photoVersion}).`;
    case "detached":
      return "Foto quitada. El producto vuelve a mostrarse sin imagen.";
    case "conflict":
      return "Otra pestaña o dispositivo cambió la foto. Actualizamos el estado: volvé a intentar.";
    case "unauthorized":
      return "Tu sesión no está activa. Iniciá sesión de nuevo.";
    case "not_found":
      return "No encontramos ese producto en tu negocio.";
    case "input_too_large":
      return "La imagen supera el máximo permitido.";
    case "invalid_image":
      return "El archivo no es una imagen válida. Probá con PNG, JPEG o WebP.";
    case "invalid_input":
      return "No pudimos interpretar el cambio de foto. Volvé a intentar.";
    default:
      return "No pudimos guardar la foto. Intentá de nuevo más tarde.";
  }
}
