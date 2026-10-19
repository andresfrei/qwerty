import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import * as React from "react";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../app/store/[slug]/checkout/checkout-client.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const receiptId = "22222222-2222-4222-8222-222222222222";
const item = { id: "water", business_id: "shop", category_id: "food", name: "Agua", description: null, price_minor: 1000, currency: "ARS", is_available: true, sort_order: 0 };
const catalog = { status: "ok", storefront: { business_id: "shop", slug: "tienda", display_name: "Tienda", is_published: true }, categories: [{ category: { id: "food", business_id: "shop", name: "Carta", sort_order: 0 }, items: [item] }], groups: [], options: [], surchargeMinor: 0 };
function nodes(tree) { return !tree || typeof tree !== "object" ? [] : [tree, ...React.Children.toArray(tree.props?.children).flatMap(nodes)]; }
function text(tree) { return typeof tree === "string" ? tree : !tree || typeof tree !== "object" ? "" : React.Children.toArray(tree.props?.children).map(text).join(" "); }

// The real component and callbacks, with deterministic hooks/storage. Not a
// browser: native file-input/layout assertions belong to the browser fixture.
function harness() {
  const slots = [], effects = [], writes = [];
  let cursor = 0, saved = JSON.stringify({ version: 2, businessId: "shop", items: [{ id: item.id, key: item.id, name: item.name, unitPriceMinor: 1000, currency: "ARS", quantity: 2, selection: [], selectionText: "" }] });
  const changed = (a, b) => !a || a.length !== b.length || a.some((value, i) => value !== b[i]);
  const hooks = {
    useState(initial) { const id = cursor++; if (!(id in slots)) slots[id] = typeof initial === "function" ? initial() : initial; return [slots[id], (next) => { slots[id] = typeof next === "function" ? next(slots[id]) : next; }]; },
    useRef(initial) { const id = cursor++; return slots[id] ??= { current: initial }; },
    useMemo(fn, deps) { const id = cursor++; if (!slots[id] || changed(slots[id].deps, deps)) slots[id] = { value: fn(), deps }; return slots[id].value; },
    useEffect(fn, deps) { const id = cursor++; if (changed(slots[id], deps)) { slots[id] = deps; effects.push(fn); } },
  };
  const module = { exports: {} }, storage = { getItem: () => saved, setItem: (key, value) => { saved = value; writes.push([key, value]); } };
  const resolve = (name) => name === "react" ? hooks : name.startsWith("@/app/lib/") ? require(`../app/lib/${name.slice("@/app/lib/".length)}.ts`) : require(name);
  new Function("require", "module", "exports", "localStorage", compiled)(resolve, module, module.exports, storage);
  const render = () => { cursor = 0; const tree = module.exports.default({ catalog }); while (effects.length) effects.shift()(); return tree; };
  const find = (id) => nodes(render()).find((node) => node.props?.id === id);
  render(); render();
  for (const [key, value] of [["name", "Ana"], ["email", "ana@example.test"], ["telephone", "+54 111"]]) find(`contact-${key}`).props.onChange({ target: { value } });
  return { render, find, writes, saved: () => JSON.parse(saved), session: () => nodes(render()).find((node) => node.type === "form").props.onSubmit({ preventDefault() {} }), choose: (file) => { const input = find("receipt-file"); assert.ok(input, "actual receipt file chooser exists"); input.props.onChange({ currentTarget: { files: [file] } }); }, upload: () => { const button = find("receipt-upload"); assert.ok(button, "actual receipt upload action exists"); return button.props.onClick(); } };
}
function retained(h, before, file) {
  assert.deepEqual(h.saved(), before);
  for (const [key, value] of [["name", "Ana"], ["email", "ana@example.test"], ["telephone", "+54 111"]]) assert.equal(h.find(`contact-${key}`).props.value, value);
  assert.ok(text(h.render()).includes(file.name));
  assert.ok(text(h.render()).includes("Todavía no se envió ningún pedido."));
  assert.ok(h.writes.every(([key, value]) => key === "qwerty:cart:v1:shop" && !/ana@example|telephone|receiptId|receipt\.pdf/.test(value)));
  assert.ok(!nodes(h.render()).some((node) => ["iframe", "object", "embed"].includes(node.type)));
}

