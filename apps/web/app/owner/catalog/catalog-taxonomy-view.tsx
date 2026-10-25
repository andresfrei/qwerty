import { Field } from "./catalog-editor-client";
import { moneyText } from "./catalog-editor";
import { CatalogFormFrame, CatalogScopedForm } from "./catalog-form-scope";
import { CatalogInspectionLink, CatalogLink } from "./catalog-form-navigation";
import { catalogHref } from "./catalog-navigation";
import type { CatalogTaxonomyPage, CategorySummary, GroupSummary, OptionSummary, OptionDirectorySummary, ItemParent } from "./catalog-page-data";
import { CatalogProductReadLink } from "./catalog-product-filters";
import { CatalogCategorySearch, CatalogOptionFilters } from "./catalog-taxonomy-controls";
import { CatalogGroupForm, CatalogOptionForm } from "./catalog-option-forms";
import type { CatalogGroupCreationContext, CatalogOptionCreationContext } from "./catalog-taxonomy-page";

type Ready = Extract<CatalogTaxonomyPage, { kind: "ready" }>;
const card = "grid min-w-0 gap-4 rounded-2xl border border-[var(--line)] bg-white p-5 sm:p-6";

export function CatalogCategorySummary({ category }: { category: CategorySummary }) {
  return <div className="grid gap-2 text-sm">
    <strong className="break-words text-lg">{category.name}</strong>
    <p>Orden {category.sort_order}</p>
  </div>;
}

export function CatalogGroupSummary({ group }: { group: GroupSummary }) {
  return <div className="grid gap-2 text-sm">
    <strong className="break-words text-lg">{group.name}</strong>
    <p>{group.selection_mode === "quantity" ? "Unidades" : "Opciones distintas"} · Mínimo {group.min_select} · Máximo {group.max_select} · Orden {group.sort_order}</p>
  </div>;
}

export function CatalogGroupCreationView({ context, readKey }: { context: CatalogGroupCreationContext; readKey: string }) {
  const { owner, request } = context;
  const page = { accountId: owner.account.id, businessId: owner.business.id, readKey };
  const query = { ...request.query, businessId: page.businessId };
  return <section className="mx-auto mt-14 grid max-w-3xl gap-6">
    <h1 className="text-4xl font-[750] tracking-[-0.07em]">Nuevo grupo · {owner.business.name}</h1>
    <CatalogProductReadLink href={catalogHref("items", { businessId: page.businessId, storePage: query.storePage })} businessId={page.businessId}>Volver a productos</CatalogProductReadLink>
    <CatalogFormFrame page={page} readOnly={<p>Nuevo grupo · Consulta en modo solo lectura. No repitas el envío.</p>}
      editable={<CatalogGroupForm scopeKey={JSON.stringify(page)} businessId={page.businessId} item={null} query={query} />} />
  </section>;
}

