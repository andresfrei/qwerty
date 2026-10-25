# Owner catalog resource navigation

## Delivery status

The navigation/query foundation is prepared first. Its section components are not
yet mounted in the legacy catalog: no links to unfinished pages are advertised.
Record routes and form integration remain subsequent work units. A server-only,
injectable taxonomy/Products read slice and bounded choices GET endpoint now exist.
T3's data foundation covers category/component/group selection; selector widgets,
form integration and mounted resource pages remain T4–T6 work.
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
parser. Category/component choices use the bounded HTTP contract below. This taxonomy API's
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

## Bounded choices HTTP contract (frozen T3 → T4/T5/T6)

`GET /owner/catalog/choices` is read-only, dynamic and session-role only.
`catalog/catalog-choice-query.ts` exports `CatalogChoiceQuery` and
`parseCatalogChoiceQuery(URLSearchParams): CatalogChoiceQuery | null`.
The separate exact query accepts only:

- `selectedBusinessId`: required UUID, normalized lowercase; **no default store**.
- `kind`: required literal `categories|items|groups`, never a table/resource URL.
- `q`: optional, default `""`; trimmed, maximum 100 characters, no controls.
- `page`: optional, default 0; canonical zero-based integer through 1000000.
- `itemId`: required UUID for `groups`, forbidden otherwise, normalized lowercase.

Duplicates, unknown fields, arrays encoded as bracket keys, malformed/context-free
IDs and noncanonical pages fail before client creation. `businessId`, `storePage`,
`groupId`, arbitrary return URLs and other kinds are not accepted. Existing shared
owner/mutation parsers remain strict and unchanged.

`catalog/catalog-choices-gateway.ts` exports `CatalogChoice`, `CatalogItemChoice`,
`CatalogChoicesDTO`, `CatalogChoicesDependencies`, `createCatalogChoicesGateway`
and `handleCatalogChoicesRequest`. A successful JSON body is exactly:

```ts
{
  selectedBusinessId: string;
  q: string; // normalized search; completeness applies to these matches only
  pagination: {
    page: number; pageSize: 25; total: number; hasMore: boolean;
    pageComplete: true; collectionComplete: boolean;
  };
} & (
  | { kind: "categories"; rows: { id: string; label: string }[] }
  | { kind: "items"; rows: {
      id: string; label: string;
      itemKind: "legacy" | "standard" | "pizza" | "dozen" | "combo";
      isAvailable: boolean;
    }[] }
  | { kind: "groups"; itemId: string; rows: { id: string; label: string }[] }
)
```

The exported pagination type is the existing `CatalogPagePagination` (its
`pageSize` is typed `number`; runtime size is fixed at 25). Items expose explicit
kind/availability, not inferred names or eligibility guarantees. Inactive/absent
profiles are `legacy`; typed-missing capability also retains legacy behavior.
No full item, category object, profile version/document, component matrix,
photo path, account, owned-business list or parent object is serialized.

The gateway reuses `resolveOwnerContext` for fresh confirmed-owner scope and the
configuration route's verified-refresh notification. The existing N2/N3 page
readers then perform their own fresh dashboard authorization; no cached owner,
second-business fallback or alternate catalog query implementation is introduced.
Groups require a scoped existing item before reading its groups. Categories use
one counted page; Items reuse bounded profile metadata/category batches; Groups
use an item singleton plus one counted group page. No mutation RPC or retry is
available; the only Items RPC is the existing read-only capability probe, once.

