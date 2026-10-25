import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "./owner-first-store-fixtures.mjs";
const root = "apps/web/app/components/";
const component = (file, name) => existsSync(root + file) ? load(root + file)[name] : () => React.createElement("p", null, "Missing list component");

test("list composition keeps title, compact toolbar, results and footer in reading order", () => {
  const Layout = component("resource-list-layout.tsx", "ResourceListLayout");
  const html = renderToStaticMarkup(React.createElement(Layout, { titleId: "products-title", title: "Productos", context: "Catálogo",
    toolbar: React.createElement("p", null, "Toolbar"), footer: React.createElement("nav", null, "Paginación") }, React.createElement("table", null, React.createElement("tbody"))));
  assert.match(html, /aria-labelledby="products-title"/); assert.match(html, /<h1[^>]*>Productos<\/h1>/);
  assert.ok(html.indexOf("Toolbar") < html.indexOf("<table")); assert.ok(html.indexOf("<table") < html.indexOf("Paginación"));
  assert.doesNotMatch(html, /max-w-3xl/);
});
test("real headless table retains supplied server order and all25page rows without client sorting", () => {
  const Table = component("resource-table.tsx", "ResourceTable");
  const rows = Array.from({ length: 25 }, (_, index) => ({ id: `row-${index}`, name: `Producto ${25-index}` }));
  const props = { data: rows, columns: [{ accessorKey: "name", header: "Producto" }], rowCount: 76, pageIndex: 2, caption: "Productos de prueba", emptyLabel: "Sin resultados" };
  const html = renderToStaticMarkup(React.createElement(Table, props));
  assert.match(html, /<table/); assert.match(html, /<caption[^>]*>Productos de prueba<\/caption>/);
  assert.equal((html.match(/<tbody>[\s\S]*?<\/tbody>/)?.[0].match(/<tr\b/g) ?? []).length, 25);
  assert.ok(html.indexOf(">Producto 25<") < html.indexOf(">Producto 1<")); assert.doesNotMatch(html, /aria-sort|<button/);
  assert.match(renderToStaticMarkup(React.createElement(Table, { ...props, data: [] })), /Sin resultados/);
  assert.equal(renderToStaticMarkup(React.createElement(Table, props)), html);
});
