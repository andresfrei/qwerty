import { CatalogProductPage } from "../../catalog-product-page";

type Search = Record<string, string | string[] | undefined>;
export const dynamic = "force-dynamic";

export default async function NewProductPage({ searchParams }: { searchParams: Promise<Search> }) {
  return CatalogProductPage({ search: await searchParams, view: { resource: "items", mode: "new" } });
}
