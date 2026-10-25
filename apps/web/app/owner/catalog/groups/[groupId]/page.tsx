import { CatalogTaxonomyPage } from "../../catalog-taxonomy-page";

type Search = Record<string, string | string[] | undefined>;
export const dynamic = "force-dynamic";

export default async function GroupPage({ params, searchParams }: {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<Search>;
}) {
  const { groupId } = await params;
  return CatalogTaxonomyPage({ search: await searchParams, view: { resource: "groups", mode: "detail", id: groupId } });
}
