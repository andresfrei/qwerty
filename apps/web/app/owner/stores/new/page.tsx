import { createClient } from "@/app/lib/supabase/server";
import { loadOwnerDashboard, type OwnerSearch } from "../../owner-dashboard-data";
import { OwnerDashboardView } from "../../owner-dashboard-views";

export const dynamic = "force-dynamic";
export default async function NewOwnerStorePage({ searchParams }: { searchParams: Promise<OwnerSearch> }) {
  const data = await loadOwnerDashboard(await createClient(), await searchParams);
  return <OwnerDashboardView data={data} create />;
}
