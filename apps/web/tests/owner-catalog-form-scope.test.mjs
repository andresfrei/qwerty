import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "./owner-first-store-fixtures.mjs";
import { adapter, browserHost, businessId, data, intent, page, pendingSession, sessionAPI } from "./owner-resource-form-fixtures.mjs";
const root = "apps/web/app/owner/catalog/";

test("mandatory adapter shares sibling gate and keeps current pending/unknown fields and key", async () => {
  const { session, calls } = pendingSession();
  const a = adapter(session), b = adapter(session);
  a.render(); b.render();
  const first = a.render(), sibling = b.render();
  const OriginalFormData = globalThis.FormData;
  globalThis.FormData = class { constructor(value) { return value; } };
  try {
    const event = { preventDefault() {}, currentTarget: data() }, before = [...event.currentTarget];
    const pending = first.props.onSubmit(event);
    await sibling.props.onSubmit(event);
    assert.equal(calls.length, 1);
    assert.equal(a.render().props.identityKey, first.props.identityKey);
    assert.equal(a.render().props.state, "pending");
    calls[0].resolve({ kind: "rejected", message: "Revisá el nombre" }); await pending;
    assert.equal(a.render().props.state, "idle");
    assert.deepEqual([...event.currentTarget], before);
    assert.equal(calls.length, 1);
    const retry = a.render().props.onSubmit(event);
    calls[1].resolve({ kind: "unknown" }); await retry;
    assert.equal(a.render().props.identityKey, first.props.identityKey);
    assert.equal(session.mode(page), "retained");
    assert.deepEqual([...event.currentTarget], before);
  } finally { globalThis.FormData = OriginalFormData; a.unmount(); b.unmount(); }
});

test("saved never rotates on cached, pre-save or unseen prefetched request keys in the same document", async () => {
  const cache = new Map();
  const { CatalogFormFrame } = load(root + "catalog-form-scope.tsx", {}, cache);
  const { CatalogSessionContext } = load(root + "catalog-form-navigation.tsx", {}, cache);
  let editors = 0;
  function EditorProbe() { editors++; return React.createElement("form"); }
  for (const kind of ["saved", "unknown"]) {
    const { session, calls } = pendingSession();
    const preSave = { ...page, readKey: "rendered-before-save" };
    session.arrive(preSave);
    const binding = session.mount(page, intent), pending = binding.submit(data());
    calls[0].resolve(kind === "saved" ? { kind, data: { ok: true } } : { kind }); await pending;
    session.arrive({ ...page });
    assert.equal(session.snapshot().state, kind);
    session.arrive({ ...page, businessId: "other", accountId: "other" });
    assert.equal(session.snapshot().state, kind, "scope/URL change is not a fresh GET");
    for (const arrival of [preSave, { ...page, readKey: "cached-history" }, { ...page, readKey: "unseen-prefetched-before-save" }, { ...page, readKey: "new-server-key" }]) {
      session.arrive(arrival);
      assert.equal(session.snapshot().state, kind, "request keys cannot establish post-save chronology");
      assert.equal(session.mode(arrival), "read-only");
      const html = renderToStaticMarkup(React.createElement(CatalogSessionContext.Provider, { value: session },
        React.createElement(CatalogFormFrame, { page: arrival, readOnly: "Consulta", editable: React.createElement(EditorProbe) })));
      assert.match(html, /Consulta/); assert.equal(editors, 0);
      const attempted = session.mount(arrival, intent);
      await attempted.submit(data()); attempted.retire();
    }
    await binding.submit(data());
    assert.equal(calls.length, 1, "no second or third POST");
  }
});

test("explicit scoped inspection renders only read-only slot before editor first paint", async () => {
  const { session, calls } = pendingSession();
  const pending = session.mount(page, intent).submit(data());
  const href = `/owner/catalog/items?businessId=${businessId}`;
  const cache = new Map();
  const { CatalogFormFrame } = load(root + "catalog-form-scope.tsx", {}, cache);
  const { CatalogSessionContext } = load(root + "catalog-form-navigation.tsx", {}, cache);
  let editors = 0;
  function Editors() { editors++; return React.createElement("form"); }
  for (const fresh of [{ ...page, readKey: "history-page" }, { ...page, businessId: "other" }, { ...page, accountId: "other" }]) {
    renderToStaticMarkup(React.createElement(CatalogSessionContext.Provider, { value: session },
      React.createElement(CatalogFormFrame, { page: fresh, readOnly: "Consulta", editable: React.createElement(Editors) })));
    assert.equal(editors, 0, "no editor mounts even before arrival effects");
  }
  assert.equal(session.navigate({ inspectionHref: href, businessId: "foreign" }), false);
  assert.equal(session.navigate({ inspectionHref: href, businessId }), true);
  const html = renderToStaticMarkup(React.createElement(CatalogSessionContext.Provider, { value: session },
    React.createElement(CatalogFormFrame, { page, readOnly: React.createElement("p", null, "Consulta"), editable: React.createElement(Editors) })));
  assert.match(html, /Consulta/);
  assert.equal(editors, 0);
  assert.ok(!html.includes("<form"));
  calls[0].resolve({ kind: "unknown" }); await pending;
  assert.equal(session.mode(page), "read-only");
});

