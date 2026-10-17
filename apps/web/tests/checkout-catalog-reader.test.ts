import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { readCheckoutCatalog } from "../app/lib/checkout-catalog-reader.ts";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { readStorefront } from "../app/lib/storefront-reader.ts";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { validateSelections, priceSelection, describeSelection } from "../app/lib/catalog-selection.ts";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { createCart, addSelectedCartItem } from "../app/lib/storefront.ts";

const id = (n: number) => `${String(n).padStart(8, "0")}-1111-4111-8111-111111111111`;
const business = id(1);
const key = "sb_publishable_synthetic";
const store = { business_id: business, slug: "la-posta", display_name: "La Posta", is_published: true };
const category = { id: id(2), business_id: business, name: "Menu", sort_order: 0 };
const pizza = { id: id(3), business_id: business, category_id: category.id, name: "Pizza", description: null,
  price_minor: 1000, currency: "ARS", is_available: true, sort_order: 0 };
const dozen = { ...pizza, id: id(4), name: "Docena", sort_order: 1 };
const flavors = { id: id(5), business_id: business, item_id: pizza.id, name: "Sabores", selection_mode: "distinct",
  min_select: 1, max_select: 2, sort_order: 0 };
const units = { ...flavors, id: id(6), item_id: dozen.id, selection_mode: "quantity", min_select: 12, max_select: 12 };
const flavor = { id: id(7), business_id: business, group_id: flavors.id, name: "Muzza", price_delta_minor: 0,
  is_available: true, sort_order: 1 };
const other = { ...flavor, id: id(8), name: "Napo", price_delta_minor: 100, sort_order: 0 };
const filling = { ...flavor, id: id(9), group_id: units.id, name: "Carne", sort_order: 0 };
const settings = { business_id: business, two_flavor_surcharge_minor: 50 };
function fixture(): Record<string, unknown> {
  return { business_storefronts: [store], catalog_categories: [category], catalog_items: [pizza, dozen],
    catalog_option_groups: [flavors, units], catalog_options: [flavor, other, filling], business_catalog_settings: [settings] };
}
function configure() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://catalog.example.invalid/ignored";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = key;
}
function harness(rows = fixture()) {
  configure();
  const calls: { url: URL; init?: RequestInit }[] = [];
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    const body = rows[url.pathname.split("/").at(-1)!];
    if (body instanceof Error) throw body;
    if (body instanceof Response) return body;
    return new Response(JSON.stringify(body), { headers: { "content-type": "application/json",
      "content-range": Array.isArray(body) ? `${body.length ? `0-${body.length - 1}` : "*"}/${body.length}` : "*/0" } });
  };
  return { calls, fetcher };
}

test("published pizza and dozen catalog feeds existing selection and cart helpers", async () => {
  const { fetcher } = harness();
  const result = await readCheckoutCatalog("la-posta", fetcher);
  assert.equal(result.status, "ok");
  if (result.status !== "ok") return;
  assert.deepEqual(result.storefront, store);
  assert.equal(result.categories[0].category.id, category.id);
  assert.equal(result.surchargeMinor, 50);
  assert.deepEqual(result.options.map((option) => option.id), [other.id, filling.id, flavor.id]);
  const request = { item: result.categories[0].items[0], groups: result.groups.filter((g) => g.item_id === pizza.id),
    options: result.options, surchargeMinor: result.surchargeMinor,
    selections: [{ groupId: flavors.id, picks: [{ optionId: flavor.id, quantity: 1 }, { optionId: other.id, quantity: 1 }] }] };
  assert.deepEqual(validateSelections(request), []);
  assert.deepEqual(priceSelection(request), { ok: true, unitPriceMinor: 1150, surchargeMinor: 50 });
  assert.equal(describeSelection(request), "Mitad Muzza / mitad Napo");
  assert.equal(addSelectedCartItem(createCart(business), request, request.selections).items[0].unitPriceMinor, 1150);
  const dozenRequest = { ...request, item: result.categories[0].items[1], groups: result.groups.filter((g) => g.item_id === dozen.id),
    selections: [{ groupId: units.id, picks: [{ optionId: filling.id, quantity: 12 }] }] };
  assert.deepEqual(validateSelections(dozenRequest), []);
  assert.deepEqual(priceSelection(dozenRequest), { ok: true, unitPriceMinor: 1000, surchargeMinor: 0 });
  assert.equal(describeSelection(dozenRequest), "12 Carne");
  assert.equal(addSelectedCartItem(createCart(business), dozenRequest, dozenRequest.selections).items[0].quantity, 1);
  assert.equal(priceSelection({ ...request, selections: [] }).ok, false);
});

