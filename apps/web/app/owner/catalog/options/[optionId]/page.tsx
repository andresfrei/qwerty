import { CatalogTaxonomyPage } from "../../catalog-taxonomy-page";

type Search = Record<string, string | string[] | undefined>;
export const dynamic = "force-dynamic";

export default async function OptionPage({ params, searchParams }: {
  params: Promise<{ optionId: string }>;
  searchParams: Promise<Search>;
}) {
  const { optionId } = await params;
  return CatalogTaxonomyPage({ search: await searchParams, view: { resource: "options", mode: "detail", id: optionId } });
}
