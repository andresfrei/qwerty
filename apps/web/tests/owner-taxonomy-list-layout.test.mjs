import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { id, load } from "./owner-first-store-fixtures.mjs";
import { taxonomy } from "./owner-resource-taxonomy-fixtures.mjs";
const search = { businessId: id, storePage: "2" };

test("actual Categories list uses the shared table/height layout with one right-side New action", async () => {
  const f = taxonomy();
  const html = await f.render("list", search);
  assert.match(html, /<table\b/); assert.match(html, /<caption[^>]*>Categorías/);
  assert.equal((html.match(/href="[^\"]*\/categories\/new\?/g) ?? []).length, 1);
  assert.match(html, /Buscar categorías/); assert.doesNotMatch(html, /Filtros de categorías|data-native-auth-form/);
  assert.ok(html.indexOf("Buscar categorías") < html.indexOf("Nueva categoría"));
  assert.match(html, /class="flex min-w-0 flex-1 flex-col gap-6"/);
  assert.doesNotMatch(html, /productos por categoría|method="post"/);
  assert.equal(f.frames.length, 0); assert.equal(f.forms.length, 0);
  const tree = await f.page("list")({ searchParams: Promise.resolve(search) });
  assert.equal(tree.props.contentWidth, "wide");
});

test("actual Options directory uses a scoped table and retains its filter frame", async () => {
  const f = taxonomy(); const html = await f.render("options-list", search);
  assert.match(html, /<table\b/); assert.match(html, /<caption[^>]*>Opciones/);
  assert.match(html, /Producto/); assert.match(html, /Grupo/); assert.match(html, /Adicional/);
  assert.equal((html.match(/href="[^\"]*\/options\/new\?/g) ?? []).length, 1);
  assert.equal(f.frames.length, 1); assert.equal(f.forms.length, 0);
  assert.ok(html.indexOf("Buscar opciones") < html.indexOf("Nueva opción"));
  const tree = await f.page("options-list")({ searchParams: Promise.resolve(search) });
  assert.equal(tree.props.contentWidth, "wide");
});
test("locked Options arrivals keep read-only filter selection before widgets mount", async () => {
  const f = taxonomy({ readOnly: true }); const html = await f.render("options-list", search);
  assert.match(html, /Filtros en modo solo lectura/); assert.equal(f.frames.length, 1);
  assert.doesNotMatch(html, /<input|<form|<select|<button|<dialog/); assert.equal(f.forms.length, 0);
});
test("real RHF option modal seeds checked labels without inventing item metadata and resets read page", () => {
  const Controls = load("apps/web/app/owner/catalog/catalog-option-list-controls.tsx").CatalogOptionListControls;
  const itemId = "22222222-2222-4222-8222-222222222222", groupId = "44444444-4444-4444-8444-444444444444";
  const props = { scopeKey: "owner:read", businessId: id, query: { businessId: id, storePage: 2, page: 8, q: " Pizza ", itemId, groupId },
    item: { id: itemId, business_id: id, name: "Pizza" }, group: { id: groupId, business_id: id, item_id: itemId, name: "Tamaño", selection_mode: "distinct", min_select: 0, max_select: 1, sort_order: 0 } };
  const html = renderToStaticMarkup(React.createElement(Controls, props));
  assert.match(html, /Filtros \(2\)/); assert.match(html, /Producto seleccionado:.*Pizza/); assert.match(html, /Grupo:.*Tamaño/);
  const dialog = html.match(/<dialog\b[\s\S]*?<\/dialog>/)?.[0] ?? "";
  assert.match(dialog, /Limpiar/); assert.match(dialog, /Cancelar/); assert.match(dialog, /Aplicar filtros/);
  assert.doesNotMatch(dialog.match(/<dialog[^>]*>/)?.[0] ?? "", /\bopen\b/);
  assert.doesNotMatch(html, /<form|name="q"|name="itemId"|name="groupId"/);
  const href = new URL(dialog.match(/href="([^"]+)"/)?.[1].replaceAll("&amp;", "&"), "https://qwerty.invalid");
  assert.equal(href.searchParams.get("businessId"), id); assert.equal(href.searchParams.get("storePage"), "2");
  assert.equal(href.searchParams.get("itemId"), itemId); assert.equal(href.searchParams.get("groupId"), groupId);
  assert.equal(href.searchParams.get("page"), null); assert.equal(href.searchParams.get("q"), "Pizza");
});
