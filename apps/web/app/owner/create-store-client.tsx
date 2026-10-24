"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { AsyncActionButton } from "@/app/components/async-action-button";
import { ownerHref } from "./owner-context";
import { StoreCreationSession, type CreationSnapshot } from "./store-creation-client";

export type CreateStoreProps = { accountId: string; contextBusinessId?: string; firstStore?: boolean };
const inputClass = "mt-1 min-h-11 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2";
export default function CreateStore({ accountId, contextBusinessId, firstStore = false }: CreateStoreProps) {
  const scope = `${accountId}:${contextBusinessId ?? "new"}`;
  const currentScope = useRef(scope); currentScope.current = scope;
  const session = useRef<StoreCreationSession | null>(null);
  const [state, setState] = useState<CreationSnapshot | null>(null);
  const [restoredScope, setRestoredScope] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const isCurrent = () => alive && currentScope.current === scope;
    // Accessing sessionStorage itself can throw; retain a non-writing form in that case.
    try {
      const next = new StoreCreationSession({ accountId, storage:window.sessionStorage, fetcher:fetch, newId:()=>crypto.randomUUID(), isCurrent,
        onChange:value=>{ if (isCurrent()) setState(value); },
        onReady:id=>{ if (isCurrent()) window.location.assign(ownerHref("home",id)); },
      });
      session.current = next; next.restore(); setRestoredScope(scope);
    } catch {
      setState({restored:true,storageOK:false,pending:null,phase:"editable",input:{businessId:"",name:"",slug:""},message:"Leé o copiá tus datos: no pudimos acceder al respaldo de esta pestaña. No se enviará ninguna creación."});
      setRestoredScope(scope);
    }
    return () => { alive = false; session.current = null; };
  }, [accountId, scope]);
  const restored = restoredScope === scope && Boolean(state?.restored);
  const phase = state?.phase ?? "editable";
  const locked = !restored || Boolean(state?.pending) || phase === "unknown" || phase === "ready";
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (restored) void session.current?.submit();
  }
  return <section className="rounded-2xl border border-[var(--line)] bg-white p-5 sm:p-8" aria-labelledby="create-store-title">
    <h1 id="create-store-title" className="text-3xl font-extrabold tracking-[-0.06em]">{firstStore ? "Creá tu primera tienda" : "Creá una tienda"}</h1>
    <p className="mt-3 text-sm leading-6">Tu tienda empieza sin publicar. El nombre y la dirección se conservan en esta pestaña antes de enviar.</p>
    <noscript>Para crear una tienda necesitás JavaScript. El botón permanece deshabilitado y no se envía ningún dato.</noscript>
    <form id="create-store-form" className="mt-6 grid gap-4" onSubmit={submit}>
      <fieldset id="create-store-fields" className="grid min-w-0 gap-4" disabled={locked}>
        <label>Nombre de la tienda<input id="create-store-name" className={inputClass} value={restored ? state?.input.name ?? "" : ""} onChange={event=>session.current?.edit("name",event.target.value)} readOnly={phase === "partial"} maxLength={120} required /></label>
        <label>Dirección de la tienda<input id="create-store-slug" className={inputClass} value={restored ? state?.input.slug ?? "" : ""} onChange={event=>session.current?.edit("slug",event.target.value)} maxLength={63} pattern="[a-z0-9]+(-[a-z0-9]+)*" required /></label>
        <p className="break-all text-sm text-[var(--muted)]">/store/{restored && state?.input.slug ? state.input.slug : "tu-direccion"} · minúsculas, números y guiones.</p>
        <AsyncActionButton id="create-store-submit" type="submit" className="min-h-11 rounded-lg bg-[var(--lime)] px-4 py-3 font-extrabold disabled:opacity-50" pending={state?.pending === "create"} locked={locked || !state?.storageOK} pendingLabel="Creando tienda…">{phase === "partial" ? "Completar esta tienda" : "Crear tienda sin publicar"}</AsyncActionButton>
      </fieldset>
    </form>
    {restored && state?.message && <p className="mt-4 text-sm leading-6" role="status">{state.message}</p>}
    {restored && state?.input.businessId && phase !== "ready" && <AsyncActionButton id="create-store-recover" type="button" className="mt-4 min-h-11 rounded-lg border border-[var(--line)] px-4 py-2 font-extrabold" pending={state.pending === "recover"} locked={Boolean(state.pending)} pendingLabel="Comprobando estado…" onClick={()=>void session.current?.recover()}>Comprobar estado</AsyncActionButton>}
    {restored && state?.canonical && <>
      <a id="created-store-link" className="mt-4 block font-extrabold underline" href={ownerHref("home",state.canonical.businessId)}>Ir a {state.canonical.business.name}</a>
      <button id="create-another-intent" type="button" className="mt-4 min-h-11 rounded-lg border border-[var(--line)] px-4 py-2 font-extrabold" onClick={()=>session.current?.startNewIntent()}>Preparar otra tienda</button>
    </>}
  </section>;
}
