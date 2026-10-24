"use client";
import { useEffect, useRef, useState } from "react";
import { AsyncActionButton } from "@/app/components/async-action-button";
import { sendOwnerMutation } from "./catalog/catalog-editor";
import { ownerHref } from "./owner-context";

export type StorePublicationProps = { businessId: string; accountId: string; isPublished: boolean };
/** Mount keyed by authorized business.id. Saved/unknown never replays a mutation. */
export default function StorePublication({ businessId, accountId, isPublished }: StorePublicationProps) {
  const scope = `${accountId}:${businessId}`;
  const current = useRef(scope); current.current = scope;
  const alive = useRef(false);
  const guard = useRef(false);
  const [hydrated, setHydrated] = useState(false);
  const [state, setState] = useState<"idle" | "pending" | "saved" | "unknown">("idle");
  const [message, setMessage] = useState("");
  useEffect(() => { alive.current = true; setHydrated(true); return () => { alive.current = false; }; }, []);
  async function publish() {
    if (guard.current || !hydrated || state !== "idle" || !alive.current) return;
    guard.current = true; setState("pending"); setMessage("");
    const result = await sendOwnerMutation("/owner/catalog/actions", {action:"set_published",isPublished:!isPublished}, fetch, businessId);
    if (!alive.current || current.current !== scope) return;
    if (result.kind === "saved") { setState("saved"); setMessage("Cambio guardado. Actualizá para consultar la publicación."); }
    else if (result.kind === "unknown") { setState("unknown"); setMessage("No pudimos confirmar el cambio. No lo repitas: actualizá para consultar el estado."); }
    else { setState("idle"); setMessage(result.message); }
    guard.current = false;
  }
  return <section className="mt-6 rounded-xl border border-[var(--line)] p-4" aria-label="Publicación de la tienda">
    <noscript>Para cambiar la publicación necesitás JavaScript. Podés seguir consultando el estado actual.</noscript>
    <fieldset id="publication-fields" disabled={!hydrated || state !== "idle"}>
      <AsyncActionButton id="publication-submit" type="button" className="min-h-11 rounded-lg bg-[var(--lime)] px-4 py-2 font-extrabold disabled:opacity-50" pending={state === "pending"} locked={!hydrated || state !== "idle"} pendingLabel={isPublished ? "Dejando de publicar…" : "Publicando tienda…"} onClick={()=>void publish()}>{isPublished ? "Dejar de publicar" : "Publicar tienda"}</AsyncActionButton>
    </fieldset>
    {message && <p role="status" className="mt-3 text-sm">{message}</p>}
    {(state === "saved" || state === "unknown") && <a className="mt-3 block font-extrabold underline" href={ownerHref("store",businessId)}>Actualizar estado (solo lectura)</a>}
  </section>;
}