function CatalogGroupView({ result, readKey }: { result: Ready; readKey: string }) {
  const { owner, request, data } = result;
  if (data.kind === "settings" || !data.parents.item) throw Error("missing_checked_group_parent");
  const item = data.parents.item;
  const query = { ...request.query, businessId: owner.business.id, itemId: item.id };
  const page = { accountId: owner.account.id, businessId: owner.business.id, readKey };
  const listHref = catalogHref("groups", query);
  const record = data.kind === "detail" ? data.record as GroupSummary : undefined;
  return <section className="mx-auto mt-14 grid max-w-3xl gap-6" aria-labelledby="groups-title">
    <header><p className="text-xs font-extrabold uppercase tracking-wider text-[var(--olive)]">Catálogo · {owner.business.name}</p>
      <h1 id="groups-title" className="mt-3 text-4xl font-[750] tracking-[-0.07em]">{record?.name ?? (data.kind === "new" ? "Nuevo grupo" : "Grupos del producto")}</h1>
      <p className="mt-3 break-words">Producto: {item.name}</p></header>
    <CatalogProductReadLink href={catalogHref("items", { businessId: page.businessId, storePage: query.storePage }, { mode: "detail", id: item.id })} businessId={page.businessId}>Volver al producto</CatalogProductReadLink>
    {data.kind === "list" ? <>
      <CatalogLink href={catalogHref("groups", query, { mode: "new" })} className="min-h-11 py-2 font-extrabold underline">Nuevo grupo</CatalogLink>
      <CatalogCategorySearch scopeKey={JSON.stringify(page)} businessId={page.businessId} query={query} resource="groups" />
      <p className="text-sm">{data.pagination.total} grupos · Página {data.pagination.page + 1}</p>
      {data.rows.length ? <ul className="grid gap-4">{data.rows.map(row => <li key={row.id} className={card}>
        <CatalogGroupSummary group={row as GroupSummary} />
        <CatalogProductReadLink href={catalogHref("groups", query, { mode: "detail", id: row.id })} businessId={page.businessId}>Abrir grupo</CatalogProductReadLink>
      </li>)}</ul> : <p>No hay grupos en esta página.</p>}
      <nav aria-label="Páginas de grupos" className="flex flex-wrap gap-4 font-extrabold underline">
        {query.page > 0 && <CatalogProductReadLink href={catalogHref("groups", { ...query, page: query.page - 1 })} businessId={page.businessId}>Anterior</CatalogProductReadLink>}
        {data.pagination.hasMore && <CatalogProductReadLink href={catalogHref("groups", { ...query, page: query.page + 1 })} businessId={page.businessId}>Siguiente</CatalogProductReadLink>}
      </nav>
    </> : <>
      <CatalogProductReadLink href={listHref} businessId={page.businessId}>Volver a grupos</CatalogProductReadLink>
      {record && <CatalogProductReadLink href={catalogHref("options", { businessId: page.businessId, storePage: query.storePage, itemId: item.id, groupId: record.id })} businessId={page.businessId}>Opciones del grupo</CatalogProductReadLink>}
      <CatalogInspectionLink href={listHref} businessId={page.businessId}>Consultar catálogo</CatalogInspectionLink>
      <CatalogFormFrame page={page} readOnly={record ? <div className={card}><CatalogGroupSummary group={record} /></div> : <p>Nuevo grupo · Solo lectura. No repitas el envío.</p>}
        editable={<CatalogGroupForm scopeKey={JSON.stringify(page)} businessId={page.businessId} item={item} group={record} query={query} />} />
    </>}
  </section>;
}

export function CatalogOptionSummary({ option, item, group }: { option: OptionSummary; item: ItemParent; group: GroupSummary }) {
  return <div className="grid gap-2 text-sm">
    <strong className="break-words text-lg">{option.name}</strong>
    <p className="break-words">Producto: {item.name} · Grupo: {group.name}</p>
    <p>Adicional: {moneyText(option.price_delta_minor)} (unidad mayor) · {option.is_available ? "Disponible" : "No disponible"} · Orden {option.sort_order}</p>
  </div>;
}

export function CatalogOptionCreationView({ context, readKey }: { context: CatalogOptionCreationContext; readKey: string }) {
  const { owner, request, item } = context;
  const page = { accountId: owner.account.id, businessId: owner.business.id, readKey };
  const query = { ...request.query, businessId: page.businessId };
  return <section className="mx-auto mt-14 grid max-w-3xl gap-6">
    <h1 className="text-4xl font-[750] tracking-[-0.07em]">Nueva opción · {owner.business.name}</h1>
    <CatalogProductReadLink href={catalogHref("options", query)} businessId={page.businessId}>Volver a opciones</CatalogProductReadLink>
    <CatalogFormFrame page={page} readOnly={<p>Nueva opción · Solo lectura. No repitas el envío.</p>}
      editable={<CatalogOptionForm scopeKey={JSON.stringify(page)} businessId={page.businessId} item={item} group={null} query={query} />} />
  </section>;
}

