import { formatMoney } from "@/app/lib/storefront";
import { Available, Field } from "./catalog-editor-client";
import { moneyText } from "./catalog-editor";
import type { CatalogItemPage, CatalogItemSummary } from "./catalog-item-page-data";
import { catalogHref } from "./catalog-navigation";
import { CatalogInspectionLink, CatalogLink } from "./catalog-form-navigation";
import { CatalogFormFrame, CatalogScopedForm } from "./catalog-form-scope";
import { PhotoEditor } from "./photo-editor-client";

type Ready = Extract<CatalogItemPage, { kind: "ready" }>;
const card = "grid min-w-0 gap-4 rounded-2xl border border-[var(--line)] bg-white p-5 sm:p-6";
const input = "mt-1 min-h-11 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm";

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
      <form action="/owner/catalog/items" method="get" className={card} aria-label="Buscar productos">
        <input type="hidden" name="businessId" value={owner.business.id} />
        <input type="hidden" name="storePage" value={query.storePage} />
        {query.categoryId && <input type="hidden" name="categoryId" value={query.categoryId} />}
        <label className="text-sm">Buscar productos<input className={input} name="q" defaultValue={query.q} maxLength={100} /></label>
        {data.parents.category && <p className="text-sm">Categoría: {data.parents.category.name}</p>}
        <button className="min-h-11 rounded-lg bg-[var(--lime)] px-4 py-2 font-extrabold" type="submit">Buscar</button>
      </form>
      <p className="text-sm">{data.pagination.total} productos · Página {data.pagination.page + 1}</p>
      {data.rows.length ? <ul className="grid gap-4">{data.rows.map(item => <li key={item.id} className={card}>
        <CatalogProductSummary item={item} />
        <CatalogLink href={catalogHref("items", query, { mode: "detail", id: item.id })} className="min-h-11 py-2 font-extrabold underline">Abrir producto</CatalogLink>
      </li>)}</ul> : <p>No hay productos en esta página.</p>}
      <nav aria-label="Páginas de productos" className="flex flex-wrap gap-4 font-extrabold underline">
        {query.page > 0 && <CatalogLink href={catalogHref("items", { ...query, page: query.page - 1 })}>Anterior</CatalogLink>}
        {data.pagination.hasMore && <CatalogLink href={catalogHref("items", { ...query, page: query.page + 1 })}>Siguiente</CatalogLink>}
      </nav>
    </> : data.kind === "detail" ? <>
      <CatalogLink href={listHref} className="min-h-11 py-2 font-extrabold underline">Volver a productos</CatalogLink>
      <CatalogInspectionLink href={listHref} businessId={owner.business.id}>Consultar catálogo</CatalogInspectionLink>
      <CatalogFormFrame page={page} readOnly={<div className={card}><CatalogProductSummary item={data.record} /></div>}
        editable={<>
          <div className={card}><CatalogProductSummary item={data.record} /></div>
          <CatalogScopedForm identity={{ action: "update_product", target: { kind: "record", id: data.record.id } }}
            title="Editar producto" pendingLabel="Guardando producto…">
            <input type="hidden" name="itemId" value={data.record.id} />
            <input type="hidden" name="categoryId" value={data.record.category_id} />
            <p className="text-sm">Categoría actual: {data.record.category.name}</p>
            <Field name="name" label="Nombre del producto" value={data.record.name} />
            <label className="text-sm">Descripción<textarea className={input} name="description" defaultValue={data.record.description ?? ""} maxLength={2000} /></label>
            <Field name="priceMinor" label="Precio base (unidad mayor, ej. 12,50)" value={moneyText(data.record.price_minor)} money />
            <Field name="currency" label="Moneda ISO (ej. ARS, USD)" value={data.record.currency} />
            <Available value={data.record.is_available} />
            <Field name="sortOrder" label="Orden" value={data.record.sort_order} numeric />
          </CatalogScopedForm>
          <div className={card}><h2 className="text-lg font-extrabold">Foto del producto</h2>
            <PhotoEditor key={`${owner.business.id}:${data.record.id}`} businessId={owner.business.id}
              itemId={data.record.id} itemName={data.record.name} photoPath={data.record.photo_path} photoVersion={String(data.record.photo_version)} />
          </div>
        </>} />
    </> : null}
  </section>;
}
