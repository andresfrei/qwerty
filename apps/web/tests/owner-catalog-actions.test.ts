import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server.js";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { handleCatalogPost, CatalogWriteError, type CatalogGateway, type CatalogWrite } from "../app/owner/catalog/catalog-actions.ts";

const trustedOrigin = "http://127.0.0.1:3000";
const trustedHost = "127.0.0.1:3000";
const ownerBusinessId = "11111111-1111-4111-8111-111111111111";
const categoryId = "22222222-2222-4222-8222-222222222222";
const otherCategoryId = "33333333-3333-4333-8333-333333333333";
const itemId = "44444444-4444-4444-8444-444444444444";

type GatewayOptions = {
  businessId?: string | null;
  ownedCategories?: string[];
  ownedItems?: string[];
  failWrite?: CatalogWriteError;
};

function fakeGateway(options: GatewayOptions = {}) {
  const businessId = options.businessId === undefined ? ownerBusinessId : options.businessId;
  const categories = new Set(options.ownedCategories ?? [categoryId]);
  const items = new Set(options.ownedItems ?? [itemId]);
  const writes: CatalogWrite[] = [];
  const gateway: CatalogGateway = {
    ownerBusinessId: async () => businessId,
    categoryOwnedBy: async (_businessId, id) => categories.has(id),
    itemOwnedBy: async (_businessId, id) => items.has(id),
    write: async (write) => {
      if (options.failWrite) throw options.failWrite;
      writes.push(write);
    },
  };
  return { gateway, writes };
}

function deps(gateway: CatalogGateway | null, trusted: string | null = trustedOrigin) {
  return { trustedOrigin: trusted, createGateway: async () => gateway };
}

