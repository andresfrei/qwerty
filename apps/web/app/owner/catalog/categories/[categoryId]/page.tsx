import { CatalogTaxonomyPage } from "../../catalog-taxonomy-page";

type Search = Record<string, string | string[] | undefined>;
export const dynamic = "force-dynamic";

export default async function CategoryPage({ params, searchParams }: {
  params: Promise<{ categoryId: string }>;
  searchParams: Promise<Search>;
}) {
  const { categoryId } = await params;
  return CatalogTaxonomyPage({ search: await searchParams, view: { resource: "categories", mode: "detail", id: categoryId } });
}
