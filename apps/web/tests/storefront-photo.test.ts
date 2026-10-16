import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's native TypeScript runner resolves explicit .ts imports.
import { PRODUCT_PHOTO_BUCKET, publicPhotoUrl, readProductPhoto } from "../app/lib/storefront-photo.ts";
// @ts-expect-error Node's native TypeScript runner resolves explicit .ts imports.
import { readStorefront } from "../app/lib/storefront-reader.ts";

const baseUrl = "http://127.0.0.1:54321";
const businessId = "11111111-1111-4111-8111-111111111111";
const itemId = "22222222-2222-4222-8222-222222222222";
const fileId = "33333333-3333-4333-8333-333333333333";
const photoPath = `${businessId}/${itemId}/${fileId}.webp`;
const expectedUrl = `${baseUrl}/storage/v1/object/public/${PRODUCT_PHOTO_BUCKET}/${photoPath}`;
const anonKey = `eyJhbGciOiJub25lIn0.${Buffer.from(JSON.stringify({ role: "anon" }), "utf8").toString("base64url")}.signature`;
const category = { id: "44444444-4444-4444-8444-444444444444", business_id: businessId, name: "Empanadas", sort_order: 0 };
const baseItem = {
  id: itemId,
  business_id: businessId,
  category_id: category.id,
  name: "Empanada de carne",
  description: null,
  price_minor: 120000,
  currency: "ARS",
  is_available: true,
  sort_order: 0,
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("a valid stored photo becomes its exact public bucket URL", () => {
  assert.equal(publicPhotoUrl(baseUrl, photoPath), expectedUrl);
  assert.deepEqual(readProductPhoto({ value: photoPath, businessId, itemId, baseUrl }), {
    kind: "photo",
    path: photoPath,
    url: expectedUrl,
  });
});

test("the validator mirrors the stored constraint extension set", () => {
  for (const extension of ["jpg", "jpeg", "png", "webp"]) {
    const path = `${businessId}/${itemId}/${fileId}.${extension}`;
    assert.deepEqual(readProductPhoto({ value: path, businessId, itemId, baseUrl }), {
      kind: "photo",
      path,
      url: `${baseUrl}/storage/v1/object/public/${PRODUCT_PHOTO_BUCKET}/${path}`,
    });
  }
});

test("a missing photo degrades to the honest fallback", () => {
  for (const value of [null, undefined, ""]) {
    assert.deepEqual(readProductPhoto({ value, businessId, itemId, baseUrl }), { kind: "fallback" }, String(value));
  }
});

test("a malformed photo path is dropped instead of rendered", () => {
  const malformed = [
    "not-a-uuid",
    `${businessId}/${itemId}/not-a-uuid.webp`,
    `${businessId}/${itemId}/${fileId}.gif`,
    `${businessId}/${itemId}/${fileId}.WEBP`,
    `${businessId}/44444444-4444-4444-8444-444444444444/${fileId}.webp`,
    `99999999-9999-4999-8999-999999999999/${itemId}/${fileId}.webp`,
    `${businessId}/${itemId}/${fileId}.webp/extra`,
    `${businessId}//${fileId}.webp`,
    `${businessId}/${itemId}/${fileId}.webp?x=1`,
    `../${itemId}/${fileId}.webp`,
  ];
  for (const value of malformed) {
    assert.deepEqual(readProductPhoto({ value, businessId, itemId, baseUrl }), { kind: "fallback" }, value);
  }
  assert.deepEqual(readProductPhoto({ value: 42, businessId, itemId, baseUrl }), { kind: "fallback" });
  assert.deepEqual(readProductPhoto({ value: photoPath, businessId, itemId, baseUrl: "not a url" }), { kind: "fallback" });
});

test("the reader attaches a valid photo and degrades malformed or missing ones", async () => {
  process.env.SUPABASE_URL = baseUrl;
  process.env.SUPABASE_ANON_KEY = anonKey;
  const malformedId = "55555555-5555-4555-8555-555555555555";
  const plainId = "66666666-6666-4666-8666-666666666666";
  let calls = 0;
  const result = await readStorefront("la-posta", async () => {
    calls += 1;
    if (calls === 1) return response([{ business_id: businessId, slug: "la-posta", display_name: "La Posta", is_published: true }]);
    if (calls === 2) return response([category]);
    return response([
      { ...baseItem, photo_path: photoPath },
      { ...baseItem, id: malformedId, photo_path: "not-a-path" },
      { ...baseItem, id: plainId, photo_path: null },
    ]);
  });

  assert.equal(result.status, "ok");
  if (result.status === "ok") {
    const items = result.categories.flatMap(({ items: categoryItems }) => categoryItems);
    assert.equal(items.length, 3);
    assert.deepEqual(items.find((item) => item.id === itemId)?.photo, { kind: "photo", path: photoPath, url: expectedUrl });
    assert.deepEqual(items.find((item) => item.id === malformedId)?.photo, { kind: "fallback" });
    assert.deepEqual(items.find((item) => item.id === plainId)?.photo, { kind: "fallback" });
  }
});

test("the reader still hides unavailable items and unpublished storefronts", async () => {
  process.env.SUPABASE_URL = baseUrl;
  process.env.SUPABASE_ANON_KEY = anonKey;
  const urls: string[] = [];
  let calls = 0;
  const result = await readStorefront("la-posta", async (input) => {
    urls.push(String(input));
    calls += 1;
    if (calls === 1) return response([{ business_id: businessId, slug: "la-posta", display_name: "La Posta", is_published: true }]);
    if (calls === 2) return response([category]);
    return response([{ ...baseItem, photo_path: photoPath }]);
  });
  assert.equal(result.status, "ok");
  const itemsUrl = new URL(urls[2] ?? "");
  assert.equal(itemsUrl.searchParams.get("is_available"), "eq.true");
  assert.equal(itemsUrl.searchParams.get("select"), "id,business_id,category_id,name,description,price_minor,currency,is_available,sort_order,photo_path");

  const unpublished = await readStorefront("hidden", async () =>
    response([{ business_id: businessId, slug: "hidden", display_name: "Hidden", is_published: false }]));
  assert.deepEqual(unpublished, { status: "not_found" });
});
