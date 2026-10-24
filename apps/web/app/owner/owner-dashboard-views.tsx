import { redirect } from "next/navigation";
import { ownerHref, type OwnerBusiness } from "./owner-context";
import { OwnerShell, type OwnerModule } from "./owner-shell";
import type { OwnerDashboardData } from "./owner-dashboard-data";
import type { CreationStorefront } from "./stores/store-creation-contract";
import CreateStore from "./create-store-client";
import StorePublication from "./store-publication-client";
import FirstStore from "./first-store-client";

type StoreProps = { business: OwnerBusiness; storefront: CreationStorefront | null };
const card = "rounded-2xl border border-[var(--line)] bg-white p-5 sm:p-8";
export function OwnerHomeView({ business, storefront }: StoreProps) {
  return <section className={card}>
    <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--olive)]">Inicio</p>
    <h1 className="mt-3 break-words text-3xl font-extrabold tracking-[-0.06em]">{business.name}</h1>
    <p className="mt-4 text-sm">{storefront?.is_published ? "Publicada" : "Sin publicar"}{!storefront && " · falta configurar la dirección de tu tienda."}</p>
    <div className="mt-6 grid gap-3 sm:grid-cols-3">
      <a className="min-h-11 rounded-lg bg-[var(--lime)] px-4 py-3 font-extrabold" href={ownerHref("orders",business.id)}>Consultar pedidos</a>
      <a className="min-h-11 rounded-lg border border-[var(--line)] px-4 py-3 font-extrabold" href={ownerHref("catalog",business.id)}>Editar catálogo</a>
      <a className="min-h-11 rounded-lg border border-[var(--line)] px-4 py-3 font-extrabold" href={ownerHref("store",business.id)}>Ver tienda</a>
    </div>
  </section>;
}
export function StoreDetails({ business, storefront }: StoreProps) {
  return <section className={card}>
    <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--olive)]">Tienda</p>
    <h1 className="mt-3 break-words text-3xl font-extrabold tracking-[-0.06em]">{business.name}</h1>
    <dl className="mt-6 grid gap-4 text-sm">
      <div><dt className="font-extrabold">Nombre</dt><dd>{business.name}</dd></div>
      {storefront && <div><dt className="font-extrabold">Dirección</dt><dd className="break-all">/store/{storefront.slug}</dd></div>}
      <div><dt className="font-extrabold">Publicación</dt><dd>{storefront?.is_published ? "Publicada" : "Sin publicar"}</dd></div>
    </dl>
    {storefront?.is_published ? <a className="mt-6 block break-all font-extrabold underline" href={`/store/${storefront.slug}`}>Ver tienda para hacer pedidos</a> : <p className="mt-6 text-sm leading-6">Tu tienda todavía no está publicada. El enlace para compradores estará disponible cuando la publiques.</p>}
    {!storefront && <p className="mt-4 text-sm leading-6">Falta completar la dirección de esta tienda. No crees otra para reemplazarla. Completá la configuración de esta misma tienda abajo.</p>}
  </section>;
}

/** Server renderer shared by request-local dynamic pages. */
export function OwnerDashboardView({ data, module = "home", create = false }: { data: OwnerDashboardData; module?: OwnerModule; create?: boolean }) {
  if (data.kind === "redirect") redirect(data.href);
  if (data.kind === "invalid" || data.kind === "missing" || data.kind === "unavailable") {
    const messages = { invalid:"La selección de tienda no es válida.", missing:"No encontramos esa tienda en tu cuenta.", unavailable:"No pudimos consultar tus tiendas. Actualizá antes de continuar." };
    return <main className="mx-auto max-w-3xl px-5 py-12"><h1 className="text-3xl font-extrabold">Tus tiendas</h1><p className="mt-4" role="alert">{messages[data.kind]}</p><a className="mt-4 block underline" href="/owner">Volver a consultar tus tiendas</a></main>;
  }
  const selected = data.kind === "selected" ? data.business : null;
  const contextKey = `${data.account.id}:${selected?.id ?? "empty"}`;
  return <OwnerShell key={contextKey} ownedBusinesses={data.businesses} selectedBusiness={selected} activeModule={module} account={data.account} pagination={data.pagination}>
    {create || data.kind === "empty" ? <CreateStore key={contextKey} accountId={data.account.id} contextBusinessId={selected?.id} firstStore={data.kind === "empty"} /> : data.kind === "selected" && <>
      {module === "store" ? <><StoreDetails business={data.business} storefront={data.storefront} />{data.storefront ? <StorePublication key={contextKey} businessId={data.business.id} accountId={data.account.id} isPublished={data.storefront.is_published} /> : <FirstStore key={contextKey} business={data.business} />}</> : <OwnerHomeView business={data.business} storefront={data.storefront} />}
    </>}
  </OwnerShell>;
}
