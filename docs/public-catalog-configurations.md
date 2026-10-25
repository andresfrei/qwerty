# Public configurations — reader, cart and corrected durable controller available but unmounted

SOURCE prefix only; reader, cart and corrected durable controller available but
unmounted. No browser/CSS, remote activation or SQL/Auth/RLS/race proof. Independent
SOURCE review was of final bytes, not this intermediate prefix.

## Public reader contract

`configured-storefront-reader.ts` exports
`readConfiguredStorefront(slug, fetcher = fetch): Promise<ConfiguredStorefrontRead>`
and `PUBLIC_CONFIGURATION_MAX_BYTES = 1048576`.

Successful output retains the existing public `storefront` and `categories`, adds
`capability: "ready" | "legacy_only"` and `configurations`, keyed by public root ID:

- `{status:"legacy"}`: a complete successful active-profile read found none.
- `{status:"ready",catalog:ProfileCatalog}`: **explicit public** T1 projection of
  this root, fixed children, groups, options and active profile metadata only.
- `{status:"unavailable"}`: invalid active document or unreadable/invalid dependency;
  no document, missing child ID/name, price fallback or diagnostic accompanies it.

Only the strict T3 capability classifier enables the new table. Typed absence
returns legacy-only plus an empty configuration map, not a fabricated ready map.
Transport/permission/malformed capability yields `{status:"unavailable"}`; a caller
must retain its cart and must not treat every product as legacy. Other top-level
not-found/misconfigured/unavailable states follow the existing reader. A mismatched
returned slug rejects before any advanced reads.

All requests use the existing public-key factory, anonymous REST credentials,
`credentials:omit`, `redirect:error` and `cache:no-store`, never owner cookies,
service-role or a private catalog RPC. New row reads bind business/references,
require exact count metadata and cap each query at 1000 rows. Profile root IDs are
queried in batches of 100; T1's row/byte ceilings apply per dependent projection,
not to all legacy products. New responses stream-bound UTF-8 to 1 MiB, depth 24,
with a five-second fetch signal; overflow cancels the stream. These are technical
limits, not commercial limits. No truncation is accepted.

Unavailable options remain public metadata with their actual boolean: do **not**
copy the old checkout reader's `is_available=true` option filter. T1 needs the full
pizza matrix/fixed-choice structure; selection still rejects agotado. Missing or
unavailable *items* are not exposed via a privileged fallback. Even a forged
successful supplemental response containing an unavailable child rejects. Missing
children disable only dependent combos; unrelated valid items remain usable.

## Additive cart and wire contract

`configured-cart.ts` exports:

- `ConfiguredCart = {businessId,slug,items:PublicCartLine[]}`. Legacy lines remain
  existing `CartItem` values with their flat `selection` arrays. A configured line
  has `configured:true`, a T1 `ProfileSelection` (including every child version),
  and the common name/price/quantity/text fields. Stored names/prices are advisory;
  the backend remains authoritative.
- `readConfiguredCart(value,businessId,slug)` returns `{ok:true,cart}` or
  `{ok:false}`. Null means empty. Existing unversioned/v1/v2 formats reuse the old
  normalizer; v3 requires both scope fields. No current catalog lookup, retagging,
  repricing, deletion or persistence occurs. Stale versions remain stored intent.
- `addConfiguredVariant(cart,request,units=1)` delegates validation, identity,
  pricing and description to T1. `changeConfiguredQuantity(cart,key,units)` treats
  zero as explicit removal. Both return `{ok,cart}`; rejection retains the exact
  original cart object. Quantities must be whole 1–99; an overflowing merge rejects
  rather than silently clipping. Root units multiply one complete combo.
- `configuredCartStorageKey(businessId,slug)` is
  `qwerty:cart:v3:<businessId>:<slug>`. `persistConfiguredCart(write,cart)` writes
  `{version:3,businessId,slug,items}` once and returns a boolean. It is an **explicit
  mutation operation**, never an on-load migration. This module does not read,
  overwrite or remove an old storage key. Mounted legacy-only code still writes
  its original v2 format. The mounted boundaries retain that classic path when
  there are no profiles or new scoped durable entries.
- `configuredCartIntent(cart,{requestId,receiptId,contact})` returns `{ok:true,intent}`
  or `{ok:false}`. All-legacy output is the exact unversioned v1 body. If any line
  is configured, output has `version:2`, full T1 selections, and old flat lines
  wrapped as `{kind:"legacy",profileVersion:0,groups}`. Only expected parent totals
  accompany IDs/choices/contact. Actor/business/slug/client-price extras are not
  copied. Arithmetic and mixed-currency failures reject; this helper is **not** a
  current-catalog quote, controller or authorization boundary.

`pickup-attempt.ts` retains all old technical-reference APIs and adds
`configuredAttemptKey(slug)`, `readConfiguredAttempt(storage,slug)` and
`saveConfiguredAttempt(storage,value)`. The new key is `qwerty:pickup:v2:<slug>`:

