import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const { useTable, tableFeatures, rowPaginationFeature, columnFilteringFeature } = require("@tanstack/react-table");
const { useForm } = require("react-hook-form");
const features = tableFeatures({ rowPaginationFeature, columnFilteringFeature });

test("pinned real Table/RHF hooks SSR with React without repaging server rows", () => {
  assert.equal(require("@tanstack/react-table/package.json").version, "9.3.1");
  assert.equal(require("react-hook-form/package.json").version, "7.91.0");
  const rows = Array.from({ length: 25 }, (_, index) => ({ id: `synthetic-${index}`, name: `Producto ${index}` }));
  function Example() {
    const table = useTable({ features, data: rows, columns: [{ accessorKey: "name", header: "Nombre" }],
      manualPagination: true, manualFiltering: true, rowCount: 76,
      state: { pagination: { pageIndex: 2, pageSize: 25 } } });
    const form = useForm({ defaultValues: { q: "Pizza" } });
    return React.createElement("section", { "data-count": table.getRowModel().rows.length },
      React.createElement("input", { ...form.register("q"), defaultValue: form.getValues("q") }));
  }
  const first = renderToStaticMarkup(React.createElement(Example));
  assert.equal(renderToStaticMarkup(React.createElement(Example)), first);
  assert.match(first, /data-count="25"/);
  assert.match(first, /name="q"/); assert.match(first, /value="Pizza"/);
});
