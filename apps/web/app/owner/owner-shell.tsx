import type { ReactNode } from "react";
import { catalogHref, catalogStoreHref, type CatalogQuery, type CatalogView } from "./catalog/catalog-navigation";
import { CatalogSectionNav } from "./catalog/catalog-navigation-view";
import { ownerHref, type OwnerBusiness } from "./owner-context";

export type OwnerModule = "home" | "orders" | "catalog" | "store";
export type OwnerAccountContext = { id: string };
export type OwnerPagination = { page: number; hasMore: boolean };
export type OwnerShellProps = {
  ownedBusinesses: readonly OwnerBusiness[];
  selectedBusiness: OwnerBusiness | null;
  activeModule: OwnerModule;
  account: OwnerAccountContext;
  pagination: OwnerPagination;
  children?: ReactNode;
  catalogContext?: { view: CatalogView; query: CatalogQuery };
};
const link = "block min-h-11 rounded-lg px-3 py-3 text-sm font-extrabold hover:bg-[var(--soft-lime)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--olive)]";
const modules: readonly [OwnerModule, string][] = [["home", "Inicio"], ["orders", "Pedidos"], ["catalog", "Catálogo"], ["store", "Tienda"]];

/** Presentation only: the request's server data, never this list, authorizes selection. */
export function OwnerShell({ ownedBusinesses, selectedBusiness, activeModule, pagination, children, catalogContext }: OwnerShellProps) {
  const catalog = activeModule === "catalog" && selectedBusiness && catalogContext
    && catalogContext.query.businessId === selectedBusiness.id ? catalogContext : undefined;
  const currentHref = ownerHref(activeModule, selectedBusiness?.id);
  // ownerHref above validates selection before constructing this fixed local route.
  const createHref = selectedBusiness ? `/owner/stores/new?businessId=${encodeURIComponent(selectedBusiness.id.toLowerCase())}` : "/owner/stores/new";
  const pageHref = (page: number) => catalog
    ? catalogHref(catalog.view.resource, { ...catalog.query, storePage: page }, catalog.view)
    : `${currentHref}${currentHref.includes("?") ? "&" : "?"}storePage=${page}`;
  return <div className="min-h-screen bg-[var(--cream)] text-[var(--ink)] lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
    <aside className="min-w-0 border-b border-[var(--line)] p-5 lg:min-h-screen lg:border-r lg:border-b-0 lg:p-6">
      <a href="/owner" className="text-2xl font-extrabold tracking-[-0.08em]">qwerty</a>
      <details className="relative mt-6 rounded-xl border border-[var(--line)] bg-white">
        <summary className={`${link} cursor-pointer break-words`} aria-label={`Seleccionar tienda: ${selectedBusiness?.name ?? "Tus tiendas"}`}>{selectedBusiness?.name ?? "Tus tiendas"}</summary>
        <div className="max-h-80 overflow-y-auto border-t border-[var(--line)] p-2">
          <ul aria-label="Tus tiendas">{ownedBusinesses.map(business => <li key={business.id}>
            <a className={link} href={catalog ? catalogStoreHref(catalog.view.resource, business.id) : ownerHref(activeModule, business.id)} aria-current={business.id === selectedBusiness?.id ? "true" : undefined}>
              {business.name}{business.id === selectedBusiness?.id && <><span aria-hidden="true"> ✓</span><span className="sr-only"> Seleccionada</span></>}
            </a>
          </li>)}</ul>
          {ownedBusinesses.length === 0 && <p className="p-3 text-sm">No hay tiendas en esta página.</p>}
          <nav className="flex flex-wrap gap-2" aria-label="Páginas de tiendas">
            {pagination.page > 0 && <a className={link} href={pageHref(pagination.page - 1)}>Anteriores</a>}
            {pagination.hasMore && pagination.page < 1000000 && <a className={link} href={pageHref(pagination.page + 1)}>Más tiendas</a>}
          </nav>
          {pagination.hasMore && pagination.page === 1000000 && <p className="p-3 text-sm">Hay más tiendas; se alcanzó el límite de consulta.</p>}
        </div>
        <div className="border-t border-[var(--line)] p-2">
          <a className={`${link} text-[var(--olive)]`} href={createHref}>+ Crear tienda</a>
        </div>
      </details>
      <nav aria-label="Menú principal" className="mt-6 grid grid-cols-2 gap-1 lg:grid-cols-1">{modules.map(([module, label]) =>
        <a key={module} className={`${link} ${module === activeModule ? "bg-[var(--lime)]" : ""}`} href={ownerHref(module, selectedBusiness?.id)} aria-current={module === activeModule ? "page" : undefined}>{label}</a>
      )}</nav>
      <form action="/auth/logout" method="post" className="mt-6"><button className={`${link} w-full border border-[var(--line)] text-left`} type="submit">Cerrar sesión</button></form>
    </aside>
    <main className="min-w-0 px-5 py-8 sm:px-8 lg:p-12"><div className="mx-auto max-w-4xl">
      {catalog && <CatalogSectionNav section={catalog.view.resource === "groups" ? "items" : catalog.view.resource} query={catalog.query} />}
      {children}
    </div></main>
  </div>;
}
