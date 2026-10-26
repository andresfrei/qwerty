import assert from "node:assert/strict";
import test from "node:test";
import { id } from "./owner-first-store-fixtures.mjs";
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
