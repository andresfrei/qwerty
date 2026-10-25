# Owner catalog resource navigation

## Delivery status

The navigation/query foundation is prepared first. Its section components are not
yet mounted in the legacy catalog: no links to unfinished pages are advertised.
Record routes and form integration remain subsequent work units. A server-only,
injectable taxonomy/Products read slice now exists; T3 is still partial (bounded
choices and their HTTP integration are not implemented).
This guide does not certify a complete dashboard or real-account acceptance.

## Route and query contracts

Catalog uses `items` (Products), `categories`, `options` (contextual varieties) and
`settings`. Existing item-photo endpoints keep their namespace. `groups` is a
contextual resource, not another primary menu. List routes live under
`/owner/catalog/<resource>`; records use `/<id>` and creation uses `/new`.
Settings is a singleton configuration page, not a record/new collection.

`parseCatalogPageQuery(search, view)` validates a plain Next search-parameter
object or URLSearchParams plus a fixed resource/mode/path ID. It rejects duplicate
keys, arrays, unknown fields, invalid UUIDs, malformed IDs and noncanonical pages.
Pages are zero-based integers through 1000000. Search text is trimmed, bounded to
100 characters and cannot contain control characters.

Common context is optional `businessId` and `storePage`. Collection views also
allow `page` and `q`. Item views allow `categoryId`; option views allow `itemId`
and `groupId`; group views allow `itemId`. Settings accepts only common context.
IDs are normalized to lowercase. These syntax checks never establish ownership:
every page/read/write must independently validate fresh identity, business and
record ancestry.

Only `ownerSearch` is passed to existing owner loading. Catalog filters must not
be forwarded into or permitted by the strict shared owner/mutation query parser.
`catalogHref` builds fixed local destinations, never an arbitrary return URL.
`catalogStoreHref` returns the selected section's list in the new business,
clearing old record/filter context. Groups return to Products after a store change.
Breadcrumbs preserve the current section's validated list context.

## Server taxonomy reads (partial T3)

`catalog/catalog-page-data.ts` exports `loadCatalogTaxonomyPage(client, search,
view)`, `CATALOG_PAGE_SIZE` (25), and types `TaxonomyResource`, `TaxonomyView`,
`CategorySummary`, `ItemParent`, `GroupSummary`, `OptionSummary`, `OptionDirectorySummary`, `TaxonomyRecord`,
`CatalogPagePagination`, `TaxonomyPageData`, `CatalogTaxonomyPage`.
Supply the current request's session Supabase SDK client, never a privileged or
cached client. The module is marked `server-only`; it has no mutations or HTTP
handler. It calls the unchanged `loadOwnerDashboard(client, request.ownerSearch)`
after frozen catalog syntax validation and before any catalog query.

Supported resource/mode combinations:

- Categories: list/new/detail.
- Groups: list/new require `itemId`; detail derives its item and checks any
  supplied `itemId` against that item.
- Options: list is the central business directory, optionally filtered by
  `itemId` and/or `groupId`. New still requires `groupId`. Detail derives
  group → item and checks both supplied ancestry IDs. Every list option includes
  its checked `group: GroupSummary` and `item: ItemParent`; these are existing
  product-specific options, not shared/global varieties.
- Settings: singleton list mode only, reusing the owner's storefront and
  `business_catalog_settings`; successful absence means surcharge zero.

Groups/new Options contextual requirements are narrower than the navigation
parser. Category/component choices remain a future unit. This taxonomy API's
view resource type excludes Products; use the separate reader below. Unsupported
runtime requests return `invalid`. Item-only Options filtering uses the existing
inner group relationship, not an incomplete group-ID selector. Directory parent
labels use at most one business-scoped `.in("id", distinctPageIds)` group
batch and one item batch (each at most 25 IDs/rows). Explicitly checked context
parents are reused from request-local caches, so a group/item context needs no
redundant label batch. Unrelated parents are never loaded.

On success the result is `{kind: "ready", owner, request, data}`. `owner` is the
fresh selected dashboard result, `request` the parsed catalog context. `data` is:

- `{kind: "list", rows, parents, pagination}`;
- `{kind: "detail", record, parents}`;
- `{kind: "new", parents}` (checked context, **not** write authorization);
- `{kind: "settings", storefront, surchargeMinor}`.