test("only confirmed saved inspection renders a native GET exit; unresolved inspection remains SPA/read-only", async () => {
  for (const kind of ["pending", "unknown", "saved"]) {
    const { session, calls } = pendingSession();
    const pending = session.mount(page, intent).submit(data());
    if (kind !== "pending") {
      calls[0].resolve(kind === "saved" ? { kind, data: { ok: true } } : { kind }); await pending;
    }
    const cache = new Map();
    const { CatalogInspectionLink, CatalogSessionContext, installCatalogFormNavigation } = load(root + "catalog-form-navigation.tsx", {}, cache);
    const href = `/owner/catalog/items?businessId=${businessId}`;
    const html = renderToStaticMarkup(React.createElement(CatalogSessionContext.Provider, { value: session },
      React.createElement(CatalogInspectionLink, { href, businessId }, "Consultar catálogo (solo lectura)")));
    assert.equal(html.includes("data-catalog-confirmed-get"), kind === "saved");
    assert.equal(html.includes("data-catalog-inspection"), kind !== "saved");
    if (kind === "saved") assert.ok(!html.includes("solo lectura"));
    const host = browserHost(), uninstall = installCatalogFormNavigation(session, host);
    const marker = kind === "saved" ? "data-catalog-confirmed-get" : "data-catalog-inspection";
    const clicked = host.fire("click", { href, [marker]: businessId });
    assert.equal(clicked.defaultPrevented, false);
    assert.equal(host.fire("beforeunload").defaultPrevented, kind !== "saved");
    assert.equal(host.fire("beforeunload").defaultPrevented, true, "one exit only");
    if (kind === "saved") {
      const canceled = host.fire("click", { href, [marker]: businessId });
      canceled.preventDefault();
      assert.equal(host.fire("beforeunload").defaultPrevented, true);
      const attributes = { href, [marker]: businessId };
      host.fire("click", attributes);
      attributes.href = "https://foreign.invalid/owner/catalog/items";
      assert.equal(host.fire("beforeunload").defaultPrevented, true);
      for (const extra of [{ isTrusted: false }, { ctrlKey: true }]) {
        assert.equal(host.fire("click", { href, [marker]: businessId }, extra).defaultPrevented, true);
        assert.equal(host.fire("beforeunload").defaultPrevented, true);
      }
      assert.equal(host.fire("click", { href, [marker]: "foreign" }).defaultPrevented, true);
      assert.equal(host.fire("beforeunload").defaultPrevented, true);
    }
    session.arrive({ ...page, readKey: "cached-or-new-key" });
    assert.equal(session.snapshot().state, kind);
    assert.equal(session.mode({ ...page, readKey: "cached-or-new-key" }), "read-only");
    assert.equal(calls.length, 1, "neither GET link nor arrival repeats the POST");
    if (kind === "pending") { calls[0].resolve({ kind: "unknown" }); await pending; }
    uninstall();
  }
});

test("native logout default action is not vetoed by the locked beforeunload guard", async () => {
  const { session, calls } = pendingSession();
  const { installCatalogFormNavigation } = load(root + "catalog-form-navigation.tsx");
  const host = browserHost();
  const uninstall = installCatalogFormNavigation(session, host);
  const pending = session.mount(page, intent).submit(data());
  const result = host.nativeSubmit({ method: "post", action: "https://qwerty.invalid/auth/logout" }, { fail: true });
  assert.equal(result.event.defaultPrevented, false);
  assert.equal(result.status, "failed", "native POST proceeded past unload to a simulated request failure");
  assert.equal(host.requests.length, 1);
  assert.equal(host.fire("beforeunload").defaultPrevented, true, "failure cannot preserve the consumed bypass");
  assert.equal(host.requests.length, 1, "no second native POST");
  calls[0].resolve({ kind: "unknown" }); await pending;
  assert.equal(calls.length, 1);
  uninstall();
});

