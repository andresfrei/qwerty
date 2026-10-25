import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "./owner-first-store-fixtures.mjs";

const root = "apps/web/app/owner/";
const businessId = "11111111-1111-4111-8111-111111111111";
const otherBusinessId = "22222222-2222-4222-8222-222222222222";
const recordId = "33333333-3333-4333-8333-333333333333";
const groupId = "44444444-4444-4444-8444-444444444444";
const api = () => load(root + "catalog/catalog-navigation.ts");

test("catalog sections have fixed local list/new/detail destinations", () => {
  const { catalogHref } = api();
  for (const resource of ["items", "categories", "options", "settings"]) {
    assert.equal(catalogHref(resource, { businessId }), `/owner/catalog/${resource}?businessId=${businessId}`);
  }
  assert.equal(catalogHref("items", { businessId }, { mode: "new" }), `/owner/catalog/items/new?businessId=${businessId}`);
  assert.equal(catalogHref("items", { businessId }, { mode: "detail", id: recordId }), `/owner/catalog/items/${recordId}?businessId=${businessId}`);
  assert.throws(() => catalogHref("https://foreign.invalid", { businessId }));
  assert.throws(() => catalogHref("items", { businessId }, { mode: "detail", id: "../orders" }));
  assert.throws(() => catalogHref("settings", { businessId }, { mode: "new" }));
});

test("catalog queries preserve list context but pass only owner selection to existing data loading", () => {
  const { parseCatalogPageQuery, catalogHref } = api();
  const source = Object.freeze({ businessId: businessId.toUpperCase(), storePage: "2", page: "3", q: " Pizza & salsa ", categoryId: recordId });
  const result = parseCatalogPageQuery(source, { resource: "items" });
  assert.equal(result.ok, true);
  assert.deepEqual(result.ownerSearch, { businessId, storePage: "2" });
  assert.deepEqual(result.query, { businessId, storePage: 2, page: 3, q: "Pizza & salsa", categoryId: recordId });
  const href = catalogHref("items", result.query, { mode: "detail", id: groupId });
  const url = new URL(href, "https://qwerty.invalid");
  assert.equal(url.pathname, `/owner/catalog/items/${groupId}`);
  assert.equal(url.searchParams.get("q"), "Pizza & salsa");
  assert.equal(url.searchParams.get("page"), "3");
  assert.equal(url.searchParams.get("categoryId"), recordId);
  assert.equal(source.q, " Pizza & salsa ");
});

test("invalid catalog query input is rejected without mutation or unknown-key fallback", () => {
  const { parseCatalogPageQuery } = api();
  const bad = [
    { businessId: [businessId] }, { page: ["1"] }, { page: "01" },
    { page: "-1" }, { page: "1000001" }, { storePage: "1.5" },
    { businessId: "foreign" }, { categoryId: "bad" }, { q: "x".repeat(101) },
    { q: "line\nbreak" }, { redirect: "https://foreign.invalid" }, { itemId: recordId },
  ];
  for (const input of bad) {
    const before = structuredClone(input);
    assert.equal(parseCatalogPageQuery(input, { resource: "items" }).ok, false, JSON.stringify(input));
    assert.deepEqual(input, before);
  }
  const duplicate = new URLSearchParams(`businessId=${businessId}&businessId=${businessId}`);
  assert.equal(parseCatalogPageQuery(duplicate, { resource: "items" }).ok, false);
  assert.equal(duplicate.getAll("businessId").length, 2);
});

test("record modes validate IDs and retain contextual option ancestry without inventing authority", () => {
  const { parseCatalogPageQuery } = api();
  const selected = parseCatalogPageQuery({ businessId, itemId: recordId, groupId }, { resource: "options", mode: "detail", id: otherBusinessId });
  assert.equal(selected.ok, true);
  assert.equal(selected.id, otherBusinessId);
  assert.equal(selected.query.itemId, recordId);
  assert.equal(selected.query.groupId, groupId);
  assert.equal(parseCatalogPageQuery({}, { resource: "items", mode: "detail" }).ok, false);
  assert.equal(parseCatalogPageQuery({}, { resource: "items", mode: "detail", id: [recordId] }).ok, false);
  assert.equal(parseCatalogPageQuery({}, { resource: "items", id: recordId }).ok, false);
  assert.equal(parseCatalogPageQuery({ page: "1" }, { resource: "settings" }).ok, false);
  assert.equal(parseCatalogPageQuery({ groupId }, { resource: "categories" }).ok, false);
  assert.equal(parseCatalogPageQuery({}, { resource: "groups", mode: "new" }).ok, true);
});

test("switching stores returns to the section list without foreign record/filter context", () => {
  const { catalogStoreHref } = api();
  assert.equal(catalogStoreHref("options", otherBusinessId), `/owner/catalog/options?businessId=${otherBusinessId}`);
  assert.equal(catalogStoreHref("groups", otherBusinessId), `/owner/catalog/items?businessId=${otherBusinessId}`);
  assert.throws(() => catalogStoreHref("items", "bad"));
});

test("actual navigation markup exposes sections and a contextual breadcrumb back link", () => {
  const { CatalogSectionNav, CatalogBreadcrumbs } = load(root + "catalog/catalog-navigation-view.tsx");
  const query = { businessId, storePage: 0, page: 2, q: "Pizza", categoryId: recordId };
  const html = renderToStaticMarkup(React.createElement(CatalogSectionNav, { section: "items", businessId }));
  assert.match(html, /aria-label="Secciones de catálogo"/);
  for (const label of ["Productos", "Categorías", "Variedades y opciones", "Ajustes"]) assert.ok(html.includes(label));
  assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1);
  assert.ok(!/Caja|Cocina|Repartos/.test(html));
  const breadcrumb = renderToStaticMarkup(React.createElement(CatalogBreadcrumbs, { section: "items", query, title: "Pizza <especial>" }));
  assert.match(breadcrumb, /aria-label="Ruta de navegación"/);
  assert.ok(breadcrumb.includes("page=2"));
  assert.ok(breadcrumb.includes(`categoryId=${recordId}`));
  assert.ok(breadcrumb.includes("Pizza &lt;especial&gt;"));
});

test("legacy owner links and API query restrictions remain unchanged", () => {
  const { ownerHref, parseBusinessSelection } = load(root + "owner-context.ts");
  assert.equal(ownerHref("catalog", businessId), `/owner/catalog?businessId=${businessId}`);
  assert.equal(ownerHref("orders", businessId), `/owner/orders?businessId=${businessId}`);
  assert.deepEqual(parseBusinessSelection(new URLSearchParams(`businessId=${businessId}`)), { ok: true, businessId });
  for (const extra of ["page=1", "q=Pizza", `itemId=${recordId}`]) {
    assert.equal(parseBusinessSelection(new URLSearchParams(`businessId=${businessId}&${extra}`)).ok, false);
  }
});
