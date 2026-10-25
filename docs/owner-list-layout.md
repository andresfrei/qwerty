# Owner resource list layout

## Current status

The approved prototype targets **Products lists and their filter dialog only**.
The dependencies and Products layout are integrated. Source checks pass: 96 scoped
cases, TypeScript and four-file lint. A bounded synthetic Chromium run passes 63
checks at 1440/390. Independent S1–S4 integration review passes with no blockers.
Native ASSESS remains unassessable with RDD off; this is not native approval.
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

The Products list mounts these components. `CatalogProductsTable` defines its
render functions in the client subtree; the server passes serializable summaries,
reference-price strings, validated record URLs and certified pagination metadata.
Category/availability are secondary desktop columns and compact mobile sublines.
`OwnerShell.contentWidth` defaults to `reading`; only the Products list adapter
passes `wide`. New/detail/editing surfaces keep their prior width and widgets.

## Products filter toolbar (source prototype)

The toolbar places search and **Filtros** on the left and **Nuevo producto** on the
right. The filter count/chip describe the applied category, not an uncommitted
modal selection. The modal uses React Hook Form and the existing scoped, paged
category picker; it is not a new catalog query or write endpoint.

Open/Cancel/Escape reset the category draft to the applied category; Clear changes
only the modal draft until Apply. Apply combines the visible search text and the
chosen category into an existing validated read URL, resets product page and keeps
business/store-page context. The picker is remounted on draft reset, and a fresh
owner/business/read scope remounts the form.

Idle search retains native GET/Enter. When an operation is locked, the existing
native GET veto remains; guarded Search/Apply links provide scoped inspection.
No native-exit exemption, synthetic click, save retry or lifecycle reset is added.
Guarded read controls forward an optional UI click callback so Apply can close the
dialog without resetting its draft/href before navigation. Existing callers omit
the callback; native/SPA destination validation and cancellation remain unchanged.
The modal is client UI; ordinary SSR search/read links remain native where eligible.

Actual RHF SSR checks are in `owner-product-list-toolbar.test.mjs`.

## Verification and limits

- Source: 96 scoped cases pass, including real-library SSR, strict read guards,
  unchanged classic payloads and Products/New/detail integration; TypeScript/lint pass.
- Meaningful RED→GREEN: two missing layout/table rules, two toolbar/modal rules,
  one optional read-click forwarding rule and three list/width integration rules.
- Synthetic Chromium: actual React/RHF/Table SSR→StrictMode hydration, desktop/mobile
  toolbar/modal, paged category selection, draft Clear/Cancel/Escape/Apply, focus,
  stale-scope fencing, no filter writes, Enter GET, locked GET veto, unknown SPA
  inspection and saved native GET: 63 checks pass; no unexpected errors/requests.
- Differential: eight default shared-shell and four New/detail public SSR outputs
  are unchanged against the prior source/working sidebar baseline, including changed
  search input. Classic/photo/profile leaves use identical adapters in both versions.

The first browser run stopped after 27 partial desktop checks because its private
synthetic save payload omitted required `sortOrder`. The corrected fixture passed
an actual-gate payload preflight, then one explicitly renewed browser session.
The invalid fixture run and preparation failures are retained; totals overlap.

These are isolated synthetic fixtures, not live Next RSC/prefetch, Auth/RLS,
real-account, concurrent-session, clean-checkout or real photo/profile mutation
acceptance. No full build/unrelated full suite was run. Manual account QA remains
human-owned. The existing MVP/proxy was not restarted; nothing is published.

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
