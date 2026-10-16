import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's native TypeScript runner resolves explicit .ts imports.
import { readStorefront } from "../app/lib/storefront-reader.ts";
import type { CatalogItem } from "../app/lib/storefront";

const businessId = "11111111-1111-4111-8111-111111111111";
const anonKey = `eyJhbGciOiJub25lIn0.${Buffer.from(JSON.stringify({ role: "anon" }), "utf8").toString("base64url")}.signature`;
const firstCategory = {
  id: "44444444-4444-4444-8444-444444444444",
  business_id: businessId,
  name: "Empanadas",
  sort_order: 10,
};
const secondCategory = {
  id: "55555555-5555-4555-8555-555555555555",
  business_id: businessId,
  name: "Bebidas",
  sort_order: 0,
};
const emptyCategory = {
  id: "66666666-6666-4666-8666-666666666666",
  business_id: businessId,
  name: "Postres",
  sort_order: 20,
};
const firstItem: CatalogItem = {
  id: "22222222-2222-4222-8222-222222222222",
  business_id: businessId,
  category_id: firstCategory.id,
  name: "Empanada de carne",
  description: "Carne suave",
  price_minor: 120000,
  currency: "ARS",
  is_available: true,
  sort_order: 4,
};
const secondItem: CatalogItem = {
  ...firstItem,
  id: "33333333-3333-4333-8333-333333333333",
  category_id: firstCategory.id,
  name: "Empanada criolla",
  sort_order: 1,
};
const drinkItem: CatalogItem = {
  ...firstItem,
  id: "88888888-8888-4888-8888-888888888888",
  category_id: secondCategory.id,
  name: "Gaseosa",
  sort_order: 0,
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("reader only asks the public REST path with constrained fields", async () => {
  process.env.SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_ANON_KEY = anonKey;
  const calls: { url: string; headers: Headers; cache?: RequestCache }[] = [];
  const result = await readStorefront("la-posta", async (input, init) => {
    calls.push({ url: String(input), headers: new Headers(init?.headers), cache: init?.cache });
    if (calls.length === 1) return response([{ business_id: businessId, slug: "la-posta", display_name: "La Posta", is_published: true }]);
    if (calls.length === 2) return response([firstCategory, secondCategory, emptyCategory]);
    return response([firstItem, secondItem, drinkItem]);
  });

  assert.equal(result.status, "ok");
  if (result.status === "ok") {
    assert.deepEqual(result.categories.map(({ category }) => category.name), ["Bebidas", "Empanadas"]);
    assert.deepEqual(result.categories[1]?.items.map((item) => item.name), ["Empanada criolla", "Empanada de carne"]);
  }
  assert.equal(calls.length, 3);
  const storefrontUrl = new URL(calls[0].url);
  assert.equal(storefrontUrl.pathname, "/rest/v1/business_storefronts");
  assert.equal(storefrontUrl.searchParams.get("slug"), "eq.la-posta");
  assert.equal(storefrontUrl.searchParams.get("select"), "business_id,slug,display_name,is_published");
  assert.equal(calls[0].cache, "no-store");
  assert.equal(calls[0].headers.get("apikey"), anonKey);
  assert.equal(calls[0].headers.get("authorization"), `Bearer ${anonKey}`);

  const categoriesUrl = new URL(calls[1].url);
  assert.equal(categoriesUrl.pathname, "/rest/v1/catalog_categories");
  assert.equal(categoriesUrl.searchParams.get("business_id"), `eq.${businessId}`);
  assert.equal(categoriesUrl.searchParams.get("select"), "id,business_id,name,sort_order");
  assert.equal(categoriesUrl.searchParams.get("order"), "sort_order.asc,id.asc");

  const itemsUrl = new URL(calls[2].url);
  assert.equal(itemsUrl.searchParams.get("business_id"), `eq.${businessId}`);
  assert.equal(itemsUrl.searchParams.get("is_available"), "eq.true");
  assert.equal(itemsUrl.searchParams.get("select"), "id,business_id,category_id,name,description,price_minor,currency,is_available,sort_order,photo_path");
  assert.equal(itemsUrl.searchParams.get("order"), "sort_order.asc,id.asc");
});

test("reader rejects malformed or cross-category catalog payloads", async () => {
  process.env.SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_ANON_KEY = anonKey;
  const malformedCategory = {
    id: firstCategory.id,
    business_id: firstCategory.business_id,
    name: firstCategory.name,
  };
  let calls = 0;
  const malformed = await readStorefront("la-posta", async () => {
    calls += 1;
    if (calls === 1) return response([{ business_id: businessId, slug: "la-posta", display_name: "La Posta", is_published: true }]);
    return response([malformedCategory]);
  });
  assert.deepEqual(malformed, { status: "unavailable" });

  calls = 0;
  const unrelatedCategory = "77777777-7777-4777-8777-777777777777";
  const crossCategory = await readStorefront("la-posta", async () => {
    calls += 1;
    if (calls === 1) return response([{ business_id: businessId, slug: "la-posta", display_name: "La Posta", is_published: true }]);
    if (calls === 2) return response([firstCategory]);
    return response([{ ...firstItem, category_id: unrelatedCategory }]);
  });
  assert.deepEqual(crossCategory, { status: "unavailable" });
});

test("reader treats unpublished and malformed slugs as not found without probing REST", async () => {
  process.env.SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_ANON_KEY = anonKey;
  let calls = 0;
  const unpublished = await readStorefront("hidden", async () => {
    calls += 1;
    return response([]);
  });
  const invalid = await readStorefront("hidden%2Fother", async () => {
    calls += 1;
    return response([]);
  });

  assert.deepEqual(unpublished, { status: "not_found" });
  assert.deepEqual(invalid, { status: "not_found" });
  assert.equal(calls, 1);
});

test("reader reports configuration and backend failures honestly", async () => {
  delete process.env.SUPABASE_URL;
  process.env.SUPABASE_ANON_KEY = anonKey;
  assert.deepEqual(await readStorefront("la-posta", fetch), { status: "misconfigured" });

  process.env.SUPABASE_URL = "http://127.0.0.1:54321";
  const result = await readStorefront("la-posta", async () => response({ error: "offline" }, 503));
  assert.deepEqual(result, { status: "unavailable" });
});