test("public URLs constrain fields, business, available options and valid item/group IDs without user authority", async () => {
  const { calls, fetcher } = harness();
  await readCheckoutCatalog("la-posta", fetcher);
  assert.equal(calls.length, 6);
  for (const { url, init } of calls) {
    assert.equal(url.origin, "https://catalog.example.invalid");
    assert.match(url.pathname, /^\/rest\/v1\//);
    assert.equal(init?.cache, "no-store");
    assert.equal(new Headers(init?.headers).get("apikey"), key);
    assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${key}`);
    assert.equal(new Headers(init?.headers).has("cookie"), false);
    assert.equal(init?.credentials, "omit");
    assert.equal(init?.redirect, "error");
    assert.equal(new Headers(init?.headers).get("prefer"), "count=exact");
    assert.equal(init?.body, undefined);
  }
  const supplemental = calls.slice(3);
  const expected = ["id,business_id,item_id,name,selection_mode,min_select,max_select,sort_order",
    "id,business_id,group_id,name,price_delta_minor,is_available,sort_order", "business_id,two_flavor_surcharge_minor"];
  assert.deepEqual(supplemental.map(({ url }) => url.searchParams.get("select")), expected);
  for (const { url } of supplemental) assert.equal(url.searchParams.get("business_id"), `eq.${business}`);
  assert.equal(supplemental[0].url.searchParams.get("item_id"), `in.(${pizza.id},${dozen.id})`);
  assert.equal(supplemental[1].url.searchParams.get("group_id"), `in.(${flavors.id},${units.id})`);
  assert.equal(supplemental[1].url.searchParams.get("is_available"), "eq.true");
});

test("options and settings reads start independently after groups", async () => {
  const { fetcher } = harness();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let optionsStarted = false;
  const result = await readCheckoutCatalog("la-posta", async (input, init) => {
    const table = new URL(String(input)).pathname.split("/").at(-1);
    if (table === "catalog_options") { optionsStarted = true; await gate; }
    if (table === "business_catalog_settings") { assert.equal(optionsStarted, true); release(); }
    return fetcher(input, init);
  });
  assert.equal(result.status, "ok");
});

test("unknown, unpublished and invalid slugs never read supplemental data", async () => {
  for (const stores of [[], [{ ...store, is_published: false }]]) {
    const rows = fixture(); rows.business_storefronts = stores;
    const { calls, fetcher } = harness(rows);
    assert.deepEqual(await readCheckoutCatalog("la-posta", fetcher), { status: "not_found" });
    assert.equal(calls.length, 1);
  }
  const { calls, fetcher } = harness();
  assert.deepEqual(await readCheckoutCatalog("bad/slug", fetcher), { status: "not_found" });
  assert.equal(calls.length, 0);
});

test("explicit zero and complete zero-row settings both yield zero surcharge", async () => {
  const rows = fixture(); rows.business_catalog_settings = [{ ...settings, two_flavor_surcharge_minor: 0 }];
  const result = await readCheckoutCatalog("la-posta", harness(rows).fetcher);
  assert.equal(result.status, "ok");
  if (result.status === "ok") assert.equal(result.surchargeMinor, 0);
  rows.business_catalog_settings = [];
  for (const plainMenu of [false, true]) {
    if (plainMenu) { rows.catalog_option_groups = []; rows.catalog_options = []; }
    const absent = await readCheckoutCatalog("la-posta", harness(rows).fetcher);
    assert.equal(absent.status, "ok");
    if (absent.status === "ok") assert.equal(absent.surchargeMinor, 0);
  }
});

test("malformed, duplicate and foreign relationships fail closed instead of yielding a priceable catalog", async () => {
  const cases: [string, unknown][] = [
    ["catalog_option_groups", [{ ...flavors, business_id: id(99) }]],
    ["catalog_option_groups", [{ ...flavors, item_id: id(99) }]],
    ["catalog_option_groups", [{ ...flavors, selection_mode: "pizza" }]],
    ["catalog_option_groups", [{ ...flavors, min_select: 3, max_select: 2 }]],
    ["catalog_option_groups", [{ ...flavors, sort_order: -1 }]],
    ["catalog_option_groups", [flavors, flavors]],
    ["catalog_options", [{ ...flavor, business_id: id(99) }]],
    ["catalog_options", [{ ...flavor, group_id: id(99) }]],
    ["catalog_options", [{ ...flavor, is_available: false }]],
    ["catalog_options", [{ ...flavor, price_delta_minor: -1 }]],
    ["catalog_options", [flavor, flavor]],
    ["business_catalog_settings", [{ ...settings, business_id: id(99) }]],
    ["business_catalog_settings", [{ business_id: business }]],
    ["business_catalog_settings", [{ ...settings, two_flavor_surcharge_minor: -1 }]],
    ["business_catalog_settings", [settings, settings]],
    ["catalog_items", [{ ...pizza, business_id: id(99) }]],
    ["catalog_items", [pizza, pizza]],
    ["catalog_items", [{ ...pizza, category_id: id(99) }]],
  ];
  for (const [table, value] of cases) {
    const rows = fixture(); rows[table] = value;
    assert.deepEqual(await readCheckoutCatalog("la-posta", harness(rows).fetcher), { status: "unavailable" }, table);
  }
});

test("read failures and non-array/truncated supplemental payloads fail closed", async () => {
  for (const table of ["catalog_option_groups", "catalog_options", "business_catalog_settings"]) {
    for (const failure of [new Error("offline"), new Response("{}", { status: 503 }), {},
      new Response("not-json")]) {
      const rows = fixture(); rows[table] = failure;
      assert.deepEqual(await readCheckoutCatalog("la-posta", harness(rows).fetcher), { status: "unavailable" }, table);
    }
  }
});

test("a complete 1000-row page is accepted while incomplete or over-limit pages fail closed", async () => {
  const options = Array.from({ length: 1000 }, (_, index) => ({ ...flavor, id: id(100 + index) }));
  const rows = fixture(); rows.catalog_options = options;
  const complete = await readCheckoutCatalog("la-posta", harness(rows).fetcher);
  assert.equal(complete.status, "ok");
  if (complete.status === "ok") assert.equal(complete.options.length, 1000);
  for (const range of ["0-999/1001", "0-998/1000"]) {
    rows.catalog_options = new Response(JSON.stringify(options), { headers: { "content-range": range } });
    assert.deepEqual(await readCheckoutCatalog("la-posta", harness(rows).fetcher), { status: "unavailable" });
  }
  rows.catalog_options = [...options, { ...flavor, id: id(1100) }];
  assert.deepEqual(await readCheckoutCatalog("la-posta", harness(rows).fetcher), { status: "unavailable" });
});

test("zero-row settings still require successful complete metadata", async () => {
  for (const headers of [{}, { "content-range": "*/1" }] as HeadersInit[]) {
    const rows = fixture();
    rows.business_catalog_settings = new Response("[]", { headers });
    assert.deepEqual(await readCheckoutCatalog("la-posta", harness(rows).fetcher), { status: "unavailable" });
  }
});

test("missing or partial count metadata cannot silently omit configuration or items", async () => {
  for (const table of ["catalog_items", "catalog_option_groups", "catalog_options", "business_catalog_settings"]) {
    const countHeaders: HeadersInit[] = [{}, { "content-range": "0-0/2" }, { "content-range": "0-0/*" }];
    for (const headers of countHeaders) {
      const rows = fixture();
      const value = (rows[table] as unknown[]).slice(0, 1);
      rows[table] = new Response(JSON.stringify(value), { headers });
      assert.deepEqual(await readCheckoutCatalog("la-posta", harness(rows).fetcher), { status: "unavailable" });
    }
  }
});

test("returned records strip unexpected fields rather than widening the public contract", async () => {
  const rows = fixture();
  for (const table of Object.keys(rows)) {
    rows[table] = (rows[table] as object[]).map((value) => ({ ...value, private_note: "synthetic-private" }));
  }
  const result = await readCheckoutCatalog("la-posta", harness(rows).fetcher);
  assert.equal(result.status, "ok");
  assert.equal(JSON.stringify(result).includes("private_note"), false);
});

test("validated configuration failures perform no public fetch", async () => {
  const { calls, fetcher } = harness();
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_secret_invalid";
  assert.deepEqual(await readCheckoutCatalog("la-posta", fetcher), { status: "misconfigured" });
  assert.equal(calls.length, 0);
});

test("original storefront fixture still needs only its original three requests", async () => {
  const rows = fixture();
  delete rows.catalog_option_groups; delete rows.catalog_options; delete rows.business_catalog_settings;
  const { calls, fetcher } = harness(rows);
  const result = await readStorefront("la-posta", fetcher);
  assert.equal(result.status, "ok");
  assert.deepEqual(calls.map(({ url }) => url.pathname), ["/rest/v1/business_storefronts", "/rest/v1/catalog_categories", "/rest/v1/catalog_items"]);
});
