import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import postcss from "postcss";

const stylesheet = postcss.parse(readFileSync(new URL("../app/globals.css", import.meta.url), "utf8"));
const pointerRules = [];
stylesheet.walkRules((rule) => {
  if (rule.nodes.some((node) => node.type === "decl" && node.prop === "cursor" && node.value === "pointer")) {
    pointerRules.push(rule);
  }
});

const controls = [
  "a[href]", "area[href]", "button", "summary", "select",
  'input[type="button"]', 'input[type="submit"]', 'input[type="reset"]',
  'input[type="checkbox"]', 'input[type="radio"]', 'input[type="file"]',
  'input[type="range"]', 'input[type="color"]',
  '[role="button"]', '[role="link"]', '[role="menuitem"]', '[role="tab"]',
];

test("clickable controls receive a pointer through the shared base stylesheet", () => {
  const controlRule = pointerRules.find((rule) => controls.every((selector) => rule.selector.includes(selector)));
  assert.ok(controlRule, "all clickable control selectors must receive cursor: pointer");
  assert.equal(controlRule.parent.type, "atrule");
  assert.equal(controlRule.parent.name, "layer");
  assert.equal(controlRule.parent.params, "base", "explicit cursor utilities must retain precedence");
});

test("pointer rules exclude disabled and inert controls without changing text-field cursors", () => {
  assert.ok(pointerRules.length > 0, "shared pointer rules must exist");
  for (const rule of pointerRules) {
    assert.ok(rule.selector.includes(":not(:disabled)"));
    assert.ok(rule.selector.includes(':not([aria-disabled="true"])'));
    assert.ok(rule.selector.includes(":not([inert], [inert] *)"));
    assert.doesNotMatch(rule.selector, /\binput(?!\[type=)/, "never apply pointer to every input");
    assert.doesNotMatch(rule.selector, /input\[type="(?:text|email|password|search|number|tel|url)"\]/);
  }
});

test("the native file-picker button also receives a pointer only while enabled", () => {
  assert.ok(pointerRules.some((rule) => rule.selector.includes("::file-selector-button")));
});
