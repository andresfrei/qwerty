import OrderQueueClient from "./order-queue-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pedidos privados", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function OwnerOrdersPage({ searchParams }: { searchParams: Promise<{ businessId?: string | string[] }> }) {
  const { businessId } = await searchParams;
  return <OrderQueueClient businessId={typeof businessId === "string" ? businessId : ""} />;
}
