"use client";
import { useRef, useState, type FormEvent } from "react";
import type { FirstBusiness, DraftStorefront } from "./onboarding/owner-onboarding";
import { sendOwnerMutation, suggestedSlug } from "./catalog/catalog-editor";

const input = "mt-1 min-h-11 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2";
export default function FirstStore({ business: initialBusiness = null, storefront = null }: { business?: FirstBusiness | null; storefront?: DraftStorefront | null }) {
  const [business, setBusiness] = useState(initialBusiness);
  const [ready, setReady] = useState(Boolean(storefront));
  const [slug, setSlug] = useState(suggestedSlug(initialBusiness?.name ?? ""));
  const [pending, setPending] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [message, setMessage] = useState("");
  const lock = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || unknown || ready) return;
    lock.current = true; setPending(true); setMessage("");
    const form = new FormData(event.currentTarget);
    const payload = business ? { action: "create_draft", displayName: form.get("displayName"), slug: form.get("slug") } : { action: "create_business", name: form.get("name") };
    const result = await sendOwnerMutation("/owner/onboarding", payload);
    if (result.kind === "unknown") { setUnknown(true); setMessage("No sabemos si se guardó. No vuelvas a enviarlo: actualizá para consultar el estado."); }
    else if (result.kind === "rejected") setMessage(result.message);
    else if (!business) {
      const created = result.data.business as FirstBusiness;
      setBusiness(created); setSlug(suggestedSlug(created.name));
    } else { setReady(true); setMessage((result.data.storefront as DraftStorefront).is_published ? "Tu vidriera ya estaba publicada. Continuá con el catálogo." : "Vidriera lista, todavía sin publicar."); }
    setPending(false); lock.current = false;
  }
  return <section className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--cream)] p-5" aria-labelledby="setup-title">
    <h2 id="setup-title" className="text-lg font-extrabold">{ready ? "Continuá con tu catálogo" : business ? "Configurá tu vidriera" : "Creá tu primer negocio"}</h2>
    <p className="mt-2 text-sm leading-6">Usamos tu primer negocio (por fecha de creación e identificador). La vidriera comienza sin publicar.</p>
    <noscript>Para guardar la configuración necesitás JavaScript. Tus datos todavía no se enviaron.</noscript>
    {!ready && <form key={business?.id ?? "new"} method="post" action="/owner/onboarding" onSubmit={submit} className="mt-4 grid gap-4">
      <fieldset disabled={pending || unknown} className="grid min-w-0 gap-4">
        {business ? <>
          <p className="text-sm">Negocio: {business.name}. Si antes se interrumpió la configuración, continuás acá sin crear otro.</p>
          <label>Nombre visible<input className={input} name="displayName" maxLength={120} defaultValue={business.name} required /></label>
          <label>Dirección de la tienda<input className={input} name="slug" maxLength={63} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={slug} onChange={e => setSlug(e.target.value)} required /></label>
          <p className="break-all text-sm text-[var(--muted)]">/store/{slug || "tu-direccion"} · minúsculas, números y guiones. Podés editar la sugerencia.</p>
        </> : <label>Nombre del negocio<input className={input} name="name" maxLength={120} required /></label>}
        <button id="first-store-submit" className="min-h-11 rounded-lg bg-[var(--lime)] px-4 py-2 font-extrabold disabled:opacity-50" type="submit">{pending ? "Guardando…" : business ? "Crear vidriera sin publicar" : "Crear negocio"}</button>
      </fieldset>
    </form>}
    {message && <p className="mt-3 text-sm" role="status">{message}</p>}
    {unknown && <a className="mt-3 inline-block underline" href="/owner">Actualizar estado (solo lectura)</a>}
    {ready && <a className="mt-3 inline-block font-extrabold underline" href="/owner/catalog">Configurar catálogo</a>}
  </section>;
}
