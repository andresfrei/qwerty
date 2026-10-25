import { randomUUID } from "node:crypto";
import { createClient } from "@/app/lib/supabase/server";
import { loadOwnerDashboard, type OwnerDashboardData } from "../owner-dashboard-data";
import { OwnerDashboardView } from "../owner-dashboard-views";
import { OwnerShell } from "../owner-shell";
import { loadCatalogTaxonomyPage, type TaxonomyView } from "./catalog-page-data";
import { parseCatalogPageQuery, type CatalogSearch, type CatalogPageRequest } from "./catalog-navigation";
import { CatalogTaxonomyView, CatalogGroupCreationView } from "./catalog-taxonomy-view";

export type CatalogTaxonomySliceView = Omit<TaxonomyView, "resource"> & { resource: "categories" | "settings" | "groups" };
export type CatalogGroupCreationContext = {
  kind: "creation_chooser";
  owner: Extract<OwnerDashboardData, { kind: "selected" }>;
  request: CatalogPageRequest;
};

/** Every public leaf reads fresh owner scope; the layout is never authority. */
export async function CatalogTaxonomyPage({ search, view }: { search: CatalogSearch; view: CatalogTaxonomySliceView }) {
  const client = await createClient();
  const request = parseCatalogPageQuery(search, view);
  // Only a syntactically valid New with genuinely absent parent gets this separate context.
  // Explicit malformed/foreign parents always use the unchanged reader/failure envelope.
  const choosing = request.ok && request.resource === "groups" && request.mode === "new" && !request.query.itemId;
  const result = choosing ? await loadOwnerDashboard(client, request.ownerSearch)
    : await loadCatalogTaxonomyPage(client, search, view);
  if (result.kind === "redirect" || result.kind === "empty") {
    return <OwnerDashboardView data={result} module="catalog" />;
  }
  const title = view.resource === "settings" ? "Ajustes del catálogo" : view.resource === "groups" ? "Grupos del producto" : "Categorías";
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
  return <OwnerShell ownedBusinesses={owner.businesses} selectedBusiness={owner.business}
    activeModule="catalog" account={owner.account} pagination={owner.pagination}>
    {result.kind === "selected" && request.ok
      ? <CatalogGroupCreationView context={{ kind: "creation_chooser", owner, request }} readKey={randomUUID()} />
      : result.kind === "ready" && <CatalogTaxonomyView result={result} readKey={randomUUID()} />}
  </OwnerShell>;
}
