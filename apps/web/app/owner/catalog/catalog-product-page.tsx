import { randomUUID } from "node:crypto";
import { createClient } from "@/app/lib/supabase/server";
import { OwnerDashboardView } from "../owner-dashboard-views";
import { OwnerShell } from "../owner-shell";
import { loadCatalogItemPage, type ItemView } from "./catalog-item-page-data";
import type { CatalogSearch } from "./catalog-navigation";
import { CatalogProductView } from "./catalog-product-view";

/** Request-local authorization; the Catalog layout supplies a session, not authority. */
export async function CatalogProductPage({ search, view }: { search: CatalogSearch; view: ItemView }) {
  const client = await createClient();
  const result = await loadCatalogItemPage(client, search, view);
  if (result.kind === "redirect" || result.kind === "empty") {
    return <OwnerDashboardView data={result} module="catalog" />;
  }
  if (result.kind !== "ready") {
    const messages = {
      invalid: "La consulta de productos no es válida.",
      missing: "No encontramos ese producto o tienda en tu cuenta.",
      unavailable: "No pudimos cargar los productos. Intentá de nuevo más tarde.",
    };
    return <main className="mx-auto max-w-3xl px-5 py-12">
      <h1 className="text-3xl font-extrabold">Productos</h1>
      <p className="mt-4" role="alert">{messages[result.kind]}</p>
    </main>;
  }
  const { owner } = result;
  return <OwnerShell ownedBusinesses={owner.businesses} selectedBusiness={owner.business}
    activeModule="catalog" account={owner.account} pagination={owner.pagination}
    catalogContext={{ view: { resource: result.request.resource, mode: result.request.mode, ...(result.request.id ? { id: result.request.id } : {}) },
      query: { ...result.request.query, businessId: owner.business.id } }}>
    <CatalogProductView result={result} readKey={randomUUID()} />
  </OwnerShell>;
}