```ts
{version:2,businessId,slug,status:"pending"|"unknown"|"correction"|"confirmed",
 intent:AcceptedOrderIntent,cartSnapshot:{key:string,value:string},correction?:code}
```

The envelope version is distinct from wire version. `intent` is the complete v2
wire for configured/mixed carts, or unversioned v1 wire for all-classic advanced
input. A later controller unit canonicalizes new advanced v1 requests before freezing; this codec preserves original frozen intent. It contains contact, expected parent total, receipt/request IDs and every
root/component profile version and choice. Receipt **file bytes are never stored**.
The exact scoped snapshot key is either the selected v3 key or legacy business
key. Parsing uses T3 normalizers, bounds the envelope to 6 MiB, rejects extra
actor/scope fields and validates status/correction/snapshot binding. It preserves
original intent rather than rewriting it from an accepted deduplicated quote.
Old `readAttemptState` also exposes a valid new envelope's technical selectors.

`configured-checkout.ts` exports `loadScopedCart`, `publicItemCatalog`,
`cartLineSelection`, `inspectConfiguredCart`, and
`createConfiguredCheckoutController(page,{storage,fetcher?,uuid?,onChange?})`.
The controller exposes `snapshot`, `restore`, `editContact`, `setFile`, `quantity`,
`replace`, `review`, `prepare`, `upload`, `confirm`, `recover`, `dispose`.

Snapshot fields are `{phase,cart,contact,file,receiptId,attempt,reference,order,
reading,message}`. Phases are loading, idle, preparing, ready, uploading, pending,
unknown, correction, confirmed, unavailable and storage_error.

- Restore finishes before writes. Full envelopes take precedence over old refs.
  Scope/malformed envelope failures lock without replacement. A malformed current
  cart does **not** prevent a valid frozen attempt's GET. Unknown/missing GETs
  preserve the exact payload and durable bytes with zero storage writes or POSTs.
- Current T1 selection/pricing plus T3 wire/resource validation precede session or
  receipt effects. Pure preview validation uses unsent/unpersisted placeholder
  selectors, not allocated request IDs. Mixed currency, malformed and duplicate
  canonical variants reject before staging. Backend authority is unchanged.
- `confirm` canonicalizes v1 and v2 through their existing T3 normalizers (not a
  later quote), persists and reads back
  the full pending envelope before the only POST, then synchronously locks it.
  Concurrently changed durable intents and changed cart snapshots refuse dispatch.
  V1 remains unversioned; its canonical ordering now matches server presentation.
  The original classic component/helper path is unchanged; mixed legacy lines use
  profile version zero.
- Unknown/pending/saved states cannot edit, stage, allocate fresh IDs or resend.
  `recover` only GETs the same request. For already-frozen raw v1 intent it derives
  a separate canonical expected view using `normalizePickupIntent`, without
  rewriting stored intent bytes or resending. V2 keeps the original frozen intent,
  including duplicate halves/component versions. It never creates another session. Write generations and disposal reject
  late POST results after a GET winner or context change.
- Narrow known corrections retain cart, receipt and request. The UI requires an
  explicit review/reprice and another explicit confirmation. A changed version or
  old flat line on an active profile needs an explicit complete picker acceptance;
  no implicit retagging. Updating the catalog is an explicit page reload retaining
  the frozen reference. Rejection never auto-uploads/consumes another receipt.
- Accepted v2 displays use stored names/groups/instances only. Cleanup writes an
  empty scoped v3 tombstone only if the **currently preferred key and exact bytes**
  still match the submitted snapshot. An intervening v3 edit cannot be overwritten
  merely because an old v1 key remained unchanged. Old keys are not deleted.

## B1 bounded correction candidate

The controller previously validated v1 but froze cart order. Real
`normalizePickupIntent`/`quotePickupOrder`/`presentPickupOrder` return canonical line
order; the existing client binds lines by index. A reversed multi-line cart therefore
wrote an order once but showed unknown after POST and recovery.

The narrow fix reuses the existing normalizer for new v1 wire and a separate
canonical expected binding view when recovering an old raw v1 envelope. It does not
change the shared client, normalizer, presenter, DTO, cart format, pricing or v2
normalization. Frozen intent bytes remain exact; normal confirmed-status metadata
and only matching-snapshot cleanup retain their existing behavior. A newer preferred
cart/key must survive. No retry, new UUID, upload or current catalog lookup follows
recovery.

Regression tests use actual controller callbacks and fake HTTP backed by the
real three server functions, covering descending IDs, contact whitespace, group/
pick order, accepted-but-lost response, old raw payload recovery without a catalog,
matching cleanup and newer-key preservation. RED observed all three new cases as
unknown instead of confirmed. Final limited evidence and exact independent recheck
command are recorded in `.pi/catalog-configurations/public/correction/handoff.md`.
Do not treat a local correction pass as independent SOURCE approval.
