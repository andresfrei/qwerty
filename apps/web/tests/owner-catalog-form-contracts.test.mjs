import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./owner-first-store-fixtures.mjs";
const root = "apps/web/app/owner/catalog/";
const businessId = "11111111-1111-4111-8111-111111111111";
const id = "22222222-2222-4222-8222-222222222222";

// Triangulate the new public callback against the unchanged eleven-action model/transport.
test("all eleven classic contracts pass through the gate with existing conversion and POST options", async () => {
  const { createCatalogFormGate } = load(root + "catalog-form-lifecycle.ts");
  const { sendOwnerMutation, catalogFormPayload } = load(root + "catalog-editor.ts");
  const product = { categoryId: id, name: "Pizza", description: "", priceMinor: "12,50", currency: "ARS", isAvailable: "false", sortOrder: "0" };
  const group = { name: "Gustos", selectionMode: "quantity", minSelect: "12", maxSelect: "12", sortOrder: "0" };
  const option = { name: "Opción", priceDeltaMinor: "0.29", isAvailable: "true", sortOrder: "0" };
  const cases = [
    ["create_category", "parent", businessId, { name: "Categoría", sortOrder: "0" }],
    ["rename_category", "record", id, { categoryId: id, name: "Conservar" }],
    ["reorder_category", "record", id, { categoryId: id, sortOrder: "2" }],
    ["create_product", "parent", id, product], ["update_product", "record", id, { ...product, itemId: id }],
    ["create_option_group", "parent", id, { ...group, itemId: id }],
    ["update_option_group", "record", id, { ...group, groupId: id }],
    ["create_option", "parent", id, { ...option, groupId: id }],
    ["update_option", "record", id, { ...option, optionId: id }],
    ["set_published", "singleton", businessId, { isPublished: "true" }],
    ["set_two_flavor_surcharge", "singleton", businessId, { twoFlavorSurchargeMinor: "1,23" }],
  ];
  for (const [action, kind, targetId, values] of cases) {
    const data = new Map(Object.entries({ action, ...values })), before = [...data];
    let calls = 0;
    const gate = createCatalogFormGate((payload, scope) => sendOwnerMutation("/owner/catalog/actions", payload, async (url, init) => {
      calls++;
      assert.equal(url, `/owner/catalog/actions?businessId=${businessId}`);
      assert.equal(init.method, "POST");
      assert.equal(init.credentials, "same-origin");
      assert.equal(init.cache, "no-store");
      assert.equal(init.redirect, "error");
      assert.equal(init.headers["content-type"], "application/json");
      assert.deepEqual(JSON.parse(init.body), catalogFormPayload(data));
      return Response.json({ error: "invalid_request" }, { status: 400 });
    }, scope));
    const binding = gate.bind({ accountId: "owner-a", businessId, action, target: { kind, id: targetId }, generation: 1 });
    await gate.submit(binding, data);
    assert.equal(calls, 1, action);
    assert.deepEqual([...data], before, action);
    assert.equal(gate.getSnapshot().state, "idle", action);
  }
});

test("retired idle callbacks cannot interfere with a newer pending operation; subscriptions expose synchronous state", async () => {
  const { createCatalogFormGate } = load(root + "catalog-form-lifecycle.ts");
  let settle, calls = 0;
  const gate = createCatalogFormGate(() => { calls++; return new Promise(resolve => { settle = resolve; }); });
  const identity = { accountId: "owner", businessId, action: "create_option", target: { kind: "parent", id }, generation: 1 };
  const a = gate.bind(identity);
  gate.retire(a);
  const b = gate.bind({ ...identity, generation: 2 });
  const observed = [];
  const unsubscribe = gate.subscribe(() => observed.push(gate.getSnapshot().state));
  const data = new Map(Object.entries({ action: "create_option", groupId: id, name: "Conservar", priceDeltaMinor: "0", isAvailable: "true", sortOrder: "0" }));
  const pending = gate.submit(b, data);
  assert.deepEqual(observed, ["pending"]);
  await gate.submit(a, data);
  assert.equal(gate.getSnapshot().pendingKey, b.key);
  assert.equal(calls, 1);
  settle({ kind: "saved", data: { ok: true } }); await pending;
  assert.deepEqual(observed, ["pending", "saved"]);
  unsubscribe();
  assert.equal(gate.canNavigate(), false);
});
