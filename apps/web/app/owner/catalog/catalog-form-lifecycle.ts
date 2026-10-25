import { catalogFormPayload, sendOwnerMutation, type MutationResult } from "./catalog-editor";
import { parseCatalogPageQuery, type CatalogResource } from "./catalog-navigation";

export type CatalogFormIdentity = Readonly<{
  accountId: string;
  businessId: string;
  action: string;
  target: Readonly<{ kind: "record" | "parent" | "singleton"; id: string }>;
  generation: number;
}>;
export type CatalogFormBinding = Readonly<{ key: string }>;
export type CatalogFormSnapshot = Readonly<{
  state: "idle" | "pending" | "saved" | "unknown";
  message: string;
  pendingKey?: string;
}>;
export type CatalogFormSender = (payload: unknown, businessId: string) => Promise<MutationResult>;
export type CatalogInspection = { inspectionHref: string; businessId: string };

/** Validate the raw path before URL normalization; this is not write authorization. */
export function catalogInspectionHref(href: string, businessId: string): string | null {
  const match = /^\/owner\/catalog\/(items|categories|groups|options|settings)(?:\/([0-9a-f-]+))?(\?[^#]*)?$/.exec(href);
  if (!match) return null;
  const parsed = parseCatalogPageQuery(new URLSearchParams(match[3] ?? ""), {
    resource: match[1] as CatalogResource,
    mode: match[2] ? "detail" : "list",
    ...(match[2] ? { id: match[2] } : {}),
  });
  return parsed.ok && parsed.query.businessId === businessId.toLowerCase() ? href : null;
}

const targets: Record<string, [CatalogFormIdentity["target"]["kind"], string | null]> = {
  create_category: ["parent", null], rename_category: ["record", "categoryId"],
  reorder_category: ["record", "categoryId"], create_product: ["parent", "categoryId"],
  update_product: ["record", "itemId"], create_option_group: ["parent", "itemId"],
  update_option_group: ["record", "groupId"], create_option: ["parent", "groupId"],
  update_option: ["record", "optionId"], set_published: ["singleton", null],
  set_two_flavor_surcharge: ["singleton", null],
};
const unknownMessage = "No sabemos si se guardó. No repitas el envío: consultá el estado (solo lectura).";

/** Own one instance above ALL reachable classic forms. No persistence or auth lives here. */
export function createCatalogFormGate(send: CatalogFormSender = (payload, businessId) =>
  sendOwnerMutation("/owner/catalog/actions", payload, undefined, businessId)) {
  let snapshot: CatalogFormSnapshot = Object.freeze({ state: "idle", message: "" });
  let sequence = 0;
  let operation: { binding: CatalogFormBinding; businessId: string } | undefined;
  const bindings = new Map<CatalogFormBinding, CatalogFormIdentity>();
  const listeners = new Set<() => void>();
  function publish(next: CatalogFormSnapshot) {
    snapshot = Object.freeze(next);
    for (const listener of listeners) listener();
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    bind(identity: CatalogFormIdentity): CatalogFormBinding {
      // Copy caller-owned identity: later prop mutation cannot retarget a callback.
      const copy = Object.freeze({ ...identity, target: Object.freeze({ ...identity.target }) });
      const binding = Object.freeze({ key: JSON.stringify([copy.accountId, copy.businessId,
        copy.action, copy.target.kind, copy.target.id, copy.generation, ++sequence]) });
      bindings.set(binding, copy);
      return binding;
    },
    retire(binding: CatalogFormBinding) {
      bindings.delete(binding);
      // Losing an unresolved view must never unlock another writable view.
      if (operation?.binding === binding && snapshot.state === "pending") {
        publish({ state: "unknown", message: unknownMessage });
      }
    },
    canNavigate(inspection?: CatalogInspection): boolean {
      if (snapshot.state === "idle") return true;
      return !!inspection && operation?.businessId === inspection.businessId &&
        catalogInspectionHref(inspection.inspectionHref, operation.businessId) !== null;
    },
    async submit(binding: CatalogFormBinding, form: FormData): Promise<void> {
      const identity = bindings.get(binding);
      if (!identity || snapshot.state !== "idle") return;
      const payload = catalogFormPayload(form);
      const target = targets[identity.action];
      const data = payload as Record<string, unknown> | null;
      if (!data || data.action !== identity.action || !target || target[0] !== identity.target.kind ||
        (target[1] ? data[target[1]] : identity.businessId) !== identity.target.id) {
        publish({ state: "idle", message: "Revisá los datos y el registro seleccionado." });
        return;
      }
      // Publish/acquire synchronously BEFORE invoking any asynchronous transport.
      operation = { binding, businessId: identity.businessId };
      publish({ state: "pending", message: "", pendingKey: binding.key });
      let result: MutationResult;
      try { result = await send(payload, identity.businessId); }
      catch { result = { kind: "unknown" }; }
      if (!bindings.has(binding) || operation?.binding !== binding || snapshot.pendingKey !== binding.key) return;
      if (result.kind === "rejected") {
        operation = undefined;
        publish({ state: "idle", message: result.message });
      } else if (result.kind === "saved") {
        publish({ state: "saved", message: "Cambio guardado. Consultá el catálogo (solo lectura)." });
      } else {
        publish({ state: "unknown", message: unknownMessage });
      }
    },
  };
}
export type CatalogFormGate = ReturnType<typeof createCatalogFormGate>;
