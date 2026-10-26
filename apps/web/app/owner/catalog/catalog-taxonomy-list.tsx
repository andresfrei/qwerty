import { ResourceListLayout } from "../../components/resource-list-layout";
import { CatalogLink } from "./catalog-form-navigation";
import { CatalogProductReadLink } from "./catalog-product-filters";
import { CatalogListSearch } from "./catalog-list-search";
import { catalogHref, type CatalogQuery } from "./catalog-navigation";
import { CatalogCategoryTable } from "./catalog-taxonomy-table";
import type { CatalogTaxonomyPage } from "./catalog-page-data";
type Ready = Extract<CatalogTaxonomyPage, { kind: "ready" }>;
export const catalogListCreate = "inline-flex min-h-11 shrink-0 self-end items-center rounded-lg bg-[var(--lime)] px-4 py-2 text-sm font-extrabold text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--olive)] lg:self-auto";
export function CatalogListFooter({ resource, businessId, query, total, page, hasMore }: { resource: "categories" | "options"; businessId: string; query: CatalogQuery; total: number; page: number; hasMore: boolean }) {
  const label = resource === "categories" ? "categorías" : "opciones";
  return <div className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
    <p>{total} {label} · Página {page + 1}</p><nav aria-label={`Páginas de ${label}`} className="flex flex-wrap gap-4 font-extrabold underline">
      {query.page > 0 && <CatalogProductReadLink href={catalogHref(resource, { ...query, page: query.page - 1 })} businessId={businessId}>Anterior</CatalogProductReadLink>}
      {hasMore && <CatalogProductReadLink href={catalogHref(resource, { ...query, page: query.page + 1 })} businessId={businessId}>Siguiente</CatalogProductReadLink>}
    </nav>
  </div>;
}
export function CatalogCategoryListView({ result, readKey }: { result: Ready; readKey: string }) {
  const { owner, request, data } = result;
  if (request.resource !== "categories" || data.kind !== "list") throw Error("invalid_category_list");
  const query = { ...request.query, businessId: owner.business.id }, businessId = owner.business.id;
  return <ResourceListLayout titleId="taxonomy-title" title="Categorías" context={`Catálogo · ${owner.business.name}`}
    toolbar={<div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <CatalogListSearch scopeKey={JSON.stringify([owner.account.id, businessId, readKey])} businessId={businessId} query={query} />
      <CatalogLink href={catalogHref("categories", query, { mode: "new" })} className={catalogListCreate}>Nueva categoría</CatalogLink>
    </div>} footer={<CatalogListFooter resource="categories" businessId={businessId} query={query} {...data.pagination} />}>
    <CatalogCategoryTable businessId={businessId} total={data.pagination.total} page={data.pagination.page}
      rows={data.rows.map(row => ({ id: row.id, name: row.name, sortOrder: row.sort_order, href: catalogHref("categories", query, { mode: "detail", id: row.id }) }))} />
  </ResourceListLayout>;
}
