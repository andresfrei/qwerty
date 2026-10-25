"use client";
import { columnFilteringFeature, flexRender, rowPaginationFeature, tableFeatures, useTable, type ColumnDef } from "@tanstack/react-table";

export const resourceTableFeatures = tableFeatures({ rowPaginationFeature, columnFilteringFeature });
export type ResourceColumn<TData extends { id: string }> = ColumnDef<typeof resourceTableFeatures, TData, unknown>;
export type ResourceTableProps<TData extends { id: string }> = {
  data: TData[];
  columns: ResourceColumn<TData>[];
  rowCount: number;
  pageIndex: number;
  caption: string;
  emptyLabel: string;
  columnClasses?: Record<string, string>;
};

/** Already scoped/server-paged rows only. No local filtering, sorting or fetching. */
export function ResourceTable<TData extends { id: string }>({ data, columns, rowCount, pageIndex, caption, emptyLabel, columnClasses = {} }: ResourceTableProps<TData>) {
  const table = useTable({ features: resourceTableFeatures, data, columns, rowCount,
    manualPagination: true, manualFiltering: true,
    state: { pagination: { pageIndex, pageSize: 25 } }, getRowId: row => row.id });
  const rows = table.getRowModel().rows;
  return <div className="min-w-0 overflow-x-auto">
    <table className="w-full border-collapse text-left text-sm">
      <caption className="sr-only">{caption}</caption>
      <thead className="bg-[var(--cream)] text-[var(--muted)]">
        {table.getHeaderGroups().map(group => <tr key={group.id}>
          {group.headers.map(header => <th key={header.id} scope="col" colSpan={header.colSpan}
            className={`px-4 py-3 font-extrabold sm:px-5 ${columnClasses[header.column.id] ?? ""}`}>
            {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
          </th>)}
        </tr>)}
      </thead>
      <tbody>
        {rows.length ? rows.map(row => <tr key={row.id} className="border-t border-[var(--line)] align-top hover:bg-[var(--soft-lime)]/40">
          {row.getAllCells().map(cell => <td key={cell.id} className={`px-4 py-4 sm:px-5 ${columnClasses[cell.column.id] ?? ""}`}>
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </td>)}
        </tr>) : <tr><td colSpan={columns.length} className="px-5 py-12 text-center text-[var(--muted)]">{emptyLabel}</td></tr>}
      </tbody>
    </table>
  </div>;
}
