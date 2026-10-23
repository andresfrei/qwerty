'use client';

import { useEffect, useRef, useState } from "react";
import { AsyncActionButton } from "@/app/components/async-action-button";
import { requestOrder, type OrderResponse } from "@/app/lib/pickup-order-client";
import { readAttemptState, type AttemptReference } from "@/app/lib/pickup-attempt";
import { formatMoney } from "@/app/lib/storefront";

export default function OrderStatusClient({ slug, id }: { slug: string; id?: string }) {
  const [reference, setReference] = useState<AttemptReference | null>(null);
  const [result, setResult] = useState<OrderResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const active = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    const token = ++generation.current;
    setResult(null); setReference(null); setStorageUnavailable(false);
    if (id) {
      setBusy(true);
      void requestOrder({ kind: "known", id }).then(next => { if (generation.current === token) { setResult(next); setBusy(false); } });
    } else {
      setBusy(false);
      const saved = readAttemptState(() => localStorage, slug);
      setStorageUnavailable(saved.unavailable); setReference(saved.reference);
    }
    return () => { generation.current++; };
  }, [slug, id]);
  async function refresh() {
    if (active.current || (!id && !reference)) return;
    active.current = true; setResult(null); setBusy(true);
    const token = generation.current;
    try {
      const next = await requestOrder(id ? { kind: "known", id } : { kind: "recover", ...(reference as AttemptReference) });
      if (generation.current === token) setResult(next);
    } finally { active.current = false; if (generation.current === token) setBusy(false); }
  }
  const order = result?.status === "confirmed" ? result.order : null;
  return <main className="mx-auto min-h-screen max-w-3xl px-5 py-10 sm:px-8">
    <p className="text-xs font-bold uppercase text-[var(--olive)]">Consulta privada</p>
    <h1 className="mt-3 text-3xl font-extrabold tracking-tight">{id ? "Seguimiento del pedido" : "Recuperar un intento"}</h1>
    <p className="mt-4 text-sm leading-6 text-[var(--muted)]">Solo la sesión autorizada por el servidor permite consultar. El correo de contacto y esta dirección no otorgan acceso ni prueban el nombre del negocio.</p>
    <section aria-live="polite" aria-busy={busy} className="mt-6 space-y-4 break-words rounded-xl border border-[var(--line)] bg-white p-5">
      {busy && <p>Consultando pedido…</p>}
      {storageUnavailable && <p>No pudimos acceder al almacenamiento de este navegador. No consultamos pedidos ni creamos otra sesión; conservá tu referencia.</p>}
      {!id && !reference && !storageUnavailable && <p>No hay una referencia válida guardada en este navegador. No buscamos compras por correo ni creamos otra sesión.</p>}
      {result?.status === "session" && <p>Necesitás la sesión original autorizada. No crearemos otra ni recuperaremos por correo.</p>}
      {result?.status === "missing" && <p>No hay un pedido visible para esta sesión.</p>}
      {result && !["confirmed", "session", "missing"].includes(result.status) && <p>No pudimos confirmar el resultado. Conservá la referencia y consultá más tarde; esto no demuestra que el pedido no exista.</p>}
      {order && <><h2 className="text-xl font-bold">Pedido recibido</h2><p className="break-all text-xs">Referencia: {order.id}</p><p>Pedido: pendiente de pago</p><p>Pago: pendiente de verificación. Un comprobante no confirma fondos.</p><p>{order.contact.name} · {order.contact.email} · {order.contact.telephone}</p><ul className="space-y-3">{order.lines.map(line => <li key={JSON.stringify(line)}>{line.quantity} × {line.name}<p className="text-sm">{line.selectionText}</p><p>{formatMoney(line.lineTotalMinor, order.currency)}</p></li>)}</ul><p className="font-bold">Total: {formatMoney(order.totalMinor, order.currency)}</p></>}
    </section>
    <AsyncActionButton id="order-refresh" type="button" pending={busy} pendingLabel="Consultando…" disabled={busy || (!id && !reference)} onClick={refresh} className="mt-5 min-h-11 rounded-lg border border-[var(--line)] bg-[var(--lime)] px-4 py-2 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--olive)] disabled:opacity-50">Consultar estado</AsyncActionButton>
  </main>;
}
