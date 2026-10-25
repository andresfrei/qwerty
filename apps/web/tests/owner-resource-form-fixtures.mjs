import * as React from "react";
import { load } from "./owner-first-store-fixtures.mjs";
export const businessId = "11111111-1111-4111-8111-111111111111";
export const recordId = "22222222-2222-4222-8222-222222222222";
export const page = { accountId: "owner", businessId, readKey: "ready-get-1" };
export const intent = { action: "rename_category", target: { kind: "record", id: recordId } };
export const data = () => new Map(Object.entries({ action: "rename_category", categoryId: recordId, name: "Conservar" }));
export const sessionAPI = () => load("apps/web/app/owner/catalog/catalog-form-session.ts");
export function pendingSession() {
  const calls = [];
  const session = sessionAPI().createCatalogFormSession((payload, scope) => new Promise(resolve => calls.push({ payload, scope, resolve })));
  return { session, calls };
}
export function adapter(session, currentPage = page, props = {}) {
  const slots = [], effects = []; let cursor = 0;
  const hooks = { ...React,
    useContext: context => context.displayName === "CatalogFormSession" ? session : currentPage,
    useSyncExternalStore: (_subscribe, get) => get(),
    useEffect(fn, deps) {
      const i = cursor++, previous = slots[i];
      if (!previous || deps.some((value, j) => value !== previous.deps[j])) effects.push(() => {
        previous?.cleanup?.(); slots[i] = { deps, fn, cleanup: fn() };
      });
    },
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = value; }]; },
  };
  const api = load("apps/web/app/owner/catalog/catalog-form-scope.tsx", { react: hooks });
  const values = { identity: intent, title: "Nombre", pendingLabel: "Guardando categoría…", children: React.createElement("input", { name: "name", defaultValue: "Conservar" }), ...props };
  const render = () => { cursor = 0; const tree = api.CatalogScopedForm(values); while (effects.length) effects.shift()(); return tree; };
  return { render, values, replay() { for (const slot of slots) if (slot?.fn) { slot.cleanup?.(); slot.cleanup = slot.fn(); } },
    unmount() { for (const slot of slots) slot?.cleanup?.(); } };
}
export function browserHost() {
  const listeners = new Map();
  const requests = [];
  const host = { location: { href: "https://qwerty.invalid/owner/catalog/items" },
    requests,
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    fire(type, attributes = {}, extra = {}) {
      const anchor = { getAttribute: key => attributes[key] ?? null, hasAttribute: key => Object.hasOwn(attributes, key) };
      const event = { type, isTrusted: true, defaultPrevented: false, button: 0, preventDefault() { this.defaultPrevented = true; },
        target: { closest: selector => selector === "a[href]" ? anchor : null }, ...extra };
      for (const fn of listeners.get(type) ?? []) fn(event);
      return event;
    }, count: type => listeners.get(type)?.size ?? 0,
    nativeSubmit(form, { laterListener, fail = false } = {}) {
      const event = host.fire("submit", {}, { target: form });
      laterListener?.(event);
      if (event.defaultPrevented) return { status: "canceled", event };
      const leave = host.fire("beforeunload");
      if (leave.defaultPrevented) return { status: "blocked", event };
      // Standard app native-default ordering, not a real browser or HTTP request.
      const request = { method: form.method, action: form.action, status: fail ? "failed" : "sent" };
      requests.push(request);
      return { ...request, event };
    },
  };
  return host;
}
