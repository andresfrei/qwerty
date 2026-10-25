# Owner catalog resource navigation

## Delivery status

The navigation/query foundation is prepared first. Its section components are not
yet mounted in the legacy catalog: no links to unfinished pages are advertised.
Record routes, bounded reads and form integration remain subsequent work units.
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

## Focused verification

`node --test apps/web/tests/owner-catalog-navigation.test.mjs` exercises the public
helpers, actual static React navigation markup and the unchanged legacy owner
URL/parser boundary. Static markup is not browser navigation or hydration proof.
The implementation spec and live work-unit status are in
[owner-resource-navigation.md](../odd/tasks/owner-resource-navigation.md).
