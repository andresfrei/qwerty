import { CatalogTaxonomyPage } from "../../catalog-taxonomy-page";

type Search = Record<string, string | string[] | undefined>;
export const dynamic = "force-dynamic";

export default async function NewGroupPage({ searchParams }: { searchParams: Promise<Search> }) {
  return CatalogTaxonomyPage({ search: await searchParams, view: { resource: "groups", mode: "new" } });
}
