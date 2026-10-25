import { CatalogProductPage } from "../../catalog-product-page";

type Search = Record<string, string | string[] | undefined>;
export const dynamic = "force-dynamic";

export default async function ProductPage({ params, searchParams }: {
  params: Promise<{ itemId: string }>;
  searchParams: Promise<Search>;
}) {
  const { itemId } = await params;
  return CatalogProductPage({ search: await searchParams, view: { resource: "items", mode: "detail", id: itemId } });
}