`parents` contains only the checked minimal `item` and/or checked `group` when
applicable. Returned taxonomy records use explicit field projections, not raw
backend objects. Detail identity uses business + path ID; `q` and `page` remain
return-navigation context and never narrow identity.

For example, Categories page 1 of 27 matching rows returns two rows and
`pagination: {page: 1, pageSize: 25, total: 27, hasMore: false,
pageComplete: true, collectionComplete: false}`. Each list uses exact count,
`sort_order ASC, id ASC`, and an inclusive 25-row range. `pageComplete` certifies
the requested window only; `collectionComplete` is true only on page zero when
all matching rows fit. Never use a page as a complete selection library.
Search is a single SDK `ilike` name filter with escaped backslash, percent,
underscore and star alias; no interpolated OR expression is used.

All catalog queries include `business_id`. Detail/explicit-context singleton
reads request exact counts and at most two rows. List label batches request exact
counts and limit 25; count must equal returned length, IDs must be unique members
of the requested set, and every requested parent must resolve. Truncation never
produces partial labels.
Missing/foreign parents, contradictory ancestry or absent records yield only
`{kind: "missing"}`. Missing counts, truncation, malformed/foreign payloads,
duplicate IDs, permission/transport errors yield only `{kind: "unavailable"}`;
no backend details or partial private results escape. Invalid syntax or missing
required contextual parents yields `{kind: "invalid"}` before even auth reads.
Non-selected dashboard outcomes (redirect/invalid/unavailable/missing/empty) are
forwarded without catalog reads or fallback to another business.

## Server Products reads (partial T3)

`catalog/catalog-item-page-data.ts` exports `loadCatalogItemPage(client, search,
view)` and types `ItemView`, `ItemProfileSummary`, `CatalogItemSummary`,
`CatalogItemPageData`, `CatalogItemPage`. `ItemView` fixes resource to `items`.
It uses the same invalid/fresh-owner/failure envelope as taxonomy and the same
25-row pagination/count/order/search conventions. Every table read is scoped to
the resolved owner business. No mutations, HTTP handler, React or page mount.

Successful `data` is `{kind: "list", rows, parents, pagination, capability}`,
`{kind: "detail", record, parents, capability}`, or
`{kind: "new", parents, capability}`. `parents` has optional checked `category`.
List/new validate explicit `categoryId`; detail ignores category origin, q and
page for identity, and resolves the record's actual category. Missing/foreign
IDs never trigger another-business lookup or default selection.

`CatalogItemSummary` freezes these fields: `id`, `business_id`, `category_id`,
`name`, `description`, `price_minor`, `currency`, `is_available`, `sort_order`,
`photo_path`, `photo_version`, `category: CategorySummary`, and
`profile: ItemProfileSummary`. Photo version retains a nonnegative safe integer
or canonical bigint decimal string (through signed bigint maximum). The photo
path is existing editor input, not a freshly signed/trusted image URL.
List category labels use at most one business-scoped `.in("id", distinctPageIds)`
batch, with at most 25 IDs/rows and certified counts/membership. Explicit category
context is checked once and reused, avoiding a redundant batch. Detail/new keep
singleton context checks. These are complete page labels, not a selection library.

`capability` is `ready` or `legacy_only`; `unavailable` produces only the failure
envelope. The existing strict capability classifier is reused: only the exact
typed missing no-argument capability supports old schema. No undefined-RPC,
transport, permission or malformed-response legacy fallback exists.
Ready capability reads only listed/selected item IDs, exact count and limit 26,
projecting `business_id,item_id,version,is_active,kind:document->>kind`.
No full profile documents, matrices, components or catalog snapshots are read.
`profile` is `{kind, version, isActive}`: active kind must be explicitly
`standard|pizza|dozen|combo`; absent/inactive is `legacy` (absent version 0).
Malformed active kind fails closed, never name-inferred. This metadata does not
validate a full configuration or replace the selected editor's existing reader.
Empty pages/new do not query item profiles. Every returned field is projected;
SDK extras/private documents are not returned.

## Focused verification

`node --test apps/web/tests/owner-catalog-navigation.test.mjs` exercises the public
helpers, actual static React navigation markup and the unchanged legacy owner
URL/parser boundary. Static markup is not browser navigation or hydration proof.
The implementation spec and live work-unit status are in
[owner-resource-navigation.md](../odd/tasks/owner-resource-navigation.md).
