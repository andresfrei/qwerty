# Owner resource list layout

## Current status

The approved prototype targets **Products lists and their filter dialog only**.
Dependencies are installed; the new layout is not yet integrated or accepted.
Auth, existing record-editing forms and saved/unknown operation lifecycles are not
being migrated. Existing nested Catalog sidebar working changes are preserved.

## Presentation foundations

`ResourceListLayout` composes a title/context, toolbar, result area and footer.
Its slots contain resource-owned links and controls, not a generic CRUD engine.
It imposes no narrow reading-width limit on a listing.

The client `ResourceTable` uses actual Table v9 feature types and semantic table
markup. It receives scoped rows, column definitions, certified `rowCount` and
`pageIndex`; `manualPagination`/`manualFiltering` retain all supplied rows in server
order. No client sorted/filtered/paginated row models or fetching are enabled.
Pagination links remain with each resource. Responsive column classes may hide
secondary columns while keeping primary content readable.

Foundation public SSR tests:

```sh
node --test apps/web/tests/owner-list-table.test.mjs
```

These components are not yet mounted by the current Products page.

## Dependencies

- `@tanstack/react-table` **9.3.1**: headless table rendering; v9 feature/generic APIs.
- `react-hook-form` **7.91.0**: new filter-dialog UI drafts, not transport authority.

Both are exact direct dependencies of `@qwerty/web`. Only their required transitive
packages are added. Installation uses the existing pnpm11.20 workspace/lockfile,
ignores dependency scripts and does not enable devtools or add TanStack Query,
Router, Start, TanStack Form, Zod or another UI framework.

Existing server authorization, strict query parsing, certified counts and already
paged rows remain authoritative. The table must not re-filter/re-page a 25-row
server result or offer unsupported global sorting. Form submission state is not
an idempotency/unknown-result/CAS mechanism.

The real dependency SSR smoke command is:

```sh
node --test apps/web/tests/owner-list-dependencies.test.mjs
```

Feature specification, authorization and subsequent verification evidence:
[owner-products-list-layout.md](../odd/tasks/owner-products-list-layout.md).
