"use client";
import { useMemo } from "react";
import { ResourceTable, type ResourceColumn } from "../../components/resource-table";
import { CatalogProductReadLink } from "./catalog-product-filters";

export type ProductListRow = { id: string; name: string; categoryName: string; referencePrice: string; available: boolean; href: string };
export function CatalogProductsTable({ rows, businessId, total, page }: { rows: ProductListRow[]; businessId: string; total: number; page: number }) {
  const columns = useMemo<ResourceColumn<ProductListRow>[]>(() => [
    { id: "product", accessorKey: "name", header: "Producto", cell: ({ row }) => <div className="min-w-0">
      <strong className="block max-w-[24rem] break-words">{row.original.name}</strong>
      <span className="mt-1 block text-xs text-[var(--muted)] md:hidden">{row.original.categoryName} · {row.original.available ? "Disponible" : "No disponible"}</span>
    </div> },
    { id: "category", accessorKey: "categoryName", header: "Categoría" },
    { id: "price", accessorKey: "referencePrice", header: () => <><span className="md:hidden">Referencia</span><span className="hidden md:inline">Precio base de referencia</span></> },
    { id: "availability", accessorKey: "available", header: "Disponibilidad", cell: ({ row }) =>
      <span className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${row.original.available ? "bg-[var(--soft-lime)] text-[var(--olive)]" : "bg-[var(--cream)] text-[var(--muted)]"}`}>{row.original.available ? "Disponible" : "No disponible"}</span> },
    { id: "open", header: "Ficha", cell: ({ row }) => <span className="[&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center">
      <CatalogProductReadLink href={row.original.href} businessId={businessId}><span aria-hidden="true">Abrir</span><span className="sr-only">Abrir producto: {row.original.name}</span></CatalogProductReadLink>
    </span> },
  ], [businessId]);
  return <ResourceTable data={rows} columns={columns} rowCount={total} pageIndex={page}
    caption="Productos de la tienda seleccionada; precios de referencia" emptyLabel="No hay productos en esta página."
    columnClasses={{ product: "w-full", category: "hidden md:table-cell", price: "whitespace-nowrap", availability: "hidden md:table-cell", open: "whitespace-nowrap" }} />;
}
