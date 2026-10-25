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
});
