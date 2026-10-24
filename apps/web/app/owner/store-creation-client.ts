import type { StoreCreationInput, StoreCreationResponse, CreationStorefront } from "./stores/store-creation-contract";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const keys = (value: Record<string, unknown>, expected: string[]) => Object.keys(value).sort().join(",") === [...expected].sort().join(",");
const name = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= 120;
const slug = (value: unknown): value is string => typeof value === "string" && value.length <= 63 && slugPattern.test(value);
export function validStorefront(value: unknown): value is CreationStorefront {
  return record(value) && keys(value, ["slug", "display_name", "is_published"]) && slug(value.slug) && name(value.display_name) && typeof value.is_published === "boolean";
}
function validInput(value: unknown): value is StoreCreationInput {
  return record(value) && keys(value, ["businessId", "name", "slug"]) && typeof value.businessId === "string" && uuid.test(value.businessId) && typeof value.name === "string" && value.name.length <= 120 && typeof value.slug === "string" && value.slug.length <= 63;
}
type CreationStateResponse = Exclude<StoreCreationResponse, { error: string }>;
export type CreationReply = CreationStateResponse | { state: "error"; error: string };
/** Strict status, shape and original-reference correlation; annotations are not validation. */
export function parseCreationReply(status: number, value: unknown, businessId: string): CreationReply | null {
  if (!record(value)) return null;
  if (value.state === "outcome_unknown" && status === 503 && keys(value,["state","businessId"]) && value.businessId === businessId) return { state: "outcome_unknown", businessId };
  if ((value.state === "ready" && [200,201].includes(status)) || (value.state === "partial" && status === 409)) {
    if (value.businessId !== businessId || !record(value.business) || !keys(value.business,["id","name"]) || value.business.id !== businessId || !uuid.test(businessId) || !name(value.business.name)) return null;
    if (value.state === "ready" && keys(value,["state","businessId","business","storefront"]) && validStorefront(value.storefront)) return value as CreationStateResponse;
    if (value.state === "partial" && keys(value,["state","businessId","business","reason"]) && ["slug_unavailable","draft_rejected","storefront_missing"].includes(String(value.reason))) return value as CreationStateResponse;
    return null;
  }
  const errors: Record<number, string[]> = { 400:["invalid_request"], 401:["unauthorized"], 403:["request_rejected"], 405:["method_not_allowed"], 503:["unavailable"] };
  return keys(value,["error"]) && typeof value.error === "string" && errors[status]?.includes(value.error) ? { state: "error", error: value.error } : null;
}
const messages: Record<string, string> = {
  slug_unavailable: "La dirección no está disponible. Elegí otra para esta misma tienda.",
  draft_rejected: "La tienda está creada; falta completar su dirección.",
  storefront_missing: "La tienda está creada; falta completar su dirección.",
  invalid_request: "Revisá el nombre y la dirección de la tienda.",
  request_rejected: "No pudimos autorizar la solicitud. Conservamos los datos.",
  unauthorized: "Volvé a iniciar sesión con tu cuenta confirmada. Conservamos los datos.",
  unavailable: "No pudimos consultar el servicio. Conservamos los datos.",
  method_not_allowed: "No pudimos enviar la solicitud. Conservamos los datos.",
};
const unknownMessage = "No pudimos confirmar el resultado. Conservamos los datos; comprobá el estado antes de continuar.";
export type CreationSnapshot = {
  restored: boolean; storageOK: boolean; pending: "create" | "recover" | null;
  phase: "editable" | "partial" | "unknown" | "ready";
  input: StoreCreationInput; message: string; canonical?: Extract<StoreCreationResponse, { state: "ready" }>;
};
type StoragePort = Pick<Storage, "getItem" | "setItem">;
type CreationOptions = {
  accountId: string; storage: StoragePort; fetcher: typeof fetch; newId: () => string;
  isCurrent: () => boolean; onChange: (state: CreationSnapshot) => void;
  onReady?: (businessId: string) => void;
};
/** One mounted account/tab intent. No retries, global manager or credential storage. */
export class StoreCreationSession {
  private busy = false;
  private key: string;
  private state: CreationSnapshot = { restored:false, storageOK:false, pending:null, phase:"editable", input:{businessId:"",name:"",slug:""}, message:"" };
  constructor(private options: CreationOptions) { this.key = `qwerty:store-creation:v1:${options.accountId}`; }
  snapshot() { return this.state; }
  private change(update: Partial<CreationSnapshot>) {
    if (!this.options.isCurrent()) return;
    this.state = { ...this.state, ...update }; this.options.onChange(this.state);
  }
  private persist(state: CreationSnapshot) {
    this.options.storage.setItem(this.key, JSON.stringify({ version:1, accountId:this.options.accountId, input:state.input, phase:state.phase, canonical:state.canonical }));
  }
  restore() {
    try {
      const raw = this.options.storage.getItem(this.key);
      if (raw && raw !== "null") {
        const stored: unknown = JSON.parse(raw);
        if (!record(stored) || stored.version !== 1 || stored.accountId !== this.options.accountId || !validInput(stored.input) || !["editable","partial","unknown","ready"].includes(String(stored.phase))) throw Error("invalid storage");
        // Only a strictly validated canonical result can restore a final state.
        const canonical = stored.phase === "ready" ? parseCreationReply(200, stored.canonical, stored.input.businessId) : null;
        if (stored.phase === "ready" && canonical?.state !== "ready") throw Error("invalid ready");
        // Editable is persisted only after a recognized definite no-write POST reply.
        // The pre-POST marker, lost responses and partial snapshots still restore GET-only.
        const phase = canonical?.state === "ready" ? "ready" : stored.phase === "editable" ? "editable" : "unknown";
        this.change({ input:stored.input, phase, canonical:canonical?.state === "ready" ? canonical : undefined, message:phase === "ready" ? "Tienda lista." : phase === "editable" ? "Conservamos los datos. Podés corregirlos y enviar esta misma tienda." : unknownMessage });
      }
      this.change({restored:true,storageOK:true});
    } catch { this.change({restored:true,storageOK:false,message:"No pudimos recuperar los datos de esta pestaña. No se enviará ninguna creación."}); }
  }
  startNewIntent() {
    if (this.busy || !this.options.isCurrent() || this.state.phase !== "ready") return;
    try {
      // A deliberate, settled-only reset. Failed cleanup never unlocks creation.
      this.options.storage.setItem(this.key, "null");
      this.change({ phase:"editable", input:{businessId:"",name:"",slug:""}, canonical:undefined, storageOK:true, message:"" });
    } catch { this.change({message:"La tienda está lista, pero no pudimos preparar otra creación. Conservamos su referencia."}); }
  }
  edit(field: "name" | "slug", value: string) {
    if (!this.state.restored || this.busy || ["unknown","ready"].includes(this.state.phase) || (field === "name" && this.state.phase === "partial")) return;
    this.change({input:{...this.state.input,[field]:value}});
  }
  async submit() {
    if (this.busy || !this.options.isCurrent() || !this.state.restored || !this.state.storageOK || ["unknown","ready"].includes(this.state.phase)) return;
    this.busy = true;
    try {
      let input = this.state.input;
      if (!name(input.name) || !slug(input.slug)) { this.change({message:messages.invalid_request}); return; }
      if (!input.businessId) input = {...input,businessId:this.options.newId().toLowerCase()};
      if (!uuid.test(input.businessId)) throw Error("invalid reference");
      // Persist unknown BEFORE the first await: a refresh must never enable blind replay.
      const previousPhase = this.state.phase === "partial" ? "partial" : "editable";
      const next = {...this.state,input,phase:"unknown" as const};
      this.change({input}); this.persist(next);
      this.change({phase:"unknown",pending:"create",message:""});
      await this.request("POST",input,previousPhase);
    } catch { this.change({storageOK:false,pending:null,message:"No pudimos conservar los datos. No se enviará ninguna creación."}); }
    finally { this.busy = false; }
  }
  async recover() {
    if (this.busy || !this.options.isCurrent() || !this.state.restored || !this.state.input.businessId) return;
    this.busy = true; this.change({pending:"recover",message:""});
    try { await this.request("GET",this.state.input); } finally { this.busy = false; }
  }
  private async request(method: "GET" | "POST", input: StoreCreationInput, previousPhase: "editable" | "partial" = "editable") {
    let result: CreationReply | null = null;
    try {
      const response = await this.options.fetcher(method === "GET" ? `/owner/stores/create?businessId=${encodeURIComponent(input.businessId)}` : "/owner/stores/create", {
        method, credentials:"same-origin", cache:"no-store", redirect:"error",
        ...(method === "POST" ? {headers:{"Content-Type":"application/json"},body:JSON.stringify(input)} : {}),
      });
      if (/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") ?? "")) result = parseCreationReply(response.status, await response.json(), input.businessId);
    } catch { /* A committed write may have lost its response. */ }
    if (!this.options.isCurrent()) return;
    if (result?.state === "ready") {
      this.change({phase:"ready",pending:null,input:{businessId:input.businessId,name:result.business.name,slug:result.storefront.slug},canonical:result,message:result.storefront.is_published ? "Tu tienda ya está publicada." : "Tienda lista, todavía sin publicar."});
    } else if (result?.state === "partial") {
      this.change({phase:"partial",pending:null,input:{...input,name:result.business.name},message:messages[result.reason]});
    } else if (result?.state === "error" && method === "POST") {
      // This POST began from a known state; a GET error never settles prior uncertainty.
      this.change({phase:previousPhase,pending:null,message:messages[result.error]});
    } else {
      this.change({phase:"unknown",pending:null,message:result?.state === "error" ? `${messages[result.error]} ${unknownMessage}` : unknownMessage});
    }
    try { this.persist(this.state); }
    catch { this.change({storageOK:false,message:`${this.state.message} No pudimos actualizar el respaldo de esta pestaña.`}); }
    if (result?.state === "ready" && method === "POST" && this.options.isCurrent()) this.options.onReady?.(input.businessId);
  }
}
