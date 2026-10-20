'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { requestOrder, type OrderIntent, type OrderResponse } from "@/app/lib/pickup-order-client";
import { clearSubmittedCartState, readAttemptState, saveAttempt, type AttemptReference } from "@/app/lib/pickup-attempt";
import type { CheckoutCatalogRead } from "@/app/lib/checkout-catalog-reader";
import type { GroupSelection } from "@/app/lib/catalog-selection";
import { CHECKOUT_RECEIPT_MAX_BYTES, uploadCheckoutReceipt, type ReceiptUploadResult } from "@/app/lib/checkout-receipt";
import { cartStorageKey, inspectCart, submitCheckout, updateQuantity, updateSelection, validateContact, type Contact, type ContactErrors } from "@/app/lib/checkout-draft";
import { cartTotalsByCurrency, createCart, formatMoney, normalizePersistedCart, persistCart, type CartState } from "@/app/lib/storefront";

const control = "rounded-lg border border-[var(--line)] bg-white px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--olive)]";
const action = `${control} min-h-11 text-sm font-bold disabled:opacity-50`;
const contactFields = [
  { key: "name", label: "Nombre", type: "text", autoComplete: "name", maxLength: 120 },
  { key: "email", label: "Correo", type: "email", autoComplete: "email", maxLength: 254 },
  { key: "telephone", label: "Teléfono de contacto", type: "tel", autoComplete: "tel", maxLength: 50 },
] as const;

