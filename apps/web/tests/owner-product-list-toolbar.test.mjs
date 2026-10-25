import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load, id } from "./owner-first-store-fixtures.mjs";
const Filters = load("apps/web/app/owner/catalog/catalog-product-filters.tsx").CatalogProductFilters;
const base = { scopeKey: "synthetic-owner:list", businessId: id, query: { businessId: id, storePage: 2, page: 8, q: " Pizza " }, category: null };
const render = extra => renderToStaticMarkup(React.createElement(Filters, { ...base, ...extra }));

test("compact toolbar keeps search/filter left and creation last, with closed accessible filter dialog", () => {
  const html = render();
  assert.match(html, /<dialog\b/); assert.match(html, /Filtros de productos/);
  assert.doesNotMatch(html.match(/<dialog\b[^>]*>/)?.[0] ?? "", /\bopen=/);
  assert.ok(html.indexOf("Buscar productos") < html.indexOf(">Filtros<"));
  assert.ok(html.indexOf(">Filtros<") < html.indexOf("Nuevo producto"));
  const form = html.match(/<form\b[^>]*>/)?.[0] ?? "";
  assert.match(form, /method="get"/); assert.match(form, /action="\/owner\/catalog\/items"/);
  assert.doesNotMatch(html, /name="page"|name="categoryId"/);
});
test("real-hook SSR modal uses scoped canonical read URLs, applied category and no mutation form", () => {
  const category = { id: "22222222-2222-4222-8222-222222222222", name: "Carta" };
  const html = render({ category, query: { ...base.query, categoryId: category.id } });
  assert.match(html, /Filtros \(1\)/);
  const dialog = html.match(/<dialog\b[\s\S]*?<\/dialog>/)?.[0] ?? "";
  assert.ok(dialog); assert.doesNotMatch(dialog, /<form\b/);
  for (const label of ["Limpiar", "Cancelar", "Aplicar filtros"]) assert.ok(dialog.includes(label));
  const href = dialog.match(/href="([^"]+)"/)?.[1]?.replaceAll("&amp;", "&"); assert.ok(href);
  const url = new URL(href, "https://qwerty.invalid");
  assert.equal(url.pathname, "/owner/catalog/items"); assert.equal(url.searchParams.get("businessId"), id);
  assert.equal(url.searchParams.get("storePage"), "2"); assert.equal(url.searchParams.get("page"), null);
  assert.equal(url.searchParams.get("q"), "Pizza"); assert.equal(url.searchParams.get("categoryId"), category.id);
  assert.match(html, /name="categoryId"/);
});
