"use client";
import { useMemo } from "react";
import { ResourceTable, type ResourceColumn } from "../../components/resource-table";
import { CatalogProductReadLink } from "./catalog-product-filters";
export type CategoryListRow = { id: string; name: string; sortOrder: number; href: string };
export function CatalogCategoryTable({ rows, businessId, total, page }: { rows: CategoryListRow[]; businessId: string; total: number; page: number }) {
  const columns = useMemo<ResourceColumn<CategoryListRow>[]>(() => [
    { id: "name", accessorKey: "name", header: "Categoría", cell: ({ row }) => <strong className="block break-words">{row.original.name}</strong> },
    { id: "order", accessorKey: "sortOrder", header: "Orden" },
    { id: "open", header: "Ficha", cell: ({ row }) => <CatalogProductReadLink href={row.original.href} businessId={businessId}>Abrir categoría</CatalogProductReadLink> },
  ], [businessId]);
  return <ResourceTable data={rows} columns={columns} rowCount={total} pageIndex={page} caption="Categorías de la tienda seleccionada"
    emptyLabel="No hay categorías en esta página." columnClasses={{ name: "w-full", order: "whitespace-nowrap", open: "whitespace-nowrap" }} />;
}
