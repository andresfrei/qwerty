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

export type OptionListRow = CategoryListRow & { itemName: string; groupName: string; addition: string; available: boolean };
export function CatalogOptionTable({ rows, businessId, total, page }: { rows: OptionListRow[]; businessId: string; total: number; page: number }) {
  const columns = useMemo<ResourceColumn<OptionListRow>[]>(() => [
    { id: "name", accessorKey: "name", header: "Opción", cell: ({ row }) => <div className="min-w-0"><strong className="block break-words">{row.original.name}</strong>
      <span className="mt-1 block break-words text-xs text-[var(--muted)] md:hidden">{row.original.itemName} · {row.original.groupName} · {row.original.available ? "Disponible" : "No disponible"}</span></div> },
    { id: "item", accessorKey: "itemName", header: "Producto" },
    { id: "group", accessorKey: "groupName", header: "Grupo" },
    { id: "addition", accessorKey: "addition", header: "Adicional", cell: ({ row }) => <><span>{row.original.addition}</span><span className="block text-xs text-[var(--muted)]">unidad mayor</span></> },
    { id: "availability", accessorKey: "available", header: "Disponibilidad", cell: ({ row }) => row.original.available ? "Disponible" : "No disponible" },
    { id: "order", accessorKey: "sortOrder", header: "Orden" },
    { id: "open", header: "Ficha", cell: ({ row }) => <CatalogProductReadLink href={row.original.href} businessId={businessId}>Abrir opción</CatalogProductReadLink> },
  ], [businessId]);
  return <ResourceTable data={rows} columns={columns} rowCount={total} pageIndex={page} caption="Opciones de la tienda seleccionada; cada opción pertenece a un producto y grupo"
    emptyLabel="No hay opciones en esta página." columnClasses={{ name: "w-full", item: "hidden md:table-cell", group: "hidden md:table-cell", addition: "whitespace-nowrap", availability: "hidden md:table-cell", order: "hidden md:table-cell", open: "whitespace-nowrap" }} />;
}