test("receipt chooser uploads original raw bytes for supported formats, exact 10 MiB cap and private reference only", async () => {
  const oldFetch = globalThis.fetch, calls = [];
  globalThis.fetch = async (url, init) => { calls.push([url, init]); return url === "/api/checkout/session" ? Response.json({ ready: true }) : Response.json({ receiptId }, { status: 201 }); };
  try {
    const h = harness(); assert.equal(calls.length, 0); await h.session();
    assert.equal(h.find("receipt-file")?.props.accept, "image/jpeg,image/png,image/webp,application/pdf");
    for (const [extension, mime] of [["jpg", "image/jpeg"], ["png", "image/png"], ["webp", "image/webp"], ["pdf", "application/pdf"]]) {
      const file = new File([Uint8Array.of(0, 1, 128, 255)], `receipt.${extension}`, { type: mime });
      h.choose(file); await h.upload();
      const [url, init] = calls.at(-1);
      assert.equal(url, "/api/checkout/receipts?slug=tienda");
      assert.equal(init.method, "POST"); assert.equal(init.credentials, "same-origin"); assert.equal(init.cache, "no-store"); assert.equal(init.redirect, "error");
      assert.deepEqual(init.headers, { "Content-Type": "application/octet-stream" }); assert.equal(init.body, file);
      assert.deepEqual(new Uint8Array(await init.body.arrayBuffer()), Uint8Array.of(0, 1, 128, 255));
      assert.equal(h.find("receipt-original").props.href, `/api/checkout/receipts/${receiptId}?slug=tienda`);
      assert.ok(h.find("receipt-upload").props.disabled); assert.ok(text(h.render()).includes("El pago todavía no está confirmado."));
    }
    const exact = new File([new Uint8Array(10485760)], "receipt.pdf"); h.choose(exact); await h.upload(); assert.equal(calls.at(-1)[1].body, exact);
    const count = calls.length, tooLarge = new File([new Uint8Array(10485761)], "too-large.pdf"); h.choose(tooLarge); await h.upload();
    assert.equal(calls.length, count); assert.ok(text(h.find("receipt-status")).includes("10 MiB"));
    assert.ok(!h.find("receipt-original")); assert.equal(calls[0][1].body, '{"slug":"tienda"}');
  } finally { globalThis.fetch = oldFetch; }
});

test("failed actual upload preserves cart contact and file; duplicate clicks do not upload twice and explicit retry stages no order", async () => {
  const oldFetch = globalThis.fetch, calls = []; let finish;
  globalThis.fetch = async (url, init) => { calls.push([url, init]); return url === "/api/checkout/session" ? Response.json({ ready: true }) : new Promise((resolve) => { finish = resolve; }); };
  try {
    const h = harness(); await h.session(); const before = structuredClone(h.saved()), file = new File(["original"], "receipt.pdf", { type: "application/pdf" });
    h.choose(file); const first = h.upload(); await h.upload();
    assert.equal(calls.length, 2); assert.ok(h.find("receipt-upload").props.disabled); assert.ok(h.find("receipt-file").props.disabled);
    finish(Response.json({ error: "provider-private-payload" }, { status: 503 })); await first;
    retained(h, before, file); assert.ok(!text(h.render()).includes("provider-private")); assert.ok(!h.find("receipt-original"));
    const malformed = h.upload(); finish(Response.json({ receiptId: "../../foreign?slug=other" }, { status: 201 })); await malformed;
    retained(h, before, file); assert.ok(!h.find("receipt-original"));
    const retry = h.upload(); finish(Response.json({ receiptId }, { status: 201 })); await retry;
    retained(h, before, file); assert.equal(calls.length, 4); assert.ok(calls.slice(1).every(([url, init]) => url === "/api/checkout/receipts?slug=tienda" && init.body === file));
    assert.equal(h.find("receipt-original").props.href, `/api/checkout/receipts/${receiptId}?slug=tienda`);
  } finally { globalThis.fetch = oldFetch; }
});

test("receipt readiness creates no implicit Auth and session loss requires deliberate reprepare without losing drafts", async () => {
  const oldFetch = globalThis.fetch, calls = []; let uploads = 0;
  globalThis.fetch = async (url, init) => { calls.push([url, init]); return url === "/api/checkout/session" ? Response.json({ ready: true }) : ++uploads === 1 ? Response.json({ error: "Session required" }, { status: 401 }) : Response.json({ receiptId }, { status: 201 }); };
  try {
    const h = harness(); assert.equal(calls.length, 0); assert.ok(h.find("receipt-upload"), "receipt action exists before readiness");
    assert.ok(h.find("receipt-upload").props.disabled); await h.upload(); assert.equal(calls.length, 0);
    await h.session(); const before = structuredClone(h.saved()), file = new File(["original"], "receipt.pdf"); h.choose(file); await h.upload();
    retained(h, before, file); assert.equal(calls.length, 2); assert.ok(h.find("receipt-upload").props.disabled);
    assert.equal(nodes(h.render()).find((node) => node.type === "button" && node.props.type === "submit").props.disabled, false);
    await h.upload(); assert.equal(calls.length, 2); await h.session(); assert.equal(calls.length, 3); await h.upload();
    retained(h, before, file); assert.equal(calls.length, 4); assert.equal(calls[1][1].body, file); assert.equal(calls[3][1].body, file);
  } finally { globalThis.fetch = oldFetch; }
});
