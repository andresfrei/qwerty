import type { Metadata } from "next";
import { notFound } from "next/navigation";
import StorefrontClient from "../storefront-client";
import { readStorefront } from "@/app/lib/storefront-reader";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Tienda · Qwerty",
  robots: { index: false, follow: false },
};

export default async function StorefrontPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await readStorefront(slug);
  if (result.status === "not_found") notFound();
  if (result.status !== "ok") {
    const configured = result.status === "misconfigured";
    return (
      <main className="grid min-h-screen place-items-center px-6 py-12">
        <section className="w-full max-w-md rounded-2xl border border-[var(--line)] bg-white p-7" role="alert">
          <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--olive)]">Tienda no disponible</p>
          <h1 className="mt-3 text-2xl font-[750] tracking-[-0.06em]">{configured ? "Esta tienda todavía no está configurada." : "No pudimos cargar esta tienda."}</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{configured ? "Falta la configuración pública del catálogo." : "Probá nuevamente más tarde."} No se confirmó ningún pedido.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-5 py-6 sm:px-8 sm:py-10">
      <header className="mx-auto mb-10 max-w-6xl">
        <p className="text-sm font-extrabold tracking-[-0.04em]">qwerty</p>
        <p className="mt-8 text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--olive)]">Tienda</p>
        <h1 className="mt-2 text-[clamp(2.3rem,7vw,4.5rem)] font-[750] leading-none tracking-[-0.09em]">{result.storefront.display_name}</h1>
        <p className="mt-4 max-w-xl text-sm leading-6 text-[var(--body-subtle)]">Productos disponibles para consultar y sumar a tu pedido.</p>
      </header>
      <div className="mx-auto max-w-6xl">
        <StorefrontClient key={result.storefront.business_id} businessId={result.storefront.business_id} categories={result.categories} slug={result.storefront.slug} />
      </div>
    </main>
  );
}
