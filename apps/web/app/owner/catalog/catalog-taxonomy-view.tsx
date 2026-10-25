import { Field } from "./catalog-editor-client";
import { moneyText } from "./catalog-editor";
import { CatalogFormFrame, CatalogScopedForm } from "./catalog-form-scope";
import { CatalogInspectionLink, CatalogLink } from "./catalog-form-navigation";
import { catalogHref } from "./catalog-navigation";
import type { CatalogTaxonomyPage, CategorySummary } from "./catalog-page-data";
import { CatalogProductReadLink } from "./catalog-product-filters";
import { CatalogCategorySearch } from "./catalog-taxonomy-controls";

type Ready = Extract<CatalogTaxonomyPage, { kind: "ready" }>;
const card = "grid min-w-0 gap-4 rounded-2xl border border-[var(--line)] bg-white p-5 sm:p-6";

export function CatalogCategorySummary({ category }: { category: CategorySummary }) {
  return <div className="grid gap-2 text-sm">
    <strong className="break-words text-lg">{category.name}</strong>
    <p>Orden {category.sort_order}</p>
  </div>;
}

function SettingsSummary({ data }: { data: Extract<Ready["data"], { kind: "settings" }> }) {
  return <div className={card}>
    {data.storefront ? <>
      <p className="break-words font-extrabold">{data.storefront.display_name}</p>
      <p>{data.storefront.is_published ? "Publicada" : "Sin publicar"}</p>
    </> : <p>La tienda todavía no tiene vidriera configurada.</p>}
    <p className="text-sm">Recargo fijo por dos gustos: {moneyText(data.surchargeMinor)} (unidad mayor de la moneda del producto).</p>
  </div>;
}

/** Only implemented resource leaves are accepted; contextual Groups/Options are a later slice. */
export function CatalogTaxonomyView({ result, readKey }: { result: Ready; readKey: string }) {
  const { owner, request, data } = result;
  if (request.resource !== "categories" && request.resource !== "settings") throw Error("unsupported_taxonomy_view");
  const query = { ...request.query, businessId: owner.business.id };
  const listHref = catalogHref(request.resource, query);
  const page = { accountId: owner.account.id, businessId: owner.business.id, readKey };
  const title = data.kind === "settings" ? "Ajustes del catálogo"
    : data.kind === "detail" ? data.record.name : data.kind === "new" ? "Nueva categoría" : "Categorías";
  return <section className="mx-auto mt-14 grid max-w-3xl gap-6" aria-labelledby="taxonomy-title">
    <header>
      <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--olive)]">Catálogo · {owner.business.name}</p>
      <h1 id="taxonomy-title" className="mt-3 text-4xl font-[750] tracking-[-0.07em]">{title}</h1>
    </header>
    {data.kind === "list" ? <>
      <CatalogLink href={catalogHref("categories", query, { mode: "new" })} className="min-h-11 py-2 font-extrabold underline">Nueva categoría</CatalogLink>
      <CatalogCategorySearch scopeKey={JSON.stringify([page.accountId, page.businessId, readKey])} businessId={page.businessId} query={query} />
      <p className="text-sm">{data.pagination.total} categorías · Página {data.pagination.page + 1}</p>
      {data.rows.length ? <ul className="grid gap-4">{data.rows.map(category => <li key={category.id} className={card}>
        <CatalogCategorySummary category={category} />
        <CatalogProductReadLink href={catalogHref("categories", query, { mode: "detail", id: category.id })} businessId={page.businessId}>Abrir categoría</CatalogProductReadLink>
      </li>)}</ul> : <p>No hay categorías en esta página.</p>}
      <nav aria-label="Páginas de categorías" className="flex flex-wrap gap-4 font-extrabold underline">
        {query.page > 0 && <CatalogProductReadLink href={catalogHref("categories", { ...query, page: query.page - 1 })} businessId={page.businessId}>Anterior</CatalogProductReadLink>}
        {data.pagination.hasMore && <CatalogProductReadLink href={catalogHref("categories", { ...query, page: query.page + 1 })} businessId={page.businessId}>Siguiente</CatalogProductReadLink>}
      </nav>
    </> : <>
      {data.kind !== "settings" && <CatalogProductReadLink href={listHref} businessId={page.businessId}>Volver a categorías</CatalogProductReadLink>}
      <CatalogInspectionLink href={listHref} businessId={page.businessId}>Consultar catálogo</CatalogInspectionLink>
      <CatalogFormFrame page={page}
        readOnly={data.kind === "settings" ? <SettingsSummary data={data} />
          : data.kind === "detail" ? <div className={card}><CatalogCategorySummary category={data.record} /></div>
          : <p>Nueva categoría · Consulta en modo solo lectura. No repitas el envío.</p>}
        editable={data.kind === "settings" ? <>
          <SettingsSummary data={data} />
          {data.storefront && <CatalogScopedForm title="Publicación" identity={{ action: "set_published", target: { kind: "singleton", id: page.businessId } }}
            pendingLabel={data.storefront.is_published ? "Dejando de publicar…" : "Publicando tienda…"}
            save={data.storefront.is_published ? "Dejar de publicar" : "Publicar tienda"}>
            <input type="hidden" name="isPublished" value={String(!data.storefront.is_published)} />
          </CatalogScopedForm>}
          <CatalogScopedForm title="Recargo fijo por dos gustos" identity={{ action: "set_two_flavor_surcharge", target: { kind: "singleton", id: page.businessId } }} pendingLabel="Guardando recargo…">
            <Field name="twoFlavorSurchargeMinor" label="Recargo (unidad mayor de la moneda del producto)" value={moneyText(data.surchargeMinor)} money />
          </CatalogScopedForm>
        </> : data.kind === "detail" ? <>
          <div className={card}><CatalogCategorySummary category={data.record} /></div>
          <CatalogScopedForm title={`Nombre: ${data.record.name}`} identity={{ action: "rename_category", target: { kind: "record", id: data.record.id } }} pendingLabel="Guardando categoría…">
            <input type="hidden" name="categoryId" value={data.record.id} />
            <Field name="name" label="Nombre de la categoría" value={data.record.name} />
          </CatalogScopedForm>
          <CatalogScopedForm title={`Orden: ${data.record.name}`} identity={{ action: "reorder_category", target: { kind: "record", id: data.record.id } }} pendingLabel="Guardando orden…">
            <input type="hidden" name="categoryId" value={data.record.id} />
            <Field name="sortOrder" label="Orden" value={data.record.sort_order} numeric />
          </CatalogScopedForm>
        </> : <CatalogScopedForm title="Nueva categoría" identity={{ action: "create_category", target: { kind: "parent", id: page.businessId } }} pendingLabel="Creando categoría…" save="Crear categoría">
          <Field name="name" label="Nombre de la categoría" />
          <Field name="sortOrder" label="Orden" value={0} numeric />
        </CatalogScopedForm>} />
    </>}
  </section>;
}