function CatalogOptionView({ result, readKey }: { result: Ready; readKey: string }) {
  const { owner, request, data } = result;
  if (data.kind === "settings") throw Error("invalid_option_page");
  const page = { accountId: owner.account.id, businessId: owner.business.id, readKey };
  const query = { ...request.query, businessId: page.businessId };
  const item = data.parents.item ?? null, group = data.parents.group ?? null;
  const record = data.kind === "detail" ? data.record as OptionSummary : undefined;
  if (data.kind !== "list" && (!item || !group)) throw Error("missing_checked_option_parents");
  const listHref = catalogHref("options", query);
  return <section className="mx-auto mt-14 grid max-w-3xl gap-6" aria-labelledby="options-title">
    <header><p className="text-xs font-extrabold uppercase tracking-wider text-[var(--olive)]">Catálogo · {owner.business.name}</p>
      <h1 id="options-title" className="mt-3 text-4xl font-[750] tracking-[-0.07em]">{record?.name ?? (data.kind === "new" ? "Nueva opción" : "Variedades y opciones")}</h1>
      <p className="mt-3 text-sm">Opciones propias de cada producto y grupo; no son una biblioteca compartida.</p></header>
    {data.kind === "list" ? <>
      <CatalogLink href={catalogHref("options", query, { mode: "new" })} className="min-h-11 py-2 font-extrabold underline">Nueva opción</CatalogLink>
      <CatalogFormFrame page={page} readOnly={<p>Filtros en modo solo lectura.</p>}
        editable={<CatalogOptionFilters scopeKey={JSON.stringify(page)} businessId={page.businessId} item={item} group={group} query={query} />} />
      <p className="text-sm">{data.pagination.total} opciones · Página {data.pagination.page + 1}</p>
      {data.rows.length ? <ul className="grid gap-4">{data.rows.map(row => {
        const option = row as OptionDirectorySummary;
        return <li key={option.id} className={card}>
          <CatalogOptionSummary option={option} item={option.item} group={option.group} />
          <CatalogProductReadLink href={catalogHref("options", query, { mode: "detail", id: option.id })} businessId={page.businessId}>Abrir opción</CatalogProductReadLink>
        </li>;
      })}</ul> : <p>No hay opciones en esta página.</p>}
      <nav aria-label="Páginas de opciones" className="flex flex-wrap gap-4 font-extrabold underline">
        {query.page > 0 && <CatalogProductReadLink href={catalogHref("options", { ...query, page: query.page - 1 })} businessId={page.businessId}>Anterior</CatalogProductReadLink>}
        {data.pagination.hasMore && <CatalogProductReadLink href={catalogHref("options", { ...query, page: query.page + 1 })} businessId={page.businessId}>Siguiente</CatalogProductReadLink>}
      </nav>
    </> : <>
      <CatalogProductReadLink href={listHref} businessId={page.businessId}>Volver a opciones</CatalogProductReadLink>
      <CatalogInspectionLink href={listHref} businessId={page.businessId}>Consultar catálogo</CatalogInspectionLink>
      <CatalogFormFrame page={page}
        readOnly={record && item && group ? <CatalogOptionSummary option={record} item={item} group={group} /> : <p>Nueva opción · Solo lectura. No repitas el envío.</p>}
        editable={<>
          {record && item && group && <div className={card}><CatalogOptionSummary option={record} item={item} group={group} /></div>}
          <CatalogOptionForm scopeKey={JSON.stringify(page)} businessId={page.businessId} item={item} group={group} option={record} query={query} />
        </>} />
    </>}
  </section>;
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

/** Presentation dispatch only; the request-local server reader owns authorization. */
export function CatalogTaxonomyView({ result, readKey }: { result: Ready; readKey: string }) {
  const { owner, request, data } = result;
  if (request.resource === "groups") return <CatalogGroupView result={result} readKey={readKey} />;
  if (request.resource === "options") return <CatalogOptionView result={result} readKey={readKey} />;
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
