import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../app/store/[slug]/checkout/checkout-client.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function load(hooks, storage) {
  const module = { exports: {} };
  const resolve = (name) => name === "react" ? hooks : name.startsWith("@/app/lib/") ? require(`../app/lib/${name.slice("@/app/lib/".length)}.ts`) : require(name);
  new Function("require", "module", "exports", "localStorage", compiled)(resolve, module, module.exports, storage);
  return module.exports.default;
}
const item = { id: "simple", business_id: "shop", category_id: "food", name: "Agua", description: null, price_minor: 1000, currency: "ARS", is_available: true, sort_order: 0 };
const catalog = { status: "ok", storefront: { business_id: "shop", slug: "tienda", display_name: "Tienda", is_published: true }, categories: [{ category: { id: "food", business_id: "shop", name: "Carta", sort_order: 0 }, items: [item] }], groups: [], options: [], surchargeMinor: 0 };
function nodes(tree) {
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...React.Children.toArray(tree.props?.children).flatMap(nodes)];
}

// Deterministic hook/event harness executes the real component callbacks. This
// is not a DOM/browser runner and makes no layout or native-input assertions.
function harness() {
  const slots = [];
  const effects = [];
  let cursor = 0;
  const depsChanged = (a, b) => !a || a.length !== b.length || a.some((value, i) => value !== b[i]);
  const hooks = {
    useState(initial) { const id = cursor++; if (!(id in slots)) slots[id] = typeof initial === "function" ? initial() : initial; return [slots[id], (next) => { slots[id] = typeof next === "function" ? next(slots[id]) : next; }]; },
    useRef(initial) { const id = cursor++; return slots[id] ??= { current: initial }; },
    useMemo(fn, deps) { const id = cursor++; if (!slots[id] || depsChanged(slots[id].deps, deps)) slots[id] = { value: fn(), deps }; return slots[id].value; },
    useEffect(fn, deps) { const id = cursor++; if (depsChanged(slots[id], deps)) { slots[id] = deps; effects.push(fn); } },
  };
  let persisted = JSON.stringify({ version: 2, businessId: "shop", items: [{ id: item.id, key: item.id, name: item.name, unitPriceMinor: item.price_minor, currency: "ARS", quantity: 2, selection: [], selectionText: "" }] });
  const writes = [];
  const storage = { getItem: () => persisted, setItem: (key, value) => { persisted = value; writes.push([key, value]); } };
  const Component = load(hooks, storage);
  const render = () => { cursor = 0; const tree = Component({ catalog }); while (effects.length) effects.shift()(); return tree; };
  return { render, writes, saved: () => JSON.parse(persisted) };
}

test("real SSR renders contact labels and no Auth/network/localStorage side effects", () => {
  const Component = load(React, { getItem() { throw Error("SSR storage access"); } });
  const markup = renderToStaticMarkup(React.createElement(Component, { catalog }));
  for (const text of ["Nombre", "Correo", "Teléfono de contacto", "Todavía no se envió ningún pedido", "registro es opcional"]) assert.ok(markup.includes(text));
  assert.match(markup, /<button(?=[^>]*type="submit")(?=[^>]*disabled="")[^>]*>/);
});

test("actual UI event path guards concurrent submits, retains data on failure and never clears on readiness", async () => {
  const oldFetch = globalThis.fetch;
  const calls = [];
  let finish;
  globalThis.fetch = async (url, init) => { calls.push([url, init]); return new Promise((resolve) => { finish = resolve; }); };
  try {
    const h = harness();
    h.render();
    let tree = h.render();
    assert.equal(calls.length, 0, "hydration does not initialize Auth");
    for (const [id, value] of [["contact-name", "Ana"], ["contact-email", "ana@example.test"], ["contact-telephone", "123"]]) {
      nodes(tree).find((node) => node.props?.id === id).props.onChange({ target: { value } });
      tree = h.render();
    }
    const submit = nodes(tree).find((node) => node.type === "form").props.onSubmit;
    const event = { preventDefault() {} };
    const first = submit(event);
    await submit(event);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][1].body, '{"slug":"tienda"}');
    assert.ok(nodes(h.render()).find((node) => node.type === "button" && node.props.type === "submit").props.disabled);
    finish(new Response("", { status: 503 }));
    await first;
    tree = h.render();
    assert.equal(nodes(tree).find((node) => node.props?.id === "contact-name").props.value, "Ana");
    assert.equal(h.saved().items[0].quantity, 2);
    assert.ok(nodes(tree).some((node) => typeof node.props?.children === "string" && node.props.children.includes("podés reintentar")));
    const retry = nodes(tree).find((node) => node.type === "form").props.onSubmit(event);
    finish(Response.json({ ready: true }));
    await retry;
    tree = h.render();
    assert.equal(calls.length, 2);
    assert.ok(nodes(tree).find((node) => node.type === "button" && node.props.type === "submit").props.disabled);
    assert.equal(h.saved().items.length, 1);
    assert.equal(h.saved().items[0].quantity, 2);
    assert.ok(h.writes.every(([key, value]) => key === "qwerty:cart:v1:shop" && !/ana@example|telephone|contact-name/.test(value)));
  } finally {
    globalThis.fetch = oldFetch;
  }
});
