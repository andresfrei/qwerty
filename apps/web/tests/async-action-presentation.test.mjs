import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const file = new URL("../app/components/async-action-button.tsx", import.meta.url);
function component() {
  if (!existsSync(file)) return () => React.createElement("button", null, "Guardar");
  const compiled = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", compiled)(require, module, module.exports);
  return module.exports.AsyncActionButton;
}
const Button = component();
const render = (props) => renderToStaticMarkup(React.createElement(Button, { children: "Guardar", pendingLabel: "Guardando…", pending: false, ...props }));
test("SSR idle/pending operation name, native disabled and retained domain lock", () => {
  assert.match(render(), /class="async-action-label">Guardar/);
  assert.doesNotMatch(render(), /disabled=""/);
  const pending = render({ pending: true });
  assert.match(pending, /disabled=""/);
  assert.match(pending, /aria-busy="true"/);
  assert.match(pending, /class="async-action-label">Guardando…/);
  assert.match(render({ locked: true }), /disabled=""/);
  assert.match(render({ disabled: true }), /disabled=""/);
  assert.match(render({ locked: true }), /class="async-action-label">Guardar/);
});
test("decorative spinner, reserved labels and separate polite live status", () => {
  const html = render({ pending: true });
  assert.match(html, /aria-hidden="true" class="async-action-spinner"/);
  assert.match(html, /aria-hidden="true" class="async-action-reserve">Guardar/);
  assert.match(html, /aria-hidden="true" class="async-action-reserve">Guardando…/);
  assert.match(html, /role="status" aria-live="polite" aria-atomic="true">Guardando…/);
});
test("pure public callback and native submitter props remain compatible", () => {
  const callback = () => "domain callback";
  const tree = Button({ children: "Guardar", pendingLabel: "Guardando…", pending: false, onClick: callback, name: "intent", value: "save", type: "submit" });
  const button = React.Children.toArray(tree.props.children)[0];
  assert.equal(button.props.onClick, callback);
  assert.equal(button.props.onClick(), "domain callback");
  assert.equal(button.props.name, "intent");
  assert.equal(button.props.value, "save");
  assert.equal(button.props.type, "submit");
});
test("CSS reserves both labels, retains focus outline and static reduced motion indicator", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.async-action-content\s*\{[^}]*display: inline-grid/s);
  assert.match(css, /\.async-action-reserve\s*\{[^}]*visibility: hidden/s);
  assert.match(css, /\.async-action:focus-visible\s*\{[^}]*outline:/s);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.async-action-spinner\s*\{[^}]*animation: none/s);
});
