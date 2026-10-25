# Owner catalog resource navigation

## Delivery status

The navigation/query foundation is prepared first. Its section components are not
yet mounted in the legacy catalog: no links to unfinished pages are advertised.
Record routes and form integration remain subsequent work units. A server-only,
injectable taxonomy read slice now exists; T3 is still partial (Products and
bounded choices are not implemented by this slice).
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
`CategorySummary`, `ItemParent`, `GroupSummary`, `OptionSummary`, `TaxonomyRecord`,
`CatalogPagePagination`, `TaxonomyPageData`, `CatalogTaxonomyPage`.
Supply the current request's session Supabase SDK client, never a privileged or
cached client. The module is marked `server-only`; it has no mutations or HTTP
handler. It calls the unchanged `loadOwnerDashboard(client, request.ownerSearch)`
after frozen catalog syntax validation and before any catalog query.

Supported resource/mode combinations:

- Categories: list/new/detail.
- Groups: list/new require `itemId`; detail derives its item and checks any
  supplied `itemId` against that item.
- Options: list/new require `groupId`; its item's ownership is also checked.
  Detail derives group → item and checks both supplied ancestry IDs.
- Settings: singleton list mode only, reusing the owner's storefront and
  `business_catalog_settings`; successful absence means surcharge zero.

These contextual collection requirements are narrower than the navigation
parser. A context-free options directory, item-only option search, Products,
category labels/profile-kind summaries and category/component choices remain
future read units. There are no placeholder results for them: this API's view
resource type excludes Products; unsupported runtime requests return `invalid`.
No capability inference (including RPC-undefined shortcuts) is introduced.
Future Products work must use the existing strict capability classifier and
must not downgrade malformed active profiles to legacy.

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

All catalog queries include `business_id`. Parent/detail/singleton reads request
exact counts and at most two rows to detect duplicates and backend row caps.
Missing/foreign parents, contradictory ancestry or absent records yield only
`{kind: "missing"}`. Missing counts, truncation, malformed/foreign payloads,
duplicate IDs, permission/transport errors yield only `{kind: "unavailable"}`;
no backend details or partial private results escape. Invalid syntax or missing
required contextual parents yields `{kind: "invalid"}` before even auth reads.
Non-selected dashboard outcomes (redirect/invalid/unavailable/missing/empty) are
forwarded without catalog reads or fallback to another business.

## Focused verification

`node --test apps/web/tests/owner-catalog-navigation.test.mjs` exercises the public
helpers, actual static React navigation markup and the unchanged legacy owner
URL/parser boundary. Static markup is not browser navigation or hydration proof.
The implementation spec and live work-unit status are in
[owner-resource-navigation.md](../odd/tasks/owner-resource-navigation.md).
