import { randomUUID } from "node:crypto";
import { createClient } from "@/app/lib/supabase/server";
import { OwnerDashboardView } from "../owner-dashboard-views";
import { OwnerShell } from "../owner-shell";
import { loadCatalogTaxonomyPage, type TaxonomyView } from "./catalog-page-data";
import type { CatalogSearch } from "./catalog-navigation";
import { CatalogTaxonomyView } from "./catalog-taxonomy-view";

export type CatalogTaxonomySliceView = Omit<TaxonomyView, "resource"> & { resource: "categories" | "settings" };

/** Every public leaf reads fresh owner scope; the layout is never authority. */
export async function CatalogTaxonomyPage({ search, view }: { search: CatalogSearch; view: CatalogTaxonomySliceView }) {
  const client = await createClient();
  const result = await loadCatalogTaxonomyPage(client, search, view);
  if (result.kind === "redirect" || result.kind === "empty") {
    return <OwnerDashboardView data={result} module="catalog" />;
  }
  const title = view.resource === "settings" ? "Ajustes del catálogo" : "Categorías";
  if (result.kind !== "ready") {
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
  const { owner } = result;
  return <OwnerShell ownedBusinesses={owner.businesses} selectedBusiness={owner.business}
    activeModule="catalog" account={owner.account} pagination={owner.pagination}>
    <CatalogTaxonomyView result={result} readKey={randomUUID()} />
  </OwnerShell>;
}
