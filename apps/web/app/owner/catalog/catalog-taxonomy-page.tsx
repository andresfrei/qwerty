import { randomUUID } from "node:crypto";
import { createClient } from "@/app/lib/supabase/server";
import { loadOwnerDashboard, type OwnerDashboardData } from "../owner-dashboard-data";
import { OwnerDashboardView } from "../owner-dashboard-views";
import { OwnerShell } from "../owner-shell";
import { loadCatalogTaxonomyPage, type TaxonomyView, type ItemParent } from "./catalog-page-data";
import { parseCatalogPageQuery, type CatalogSearch, type CatalogPageRequest } from "./catalog-navigation";
import { CatalogTaxonomyView, CatalogGroupCreationView, CatalogOptionCreationView } from "./catalog-taxonomy-view";

export type CatalogTaxonomySliceView = Omit<TaxonomyView, "resource"> & { resource: "categories" | "settings" | "groups" | "options" };
export type CatalogGroupCreationContext = {
  kind: "creation_chooser";
  owner: Extract<OwnerDashboardData, { kind: "selected" }>;
  request: CatalogPageRequest;
};

export type CatalogOptionCreationContext = {
  kind: "option_creation_chooser";
  owner: Extract<OwnerDashboardData, { kind: "selected" }>;
  request: CatalogPageRequest;
  item: ItemParent | null;
};

/** Every public leaf reads fresh owner scope; the layout is never authority. */
export async function CatalogTaxonomyPage({ search, view }: { search: CatalogSearch; view: CatalogTaxonomySliceView }) {
  const client = await createClient();
  const request = parseCatalogPageQuery(search, view);
  // Only a syntactically valid New with genuinely absent parent gets this separate context.
  // Explicit malformed/foreign parents always use the unchanged reader/failure envelope.
  const choosing = request.ok && request.resource === "groups" && request.mode === "new" && !request.query.itemId;
  const choosingOption = request.ok && request.resource === "options" && request.mode === "new" && !request.query.groupId;
  const result = choosingOption && request.ok && request.query.itemId
    ? await loadCatalogTaxonomyPage(client, { ...request.ownerSearch, itemId: request.query.itemId }, { resource: "groups" })
    : (choosing || choosingOption) && request.ok ? await loadOwnerDashboard(client, request.ownerSearch)
    : await loadCatalogTaxonomyPage(client, search, view);
  if (result.kind === "redirect" || result.kind === "empty") {
    return <OwnerDashboardView data={result} module="catalog" />;
  }
  const title = view.resource === "settings" ? "Ajustes del catálogo" : view.resource === "groups" ? "Grupos del producto" : view.resource === "options" ? "Variedades y opciones" : "Categorías";
  if (result.kind !== "ready" && result.kind !== "selected") {
    const messages = {
      invalid: "La consulta del catálogo no es válida.",
      missing: "No encontramos ese registro o tienda en tu cuenta.",
      unavailable: "No pudimos cargar el catálogo. Intentá de nuevo más tarde.",
    };
    return <main className="mx-auto max-w-3xl px-5 py-12">
      <h1 className="text-3xl font-extrabold">{title}</h1>
      <p className="mt-4" role="alert">{messages[result.kind]}</p>
    </main>;
  }
  const owner = result.kind === "selected" ? result : result.owner;
  const optionItem = result.kind === "ready" && result.data.kind === "list" ? result.data.parents.item : undefined;
  if (choosingOption && request.ok && request.query.itemId && !optionItem) throw Error("missing_checked_option_item");
  const catalogRequest = (choosing || choosingOption) && request.ok ? request
    : result.kind === "ready" ? result.request : null;
  if (!catalogRequest) throw Error("missing_catalog_request");
  return <OwnerShell ownedBusinesses={owner.businesses} selectedBusiness={owner.business}
    activeModule="catalog" account={owner.account} pagination={owner.pagination}
    contentWidth={(catalogRequest.resource === "categories" || catalogRequest.resource === "options") && catalogRequest.mode === "list" && result.kind === "ready" && result.data.kind === "list" ? "wide" : undefined}
    catalogContext={{ view: { resource: catalogRequest.resource, mode: catalogRequest.mode, ...(catalogRequest.id ? { id: catalogRequest.id } : {}) },
      query: { ...catalogRequest.query, businessId: owner.business.id } }}>
    {choosingOption && request.ok
      ? <CatalogOptionCreationView context={{ kind: "option_creation_chooser", owner, request,
        item: optionItem ?? null }} readKey={randomUUID()} />
      : result.kind === "selected" && request.ok
      ? <CatalogGroupCreationView context={{ kind: "creation_chooser", owner, request }} readKey={randomUUID()} />
      : result.kind === "ready" && <CatalogTaxonomyView result={result} readKey={randomUUID()} />}
  </OwnerShell>;
}
