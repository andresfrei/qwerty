import { createClient } from "@/app/lib/supabase/server";
import { loadOwnerDashboard, type OwnerSearch } from "../owner-dashboard-data";
import { OwnerDashboardView } from "../owner-dashboard-views";
import { OwnerShell } from "../owner-shell";
import OrderQueueClient from "./order-queue-client";

export const dynamic = "force-dynamic";
// Referrer policy inherits owner/layout's same-origin native logout policy.
export const metadata = { title: "Pedidos privados", robots: { index: false, follow: false } };
export default async function OwnerOrdersPage({ searchParams }: { searchParams: Promise<OwnerSearch> }) {
  const data = await loadOwnerDashboard(await createClient(), await searchParams);
  if (data.kind !== "selected") return <OwnerDashboardView data={data} module="orders" />;
  const key = `${data.account.id}:${data.business.id}`;
  return <OwnerShell key={key} ownedBusinesses={data.businesses} selectedBusiness={data.business} activeModule="orders" account={data.account} pagination={data.pagination}>
    <OrderQueueClient key={key} businessId={data.business.id} />
  </OwnerShell>;
}
