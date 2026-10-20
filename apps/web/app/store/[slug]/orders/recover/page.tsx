import OrderStatusClient from "@/app/store/order-status-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Recuperar intento privado", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function RecoveryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <OrderStatusClient slug={slug} />;
}
