import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server.js";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { handleCatalogPost, type CatalogGateway, type CatalogWrite } from "../app/owner/catalog/catalog-actions.ts";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { describeGroupBehavior } from "../app/owner/catalog/catalog-preview.ts";
import type { Option, OptionGroup } from "../app/lib/catalog-selection.ts";

const trustedOrigin = "http://127.0.0.1:3000";
const trustedHost = "127.0.0.1:3000";
const ownerBusinessId = "11111111-1111-4111-8111-111111111111";
const itemId = "44444444-4444-4444-8444-444444444444";
const foreignId = "88888888-8888-4888-8888-888888888888";
const groupId = "55555555-5555-4555-8555-555555555555";
const optionId = "66666666-6666-4666-8666-666666666666";
const otherOptionId = "77777777-7777-4777-8777-777777777777";

type GatewayOptions = {
  businessId?: string | null;
  ownedItems?: string[];
  ownedGroups?: string[];
  ownedOptions?: string[];
};

function fakeGateway(options: GatewayOptions = {}) {
  const businessId = options.businessId === undefined ? ownerBusinessId : options.businessId;
  const items = new Set(options.ownedItems ?? [itemId]);
  const groups = new Set(options.ownedGroups ?? [groupId]);
  const optionsOwned = new Set(options.ownedOptions ?? [optionId]);
  const writes: CatalogWrite[] = [];
  const gateway: CatalogGateway = {
    ownerBusinessId: async () => businessId,
    categoryOwnedBy: async () => true,
    itemOwnedBy: async (_businessId, id) => items.has(id),
    groupOwnedBy: async (_businessId, id) => groups.has(id),
    optionOwnedBy: async (_businessId, id) => optionsOwned.has(id),
    write: async (write) => { writes.push(write); },
  };
  return { gateway, writes };
}

function deps(gateway: CatalogGateway | null, trusted: string | null = trustedOrigin) {
  return { trustedOrigin: trusted, createGateway: async () => gateway };
}

