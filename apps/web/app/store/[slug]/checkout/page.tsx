import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { readCheckoutCatalog } from "@/app/lib/checkout-catalog-reader";
import CheckoutClient from "./checkout-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Continuar compra · Qwerty", robots: { index: false, follow: false } };

export default async function CheckoutPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await readCheckoutCatalog(slug);
  if (result.status === "not_found") notFound();
  if (result.status !== "ok") {
    return (
      <main className="grid min-h-screen place-items-center px-5 py-12">
        <section role="alert" className="w-full max-w-md rounded-2xl border border-[var(--line)] bg-white p-7">
          <h1 className="text-2xl font-extrabold">{result.status === "misconfigured" ? "Esta tienda todavía no está configurada." : "No pudimos cargar esta tienda."}</h1>
          <p className="mt-3 text-sm leading-6">Probá nuevamente más tarde. No se confirmó ningún pedido.</p>
        </section>
      </main>
    );
  }
  return <CheckoutClient key={result.storefront.business_id} catalog={result} />;
}
