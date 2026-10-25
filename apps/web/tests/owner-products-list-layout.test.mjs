import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load, id } from "./owner-first-store-fixtures.mjs";
import { products, itemId } from "./owner-resource-products-fixtures.mjs";

test("actual Products list uses one real table/toolbar and a list-only wider shell", async () => {
  const f = products();
  const html = f.markup(await f.page("list")({ searchParams: Promise.resolve(f.search) }));
  assert.match(html, /<table\b/); assert.match(html, /Precio base de referencia/);
  assert.doesNotMatch(html, /Perfil:/); assert.equal(f.editors.length, 0); assert.equal(f.frames.length, 0);
  assert.equal((html.match(/href="[^\"]*\/items\/new\?/g) ?? []).length, 1);
  assert.equal(f.shells.length, 1); assert.equal(f.shells[0].contentWidth, "wide");
  assert.match(html, new RegExp(`/items/${itemId}\\?`));
  assert.match(html, /storePage=2/); assert.match(html, /q=Pizza/);
});
test("actual detail and New retain reading width and existing editing frames", async () => {
  const f = products();
  f.markup(await f.page("detail")({ params: Promise.resolve({ itemId }), searchParams: Promise.resolve(f.search) }));
  f.markup(await f.page("new")({ searchParams: Promise.resolve(f.search) }));
  assert.deepEqual(f.shells.map(shell => shell.contentWidth), ["reading", "reading"]);
  assert.ok(f.frames.length >= 2);
});
test("shared shell defaults remain bounded; only an explicit width prop removes the cap", () => {
  const Shell = load("apps/web/app/owner/owner-shell.tsx").OwnerShell;
  const props = { ownedBusinesses: [], selectedBusiness: null, activeModule: "home", account: { id }, pagination: { page: 0, hasMore: false } };
  const render = extra => renderToStaticMarkup(React.createElement(Shell, { ...props, ...extra }, React.createElement("p", null, "Contenido")));
  assert.match(render(), /mx-auto max-w-4xl/);
  assert.match(render({ contentWidth: "wide" }), /mx-auto max-w-none/);
  assert.equal(render({ contentWidth: "reading" }), render());
  assert.doesNotMatch(render().match(/<main[^>]*>/)?.[0] ?? "", /lg:flex/);
});

test("wide Products layout supplies a full-height flex chain with a growing result body", () => {
  const Shell = load("apps/web/app/owner/owner-shell.tsx").OwnerShell;
  const Layout = load("apps/web/app/components/resource-list-layout.tsx").ResourceListLayout;
  const content = React.createElement(Layout, { titleId: "products-title", title: "Productos", toolbar: "Filtros", footer: "Paginación" }, React.createElement("table", null, React.createElement("tbody")));
  const html = renderToStaticMarkup(React.createElement(Shell, { ownedBusinesses: [], selectedBusiness: null, activeModule: "catalog", account: { id }, pagination: { page: 0, hasMore: false }, contentWidth: "wide" }, content));
  const main = html.match(/<main class="([^"]+)"><div class="([^"]+)">/);
  assert.match(main?.[1] ?? "", /lg:flex lg:flex-col/);
  assert.match(main?.[2] ?? "", /lg:flex lg:flex-1 lg:flex-col/);
  assert.match(main?.[2] ?? "", /lg:w-full/);
  assert.match(html, /<section[^>]*class="flex min-w-0 flex-1 flex-col gap-6"/);
  assert.match(html, /class="flex min-w-0 flex-1 flex-col rounded-2xl/);
  assert.match(html, /<div class="min-w-0 flex-1"><table/);
  assert.ok(html.indexOf("<table") < html.indexOf("Paginación"));
  assert.doesNotMatch(html, /overflow-hidden|(?<!min-)h-(?:screen|dvh)|calc\(/);
});
