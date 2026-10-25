import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { readCheckoutCatalog } from "@/app/lib/checkout-catalog-reader";
import { readConfiguredStorefront } from "@/app/lib/configured-storefront-reader";
import { ConfiguredCheckoutClient } from "./checkout-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Continuar compra · Qwerty", robots: { index: false, follow: false } };

export default async function CheckoutPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug.length > 63 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) notFound();
  const publicCatalog = await readConfiguredStorefront(slug);
  const needsLegacy = publicCatalog.status === "ok" && (publicCatalog.capability === "legacy_only"
    || Object.values(publicCatalog.configurations).some(item => item.status === "legacy"));
  const legacyCatalog = needsLegacy ? await readCheckoutCatalog(slug) : null;
  // Current publication/capability cannot gate a stored attempt's private GET.
  // The client restores scope and the full frozen payload before enabling writes.
  return <ConfiguredCheckoutClient key={slug} page={{ slug, publicCatalog, legacyCatalog }} />;
}
