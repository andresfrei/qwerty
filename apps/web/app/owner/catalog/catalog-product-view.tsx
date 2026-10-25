import { formatMoney } from "@/app/lib/storefront";
import { CatalogProductForm } from "./catalog-product-form";
import { CatalogProductFilters, CatalogProductReadLink } from "./catalog-product-filters";
import type { CatalogItemPage, CatalogItemSummary } from "./catalog-item-page-data";
import { catalogHref } from "./catalog-navigation";
import { CatalogInspectionLink, CatalogLink } from "./catalog-form-navigation";
import { CatalogFormFrame } from "./catalog-form-scope";
import { PhotoEditor } from "./photo-editor-client";
import { CatalogProfileEditor } from "./catalog-profile-editor-client";

type Ready = Extract<CatalogItemPage, { kind: "ready" }>;
const card = "grid min-w-0 gap-4 rounded-2xl border border-[var(--line)] bg-white p-5 sm:p-6";

export function CatalogProductSummary({ item }: { item: CatalogItemSummary }) {
  return <div className="grid gap-2 text-sm">
    <strong className="break-words text-lg">{item.name}</strong>
    <p>Categoría: {item.category.name}</p>
    <p>Precio base de referencia: {formatMoney(item.price_minor, item.currency)}</p>
    <p className="text-xs text-[var(--muted)]">Perfil: {item.profile.kind}. El precio final depende de la configuración y selección.</p>
    <p>{item.is_available ? "Disponible" : "No disponible"} · Orden {item.sort_order}</p>
    {item.description && <p className="break-words">{item.description}</p>}
  </div>;
}

/** Catalog presentation only; no auth fallback, catalog snapshot or generic CRUD engine. */
export function CatalogProductView({ result, readKey }: { result: Ready; readKey: string }) {
  const { owner, request, data } = result;
  const query = { ...request.query, businessId: owner.business.id };
  const listHref = catalogHref("items", query);
  const page = { accountId: owner.account.id, businessId: owner.business.id, readKey };
  return <section className="mx-auto mt-14 grid max-w-3xl gap-6" aria-labelledby="products-title">
    <header>
      <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--olive)]">Catálogo · {owner.business.name}</p>
      <h1 id="products-title" className="mt-3 text-4xl font-[750] tracking-[-0.07em]">{data.kind === "detail" ? data.record.name : "Productos"}</h1>
    </header>
    {data.kind === "list" ? <>
      <CatalogLink href={catalogHref("items", query, { mode: "new" })} className="min-h-11 py-2 font-extrabold underline">Nuevo producto</CatalogLink>
      <CatalogProductFilters scopeKey={JSON.stringify([page.accountId, page.businessId, readKey, "list"])}
        businessId={owner.business.id} query={query} category={data.parents.category ?? null} />
      <p className="text-sm">{data.pagination.total} productos · Página {data.pagination.page + 1}</p>
      {data.rows.length ? <ul className="grid gap-4">{data.rows.map(item => <li key={item.id} className={card}>
        <CatalogProductSummary item={item} />
        <CatalogProductReadLink href={catalogHref("items", query, { mode: "detail", id: item.id })} businessId={owner.business.id}>Abrir producto</CatalogProductReadLink>
      </li>)}</ul> : <p>No hay productos en esta página.</p>}
      <nav aria-label="Páginas de productos" className="flex flex-wrap gap-4 font-extrabold underline">
        {query.page > 0 && <CatalogProductReadLink href={catalogHref("items", { ...query, page: query.page - 1 })} businessId={owner.business.id}>Anterior</CatalogProductReadLink>}
        {data.pagination.hasMore && <CatalogProductReadLink href={catalogHref("items", { ...query, page: query.page + 1 })} businessId={owner.business.id}>Siguiente</CatalogProductReadLink>}
      </nav>
    </> : data.kind === "detail" ? <>
      <CatalogProductReadLink href={listHref} businessId={owner.business.id}>Volver a productos</CatalogProductReadLink>
      <CatalogInspectionLink href={listHref} businessId={owner.business.id}>Consultar catálogo</CatalogInspectionLink>
      <CatalogFormFrame page={page} readOnly={<div className={card}><CatalogProductSummary item={data.record} /></div>}
        editable={<>
          <div className={card}><CatalogProductSummary item={data.record} /></div>
          <CatalogProductForm scopeKey={JSON.stringify([page.accountId, page.businessId, readKey, data.record.id])}
            businessId={owner.business.id} category={data.record.category} item={data.record} />
          <CatalogProfileEditor key={`${owner.account.id}:${owner.business.id}:${data.record.id}`}
            scope={{ accountId: owner.account.id, businessId: owner.business.id, itemId: data.record.id }} pagedComponents />
          <div className={card}><h2 className="text-lg font-extrabold">Foto del producto</h2>
            <PhotoEditor key={`${owner.business.id}:${data.record.id}`} businessId={owner.business.id}
              itemId={data.record.id} itemName={data.record.name} photoPath={data.record.photo_path} photoVersion={String(data.record.photo_version)} />
          </div>
        </>} />
    </> : <>
      <CatalogProductReadLink href={listHref} businessId={owner.business.id}>Volver a productos</CatalogProductReadLink>
      <CatalogInspectionLink href={listHref} businessId={owner.business.id}>Consultar catálogo</CatalogInspectionLink>
      <CatalogFormFrame page={page} readOnly={<p>Nuevo producto · Consulta en modo solo lectura. No repitas el envío.</p>}
        editable={<CatalogProductForm scopeKey={JSON.stringify([page.accountId, page.businessId, readKey, "new"])}
          businessId={owner.business.id} category={data.parents.category ?? null} />} />
    </>}
  </section>;
}
