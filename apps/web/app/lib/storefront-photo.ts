/**
 * Public product photo decision and URL building.
 *
 * A storefront only ever shows a photo when the stored path is a valid public
 * object path. Validation mirrors the database `catalog_items_photo_path_shape`
 * constraint exactly: `<business_id>/<item_id>/<uuid>.(jpg|jpeg|png|webp)`.
 * The trusted writer currently emits only `.webp`; accepting the wider
 * extension set is deliberate forward compatibility with the stored contract.
 */

export const PRODUCT_PHOTO_BUCKET = "product-photos";

export type StorefrontPhoto =
  | { kind: "photo"; path: string; url: string }
  | { kind: "fallback" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PHOTO_FILE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|jpeg|png|webp)$/;
const FALLBACK: StorefrontPhoto = { kind: "fallback" };

/** Builds the public Storage URL for an already validated path, or null. */
export function publicPhotoUrl(baseUrl: string, photoPath: string): string | null {
  try {
    const base = new URL(baseUrl);
    if (base.username || base.password || !/^https?:$/.test(base.protocol)) return null;
    return `${base.origin}/storage/v1/object/public/${PRODUCT_PHOTO_BUCKET}/${photoPath}`;
  } catch {
    return null;
  }
}

/**
 * Decides what the storefront shows for one catalog item's raw `photo_path`.
 * Anything missing or malformed degrades to the honest fallback, and a raw
 * value only becomes an image URL when its whole path shape is valid.
 */
export function readProductPhoto(input: {
  value: unknown;
  businessId: string;
  itemId: string;
  baseUrl: string;
}): StorefrontPhoto {
  const { value, businessId, itemId, baseUrl } = input;
  if (typeof value !== "string" || !UUID.test(businessId) || !UUID.test(itemId)) return FALLBACK;
  const segments = value.split("/");
  if (segments.length !== 3) return FALLBACK;
  const [business, item, file] = segments;
  if (business !== businessId || item !== itemId || !PHOTO_FILE.test(file)) return FALLBACK;
  const url = publicPhotoUrl(baseUrl, value);
  return url === null ? FALLBACK : { kind: "photo", path: value, url };
}
