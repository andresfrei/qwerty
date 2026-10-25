'use client';

import { useEffect, useRef, useState } from "react";
import { AsyncActionButton } from "@/app/components/async-action-button";
import { requestOrder, type OrderResponse } from "@/app/lib/pickup-order-client";
import { formatMoney } from "@/app/lib/storefront";
import { ownerHref } from "../owner-context";

export default function OrderQueueClient({ businessId }: { businessId: string }) {
  const [result, setResult] = useState<OrderResponse | null>(null);
  const [busy, setBusy] = useState(true);
  const generation = useRef(0);
  const active = useRef(false);
  useEffect(() => {
    const token = ++generation.current;
    setResult(null); setBusy(true);
    void requestOrder({ kind: "queue", businessId }).then(next => { if (generation.current === token) { setResult(next); setBusy(false); } });
    return () => { generation.current++; };
  }, [businessId]);
  async function refresh() {
    if (active.current) return;
    active.current = true; setBusy(true); setResult(null);
    const token = generation.current;
    try {
      const next = await requestOrder({ kind: "queue", businessId });
      if (generation.current === token) setResult(next);
    } finally { active.current = false; if (generation.current === token) setBusy(false); }
  }
  return <section className="mx-auto max-w-3xl">
    <a href={ownerHref("catalog", businessId)} className="text-sm font-bold underline">Volver al catálogo</a>
    <h1 className="mt-7 text-3xl font-extrabold tracking-tight">Pedidos de la tienda</h1>
    <p className="mt-4 max-w-xl text-sm leading-6 text-[var(--muted)]">Consulta de los últimos 100 pedidos visibles, más recientes primero. No es un historial completo. Los estados del pedido y del pago son independientes; esta cola es de solo lectura.</p>
    <AsyncActionButton id="queue-refresh" type="button" pending={busy} pendingLabel="Actualizando pedidos…" onClick={refresh} disabled={busy} className="mt-5 min-h-11 rounded-lg border border-[var(--line)] bg-[var(--lime)] px-4 py-2 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--olive)] disabled:opacity-50">Actualizar pedidos</AsyncActionButton>
    <section className="mt-6 space-y-5" aria-live="polite" aria-busy={busy}>
      {busy && <p>Cargando pedidos…</p>}
      {result?.status === "session" && <p>Necesitás una sesión autorizada. No iniciamos sesión automáticamente.</p>}
      {result?.status === "forbidden" && <p>Se requiere acceso de dueño confirmado.</p>}
      {result && !["queue", "session", "forbidden"].includes(result.status) && <p>No pudimos consultar los pedidos. No mostramos datos anteriores; intentá de nuevo más tarde.</p>}
      {result?.status === "queue" && (result.orders.length === 0 ? <p>No hay pedidos visibles. Esto no confirma que el negocio exista o te pertenezca.</p> : result.orders.map(order => <article key={order.id} className="min-w-0 space-y-3 break-words rounded-xl border border-[var(--line)] bg-white p-5">
        <h2 className="break-all text-sm font-extrabold">Pedido {order.id}</h2><p className="text-xs">{order.createdAt}</p>
        <p>Pedido: pendiente de pago</p><p>Pago: pendiente de verificación. El comprobante no confirma fondos.</p>
        <p>{order.contact.name} · {order.contact.email} · {order.contact.telephone}</p>
        {"version" in order && order.version === 2 ? <ul className="space-y-3">{order.lines.map(line => <li key={JSON.stringify(line)} aria-label="Composición aceptada" className="min-w-0 break-words">
          <p className="font-bold">{line.quantity} × {line.name}</p>
          {line.groups.map(group => <p key={group.groupId} className="text-sm">{group.name}: {group.picks.map(pick => `${pick.quantity} × ${pick.name}`).join(" + ")}</p>)}
          {line.components.map(component => <section key={`${component.componentId}:${component.instanceIndex}`} data-component-instance={`${component.componentId}:${component.instanceIndex}`} className="mt-2 border-l-2 border-[var(--line)] pl-3">
            <h3 className="text-sm font-bold">{component.name} · Unidad {component.instanceIndex + 1}</h3>
            {component.groups.map(group => <p key={group.groupId} className="text-sm">{group.name}: {group.picks.map(pick => `${pick.quantity} × ${pick.name}`).join(" + ")}</p>)}
          </section>)}
          <p>{formatMoney(line.lineTotalMinor, order.currency)}</p>
        </li>)}</ul> : <ul className="space-y-2">{order.lines.map(line => <li key={JSON.stringify(line)}>{line.quantity} × {line.name}<p className="text-sm">{line.selectionText}</p><p>{formatMoney(line.lineTotalMinor, order.currency)}</p></li>)}</ul>}
        <p className="font-bold">Total: {formatMoney(order.totalMinor, order.currency)}</p>
      </article>))}
    </section>
  </section>;
}
