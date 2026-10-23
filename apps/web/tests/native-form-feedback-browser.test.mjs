import assert from "node:assert/strict";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

// Use the already installed CLI's browser engine; no installation or TLS bypass.
const cli = realpathSync(execFileSync("which", ["playwright-cli"], { encoding: "utf8" }).trim());
const { chromium } = createRequire(cli)("playwright");
const source = new URL("../app/components/async-action.ts", import.meta.url);
const enhancement = existsSync(source) ? ts.transpileModule(readFileSync(source, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText : "exports.enhanceNativeAuthForms = () => () => {};";
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8").replace('@import "tailwindcss";', "");
const actions = ["/auth/login/submit", "/auth/signup/submit", "/auth/forgot-password/submit", "/auth/update-password/submit", "/auth/logout"];
const labels = ["Ingresando…", "Creando cuenta…", "Enviando enlace…", "Actualizando contraseña…", "Cerrando sesión…"];
const fixture = (action) => `<!doctype html><html lang="es"><style>${css}</style><form id="auth" method="post" action="${action}"><label>Nota anónima<input name="note" required></label><input type="hidden" name="csrf" value="fictional-token"><input name="excluded" disabled value="not-sent"><button name="intent" value="continue">Continuar</button></form><form id="custom" action="/checkout" method="post"><button>Compra local</button></form><form id="foreign" action="https://elsewhere.invalid/auth/logout" method="post"><button>Salir externo</button></form></html>`;

test("native replay: anonymous HTML only, all requests fulfilled before any navigation", async (t) => {
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true, channel: "chromium" });
  try {
    async function pageFor(action, js = true) {
      const context = await browser.newContext({ javaScriptEnabled: js, serviceWorkers: "block", viewport: { width: 390, height: 844 } });
      const page = await context.newPage();
      page.setDefaultTimeout(5000);
      page.setDefaultNavigationTimeout(5000);
      await page.goto("about:blank");
      const posts = [];
      await context.route("**/*", async (route) => {
        const request = route.request();
        if (request.method() === "POST") {
          // Only fixture fields exist; never visit or serialize real Auth forms.
          posts.push({ url: request.url(), body: request.postData(), method: request.method() });
          await route.fulfill({ status: 204, body: "" });
        } else await route.fulfill({ status: 200, contentType: "text/html", body: fixture(action) });
      });
      await page.goto("https://feedback.invalid/fixture");
      if (js) await page.addScriptTag({ content: `{const exports={};const require=(name)=>{if(name==='react')return {useEffect(){throw Error('mount not used in replay')}};throw Error(name)};${enhancement};window.cleanup=exports.enhanceNativeAuthForms(document);}` });
      return { page, context, posts };
    }
    await t.test("browser validation does not lock; same-tick duplicates preserve exact native named entry list", async () => {
      const { page, context, posts } = await pageFor(actions[0]);
      try {
        await page.locator("#auth button").click();
        assert.equal(posts.length, 0);
        assert.equal(await page.locator("#auth button").isDisabled(), false);
        await page.locator("[name=note]").fill("anonymous-fiction");
        await page.locator("#auth button").focus();
        const before = await page.locator("#auth button").boundingBox();
        await Promise.all([
          page.waitForResponse((response) => response.request().method() === "POST" && response.url() === "https://feedback.invalid/auth/login/submit" && response.status() === 204),
          page.evaluate(() => {
            const form = document.querySelector("#auth"), button = form.querySelector("button");
            window.nativeSubmits = [];
            document.addEventListener("submit", (event) => { if (event.target === form) window.nativeSubmits.push(event.defaultPrevented); });
            form.requestSubmit(button); form.requestSubmit(button);
          }),
        ]);
        assert.equal(posts.length, 1);
        assert.deepEqual(await page.evaluate(() => window.nativeSubmits), [false, true], "first native submit proceeds; same-tick duplicate is cancelled");
        assert.equal(posts[0].body, "note=anonymous-fiction&csrf=fictional-token&intent=continue");
        assert.equal(posts[0].url, "https://feedback.invalid/auth/login/submit");
        assert.equal(posts[0].method, "POST");
        // A fulfilled 204 leaves native navigation pending in this replay. Direct
        // DOM reads deliberately avoid locator actionability/navigation waits.
        const pending = await page.evaluate(() => {
          const form = document.querySelector("#auth"), button = form.querySelector("button"), rect = button.getBoundingClientRect();
          return { disabled: button.disabled, busy: button.getAttribute("aria-busy"), name: button.getAttribute("name"), value: button.getAttribute("value"), note: form.querySelector("[name=note]").value, status: form.querySelector("[role=status]").textContent, width: rect.width, height: rect.height, indicatorHidden: form.querySelector(".async-action-spinner").getAttribute("aria-hidden") };
        });
        assert.equal(pending.disabled, true);
        assert.equal(pending.busy, "true");
        assert.equal(pending.name, "intent");
        assert.equal(pending.value, "continue");
        assert.equal(pending.note, "anonymous-fiction");
        assert.match(pending.status, /Ingresando…/);
        assert.equal(pending.indicatorHidden, "true");
        assert.equal(pending.width, before.width); assert.equal(pending.height, before.height);
        await page.emulateMedia({ reducedMotion: "reduce" });
        assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("#auth .async-action-spinner")).animationName), "none");
        const restored = await page.evaluate(() => {
          window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
          const form = document.querySelector("#auth"), button = form.querySelector("button");
          return { disabled: button.disabled, busy: button.getAttribute("aria-busy"), excludedDisabled: form.querySelector("[name=excluded]").disabled, noteDisabled: form.querySelector("[name=note]").disabled, status: form.querySelector("[role=status]").textContent, label: form.querySelector(".async-action-label").textContent, indicators: form.querySelectorAll(".async-action-spinner").length };
        });
        assert.equal(restored.disabled, false);
        assert.equal(restored.busy, null);
        assert.equal(restored.excludedDisabled, true);
        assert.equal(restored.noteDisabled, false);
        assert.equal(restored.status, "");
        assert.equal(restored.label, "Continuar");
        assert.equal(restored.indicators, 0);
        await page.evaluate(() => document.querySelector("#auth button").focus());
        assert.equal(await page.evaluate(() => document.activeElement === document.querySelector("#auth button")), true);
        const cleaned = await page.evaluate(() => { window.cleanup(); return document.querySelector("#auth button").textContent; });
        assert.equal(cleaned, "Continuar");
      } finally { await context.close(); }
    });
    await t.test("all five operation labels; custom, foreign and prevented forms untouched; cleanup restores pending", async () => {
      for (let i = 0; i < actions.length; i++) {
        const { page, context } = await pageFor(actions[i]);
        try {
          assert.equal(await page.locator("#custom .async-action-content, #foreign .async-action-content").count(), 0);
          await page.evaluate(() => {
            document.querySelector("#auth").addEventListener("submit", (event) => event.preventDefault(), { once: true });
          });
          await page.locator("[name=note]").fill("anonymous-fiction");
          await page.locator("#auth button").click();
          assert.equal(await page.locator("#auth button").isDisabled(), false);
          await Promise.all([
            page.waitForResponse((response) => response.request().method() === "POST" && response.status() === 204),
            page.locator("#auth button").click({ noWaitAfter: true }),
          ]);
          const pending = await page.evaluate(() => ({ busy: document.querySelector("#auth button").getAttribute("aria-busy"), label: document.querySelector("#auth .async-action-label").textContent }));
          assert.equal(pending.busy, "true");
          assert.equal(pending.label, labels[i]);
          const cleaned = await page.evaluate(() => {
            window.cleanup();
            const form = document.querySelector("#auth"), button = form.querySelector("button");
            return { disabled: button.disabled, label: button.textContent, excludedDisabled: form.querySelector("[name=excluded]").disabled, note: form.querySelector("[name=note]").value };
          });
          assert.equal(cleaned.disabled, false);
          assert.equal(cleaned.label, "Continuar");
          assert.equal(cleaned.excludedDisabled, true);
          assert.equal(cleaned.note, "anonymous-fiction");
        } finally { await context.close(); }
      }
    });
    await t.test("detached pending forms release decoration and locks, then enhance once when reinserted", async () => {
      const { page, context, posts } = await pageFor(actions[4]);
      try {
        await page.locator("[name=note]").fill("anonymous-fiction");
        await Promise.all([
          page.waitForResponse((response) => response.request().method() === "POST" && response.status() === 204),
          page.evaluate(() => { const form = document.querySelector("#auth"); form.requestSubmit(form.querySelector("button")); }),
        ]);
        await page.evaluate(() => { window.detachedAuth = document.querySelector("#auth"); window.detachedAuth.remove(); });
        // Observe public cleanup, not a private Map or a fixed elapsed delay.
        await page.waitForFunction(() => !window.detachedAuth.querySelector(".async-action-content, [role=status]"));
        const detached = await page.evaluate(() => {
          const form = window.detachedAuth, button = form.querySelector("button");
          return { disabled: button.disabled, label: button.textContent, busy: button.getAttribute("aria-busy"), noteDisabled: form.querySelector("[name=note]").disabled, excludedDisabled: form.querySelector("[name=excluded]").disabled };
        });
        assert.deepEqual(detached, { disabled: false, label: "Continuar", busy: null, noteDisabled: false, excludedDisabled: true });
        await page.evaluate(() => document.body.append(window.detachedAuth));
        await page.waitForFunction(() => window.detachedAuth.querySelectorAll(".async-action-content").length === 1 && window.detachedAuth.querySelectorAll("[role=status]").length === 1);
        await Promise.all([
          page.waitForResponse((response) => response.request().method() === "POST" && response.status() === 204),
          page.evaluate(() => { const form = window.detachedAuth; form.requestSubmit(form.querySelector("button")); }),
        ]);
        assert.equal(posts.length, 2, "reinsertion does not retain the old lock or duplicate listeners");
        assert.equal(posts[1].body, "note=anonymous-fiction&csrf=fictional-token&intent=continue");
        assert.equal(await page.evaluate(() => window.detachedAuth.querySelectorAll(".async-action-spinner").length), 1);
        await page.evaluate(() => { window.cleanup(); delete window.detachedAuth; });
      } finally { await context.close(); }
    });
    await t.test("no-JS native POST retains payload and reaches fulfilled native response", async () => {
      const { page, context, posts } = await pageFor(actions[4], false);
      try {
        await context.unroute("**/*");
        await context.route("**/*", async (route) => {
          if (route.request().method() === "POST") {
            posts.push({ body: route.request().postData() });
            await route.fulfill({ status: 200, contentType: "text/html", body: "<h1>Resultado ficticio</h1>" });
          } else await route.fulfill({ status: 200, contentType: "text/html", body: "<h1>Resultado ficticio</h1>" });
        });
        await page.locator("[name=note]").fill("anonymous-fiction");
        await Promise.all([page.waitForURL("**/auth/logout"), page.locator("#auth button").click()]);
        assert.equal(posts.length, 1);
        assert.equal(posts[0].body, "note=anonymous-fiction&csrf=fictional-token&intent=continue");
      } finally { await context.close(); }
    });
  } finally { await browser.close(); }
});
