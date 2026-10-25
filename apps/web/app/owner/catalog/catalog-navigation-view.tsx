import { CatalogLink } from "./catalog-form-navigation";
import {
  CATALOG_SECTIONS, catalogHref, catalogSectionQuery,
  type CatalogQuery, type CatalogSection,
} from "./catalog-navigation";

export function CatalogSectionNav({
  section, businessId, storePage = 0,
}: { section: CatalogSection; businessId?: string; storePage?: number }) {
  return (
    <nav aria-label="Secciones de catálogo" className="mb-6 flex flex-wrap gap-2 border-b border-[var(--line)] pb-4">
      {CATALOG_SECTIONS.map(({ id, label }) => (
        <CatalogLink
          key={id}
          href={catalogHref(id, { businessId, storePage })}
          aria-current={id === section ? "page" : undefined}
          className={`min-h-11 rounded-lg px-3 py-3 text-sm font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--olive)] ${id === section ? "bg-[var(--lime)]" : "bg-white hover:bg-[var(--soft-lime)]"}`}
        >
          {label}
        </CatalogLink>
      ))}
    </nav>
  );
}

export function CatalogBreadcrumbs({
  section, query, title,
}: { section: CatalogSection; query: CatalogQuery; title?: string }) {
  const selected = CATALOG_SECTIONS.find(value => value.id === section);
  if (!selected) throw new Error("invalid_catalog_section");
  const label = selected.label;
  const scope = { businessId: query.businessId, storePage: query.storePage };
  return (
    <nav aria-label="Ruta de navegación" className="mb-4 text-sm text-[var(--muted)]">
      <ol className="flex flex-wrap items-center gap-2">
        <li><CatalogLink className="underline" href={catalogHref("items", scope)}>Catálogo</CatalogLink></li>
        <li aria-hidden="true">/</li>
        <li>
          {title ? (
            <CatalogLink className="underline" href={catalogHref(section, catalogSectionQuery(section, query))}>{label}</CatalogLink>
          ) : <span aria-current="page">{label}</span>}
        </li>
        {title && <>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="break-words text-[var(--ink)]">{title}</li>
        </>}
      </ol>
    </nav>
  );
}