test("canceled or retargeted native logout cannot exempt a later unrelated exit", async () => {
  const { session, calls } = pendingSession();
  const { installCatalogFormNavigation } = load(root + "catalog-form-navigation.tsx");
  const host = browserHost(), uninstall = installCatalogFormNavigation(session, host);
  const pending = session.mount(page, intent).submit(data());
  for (const mutate of [
    (event) => event.preventDefault(),
    (_event, form) => { form.action = "https://foreign.invalid/auth/logout"; },
    (_event, form) => { form.method = "get"; },
    (_event, form) => { form.target = "_blank"; },
  ]) {
    const form = { method: "post", action: "https://qwerty.invalid/auth/logout", target: "_self" };
    const result = host.nativeSubmit(form, { laterListener: event => mutate(event, form) });
    assert.ok(["canceled", "blocked"].includes(result.status));
    assert.equal(host.requests.length, 0);
    assert.equal(host.fire("beforeunload").defaultPrevented, true);
    assert.equal(host.fire("beforeunload").defaultPrevented, true);
  }
  for (const form of [
    { method: "post", action: "https://foreign.invalid/auth/logout" },
    { method: "post", action: "/owner/catalog/actions" },
    { method: "post", action: "/auth/logout", target: "other-window" },
    { method: "post", action: "/auth/logout?extra=1" },
  ]) {
    host.fire("submit", {}, { target: form });
    assert.equal(host.fire("beforeunload").defaultPrevented, true);
  }
  host.fire("submit", {}, { isTrusted: false, target: { method: "post", action: "/auth/logout" } });
  assert.equal(host.fire("beforeunload").defaultPrevented, true);
  host.fire("submit", {}, { target: { method: "post", action: "/auth/logout" }, submitter: { hasAttribute: name => name === "formaction" } });
  assert.equal(host.fire("beforeunload").defaultPrevented, true);
  calls[0].resolve({ kind: "unknown" }); await pending;
  assert.equal(calls.length, 1);
  uninstall();
});

test("fixed auth anchor uses its live cancellation, target and trusted-event state", async () => {
  const { session, calls } = pendingSession();
  const { installCatalogFormNavigation } = load(root + "catalog-form-navigation.tsx");
  const host = browserHost(), uninstall = installCatalogFormNavigation(session, host);
  const pending = session.mount(page, intent).submit(data());
  const canceled = host.fire("click", { href: "/auth/logout" });
  canceled.preventDefault();
  assert.equal(host.fire("beforeunload").defaultPrevented, true);
  host.fire("click", { href: "/auth/logout", target: "_self" });
  assert.equal(host.fire("beforeunload").defaultPrevented, false);
  assert.equal(host.fire("beforeunload").defaultPrevented, true);
  for (const attributes of [{ href: "https://foreign.invalid/auth/logout" }, { href: "/auth/other" },
    { href: "/auth/logout", target: "_blank" }, { href: "/auth/logout", download: "" }]) {
    host.fire("click", attributes);
    assert.equal(host.fire("beforeunload").defaultPrevented, true);
  }
  for (const extra of [{ isTrusted: false }, { ctrlKey: true }, { button: 1 }]) {
    host.fire("click", { href: "/auth/logout" }, extra);
    assert.equal(host.fire("beforeunload").defaultPrevented, true);
  }
  calls[0].resolve({ kind: "unknown" }); await pending; uninstall();
});

test("native links/store selection/GET navigation deny unresolved leaves; unload warns and logout is not swallowed", async () => {
  const { session, calls } = pendingSession();
  const { installCatalogFormNavigation } = load(root + "catalog-form-navigation.tsx");
  const host = browserHost();
  const uninstall = installCatalogFormNavigation(session, host);
  assert.equal(installCatalogFormNavigation(session, host), uninstall);
  assert.equal(host.count("click"), 1);
  const pending = session.mount(page, intent).submit(data());
  for (const href of ["/owner", `/owner/catalog?businessId=${businessId}`, "/owner/orders", "https://foreign.invalid"]) {
    assert.equal(host.fire("click", { href }).defaultPrevented, true);
  }
  assert.equal(host.fire("beforeunload").defaultPrevented, true);
  assert.equal(host.fire("submit", {}, { target: { method: "post", action: "/auth/logout" } }).defaultPrevented, false);
  assert.equal(host.fire("click", { href: "/auth/logout" }).defaultPrevented, false);
  assert.equal(host.fire("submit", {}, { target: { method: "get", action: "/owner/catalog/items" } }).defaultPrevented, true);
  const href = `/owner/catalog/items?businessId=${businessId}`;
  assert.equal(host.fire("click", { href, "data-catalog-inspection": businessId }, { ctrlKey: true }).defaultPrevented, true);
  assert.equal(host.fire("click", { href, "data-catalog-inspection": businessId }).defaultPrevented, false);
  assert.equal(session.mode(page), "read-only");
  calls[0].resolve({ kind: "unknown" }); await pending;
  uninstall(); assert.equal(host.count("click"), 0);
});