Every response carries JSON, `private, no-store`, `Pragma: no-cache`, `Expires: 0`,
`Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, and no CORS grant.
GET allows omitted Origin or exactly the configured same origin; trusted target,
host/forwarding, method, query and absent body are checked before identity.
Unsupported methods return `405 {error:"method_not_allowed"}`, `Allow: GET`.
Rejected target/origin returns `400 {error:"request_rejected"}`; malformed query
or GET body/encoding/nonzero content length returns `400 {error:"invalid_request"}`.
Unverified identity returns `401 {error:"unauthorized"}`; missing/foreign selected
business or item parent returns `404 {error:"not_found"}`. Missing configuration,
provider/count/shape/truncation failures return `503 {error:"unavailable"}` without
private details or partial rows. Staged session refresh is discarded for rejected
ingress/unverified identity, but retained after confirmed identity on late 404/503.

Consumers must request later pages/search explicitly: page zero is not a full
selector unless `collectionComplete` is true (only for that query). Search across
matches does not establish global completeness. Keep previously selected IDs
separately; this endpoint does not resolve a selected ID outside the current page.
Use prior scoped detail/configuration readers for existing selections and final
validation. Never automatically repeat writes after a choice fetch or claim a
choice grants mutation authority. No React selector/page is mounted by T3.

## Classic form foundation (partial T4; not mounted)

`catalog-form-lifecycle.ts` exports `createCatalogFormGate`, `CatalogFormGate`,
`CatalogFormIdentity`, `CatalogFormBinding`, `CatalogFormSnapshot`,
`CatalogFormSender`, `CatalogInspection`, and `catalogInspectionHref`.
One gate instance must outlive **all** concurrently reachable classic controls;
never instantiate it per form or per writable page. It is client memory, not auth.

- `bind(identity)` returns an immutable `{key}`. Keep that binding stable for the
  mounted form. Identity includes accountId, businessId, action, target
  `{kind: record|parent|singleton, id}`, and lifecycle generation. Bindings coexist:
  e.g. category rename and reorder share one gate, not one lock each.
- `submit(binding, FormData)` validates through unchanged `catalogFormPayload`,
  matches action/record/creation parent, then synchronously acquires the gate
  before calling unchanged `sendOwnerMutation`. Default transport retains JSON
  POST, same-origin credentials, no-store and redirect:error. There is no retry.
- `getSnapshot()` returns stable immutable `{state, message, pendingKey?}`;
  `subscribe(listener)` returns an unsubscribe callback. Pending/saved/unknown
  block every submission. Explicit rejection returns idle without touching inputs.
- `retire(binding)` invalidates callbacks when identity changes/unmounts. Retiring
  a pending operation changes the gate to unknown, **not idle**. Late responses
  cannot change the next form's fields, lock, message or navigation state.
- `canNavigate()` is false while locked. Its sole exception takes
  `{inspectionHref, businessId}` matching the outstanding operation. It neither
  navigates nor clears state. `catalogInspectionHref(href, businessId)` returns
  the original validated local Catalog list/detail/settings href or null. It
  rejects foreign/missing business, external URLs, creation/actions, fragments,
  unknown/duplicate query keys and path normalization tricks, using frozen N1.

`catalog-form-view.tsx` exports `CatalogClassicForm` and
`CatalogClassicFormProps`: identityKey, title, action, state, pending,
 pendingLabel, onSubmit, children, optional save (default Guardar). Children must
be fields, never forms. It keys the actual form so identity changes deliberately
reset uncontrolled inputs; fieldset/button retain the classic presentation.
`catalog-editor-client.tsx` additionally exports unchanged `Field` and `Available`
primitives; default CatalogEditor behavior and optional business mode are intact.

Example adapter contract: keep `binding = gate.bind(identity)` stable; pass
`identityKey={binding.key}`, `state={snapshot.state}` and
`pending={snapshot.pendingKey === binding.key}`. Its onSubmit must call
`event.preventDefault()` then `gate.submit(binding, new FormData(event.currentTarget))`.
Retire the old binding when identity changes; never reset the shared gate.
For creations use business parent for categories, category parent for products,
item parent for groups, group parent for options; settings/publication use the
business singleton. Updated records use their actual category/item/group/option ID.

**Not complete:** no React scope/provider, shared layout, browser interception,
beforeunload warning, read-only destination rendering, or resource field bundles
are wired here. The next T4 unit must preserve the gate across internal navigation
(including history/programmatic paths), connect explicit GET inspection to a
read-only view with no writable editors, and prove mounted lifecycle behavior.
`canNavigate` is only a public policy contract, not an installed browser guard.
Do not mount these foundations alone and claim unknown-outcome protection.
No authorization/business selection may exist only in a cached Next layout;
request pages/actions must continue fresh confirmed-owner checks.
Classic locks are NOT durable across full reload/tabs/restart; a GET inspection
never proves exactly-once creation. Profile CAS remains separately durable.

## Focused verification

`node --test apps/web/tests/owner-catalog-navigation.test.mjs` exercises the public
helpers, actual static React navigation markup and the unchanged legacy owner
URL/parser boundary. Static markup is not browser navigation or hydration proof.
The implementation spec and live work-unit status are in
[owner-resource-navigation.md](../odd/tasks/owner-resource-navigation.md).
