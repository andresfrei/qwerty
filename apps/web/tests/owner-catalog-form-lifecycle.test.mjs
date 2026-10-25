import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "./owner-first-store-fixtures.mjs";

const root = "apps/web/app/owner/catalog/";
const businessId = "11111111-1111-4111-8111-111111111111";
const recordId = "22222222-2222-4222-8222-222222222222";
const otherId = "33333333-3333-4333-8333-333333333333";
const identity = (extra = {}) => ({ accountId: "owner-a", businessId,
  action: "rename_category", target: { kind: "record", id: recordId }, generation: 1, ...extra });
const fields = () => new Map(Object.entries({ action: "rename_category", categoryId: recordId, name: "Conservar" }));
const api = () => load(root + "catalog-form-lifecycle.ts");
function setup() {
  const calls = [];
  const gate = api().createCatalogFormGate((payload, scope) => new Promise(resolve => calls.push({ payload, scope, resolve })));
  return { gate, calls };
}

test("one synchronous public gate blocks same-tick controls and saved resubmission", async () => {
  const { gate, calls } = setup();
  const binding = gate.bind(identity());
  const first = gate.submit(binding, fields());
  await gate.submit(binding, fields());
  const sibling = gate.bind(identity({ action: "reorder_category" }));
  await gate.submit(sibling, new Map(Object.entries({ action: "reorder_category", categoryId: recordId, sortOrder: "2" })));
  assert.equal(calls.length, 1);
  assert.equal(gate.getSnapshot().state, "pending");
  assert.equal(calls[0].scope, businessId);
  calls[0].resolve({ kind: "saved", data: { ok: true } });
  await first;
  assert.equal(gate.getSnapshot().state, "saved");
  await gate.submit(binding, fields());
  assert.equal(calls.length, 1);
});

test("explicit rejection preserves form data and restores editability without automatic POST", async () => {
  const { gate, calls } = setup();
  const binding = gate.bind(identity()), data = fields(), before = [...data];
  const first = gate.submit(binding, data);
  calls[0].resolve({ kind: "rejected", message: "Revisá el nombre" });
  await first;
  assert.deepEqual([...data], before);
  assert.equal(gate.getSnapshot().state, "idle");
  assert.equal(gate.getSnapshot().message, "Revisá el nombre");
  assert.equal(calls.length, 1);
  const second = gate.submit(binding, data);
  calls[1].resolve({ kind: "saved", data: { ok: true } });
  await second;
  assert.equal(calls.length, 2);
});

test("unknown and thrown transport freeze every new binding without retries or redirects", async () => {
  for (const throws of [false, true]) {
    let calls = 0;
    const gate = api().createCatalogFormGate(async () => { calls++; if (throws) throw Error("lost"); return { kind: "unknown" }; });
    await gate.submit(gate.bind(identity()), fields());
    const next = gate.bind(identity({ generation: 2 }));
    await gate.submit(next, fields());
    assert.equal(gate.getSnapshot().state, "unknown");
    assert.equal(calls, 1);
  }
});

test("account/business/action/record/creation-parent/generation changes invalidate stale callbacks and remount keys", async () => {
  const changes = [{ accountId: "owner-b" }, { businessId: otherId }, { action: "reorder_category" },
    { target: { kind: "record", id: otherId } }, { target: { kind: "parent", id: otherId } }, { generation: 2 }];
  for (const change of changes) {
    for (const result of [{ kind: "rejected", message: "stale A" }, { kind: "saved", data: { ok: true } }, { kind: "unknown" }]) {
    const { gate, calls } = setup();
    const a = gate.bind(identity()), pending = gate.submit(a, fields());
    gate.retire(a);
    const b = gate.bind(identity(change));
    assert.notEqual(a.key, b.key);
    const before = gate.getSnapshot();
    calls[0].resolve(result);
    await pending;
    assert.equal(gate.getSnapshot(), before);
    assert.equal(before.state, "unknown");
    await gate.submit(a, fields());
    await gate.submit(b, fields());
    assert.equal(calls.length, 1);
    }
  }
});

test("invalid models and identity/payload target mismatch never acquire or send", async () => {
  const { gate, calls } = setup();
  const binding = gate.bind(identity());
  for (const data of [new Map(), new Map([...fields(), ["categoryId", otherId]]), new Map([...fields(), ["action", "create_category"]])]) {
    await gate.submit(binding, data);
    assert.equal(gate.getSnapshot().state, "idle");
  }
  assert.equal(calls.length, 0);
});

test("inspection accepts only same-business local Catalog GET destinations", () => {
  const { catalogInspectionHref } = api();
  for (const path of ["items", `items/${recordId}`, "categories", "groups", "options", "settings"]) {
    const href = `/owner/catalog/${path}?businessId=${businessId}`;
    assert.equal(catalogInspectionHref(href, businessId), href);
  }
  for (const href of ["https://external.invalid/owner/catalog/items", "//external.invalid", "/owner/catalog/items/new",
    `/owner/catalog/items?businessId=${otherId}`, "/owner/catalog/items", `/owner/catalog/items?businessId=${businessId}&returnURL=x`,
    `/owner/catalog/../catalog/items?businessId=${businessId}`, `/owner/catalog/items?businessId=${businessId}#new`,
    `/owner/catalog/items?businessId=${businessId}&businessId=${businessId}`, `/owner/catalog/actions?businessId=${businessId}`]) {
    assert.equal(catalogInspectionHref(href, businessId), null, href);
  }
});

test("public navigation guard retains unresolved state; only explicit validated inspection bypasses it", async () => {
  const { gate, calls } = setup();
  assert.equal(gate.canNavigate(), true);
  const pending = gate.submit(gate.bind(identity()), fields());
  assert.equal(gate.canNavigate(), false);
  const href = `/owner/catalog/items?businessId=${businessId}`;
  assert.equal(gate.canNavigate({ inspectionHref: href, businessId }), true);
  assert.equal(gate.canNavigate({ inspectionHref: href, businessId: otherId }), false);
  assert.equal(gate.canNavigate({ inspectionHref: "/owner/catalog/items/new", businessId }), false);
  assert.equal(gate.getSnapshot().state, "pending");
  calls[0].resolve({ kind: "unknown" }); await pending;
  assert.equal(gate.canNavigate(), false);
  assert.equal(gate.getSnapshot().state, "unknown");
});

test("real classic form markup preserves fields, pending indicator and identity remount key without nested forms", () => {
  const { CatalogClassicForm } = load(root + "catalog-form-view.tsx");
  const props = { identityKey: "scope-1", title: "Nombre", action: "rename_category", state: "pending", pending: true,
    pendingLabel: "Guardando categoría…", onSubmit() {}, children: React.createElement("input", { name: "name", defaultValue: "Conservar" }) };
  const element = CatalogClassicForm(props);
  assert.equal(element.key, "scope-1");
  assert.notEqual(element.key, CatalogClassicForm({ ...props, identityKey: "scope-2" }).key);
  const html = renderToStaticMarkup(React.createElement(CatalogClassicForm, props));
  assert.equal((html.match(/<form /g) ?? []).length, 1);
  assert.match(html, /<fieldset disabled/);
  assert.match(html, /name="action" value="rename_category"/);
  assert.match(html, /name="name" value="Conservar"/);
  assert.match(html, /Guardando categoría…/);
  assert.match(html, /role="status"/);
});