test("history/programmatic arrivals are read-only and same-window remount retains unresolved session", async () => {
  const { catalogFormSessionFor } = sessionAPI();
  const host = {};
  const calls = [];
  const session = catalogFormSessionFor(host, () => new Promise(resolve => calls.push(resolve)));
  assert.equal(catalogFormSessionFor(host), session);
  assert.notEqual(catalogFormSessionFor({}), session);
  const original = session.mount(page, intent), originalPending = original.submit(data());
  original.retire();
  assert.equal(catalogFormSessionFor(host).snapshot().state, "unknown");
  calls[0]({ kind: "saved", data: { ok: true } }); await originalPending;
  assert.equal(catalogFormSessionFor(host).snapshot().state, "unknown");
  // Injected transport case exercises arrival before any navigation effect can run.
  const setup = pendingSession(), mounted = setup.session.mount(page, intent);
  const pending = mounted.submit(data());
  for (const fresh of [{ ...page, readKey: "history-cache" }, { ...page, businessId: "other", readKey: "programmatic" }, { ...page, accountId: "other" }]) {
    assert.equal(setup.session.mode(fresh), "read-only");
    setup.session.arrive(fresh);
    assert.equal(setup.session.snapshot().state, "pending");
  }
  mounted.retire();
  setup.calls[0].resolve({ kind: "saved", data: { ok: true } }); await pending;
  assert.equal(setup.session.snapshot().state, "unknown");
});

test("effect cleanup/re-setup produces live new bindings and cannot unlock unresolved operation", async () => {
  const { session, calls } = pendingSession();
  const h = adapter(session);
  h.render(); const first = h.render();
  h.replay(); const replayed = h.render();
  assert.notEqual(first.props.identityKey, replayed.props.identityKey);
  const OriginalFormData = globalThis.FormData;
  globalThis.FormData = class { constructor(value) { return value; } };
  try {
    const event = { preventDefault() {}, currentTarget: data() };
    await first.props.onSubmit(event);
    assert.equal(calls.length, 0);
    const pending = replayed.props.onSubmit(event);
    h.replay(); const next = h.render();
    assert.equal(next.props.state, "unknown");
    assert.notEqual(next.props.identityKey, replayed.props.identityKey);
    calls[0].resolve({ kind: "rejected", message: "stale" }); await pending;
    assert.equal(session.snapshot().state, "unknown");
    await next.props.onSubmit(event); assert.equal(calls.length, 1);
  } finally { globalThis.FormData = OriginalFormData; h.unmount(); }
});

test("identity change resets form key, retires A and prevents its late result changing B", async () => {
  const { session, calls } = pendingSession();
  const h = adapter(session);
  h.render(); const a = h.render();
  const binding = session.mount(page, intent), pending = binding.submit(data());
  binding.retire();
  h.values.identity = { ...intent, target: { kind: "record", id: businessId } };
  h.render(); const b = h.render();
  assert.notEqual(a.props.identityKey, b.props.identityKey);
  assert.equal(b.props.state, "unknown");
  calls[0].resolve({ kind: "saved", data: { ok: true } }); await pending;
  assert.equal(h.render().props.state, "unknown"); h.unmount();
});

test("unframed legacy Catalog arrival cannot expose old writable editors while unresolved", async () => {
  const { session, calls } = pendingSession();
  const pending = session.mount(page, intent).submit(data());
  const cache = new Map();
  const { CatalogRouteBoundary } = load(root + "catalog-form-scope.tsx", { "next/navigation": { usePathname: () => "/owner/catalog" } }, cache);
  const { CatalogSessionContext } = load(root + "catalog-form-navigation.tsx", {}, cache);
  let mounted = 0;
  function LegacyEditor() { mounted++; return React.createElement("form"); }
  const html = renderToStaticMarkup(React.createElement(CatalogSessionContext.Provider, { value: session },
    React.createElement(CatalogRouteBoundary, null, React.createElement(LegacyEditor))));
  assert.equal(mounted, 0); assert.match(html, /solo lectura/);
  calls[0].resolve({ kind: "unknown" }); await pending;
});

test("editable adapter without mandatory Catalog frame/scope fails closed", () => {
  const { CatalogScopedForm } = load(root + "catalog-form-scope.tsx");
  assert.throws(() => renderToStaticMarkup(React.createElement(CatalogScopedForm, { identity: intent, title: "Nombre", pendingLabel: "Guardando…", children: "Campo" })), /catalog_form_scope_required/);
});
