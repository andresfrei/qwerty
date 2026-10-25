# Public configurations — T5 connected source handoff

**Connected source; B1 independently closed.** The original verifier's limited
23-case recheck passed after canonical v1 binding was corrected. The separate
actual-React/current-CSS probe passed 59 checks with 14 screenshots and no JS errors.
The database rollout and 113 synthetic SQL assertions are recorded in
[catalog-configurations-sql.md](catalog-configurations-sql.md). These are bounded
proofs, not full Next hydration, real-account UI/Auth or two-session acceptance.
T1/T3 contracts remain in [catalog-configurations.md](catalog-configurations.md)
and [configured-checkout.md](configured-checkout.md); owner drafts are not public DTOs.

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

Both public pages use this reader. The classic readers remain intact; checkout
additionally loads the classic catalog only when a public root needs legacy
configuration. A failed classic supplement cannot disable a valid configured root.

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

## Accepted-order display

Buyer confirmation, private status and owner queue branch on stored `version:2`.
They render parent quantity/name/line total, root groups and each fixed component's
accepted name, zero-based instance displayed as “Unidad N”, group names and counted
option names. No current catalog or child price is fetched/added. Order and payment
states remain distinct. Existing v1 rendered output and callbacks compare equal to
old HEAD; no v1 markup branch or receipt authority was rewritten.

The three small v2 branches are inline to preserve the existing test harness and
avoid expanding the authorized fixture surface. A shared TSX component is optional
future cleanup, not a reason to omit any consumer. The separate React/CSS probe
covered 390px and 1440px; it did not exercise full Next SSR/hydration or real Auth.

## Connected page and component contracts

`/store/[slug]` passes the exact successful public DTO as `{catalog}` to
`ConfiguredStorefrontClient`, keyed by business and slug. It restores scoped v3
first, then the existing business-keyed v1/v2 cart, with zero load writes. When
there are no profiles/new scoped entries it delegates to the unchanged classic
`StorefrontClient`. Advanced additions and quantity changes persist only after an
explicit valid user action, using current refs to prevent lost rapid updates.
Only a public legacy classification enables simple add; unavailable is not legacy.

The reusable `ConfiguredSelection` component has props
`{catalog:ProfileCatalog,itemId,scope,initial?,disabled?,label?,onAccept}`.
`onAccept(selection):boolean` is synchronous: false keeps the choice editable;
true locks that accepted choice until edited/reopened. The picker is lazily loaded
with Next's existing dynamic loader, preserving classic imports/render behavior.
Scope/item/line or independent component-instance keys and disposal guards reject
stale callbacks. It renders native labeled controls, not a JSON inspector:

- Pizza selects a size and one flavor plus optional second half; incompatible or
  exhausted flavors are disabled. Identical halves resolve through T1 as one with
  no fee. No base pizza price is shown as a configured selling price.
- Dozen counters show the selected sum and require exactly twelve. Price is fixed.
- Standard/legacy groups use their actual distinct/quantity controls.
- Combo lists fixed products and every independent instance. Fixed groups are
  displayed; permitted variant controls honor allowlists. No substitutions,
  recursive items or child charges. T1 validates the complete choice and computes
  the live parent price. Invalid/incomplete choices cannot invoke accepted add.

Checkout's server page always mounts `ConfiguredCheckoutClient` for a valid slug,
including unavailable/unpublished current catalogs. Its exact `{page}` prop is
`{slug,publicCatalog:ConfiguredStorefrontRead,legacyCatalog:CheckoutCatalogRead|null}`.
Invalid slugs still 404. The boundary chooses the original `CheckoutClient` only
when public classification is legacy, the classic catalog is available, and no
new scoped cart/attempt exists; otherwise it mounts `ConfiguredCheckout`.
That controller-bearing component is recreated in each effect lifecycle, including
Strict Mode replay, and disposed on scope/data replacement. Recovery never needs a
current item/profile/publication to read an accepted stored order.

## Durable attempt and controller contract

`pickup-attempt.ts` retains all old technical-reference APIs and adds
`configuredAttemptKey(slug)`, `readConfiguredAttempt(storage,slug)` and
`saveConfiguredAttempt(storage,value)`. The new key is `qwerty:pickup:v2:<slug>`:

```ts
{version:2,businessId,slug,status:"pending"|"unknown"|"correction"|"confirmed",
 intent:AcceptedOrderIntent,cartSnapshot:{key:string,value:string},correction?:code}
```

The envelope version is distinct from wire version. `intent` is the complete v2
wire for configured/mixed carts, or unversioned v1 wire for all-classic advanced
input. New advanced v1 requests use the existing server normalizer's canonical
contact/UUID/line/group/pick ordering before freezing; the v1 body schema is unchanged. It contains contact, expected parent total, receipt/request IDs and every
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

T5's B1 is closed for S1/S8 by the original independent verifier's 23/23 recheck;
S2–S6 retain the earlier bounded verdict. T6 presentation and the specifically
consented T7 SQL rollout are complete in their scopes. Real-account UI/Auth,
clean-checkout behavior and two-session races are not certified by those results.

## Historical pre-B1 evidence

- New tests: reader 10, cart 9, stored-order actual render/callbacks 5.
- Foundation 24 cases plus 28 connected picker/controller/mount/attempt cases.
  Final focused new plus affected legacy readers/cart/checkout/attempt/order UI:
  **128/128**, no photo-parser/full suite/build/browser execution.
- Final `pnpm --dir apps/web exec tsc --noEmit --incremental false`: exit 0.
- Final `pnpm --dir apps/web exec biome lint app`: exit 0; pre-existing img warning.
- Scratch `.pi/catalog-configurations/public/differential.mjs`: 25 comparison groups
  (18 old-format cart/wire, three v1 exact markup/storage/callback, three v2 markup-
  only additions, one legacy public DTO). Reader's intentional deltas: one read-only
  capability POST plus credentials omission/redirect refusal. No real network.
- Connected scratch differential: three additional groups compare actual classic
  storefront and checkout callbacks/markup/HTTP/status/storage/write counts, plus
  shared all-classic advanced controller wire and receipt bytes. Intentional
  advanced deltas: zero load writes, full attempt envelope, scoped v3 cleanup and
  session redirect refusal. Classic flow writes four times; advanced writes three
  times only after explicit confirmation. All 12 T1/T3/T4/SQL hashes are unchanged.

RED: reader 0/6 and cart 0/8 initially failed on missing modules; later unavailable-
child disclosure and mismatched-slug failures reproduced before their fixes. UI
initial RED used an invalid repeated-component fixture; corrected fixture and text
serialization then passed. The scratch old-HEAD comparison demonstrates the valid
v2 display difference but is **not** pre-implementation RED evidence. Do not present
that UI lifecycle gap as strict-TDD compliance. Initial type/lint errors were fixed
in one focused batch; those historical checks preceded the independent B1 finding.

## B1 bounded correction and independent closure

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

Committed regressions use actual controller callbacks and fake HTTP backed by the
real three server functions, covering descending IDs, contact whitespace, group/
pick order, accepted-but-lost response, old raw payload recovery without a catalog,
matching cleanup and newer-key preservation. RED observed all three new cases as
unknown instead of confirmed. Final limited evidence and exact independent recheck
command are recorded in `.pi/catalog-configurations/public/correction/handoff.md`.
The original independent verifier subsequently ran only that limited command:
23/23 passed and B1 closed. The local correction pass alone was not its approval.
