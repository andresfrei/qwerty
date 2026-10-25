import { redirect } from "next/navigation";
import { loadOwnerDashboard, type OwnerSearch } from "../owner-dashboard-data";
import { OwnerDashboardView } from "../owner-dashboard-views";
import { createClient } from "@/app/lib/supabase/server";
import { catalogHref } from "./catalog-navigation";

export const dynamic = "force-dynamic";

/** Keep the legacy strict query boundary; selection is fresh before redirecting. */
export default async function OwnerCatalogPage({ searchParams }: { searchParams: Promise<OwnerSearch> }) {
  const client = await createClient();
  const data = await loadOwnerDashboard(client, await searchParams);
  if (data.kind !== "selected") return <OwnerDashboardView data={data} module="catalog" />;
  redirect(catalogHref("items", { businessId: data.business.id, storePage: data.pagination.page }));
}
