# Configured checkout — quotation and immutable history

SOURCE only. Pure quotation, stored v2 history dispatch and additive browser codec
exist. New v2 POST/service/SDK finalization is not wired in this prefix. No UI or
deployment claim.

## Capability contract shared with T4/T5

`apps/web/app/lib/catalog-configuration-runtime.ts` exports:

- `CatalogConfigurationRpc`: minimal server-owned `rpc(name,args)` dependency.
- `readCatalogConfigurationCapability(client)`:
  `Promise<"ready" | "legacy_only" | "unavailable">`.
- `createCatalogConfigurationRuntime(client)`:
  `{configurationCapability(), configuredCatalog(business,slug)}`.
- `CatalogConfigurationRuntime`, `CatalogConfigurationCapability`,
  `ConfiguredCatalogSnapshot`, `CONFIGURED_SNAPSHOT_MAX_BYTES` (16 MiB).
- `validateConfiguredCatalogSnapshot(value,business,slug)`:
  fresh private snapshot or `null`.
- `projectConfiguredCatalog(snapshot,itemId)`:
  T1 `ProfileResult<ProfileCatalog>`, never a wrapper or public DTO.

Capability calls `catalog_configuration_capabilities` with `{}`. Only the exact
single-row `[{version:2,schemaVersion:1}]` is ready. Only `PGRST202` with the exact
public function name and no-argument schema-cache message/details is legacy-only.
Both PostgREST detail forms (with/without the unnamed JSON argument alternative)
are recognized. An unrelated function/parameter signature, transport/permission
failure, empty/multirow/bare-object response or unknown fields/types is unavailable.
There is no undefined-method fallback and no capability cache in this adapter.

## Private snapshot / projection

`configuredCatalog` calls only service RPC `pickup_order_catalog_v2` with exact
`{p_business,p_slug}`. RPC errors throw unavailable, including a missing v2 RPC
after ready capability; they never select legacy. SQL NULL remains `null`.

The adapter checks exact wrapper keys, version 2/schemaVersion 1, business/slug
binding, SHA-256 format, row keys/types/identity uniqueness and same-business
item/group/option/profile references. Payloads are bounded to 16 MiB and depth 24.

Projection selects only the requested root, its configured fixed children, their
groups/options and profile records, explicitly constructs the exact T1 fields,
and calls `validateProfileConfiguration`. T1's 1000 rows/2 MiB ceilings apply only
to this projection, not every historical business row. Active invalid profiles
fail, never become legacy. Availability is not structural: exhausted fixed choices
leave unrelated projections valid; purchase selection validation remains T1's job.
The returned projection is fresh; wrappers/private unrelated data are not spread.

These helpers do not authorize actors, verify receipts, certify prices or expose
HTTP data. Only server-owned composition may supply the privileged RPC client.
No capability result proves deployed SQL correctness or permits profile activation.

## Pure v2 contracts for service/history integration

`apps/web/app/lib/configured-order-quote.ts` exports:

- `normalizeConfiguredPickupIntent(input: unknown, slug: string)` returns
  `{ok:true,intent:ConfiguredPickupIntent}` or `ConfiguredOrderFailure`.
- `quoteConfiguredPickupOrder(input: unknown, snapshot: ConfiguredCatalogSnapshot)`
  returns `ConfiguredQuoteResult` (shapes below). Its second argument is the
  **private validated adapter snapshot**, not client input. Runtime validation
  still rejects malformed snapshots and mismatched slugs.
- Types `ConfiguredIntentLine`, `ConfiguredPickupIntent`, `ConfiguredQuoteLine`,
  `ConfiguredPickupQuote`, `ConfiguredOrderFailure`, `ConfiguredQuoteResult`.
- `CONFIGURED_ORDER_MAX_BYTES = 1048576` (1 MiB).

The exact wire body is `{version:2,requestId,receiptId,contact,expected,lines}`.
The slug remains the old route/query argument; a body slug, actor, business,
name, price, extra key, absent version or unsupported version is rejected.
The exact SQL/internal intent is:

```ts
{version:2, slug:string, requestId:UUID, receiptId:UUID,
 contact:{name:string,email:string,telephone:string},
 expected:{currency:string,totalMinor:number},
 lines:{itemId:UUID,quantity:number,selection:ProfileSelection}[]}
```

`ProfileSelection` is exactly T1's leaf/legacy/combo shape from
[catalog-configurations.md](catalog-configurations.md). The additive
`parseProfileSelection(unknown): ProfileResult<ProfileSelection>` export in
`catalog-profiles.ts` uses its existing private parser and byte/depth bounds.
It does not consult a catalog or change any previous API. Structural parsing
cannot know which fixed instances a catalog requires; quotation validates every
required component/index against its current configuration.