function catalogRequest(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`${trustedOrigin}/owner/catalog/actions`, {
    method: "POST",
    headers: { Host: trustedHost, Origin: trustedOrigin, "Content-Type": "application/json", ...headers },
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

const validGroup = {
  action: "create_option_group",
  itemId,
  name: "Sabor",
  selectionMode: "distinct",
  minSelect: 2,
  maxSelect: 2,
  sortOrder: 0,
};

const validOption = {
  action: "create_option",
  groupId,
  name: "Muzzarella",
  priceDeltaMinor: 0,
  isAvailable: true,
  sortOrder: 0,
};

test("option writes reject a forged Origin or Host and perform no write", async () => {
  for (const headers of [{ Origin: "https://evil.invalid" }, { Host: "evil.invalid" }] as Record<string, string>[]) {
    const { gateway, writes } = fakeGateway();
    const response = await handleCatalogPost(catalogRequest(validGroup, headers), deps(gateway));
    assert.equal(response.status, 400, JSON.stringify(headers));
    assert.equal(await errorCode(response), "request_rejected", JSON.stringify(headers));
    assertPrivateHeaders(response);
    assert.equal(writes.length, 0, JSON.stringify(headers));
  }
});

test("option writes require a fresh verified session and never write without one", async () => {
  const { gateway, writes } = fakeGateway({ businessId: null });
  const response = await handleCatalogPost(catalogRequest(validGroup), deps(gateway));
  assert.equal(response.status, 401);
  assert.equal(await errorCode(response), "unauthorized");
  assertPrivateHeaders(response);
  assert.equal(writes.length, 0);
});

test("invalid group, option and settings fields are rejected without writing", async () => {
  const cases: [Record<string, unknown>, string][] = [
    [{ ...validGroup, name: "   " }, "invalid_name"],
    [{ ...validGroup, selectionMode: "pick" }, "invalid_selection_mode"],
    [{ ...validGroup, minSelect: -1 }, "invalid_min_select"],
    [{ ...validGroup, minSelect: 1.5 }, "invalid_min_select"],
    [{ ...validGroup, minSelect: 3, maxSelect: 2 }, "invalid_max_select"],
    [{ ...validGroup, maxSelect: 1.5 }, "invalid_max_select"],
    [{ ...validGroup, sortOrder: -1 }, "invalid_sort_order"],
    [{ ...validOption, name: "  " }, "invalid_name"],
    [{ ...validOption, priceDeltaMinor: -1 }, "invalid_price_delta"],
    [{ ...validOption, priceDeltaMinor: 12.5 }, "invalid_price_delta"],
    [{ ...validOption, isAvailable: "yes" }, "invalid_availability"],
    [{ ...validOption, sortOrder: -1 }, "invalid_sort_order"],
    [{ action: "set_two_flavor_surcharge", twoFlavorSurchargeMinor: -1 }, "invalid_surcharge"],
    [{ action: "set_two_flavor_surcharge", twoFlavorSurchargeMinor: 1.5 }, "invalid_surcharge"],
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

test("an unknown or foreign item, group or option is rejected without writing", async () => {
  const cases: [Record<string, unknown>, GatewayOptions][] = [
    [{ ...validGroup, itemId: foreignId }, { ownedItems: [] }],
    [{ ...validGroup, action: "update_option_group", groupId: foreignId }, { ownedGroups: [] }],
    [{ ...validOption, groupId: foreignId }, { ownedGroups: [] }],
    [{ ...validOption, action: "update_option", optionId: foreignId }, { ownedOptions: [] }],
  ];

  for (const [payload, options] of cases) {
    const { gateway, writes } = fakeGateway(options);
    const response = await handleCatalogPost(catalogRequest(payload), deps(gateway));
    assert.equal(response.status, 404, JSON.stringify(payload));
    assert.equal(await errorCode(response), "not_found", JSON.stringify(payload));
    assert.equal(writes.length, 0, JSON.stringify(payload));
  }
});

test("each accepted option operation performs exactly one write", async () => {
  const cases: [Record<string, unknown>, string][] = [
    [validGroup, "insert_option_group"],
    [{ ...validGroup, action: "update_option_group", groupId }, "update_option_group"],
    [validOption, "insert_option"],
    [{ ...validOption, action: "update_option", optionId }, "update_option"],
    [{ action: "set_two_flavor_surcharge", twoFlavorSurchargeMinor: 500 }, "upsert_settings"],
  ];

  for (const [payload, kind] of cases) {
    const { gateway, writes } = fakeGateway();
    const response = await handleCatalogPost(catalogRequest(payload), deps(gateway));
    assert.equal(response.status, 200, JSON.stringify(payload));
    assert.equal((await response.json() as { ok: boolean }).ok, true, JSON.stringify(payload));
    assertPrivateHeaders(response);
    assert.equal(writes.length, 1, JSON.stringify(payload));
    assert.equal(writes[0]?.kind, kind, JSON.stringify(payload));
    assert.equal(writes[0]?.businessId, ownerBusinessId, JSON.stringify(payload));
  }
});

test("the owner preview describes group behavior through the pure selection rules", () => {
  const group: OptionGroup = {
    id: groupId, item_id: itemId, name: "Sabor", selection_mode: "distinct", min_select: 2, max_select: 2, sort_order: 0,
  };
  const available: Option[] = [
    { id: optionId, group_id: groupId, name: "Muzzarella", price_delta_minor: 0, is_available: true, sort_order: 0 },
    { id: otherOptionId, group_id: groupId, name: "Napolitana", price_delta_minor: 300, is_available: true, sort_order: 1 },
  ];

  const behavior = describeGroupBehavior({ id: itemId, price_minor: 1000 }, group, available, 500);
  assert.equal(behavior.ok, true);
  assert.equal(behavior.description, "Mitad Muzzarella / mitad Napolitana");
  assert.equal(behavior.unitPriceMinor, 1800);

  const soldOut = describeGroupBehavior(
    { id: itemId, price_minor: 1000 },
    group,
    available.map((option) => ({ ...option, is_available: false })),
    500,
  );
  assert.equal(soldOut.ok, false);
  assert.equal(soldOut.unitPriceMinor, null);
});
