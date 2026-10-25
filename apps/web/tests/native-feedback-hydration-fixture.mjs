import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const app = new URL("../app/", import.meta.url).pathname;
const modules = {};
const navigation = `${app}owner/catalog/catalog-navigation`;
const view = `${app}owner/catalog/catalog-navigation-view`;
const context = `${app}owner/owner-context`;
// Only unrelated routing adapters are replaced. The shell/button/enhancer and React are real.
modules[navigation] = "exports.catalogHref=exports.catalogStoreHref=()=>{throw Error('unexpected catalog routing')};";
modules[view] = "exports.CatalogSectionNav=()=>{throw Error('unexpected catalog section')};";
modules[context] = "exports.ownerHref=(module,id)=>'/owner'+(module==='home'?'':'/'+module)+(id?'?businessId='+id:'');";
function compile(file) {
  const id = file.replace(/\.tsx?$/, "");
  if (modules[id]) return id;
  modules[id] = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  for (const [, name] of modules[id].matchAll(/require\("([^"]+)"\)/g)) {
    if (!name.startsWith(".")) continue;
    const base = resolve(dirname(file), name);
    if (!modules[base]) compile([`${base}.tsx`, `${base}.ts`].find(existsSync));
  }
  return id;
}
const shell = compile(`${app}owner/owner-shell.tsx`);
const feedback = compile(`${app}components/async-action.ts`);
const cache = {};
function load(id, parent = "") {
  if (id.startsWith(".")) id = resolve(dirname(parent), id);
  if (!modules[id]) return require(id);
  if (!cache[id]) {
    const module = { exports: {} }; cache[id] = module;
    new Function("require", "module", "exports", modules[id])((name) => load(name, id), module, module.exports);
  }
  return cache[id].exports;
}
const props = { activeModule: "catalog", ownedBusinesses: [], selectedBusiness: null, account: { id: "synthetic-owner" }, pagination: { page: 0, hasMore: false } };
const markup = renderToString(React.createElement(load(shell).OwnerShell, props, React.createElement("span", { id: "hydration-ready" })));
for (const [name, pkg, file] of [
  ["react", "react", "react.development.js"],
  ["react/jsx-runtime", "react", "react-jsx-runtime.development.js"],
  ["react-dom", "react-dom", "react-dom.development.js"],
  ["react-dom/client", "react-dom", "react-dom-client.development.js"],
  ["scheduler", "scheduler", "scheduler.development.js"],
]) modules[name] = readFileSync(join(dirname((pkg === "scheduler" ? createRequire(require.resolve("react-dom/package.json")) : require).resolve(`${pkg}/package.json`)), "cjs", file), "utf8");
const runtime = `window.hydrationFixture=(()=>{const sources=${JSON.stringify(modules)},cache={};function load(id,parent=''){if(id.startsWith('.')){const parts=parent.split('/');parts.pop();for(const p of id.split('/')){if(p==='..')parts.pop();else if(p!=='.')parts.push(p)}id=parts.join('/')}if(!cache[id]){if(!sources[id])throw Error('missing '+id);const m={exports:{}};cache[id]=m;new Function('require','module','exports','process',sources[id])(n=>load(n,id),m,m.exports,{env:{NODE_ENV:'development'}})}return cache[id].exports}return {React:load('react'),dom:load('react-dom/client'),Shell:load(${JSON.stringify(shell)}).OwnerShell,Feedback:load(${JSON.stringify(feedback)}).NativeFormFeedback,props:${JSON.stringify(props)}}})();`;
new Function(runtime); // Preparation syntax check, not a browser execution.
const css = readFileSync(`${app}globals.css`, "utf8").replace('@import "tailwindcss";', "");
export const hydrationPreparation = { markup, moduleCount: Object.keys(modules).length };

