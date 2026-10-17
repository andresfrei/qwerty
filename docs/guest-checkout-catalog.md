# Public checkout catalog source contract

`readCheckoutCatalog(slug, fetcher?)` in `apps/web/app/lib/checkout-catalog-reader.ts`
adds checkout-only option reads. It is not a route, session initializer or order API.
The existing `readStorefront`, browsing/cart persistence and T1 publication check
are unchanged and acquire no new queries or failure modes.

## Result and use

The discriminated result retains `not_found`, `misconfigured`, `unavailable` and
`ok`. Only `ok` contains the published `storefront`, ordered public `categories`
and available items, plus `groups: OptionGroup[]`, `options: Option[]` and
`surchargeMinor`. Groups reference returned item IDs; options reference returned
group IDs. Each is ordered by `sort_order`, then ID.

For an item, filter `groups` by `item_id` and pass those groups, options,
`surchargeMinor`, the item and user selections to the existing `validateSelections`,
`priceSelection` and `describeSelection` functions. The same request works with
`addSelectedCartItem`. Do not pass every item's required groups to one request.
No pricing, selection or cart algorithm is duplicated here.

PU2 has no item kind, pizza flag, dozen flag or separate size mode. Its actual
modes are `distinct` and `quantity`; groups carry `min_select`, `max_select` and
`sort_order`. A dozen uses quantity bounds of 12; pizza halves use distinct
flavors with at most two choices. The existing helpers own their pricing and text.

## Public boundary and failures

- Resolve through `readStorefront` first. Unknown, unpublished or invalid slugs
  never query groups, options or settings.
- Reuse validated public configuration and fixed-origin REST endpoints. Requests
  use only the public key, no-store, omitted credentials and rejected redirects;
  there are no caller cookies/JWTs, Auth calls or private-user reads.
- Explicitly select group/option fields and only `business_id` plus
  `two_flavor_surcharge_minor` from settings, never wildcard settings.
- Scope groups to the business and resolved available item IDs. Then scope
  available options to the business and validated group IDs. Options and settings
  run in parallel; options cannot run before group resolution. Empty item/group
  sets skip their dependent query, not the settings requirement.
- Validate modes, limits, nonnegative integer prices/sort order, IDs, duplicate
  identities and business/item/group relationships. Reject the entire result on
  malformed data, failed reads or foreign relationships. Required groups remain
  present even if no option is available, so the pure validator rejects missing
  selections rather than pricing an unconfigured base item.
- PU2 defaults the surcharge column to zero **on an inserted settings row**; it
  does not guarantee a row exists for every business. A complete successful
  zero-row settings read yields zero, matching the existing owner catalog's
  fallback without introducing a setup prerequisite. Explicit zero is also valid.
  Failed reads, missing/partial metadata, malformed/foreign or multiple settings
  rows remain `unavailable`; they never fall back to zero.
- Checkout fetches request exact counts and require matching Content-Range totals
  and ranges. A known-complete 1,000-row page is valid; over-limit or truncated
  results fail closed (including storefront reads made by this reader).
  This intentionally bounded reader does not paginate. It does
  not silently price a partial catalog. Large menus need a separately validated
  paginated contract; backend/proxy omission of count metadata is unavailable.
- Only explicit public fields are returned; unexpected extra payload fields are
  not forwarded. Failure results contain no partial priceable catalog.

## Proof and limits

Synthetic injected-fetch tests exercise the exported reader, existing pure helpers
and original storefront sequence. No provider, live database, schema/grant/config
change or anonymous/manual-linking enablement is part of this unit. Existing
commands and shared implementations are unchanged; shared-code differential is
not applicable. The previous reader/cart tests run in the full suite.

This is a source read contract, not transaction-authoritative pricing. Multiple
REST reads are not an atomic snapshot: publication, availability or prices may
change afterward. A future server order boundary must revalidate and recalculate.
T2b must collect/configure required options before validating checkout; this reader
does not reconcile, erase or migrate stored carts. Contact UI, private receipts,
orders, account association, runtime/hosted proof and abuse controls remain future
work. Rollback removes only this reader, its focused test and this document.
