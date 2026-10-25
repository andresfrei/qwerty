import { catalogInspectionHref, createCatalogFormGate, type CatalogFormIdentity,
  type CatalogFormSender, type CatalogInspection } from "./catalog-form-lifecycle";

export type CatalogFormPage = Readonly<{ accountId: string; businessId: string; readKey: string }>;
export type CatalogFormIntent = Pick<CatalogFormIdentity, "action" | "target">;
const pageKey = (page: CatalogFormPage) => JSON.stringify([page.accountId, page.businessId, page.readKey]);

/** RAM only. readKey identifies a rendered page; it cannot prove read chronology. */
export function createCatalogFormSession(send?: CatalogFormSender) {
  const gate = createCatalogFormGate(send);
  let revision = 0, generation = 0;
  let origin: string | undefined, inspecting = false;
  const listeners = new Set<() => void>();
  const notify = () => { revision++; for (const listener of listeners) listener(); };
  gate.subscribe(notify);
  function mode(page: CatalogFormPage): "editable" | "retained" | "read-only" {
    if (inspecting) return "read-only";
    return gate.getSnapshot().state === "idle" ? "editable" : origin === pageKey(page) ? "retained" : "read-only";
  }
  return {
    version: () => revision,
    snapshot: () => gate.getSnapshot(),
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    mode,
    // Arrival is observational only, including unseen prefetched/cached request keys.
    arrive: (page: CatalogFormPage) => mode(page),
    canLeaveSaved(inspection: CatalogInspection) {
      return gate.getSnapshot().state === "saved" &&
        catalogInspectionHref(inspection.inspectionHref, inspection.businessId) !== null &&
        gate.canNavigate(inspection);
    },
    navigate(inspection?: CatalogInspection) {
      if (inspection && !catalogInspectionHref(inspection.inspectionHref, inspection.businessId)) return false;
      if (!gate.canNavigate(inspection)) return false;
      inspecting = !!inspection;
      notify(); return true;
    },
    locked: () => gate.getSnapshot().state !== "idle",
    mount(authorizedPage: CatalogFormPage, intent: CatalogFormIntent) {
      const page = Object.freeze({ ...authorizedPage });
      const ownedGate = gate;
      const binding = ownedGate.bind({ ...intent, accountId: page.accountId, businessId: page.businessId, generation: ++generation });
      const key = pageKey(page);
      let live = true;
      return {
        key: binding.key,
        async submit(form: FormData) {
          if (!live || ownedGate !== gate || mode(page) !== "editable") return;
          origin = key;
          await ownedGate.submit(binding, form);
        },
        retire() { live = false; ownedGate.retire(binding); },
      };
    },
  };
}
export type CatalogFormSession = ReturnType<typeof createCatalogFormSession>;
export type CatalogMountedForm = ReturnType<CatalogFormSession["mount"]>;

// Window-keyed client lifetime survives Catalog layout unmount/re-entry. Never shared on SSR.
const sessions = new WeakMap<object, CatalogFormSession>();
export function catalogFormSessionFor(host: object, send?: CatalogFormSender): CatalogFormSession {
  let session = sessions.get(host);
  if (!session) { session = createCatalogFormSession(send); sessions.set(host, session); }
  return session;
}