export default function CheckoutClient({ catalog }: { catalog: Extract<CheckoutCatalogRead, { status: "ok" }> }) {
  const businessId = catalog.storefront.business_id;
  const data = useMemo(() => ({ items: catalog.categories.flatMap(({ items }) => items), groups: catalog.groups, options: catalog.options, surchargeMinor: catalog.surchargeMinor }), [catalog]);
  const [cart, setCart] = useState<CartState>(() => createCart(businessId));
  const [hydrated, setHydrated] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [contact, setContact] = useState<Contact>({ name: "", email: "", telephone: "" });
  const [errors, setErrors] = useState<ContactErrors>({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"idle" | "invalid" | "ready" | "error">("idle");
  const inflight = useRef(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [receiptResult, setReceiptResult] = useState<{ status: "idle" } | ReceiptUploadResult>({ status: "idle" });
  const receiptInflight = useRef(false);
  const orderInflight = useRef(false);
  const sent = useRef(false);
  const submitted = useRef<{ intent: OrderIntent; snapshot: string } | null>(null);
  const [attempt, setAttempt] = useState<AttemptReference | null>(null);
  const [orderResult, setOrderResult] = useState<OrderResponse | null>(null);
  const [orderBusy, setOrderBusy] = useState(false);
  const [referenceError, setReferenceError] = useState(false);
  const [cleanupError, setCleanupError] = useState(false);
  const [referenceStateError, setReferenceStateError] = useState(false);
  const frozen = sent.current || (attempt !== null && !attempt.correction);
  const scope = useRef(`${businessId}:${catalog.storefront.slug}`);
  const generation = useRef(0);

  useEffect(() => {
    const nextScope = `${businessId}:${catalog.storefront.slug}`;
    if (scope.current !== nextScope) {
      generation.current++;
      scope.current = nextScope;
      sent.current = false; submitted.current = null;
      setAttempt(null); setOrderResult(null); setOrderBusy(false); setReferenceError(false); setCleanupError(false); setReferenceStateError(false);
      setContact({ name: "", email: "", telephone: "" }); setErrors({});
      setStatus("idle"); setReceiptFile(null); setReceiptResult({ status: "idle" });
    }
    try {
      const saved = normalizePersistedCart(JSON.parse(localStorage.getItem(cartStorageKey(businessId)) ?? "null"), businessId);
      setCart(inspectCart(saved, data).cart);
      const pending = readAttemptState(() => localStorage, catalog.storefront.slug).reference;
      if (pending && pending.businessId === businessId) {
        setAttempt(pending); sent.current = !pending.correction;
        if (pending.correction) setOrderResult({ status: "correctable", code: pending.correction });
      }
    } catch {
      setStorageError(true);
    }
    setHydrated(true);
  }, [businessId, data, catalog.storefront.slug]);

  useEffect(() => {
    if (hydrated && cart.businessId === businessId && !persistCart((key, value) => localStorage.setItem(key, value), cartStorageKey(businessId), cart)) setStorageError(true);
  }, [businessId, cart, hydrated]);

  const inspection = inspectCart(cart, data);
  const totals = cartTotalsByCurrency(inspection.cart);

  function changeCart(next: CartState) {
    if (sent.current || orderInflight.current) return;
    submitted.current = null;
    setCart(next);
    setStatus("idle");
  }

  function pick(key: string, selections: GroupSelection[]) {
    changeCart(updateSelection(cart, key, selections, data));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sent.current || orderInflight.current || inflight.current || receiptInflight.current || !hydrated || status === "ready") return;
    setErrors(validateContact(contact));
    if (Object.keys(validateContact(contact)).length || !inspection.valid) {
      setStatus("invalid");
      return;
    }
    inflight.current = true;
    setBusy(true);
    const token = generation.current;
    try {
      const next = await submitCheckout(catalog.storefront.slug, contact, cart, data);
      if (generation.current !== token) return;
      setStatus(next);
      if (next === "ready" && receiptResult.status === "session") setReceiptResult({ status: "idle" });
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }

  async function handleReceiptUpload() {
    if (sent.current || orderInflight.current || receiptInflight.current || inflight.current || status !== "ready" || !receiptFile || receiptResult.status === "staged") return;
    receiptInflight.current = true;
    setReceiptBusy(true);
    setReceiptResult({ status: "idle" });
    const token = generation.current;
    try {
      const result = await uploadCheckoutReceipt(catalog.storefront.slug, receiptFile);
      if (generation.current !== token) return;
      setReceiptResult(result);
      if (result.status === "session") setStatus("idle");
    } finally {
      receiptInflight.current = false;
      setReceiptBusy(false);
    }
  }

  async function confirmOrder() {
    if (sent.current || orderInflight.current || inflight.current || receiptInflight.current || status !== "ready" || receiptResult.status !== "staged" || !hydrated || !inspection.valid || Object.keys(validateContact(contact)).length || Object.keys(totals).length !== 1) return;
    const requestId = attempt?.requestId ?? crypto.randomUUID();
    const reference = { businessId, slug: catalog.storefront.slug, requestId, receiptId: receiptResult.receiptId };
    // Acquisition itself can throw, before saveAttempt's write guard runs.
    try {
      if (!saveAttempt(localStorage, reference)) { setReferenceError(true); return; }
    } catch { setReferenceError(true); return; }
    setReferenceError(false); setReferenceStateError(false);
    const currency = Object.keys(totals)[0];
    const intent: OrderIntent = { requestId, receiptId: receiptResult.receiptId, contact: { name: contact.name.trim(), email: contact.email.trim(), telephone: contact.telephone.trim() }, expected: { currency, totalMinor: totals[currency] }, lines: cart.items.map(line => ({ itemId: line.id, quantity: line.quantity, selection: line.selection })) };
    submitted.current = { intent, snapshot: JSON.stringify({ version: 2, ...cart }) };
    sent.current = true; setAttempt(reference);
    await resolveOrder(reference, intent);
  }

  async function resolveOrder(reference: AttemptReference, intent?: OrderIntent) {
    if (orderInflight.current) return;
    orderInflight.current = true; setOrderBusy(true);
    const token = generation.current;
    const snapshot = submitted.current;
    try {
      const result = await requestOrder(intent ? { kind: "submit", slug: reference.slug, intent } : { kind: "recover", ...reference, intent: snapshot?.intent });
      if (generation.current !== token) return;
      setOrderResult(result);
      if (result.status === "correctable") {
        const editable = { ...reference, correction: result.code };
        setAttempt(editable); sent.current = false;
        try { if (!saveAttempt(localStorage, editable)) setReferenceStateError(true); } catch { setReferenceStateError(true); }
      }
      if (result.status === "confirmed") {
        const { correction: _correction, ...confirmed } = reference;
        setAttempt(confirmed); sent.current = true;
        // A recovery of an older winner may show it, but editing invalidated
        // its local snapshot. Only this exact, still-current submission clears.
        if (snapshot && submitted.current === snapshot) {
          const cleanup = clearSubmittedCartState(() => localStorage, businessId, snapshot.snapshot);
          if (cleanup === "cleared") setCart(createCart(businessId));
          if (cleanup === "unavailable") setCleanupError(true);
        }
        if (reference.correction) {
          try { if (!saveAttempt(localStorage, confirmed)) setReferenceStateError(true); } catch { setReferenceStateError(true); }
        }
      }
    } finally { orderInflight.current = false; if (generation.current === token) setOrderBusy(false); }
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
      <header className="mb-8">
        <a className="text-sm font-bold underline" href={`/store/${catalog.storefront.slug}`}>Volver a la carta</a>
        <p className="mt-7 text-xs font-extrabold uppercase tracking-wider text-[var(--olive)]">{catalog.storefront.display_name}</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.06em] sm:text-5xl">Continuar compra</h1>
        <p className="mt-4 max-w-xl text-sm leading-6 text-[var(--muted)]">Revisá tus productos y completá tus datos de contacto. El registro es opcional y se ofrecerá más adelante.</p>
      </header>
      <form noValidate onSubmit={handleSubmit} className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <fieldset disabled={busy || orderBusy || frozen} className="min-w-0 space-y-4">
          <legend className="mb-4 text-xl font-extrabold">Tu carrito</legend>
          {!hydrated ? <p>Cargando carrito…</p> : cart.items.length === 0 ? <p>No hay productos en tu carrito. Volvé a la carta para agregar productos.</p> : null}
          {inspection.rows.map(({ line, request, price, valid, changed, description }) => (
            <section key={line.key} className="min-w-0 rounded-xl border border-[var(--line)] bg-white p-5" aria-label={line.name}>
              <h2 className="text-lg font-extrabold">{line.name}</h2>
              {description && <p className="mt-1 break-words text-sm text-[var(--muted)]">{description}</p>}
              <p className="mt-2 text-sm">{valid ? `${formatMoney(line.unitPriceMinor, line.currency)} por unidad` : "Importe pendiente de revisión"}</p>
              {!valid && <p role="alert" className="mt-3 rounded-lg bg-[var(--transfer-bg)] p-3 text-sm text-[var(--transfer-text)]">{!request ? "Este producto ya no está disponible. Quitalo para continuar." : changed ? "El precio o la moneda cambió. Revisá y aceptá el importe actualizado." : "Las opciones están incompletas o cambiaron. Revisá tus elecciones; no se puede continuar así."}</p>}
              {request?.groups.map((group) => {
                const selected = line.selection.find((entry) => entry.groupId === group.id)?.picks ?? [];
                const options = request.options.filter((option) => option.group_id === group.id);
                return (
                  <fieldset key={group.id} className="mt-5 space-y-2">
                    <legend className="text-sm font-bold">{group.name} · {group.min_select === group.max_select ? `Elegí ${group.max_select}` : `Elegí de ${group.min_select} a ${group.max_select}`}</legend>
                    {options.map((option) => {
                      const quantity = selected.find((entry) => entry.optionId === option.id)?.quantity ?? 0;
                      const id = `${line.key}-${option.id}`;
                      function choose(amount: number) {
                        const picks = selected.filter((entry) => entry.optionId !== option.id);
                        if (amount > 0) picks.push({ optionId: option.id, quantity: amount });
                        pick(line.key, [...line.selection.filter((entry) => entry.groupId !== group.id), { groupId: group.id, picks }]);
                      }
                      return (
                        <div key={option.id} className="flex items-center justify-between gap-3 text-sm">
                          <label htmlFor={id} className="min-w-0 break-words">{option.name} {option.price_delta_minor > 0 ? `(+${formatMoney(option.price_delta_minor, line.currency)})` : ""}</label>
                          {group.selection_mode === "distinct" ? (
                            <input id={id} type="checkbox" checked={quantity > 0} onChange={(event) => choose(event.target.checked ? 1 : 0)} className="size-5 shrink-0 accent-[var(--olive)]" />
                          ) : (
                            <input id={id} type="number" min={0} max={group.max_select} step={1} value={quantity} onChange={(event) => choose(Number(event.target.value))} className={`${control} w-20 shrink-0`} />
                          )}
                        </div>
                      );
                    })}
                    {selected.some((entry) => !options.some((option) => option.id === entry.optionId)) && <button className={action} type="button" onClick={() => pick(line.key, line.selection.map((entry) => entry.groupId === group.id ? { ...entry, picks: entry.picks.filter((p) => options.some((o) => o.id === p.optionId)) } : entry))}>Quitar opciones no disponibles</button>}
                  </fieldset>
                );
              })}
              {request && line.selection.some((entry) => !request.groups.some((group) => group.id === entry.groupId)) && <button className={`${action} mt-3`} type="button" onClick={() => pick(line.key, line.selection.filter((entry) => request.groups.some((group) => group.id === entry.groupId)))}>Quitar grupos que ya no existen</button>}
              {changed && price?.ok && <button className={`${action} mt-3`} type="button" onClick={() => pick(line.key, line.selection)}>Aceptar {formatMoney(price.unitPriceMinor, request?.item ? data.items.find((item) => item.id === line.id)?.currency ?? line.currency : line.currency)} por unidad</button>}
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <label className="text-sm font-bold" htmlFor={`units-${line.key}`}>Unidades</label>
                <input id={`units-${line.key}`} type="number" min={1} max={99} step={1} value={line.quantity} className={`${control} w-20`} onChange={(event) => changeCart(updateQuantity(cart, line.key, Math.max(1, Number(event.target.value))))} />
                <button className={`${action} ml-auto`} type="button" onClick={() => changeCart({ ...cart, items: cart.items.filter((entry) => entry.key !== line.key) })}>Quitar producto</button>
              </div>
            </section>
          ))}
        </fieldset>
        <section className="min-w-0 rounded-xl border border-[var(--line)] bg-white p-5" aria-labelledby="contact-title">
          <h2 id="contact-title" className="text-xl font-extrabold">Datos de contacto</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">El teléfono y el correo son solo de contacto, no están verificados ni permiten acceder a cuentas o compras anteriores.</p>
          <fieldset disabled={busy || orderBusy || frozen} className="mt-5 space-y-4">
            <legend className="sr-only">Completá todos los campos</legend>
            {contactFields.map(({ key, label, ...input }) => (
              <div key={key}>
                <label className="mb-2 block text-sm font-bold" htmlFor={`contact-${key}`}>{label} (obligatorio)</label>
                <input {...input} id={`contact-${key}`} name={key} required value={contact[key]} aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `error-${key}` : undefined} onChange={(event) => { if (sent.current || orderInflight.current) return; submitted.current = null; setContact({ ...contact, [key]: event.target.value }); setStatus("idle"); }} className={`${control} w-full min-w-0`} />
                {errors[key] && <p id={`error-${key}`} className="mt-2 text-sm text-[var(--transfer-text)]">{errors[key]}</p>}
              </div>
            ))}
          </fieldset>
          <div className="mt-6 border-t border-[var(--line)] pt-4 text-sm font-bold">
            {inspection.valid ? Object.entries(totals).map(([currency, total]) => <p key={currency}>Total orientativo: {formatMoney(total, currency)}</p>) : <p>Completá y revisá el carrito para ver el total.</p>}
            <p className="mt-2 text-xs font-normal leading-5">Los importes incluyen las opciones y el recargo configurado por dos sabores ({formatMoney(data.surchargeMinor, data.items[0]?.currency ?? "ARS")}). El servidor volverá a verificarlos al enviar un pedido.</p>
          </div>
          <button disabled={frozen || orderBusy || busy || receiptBusy || !hydrated || !inspection.valid || status === "ready"} className="mt-5 min-h-12 w-full rounded-lg bg-[var(--lime)] px-4 py-3 text-sm font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--olive)] disabled:opacity-50" type="submit">{busy ? "Preparando…" : status === "ready" ? "Sesión preparada" : "Continuar como invitado"}</button>
          <div aria-live="polite" aria-atomic="true" className="mt-4 text-sm leading-6">
            {status === "invalid" && <p>Revisá los datos de contacto y las opciones del carrito.</p>}
            {status === "error" && <p>No pudimos preparar la sesión. Tus datos y el carrito siguen acá; podés reintentar.</p>}
            {status === "ready" && orderResult?.status !== "confirmed" && <p>La sesión está preparada. Podés adjuntar el comprobante privado y después confirmar la compra.</p>}
            {storageError && <p>No pudimos guardar el carrito en este navegador. Conservamos los cambios mientras permanezcas en esta página.</p>}
          </div>
          <section className="mt-6 border-t border-[var(--line)] pt-5" aria-labelledby="receipt-title" aria-busy={receiptBusy}>
            <h3 id="receipt-title" className="text-lg font-extrabold">Comprobante privado</h3>
            <p id="receipt-help" className="mt-3 text-sm leading-6 text-[var(--muted)]">JPEG, PNG, WebP estático o PDF, hasta 10 MiB. Conservamos el archivo original, sin comprimirlo. Adjuntarlo no confirma el pago.</p>
            <label htmlFor="receipt-file" className="mb-2 mt-4 block text-sm font-bold">Archivo del comprobante</label>
            <input id="receipt-file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={frozen || orderBusy || busy || receiptBusy || status !== "ready"} aria-describedby="receipt-help receipt-status" className="block w-full min-w-0 max-w-full text-sm file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-[var(--soft-lime)] file:px-3 file:py-2 file:font-bold file:text-[var(--olive)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--olive)] disabled:opacity-50" onChange={(event) => {
              if (sent.current || orderInflight.current || receiptInflight.current) return;
              submitted.current = null;
              const file = event.currentTarget.files?.[0] ?? null;
              setReceiptFile(file);
              setReceiptResult(file && file.size > CHECKOUT_RECEIPT_MAX_BYTES ? { status: "too_large" } : { status: "idle" });
            }} />
            {receiptFile && <p id="receipt-selected-file" className="mt-2 break-all text-xs leading-5 text-[var(--muted)]">{receiptFile.name}</p>}
            <button id="receipt-upload" type="button" disabled={frozen || orderBusy || busy || receiptBusy || status !== "ready" || !receiptFile || receiptFile.size === 0 || receiptFile.size > CHECKOUT_RECEIPT_MAX_BYTES || receiptResult.status === "staged"} className={`${action} mt-4 w-full`} onClick={handleReceiptUpload}>{receiptBusy ? "Adjuntando…" : receiptResult.status === "staged" ? "Comprobante adjuntado" : receiptResult.status === "idle" ? "Adjuntar comprobante" : "Volver a intentar"}</button>
            <div id="receipt-status" aria-live="polite" aria-atomic="true" className="mt-3 text-sm leading-6">
              {status !== "ready" && receiptResult.status !== "session" && <p>Primero completá tus datos y prepará la sesión para adjuntar el archivo.</p>}
              {receiptResult.status === "too_large" && <p>El archivo supera los 10 MiB. Elegí uno más pequeño; tus datos y el carrito siguen acá.</p>}
              {receiptResult.status === "error" && <p>No pudimos confirmar la carga. El archivo, tus datos y el carrito siguen acá; podés volver a intentar.</p>}
              {receiptResult.status === "session" && <p>Necesitamos preparar la sesión de nuevo. Tus datos, el carrito y el archivo siguen acá.</p>}
              {receiptResult.status === "staged" && <p>Comprobante adjuntado. El pago todavía no está confirmado. <a id="receipt-original" href={`/api/checkout/receipts/${receiptResult.receiptId}?slug=${encodeURIComponent(catalog.storefront.slug)}`} download rel="noreferrer" className="font-bold underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--olive)]">Descargar original</a></p>}
            </div>
          </section>
          <section className="mt-6 border-t border-[var(--line)] pt-5" aria-label="Confirmación del pedido" aria-busy={orderBusy}>
            {Object.keys(totals).length > 1 && <p role="alert" className="text-sm">Separá las compras por moneda. No convertimos importes; tu carrito se conserva.</p>}
            <button id="order-confirm" type="button" className={`${action} mt-3 w-full bg-[var(--lime)]`} disabled={frozen || orderBusy || status !== "ready" || receiptResult.status !== "staged" || !inspection.valid || Object.keys(totals).length !== 1} onClick={confirmOrder}>Confirmar compra</button>
            <div aria-live="polite" className="mt-3 space-y-3 break-words text-sm leading-6">
              {referenceError && <p>No pudimos guardar una referencia segura. No enviamos el pedido; conservamos tus datos.</p>}
              {referenceStateError && <p>No pudimos guardar el estado de la referencia. Conservá esta página; al recargar podría requerir consultar el mismo intento.</p>}
              {cleanupError && <p>No pudimos limpiar el carrito local. El pedido está confirmado; no vuelvas a enviarlo.</p>}
              {attempt?.correction && orderResult?.status !== "confirmed" && <p>El servidor indicó una corrección necesaria ({attempt.correction}). Revisá precio, opciones o contacto, prepará la sesión si hace falta y confirmá con la misma referencia. También podés consultar si ya existe un pedido.</p>}
              {orderBusy && <p>Consultando el pedido…</p>}
              {!attempt && <p>Todavía no se envió ningún pedido.</p>}
              {attempt && orderResult?.status !== "confirmed" && <><p>{orderResult?.status === "session" ? "La sesión original es necesaria. No crearemos otra ni recuperaremos por correo." : attempt.correction ? "Conservamos el carrito y los datos para corregir este mismo intento; una consulta sin resultado no autoriza crear otra referencia." : orderResult?.status === "rejected" ? "El servidor rechazó el envío sin permitir correcciones seguras. Conservamos la referencia; consultá el mismo intento." : "El resultado aún no está confirmado. No vuelvas a enviar ni reemplaces el comprobante; consultá la misma referencia."}</p><button id="order-recover" type="button" className={action} disabled={orderBusy} onClick={() => { if (attempt) void resolveOrder(attempt); }}>Consultar intento</button><a className="block underline" href={`/store/${catalog.storefront.slug}/orders/recover`}>Recuperar desde este navegador</a></>}
              {orderResult?.status === "confirmed" && <><p>Pedido recibido. Estado del pedido: pendiente de pago. Pago: pendiente de verificación; el comprobante no confirma fondos.</p><a id="order-tracking" className="font-bold underline" href={`/store/${catalog.storefront.slug}/orders/${orderResult.order.id}`}>Ver seguimiento privado</a></>}
            </div>
          </section>
        </section>
      </form>
    </main>
  );
}