function catalogRequest(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`${trustedOrigin}/owner/catalog/actions`, {
    method: "POST",
    headers: {
      Host: trustedHost,
      Origin: trustedOrigin,
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function assertPrivateHeaders(response: Response): void {
  const directives = new Set((response.headers.get("cache-control") ?? "")
    .split(",").map((value) => value.trim().toLowerCase()));
  assert.equal(directives.has("private"), true);
  assert.equal(directives.has("no-store"), true);
  assert.equal(response.headers.get("pragma"), "no-cache");
  assert.equal(response.headers.get("expires"), "0");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
}

async function errorCode(response: Response): Promise<string> {
  return (await response.json() as { error: string }).error;
}

const validProduct = {
  action: "create_product",
  name: "Muzzarella",
  description: null,
  priceMinor: 1250,
  currency: "ARS",
  categoryId,
  isAvailable: true,
  sortOrder: 1,
};

test("catalog writes reject a forged Origin and perform no write", async () => {
  const { gateway, writes } = fakeGateway();
  const response = await handleCatalogPost(
    catalogRequest({ action: "create_category", name: "Pizzas", sortOrder: 0 }, { Origin: "https://evil.invalid" }),
    deps(gateway),
  );
  assert.equal(response.status, 400);
  assert.equal(await errorCode(response), "request_rejected");
  assertPrivateHeaders(response);
  assert.equal(writes.length, 0);
});

test("catalog writes reject a forged Host and perform no write", async () => {
  const { gateway, writes } = fakeGateway();
  const response = await handleCatalogPost(
    catalogRequest({ action: "create_category", name: "Pizzas", sortOrder: 0 }, { Host: "evil.invalid" }),
    deps(gateway),
  );
  assert.equal(response.status, 400);
  assert.equal(await errorCode(response), "request_rejected");
  assertPrivateHeaders(response);
  assert.equal(writes.length, 0);
});

test("catalog writes require a fresh verified session", async () => {
  const { gateway, writes } = fakeGateway({ businessId: null });
  const response = await handleCatalogPost(catalogRequest({ action: "create_category", name: "Pizzas", sortOrder: 0 }), deps(gateway));
  assert.equal(response.status, 401);
  assert.equal(await errorCode(response), "unauthorized");
  assertPrivateHeaders(response);
  assert.equal(writes.length, 0);
});

test("catalog writes reject every invalid field without writing", async () => {
  const cases: [Record<string, unknown>, string][] = [
    [{ action: "create_category", name: "   ", sortOrder: 0 }, "invalid_name"],
    [{ action: "create_category", name: "Pizzas", sortOrder: -1 }, "invalid_sort_order"],
    [{ action: "create_category", name: "Pizzas", sortOrder: 1.5 }, "invalid_sort_order"],
    [{ ...validProduct, priceMinor: -1 }, "invalid_price"],
    [{ ...validProduct, priceMinor: 12.5 }, "invalid_price"],
    [{ ...validProduct, currency: "ars" }, "invalid_currency"],
    [{ ...validProduct, currency: "AR" }, "invalid_currency"],
    [{ ...validProduct, categoryId: otherCategoryId }, "invalid_category"],
    [{ ...validProduct, categoryId: "not-a-uuid" }, "invalid_category"],
    [{ ...validProduct, isAvailable: "yes" }, "invalid_availability"],
    [{ action: "set_published", isPublished: "yes" }, "invalid_publication"],
  ];

  for (const [payload, expected] of cases) {
    const { gateway, writes } = fakeGateway();
    const response = await handleCatalogPost(catalogRequest(payload), deps(gateway));
    assert.equal(response.status, 400, JSON.stringify(payload));
    assert.equal(await errorCode(response), expected, JSON.stringify(payload));
    assertPrivateHeaders(response);
    assert.equal(writes.length, 0, JSON.stringify(payload));
  }
});

test("a rejected request never reaches the write boundary", async () => {
  const { gateway, writes } = fakeGateway({ ownedItems: [] });
  const response = await handleCatalogPost(
    catalogRequest({ ...validProduct, action: "update_product", itemId }),
    deps(gateway),
  );
  assert.equal(response.status, 404);
  assert.equal(await errorCode(response), "not_found");
  assert.equal(writes.length, 0);
});

test("valid owner operations write exactly once with the session business", async () => {
  const { gateway, writes } = fakeGateway();
  const response = await handleCatalogPost(catalogRequest(validProduct), deps(gateway));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/json");
  assertPrivateHeaders(response);
  assert.deepEqual(writes, [{
    kind: "insert_item",
    businessId: ownerBusinessId,
    categoryId,
    name: "Muzzarella",
    description: null,
    priceMinor: 1250,
    currency: "ARS",
    isAvailable: true,
    sortOrder: 1,
  }]);
});

test("every owner operation maps to exactly one write kind", async () => {
  const cases: [Record<string, unknown>, string][] = [
    [{ action: "create_category", name: "Pizzas", sortOrder: 0 }, "insert_category"],
    [{ action: "rename_category", categoryId, name: "Empanadas" }, "update_category"],
    [{ action: "reorder_category", categoryId, sortOrder: 2 }, "update_category"],
    [validProduct, "insert_item"],
    [{ ...validProduct, action: "update_product", itemId }, "update_item"],
    [{ action: "set_published", isPublished: false }, "update_storefront"],
  ];

  for (const [payload, kind] of cases) {
    const { gateway, writes } = fakeGateway();
    const response = await handleCatalogPost(catalogRequest(payload), deps(gateway));
    assert.equal(response.status, 200, JSON.stringify(payload));
    assert.equal(writes.length, 1, JSON.stringify(payload));
    assert.equal(writes[0]?.kind, kind, JSON.stringify(payload));
    assert.equal(writes[0]?.businessId, ownerBusinessId);
  }
});

test("publishing an absent storefront fails closed without a partial write", async () => {
  const { gateway, writes } = fakeGateway({ failWrite: new CatalogWriteError("storefront_missing") });
  const response = await handleCatalogPost(catalogRequest({ action: "set_published", isPublished: true }), deps(gateway));
  assert.equal(response.status, 400);
  assert.equal(await errorCode(response), "storefront_missing");
  assertPrivateHeaders(response);
  assert.equal(writes.length, 0);
});

test("non-POST methods are rejected with private headers", async () => {
  const { gateway } = fakeGateway();
  const request = new NextRequest(`${trustedOrigin}/owner/catalog/actions`, {
    method: "GET",
    headers: { Host: trustedHost, Origin: trustedOrigin },
  });
  const response = await handleCatalogPost(request, deps(gateway));
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "POST");
  assertPrivateHeaders(response);
});

test("a missing trusted configuration fails closed", async () => {
  const { gateway, writes } = fakeGateway();
  const response = await handleCatalogPost(catalogRequest(validProduct), deps(gateway, null));
  assert.equal(response.status, 503);
  assert.equal(await errorCode(response), "unavailable");
  assert.equal(writes.length, 0);
});