Normalization reuses the **unchanged** v1 normalizer for UUID, contact trimming
and validation, expected currency/total, slug, line quantity (1..99) and common
line shape. It does not convert a v1 request to v2. Limits remain 100 lines,
1000 aggregate groups and 1000 aggregate picks (including child instances), plus
T1's per-selection resource limits. Legacy duplicate picks reject; potential
identical pizza halves remain intact until T1 validates against the profile.
UUIDs lowercase; groups/picks sort by ID; instances sort by component ID then
index; lines sort by item ID plus selection JSON. Duplicate canonical variants
reject. Normalization is independent of current profiles/versions, preserving
replay identity after catalog changes. Never use a later quote's deduplicated or
catalog-ordered selection to rewrite an accepted attempt's intent.

Quotation explicitly projects each root and fixed children through the existing
adapter and calls T1 validation, `priceProfileSelection` and
`describeProfileSelection`. Invalid active profiles cannot become legacy; inactive
or missing records require legacy version 0. Current availability, versions,
references, restrictions and size/flavor compatibility are mandatory. Unavailable
fixed choices do not invalidate unrelated projections. Pizza uses full selected
size prices, floor-cent average plus one store fee for two distinct flavors;
identical halves become one/no fee. Dozens require exactly twelve units at the
parent fixed price. Combos validate every independent instance but bill only their
own fixed price, never child prices/deltas/fees. Wrapped legacy selections retain
the old helper's price, including its old multi-distinct fee.

Exact quote metadata is SQL's shape:

```ts
{version:2,snapshotFingerprint:string,businessId:UUID,currency:string,
 totalMinor:number,contact:{name,email,telephone},lines:ConfiguredQuoteLine[]}
// Each line has exactly:
{itemId:UUID,quantity:number,selection:ProfileSelection,name:string,currency:string,
 profileVersion:number,profileKind:"legacy"|"standard"|"pizza"|"dozen"|"combo",
 unitPriceMinor:number,lineTotalMinor:number,surchargeMinor:number,
 selectionText:string,groups:ProfileGroupSnapshot[],
 components:ProfileComponentSnapshot[]}
```

The T1 group/component snapshot shapes are documented in the domain guide.
Selection retains root/child profile versions and component/index identities;
components include trusted child item IDs/names and selected groups/options/names.
Descriptions plus accepted parent prices and quantities render without a later
catalog lookup. Child snapshots are configurations, **not additional charges**.
Only these explicit accepted fields leave the private snapshot: no wrapper spread,
profile documents, matrix, unrelated rows or private error details. Results are
fresh and do not mutate even frozen inputs; callers must persist accepted quote
JSON immutably. Runtime object freezing or persistence is not this module's job.

All amounts and arithmetic must stay nonnegative JS-safe integers; currencies
cannot mix. Both normalized intent and completed quote are capped to 1 MiB using
UTF-8 pretty JSON as a conservative upper bound for SQL `jsonb::text` separators.
This can reject near-limit payloads earlier, never truncate them. Cycles,
non-JSON values and depth above 24 reject before serialization; T1 independently
uses its stricter selection limits. Output cap failure is `amount_out_of_range`.

Success is `{ok:true,quote}`. Expected total **or currency** mismatch returns
`{ok:false,code:"quote_changed",quote}` with a fully trusted correction quote.
Every other failure is **only** `{ok:false,code}` with no payload/details:
`invalid_request`, `invalid_selection`, `mixed_currency`, `unavailable`, or
`amount_out_of_range`. Malformed/private catalog or active document failures and
T1 `unavailable` map to `unavailable`; selection/version/option-availability errors
map to `invalid_selection` (as legacy option validation does). Safe price/total
failures map to `amount_out_of_range`.

This module performs no writes or authorization. The SQL fingerprint certifies
**freshness, not price**. Historical attempt lookup must still precede catalog
fetch/pricing; correction is not permission to retry a write automatically.

`configured-order-presenter.ts` validates stored envelope/contact/currency/total,
intent identity, multiplication, line/profile/selection bindings, group/pick
snapshot bindings and component/instance/version identities. It projects explicit
fresh data. The browser codec reuses its line validator, preserves v2 metadata and
binds returned selections to the submitted intent. Identical halves are the only
allowed intent-to-quote collapse (pizza, or a leaf within a combo). Without a
current catalog, historical validation cannot independently authenticate an
arbitrary renamed child or recompute commercial prices: immutable trusted stored
quotes remain the authority, not an invented cryptographic price certificate.

`ConfiguredOrderIntent` is the wire v2 intent (no slug), `AcceptedOrderIntent`
unions it with the unchanged legacy `OrderIntent`, and `ConfiguredOrder` adds
`version:2` plus typed rich lines to the existing common DTO. `requestOrder` sends
version 2 only for that intent and retains one-request/no-retry behavior. Existing
technical attempt references and read-only unknown recovery remain unchanged.