export async function ownerHydrationReplay(browser) {
  const context = await browser.newContext({ serviceWorkers: "block", viewport: { width: 390, height: 844 } });
  const page = await context.newPage(); page.setDefaultTimeout(5000); page.setDefaultNavigationTimeout(5000);
  const posts = [], unmatched = [], errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await context.route("**/*", async (route) => {
    const request = route.request();
    if (request.method() === "GET" && request.url() === "https://feedback.invalid/hydration") return route.fulfill({ contentType: "text/html; charset=utf-8", body: `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div id="feedback-root"></div><div id="owner-root">${markup}</div></body></html>` });
    if (request.method() === "POST" && request.url() === "https://feedback.invalid/auth/logout") { posts.push(request.postData() ?? ""); return route.fulfill({ status: 204, body: "" }); }
    unmatched.push(request.url()); return route.abort();
  });
  try {
    await page.goto("https://feedback.invalid/hydration");
    const before = await page.locator("#owner-root").innerHTML();
    await page.addScriptTag({ content: runtime });
    await page.evaluate(() => {
      const { React, dom, Feedback } = window.hydrationFixture;
      function Ready() { React.useEffect(() => { window.feedbackReady = true; }, []); return null; }
      window.feedbackRoot = dom.createRoot(document.querySelector("#feedback-root"));
      window.feedbackRoot.render(React.createElement(React.StrictMode, null, React.createElement(Feedback), React.createElement(Ready)));
    });
    await page.waitForFunction(() => window.feedbackReady);
    const afterEnhancement = await page.locator("#owner-root").innerHTML();
    await page.evaluate(() => {
      const { React, dom, Shell, props } = window.hydrationFixture;
      window.recoverable = [];
      function Ready() { React.useEffect(() => { window.ownerReady = true; }, []); return React.createElement("span", { id: "hydration-ready" }); }
      window.ownerRoot = dom.hydrateRoot(document.querySelector("#owner-root"), React.createElement(React.StrictMode, null, React.createElement(Shell, props, React.createElement(Ready))), { onRecoverableError: error => window.recoverable.push(error.message) });
    });
    await page.waitForFunction(() => window.ownerReady);
    const recoverable = await page.evaluate(() => window.recoverable);
    assert.deepEqual(recoverable, [], "actual OwnerShell hydrateRoot must not recover from server/client mismatch");
    assert.equal(afterEnhancement, before, "root discovery must not mutate idle OwnerShell SSR markup before hydration");
    assert.deepEqual(errors, []); assert.deepEqual(unmatched, []);
    const button = page.locator('#owner-root form[action="/auth/logout"] button');
    const dimensions = await button.boundingBox();
    await Promise.all([
      page.waitForResponse(response => response.request().method() === "POST" && response.status() === 204),
      page.evaluate(() => {
        const form = document.querySelector('#owner-root form[action="/auth/logout"]');
        window.submits = []; document.addEventListener("submit", event => { if (event.target === form) window.submits.push(event.defaultPrevented); });
        form.requestSubmit(form.querySelector("button")); form.requestSubmit(form.querySelector("button"));
      }),
    ]);
    const pending = await page.evaluate(() => {
      const form = document.querySelector('#owner-root form[action="/auth/logout"]'), button = form.querySelector("button"), box = button.getBoundingClientRect();
      return { disabled: button.disabled, busy: button.getAttribute("aria-busy"), label: form.querySelector(".async-action-label").textContent, status: form.querySelector('[role="status"]').textContent, submits: window.submits, width: box.width, height: box.height };
    });
    assert.deepEqual(posts, [""]); assert.deepEqual(pending.submits, [false, true]);
    assert.equal(pending.disabled, true); assert.equal(pending.busy, "true"); assert.equal(pending.label, "Cerrando sesión…"); assert.equal(pending.status, pending.label);
    assert.equal(pending.width, dimensions.width); assert.equal(pending.height, dimensions.height);
    await page.evaluate(() => { window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })); window.feedbackRoot.unmount(); });
    assert.equal(await page.locator("#owner-root").innerHTML(), before, "pageshow/cleanup must retain original declarative SSR markup");
    assert.deepEqual(errors, []); assert.deepEqual(unmatched, []);
  } finally { await context.close(); }
}
