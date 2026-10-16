# Public storefront photos

This slice (PU2.5) makes the public storefront show the real product photo when one exists, and keep
the honest fallback when it does not. The owner editor already replaces and detaches photos through
the trusted endpoint; this unit only reads and renders the stored result.

## Public photo path

- Bucket: `product-photos` (public reads).
- Stored path shape: `<business_id>/<item_id>/<uuid>.<extension>`, enforced in the database by the
  `catalog_items_photo_path_shape` constraint.
- Public object URL:
  `<supabase_url>/storage/v1/object/public/product-photos/<stored path>`.

The trusted writer currently emits only `.webp`. The reader deliberately accepts the wider stored
set `jpg`, `jpeg`, `png` and `webp` so it mirrors the database constraint instead of a narrower
rule, which keeps older stored objects renderable under the same contract. Anything outside that
shape is not a valid public path.

## The decision and URL logic

`apps/web/app/lib/storefront-photo.ts` is a small pure module that owns the decision and the URL
building, so it is testable without a browser:

- `readProductPhoto({ value, businessId, itemId, baseUrl })` validates the whole path shape —
  including that the first segment is the item's business and the second is the item id — and
  returns `{ kind: "photo", path, url }` only when it is valid. Everything else returns
  `{ kind: "fallback" }`.
- `publicPhotoUrl(baseUrl, photoPath)` builds the public Storage URL and rejects non-HTTP(S) or
  credential-bearing base URLs.
- `PRODUCT_PHOTO_BUCKET` names the bucket.

The public reader `apps/web/app/lib/storefront-reader.ts` selects `photo_path` with the other
columns and attaches the decision to each item as `photo`. A malformed or missing path degrades to
the fallback rather than breaking the read, so a bad stored value never removes a product from the
storefront. Only available items under a published storefront are returned, as before.

## Fallback rule

Items without a valid photo render the existing honest fallback (`Foto no disponible` icon). There
is never a placeholder food image. Items with a photo render an `<img>` with reserved space
(`size-16` / `sm:size-[4.5rem]`, matching the fallback box) so the grid does not jump, and an
accessible alternative text based on the product name (`Foto de <name>`). The per-business cart and
its persistence are unchanged.

## Verification boundary

- `apps/web/tests/storefront-photo.test.ts` covers the valid photo URL, the stored extension set,
  the missing-photo fallback, malformed paths being dropped, and that the reader still hides
  unavailable items and unpublished storefronts.
- `apps/web/tests/storefront-reader.test.ts` pins the items `select` list, which now includes
  `photo_path`; its other assertions are unchanged.
- No browser run and no hosted check were performed. Whether a hosted object is reachable at the
  public URL, and how the image actually lays out in a real browser, remain unproven here.
