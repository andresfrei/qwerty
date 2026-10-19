# Pickup proof fixture reconciliation and sequential SQL evidence

**S20 source repair reviewed; exact corrected SQL executed once under S21 and rolled back without SQL error.**
S18/S19 are spent. Schema `20261019195149` remains unchanged. The prior engine
23502 is preserved evidence, not a new production-order defect. Independent SOURCE review passed before S21; that execution grant is now consumed.

## Compatibility matrix

All fixture INSERTs name columns explicitly. IDs below abbreviate the exact
`81000000-0000-4000-8000-000000000` prefix. Defaults listed are intentionally
omitted columns, not permission grants. The table records the S20 audit; its assertions were subsequently exercised inside the successful S21 rollback transaction.

| Table | Mandatory columns supplied / defaults used | FK, check or guard / fixture binding and mutation expectations |
| --- | --- | --- |
| `auth.users` | `id`; explicit `is_anonymous`, `is_sso_user`; role/aud, email/confirmation, metadata and timestamps | 001 anonymous buyer; 002 confirmed owner; 003 confirmed same-contact-email stranger. Generated `confirmed_at` untouched. Nullable phone/token fields do not supply authority. Operator alone clears/restores confirmation and sets/clears `deleted_at` on002. Current Auth-row guard must deny unconfirmed/deleted owner despite forged claims. |
| `businesses` | `id,owner_id,name`; `created_at=now()` | 010→002; 011→003; owner Auth FK. Authenticated owner UPDATE of `owner_id` must raise42501 (only name UPDATE granted); owner and visibility unchanged. Separate operator-only FK-valid rewrite010→003 retains former-owner0/current-owner1 RLS control; not an app ownership-transfer feature. |
| `business_storefronts` | `business_id,slug,display_name,is_published` explicit | 010; unique safe slug `proof-pickup-81000000`, nonblank name. Operator unpublishes→`unavailable`, restores→creation; later unpublishes again, replay still wins. |
| `catalog_categories` | `id,business_id,name`; sort0, timestamp now | **New031→010**, nonblank name; inserted before item. Composite unique `(business_id,id)` supplies item FK. No category mutation. |
| `catalog_items` | `id,business_id,category_id,name,price_minor,currency`; available=true, sort0, timestamp now, photo_version0; nullable description/photo_path | 030→010/031. **Previously missing required category** repaired. Composite category FK forbids foreign binding. Operator name/price1001/currencyUSD/availabilityfalse changes each fence; price9999 + unavailable after creation must not reprice replay. No photo writes. |
| `catalog_option_groups` | `id,business_id,item_id,name,selection_mode,min_select,max_select`; sort0 | 050→010/030; distinct, bounds0..1. Operator name/bounds1..1 mutations remain check-valid and change fingerprint. |
| `catalog_options` | `id,business_id,group_id,name,price_delta_minor`; available=true, sort0 | 051→010/050; delta100. Operator name/delta101/availabilityfalse each change fingerprint. Same-business composite FK. |
| `business_catalog_settings` | No initial row; mutation names `business_id,two_flavor_surcharge_minor` explicitly | Missing row means effective0 in catalog function, not an INSERT default assumption. Temporary010/1 is nonnegative, changes fingerprint, then subtransaction restores absence. |
| `guest_receipts` | `id,actor_id,business_id,object_path,content_type,size_bytes,sha256`; staged, timestamp now | 020→001/010; exact `010/001/020` full-UUID path; PNG,1 byte,64 lowercase hex. Metadata only, no uploaded bytes. App roles cannot UPDATE; referenced DELETE by operator must fail23503. Consumption is order reference, never state rewrite. |
| `pickup_orders` | Direct probes/finalizer supply actor,business,request,receipt,intent,quote,currency,total; generated UUID, timestamp now, fulfillment `pendiente_de_pago`, payment `pendiente` | Before consumption, wrong actor/business must fail23503. After creation, **valid actor/business** + unused041 isolates receipt uniqueness23505, avoiding unrelated FK precedence. NULL request fails23502. Generated order IDs are not fixed/adopted; business and global counters cover residue. Quote/state UPDATE and DELETE must fail42501 for anon/authenticated/service. |
| `storage.objects` | No INSERT/UPDATE/DELETE; read-only count and exact-path absence checks | No original receipt/Storage proof. Metadata reports vendor delete/update triggers; neither is invoked. No vendor defaults/bodies assumed. |

Deployed metadata reports no custom triggers on the ten Auth/public tables above;
FK enforcement remains active. Thus there is no evidence of an owner-identity
trigger blocking the operator-only control. Existing source column grants, RLS
and `private.owner_email_verified()` supply the application authority boundary;
operator setup is not tested as an app privilege. No schema/guard/policy changed.

## Whole-packet expectations

- Six effective EXECUTE assertions precede setup; actual browser RPC42501 probes
  supplement them. An insufficient downstream table privilege alone is not proof
  of RPC EXECUTE denial. Browser INSERT DEFAULT VALUES expects42501 before NOT NULL.
- Receipt, order and private-bucket object baselines remain global: require a
  quiescent window. Denial/rejection loops compare counts and full receipt JSON.
  Catalog fences now also compare receipt count; publication rejection now checks
  all unchanged counters/receipt. Final checks compare complete immutable order.
- Quote version1, ARS1000, optional unselected group and empty selection agree
  with the existing Node normalizer/quoter. SQL mixed-line USD returns
  `mixed_currency` before fingerprint validation (S17), not conversion.
- Each catalog mutation is rolled back by QW002, not an inverse UPDATE guessing
  old values. All operator updates obey column checks and retain FK identities.
  Publication is explicitly restored before first creation.
- Replay of identical intent with NULL quote precedes publication/repricing;
  changed contact conflicts, fresh041 with consumed receipt returns `receipt_used`.
  Buyer/current verified owner read1; stranger owning only011 reads0 despite same
  typed email/forged metadata. Anon SELECT and immutable application writes deny.
- Every SET ROLE is LOCAL and reset after its probe; both JWT sub representations
  are set locally before browser probes. Auth mutations run only after RESET ROLE.
  QW001 rolls back setup, claims and mutations; unrelated errors propagate and
  abort the transaction. Explicit residue checks precede outer ROLLBACK.
- Collision refusal and postrollback checks cover Auth/business IDs, receipt,
  category/item/group/option IDs and both business bindings, settings, storefront
  business/slug, attempts040/041, and exact private Storage path. No adoption or
  deletion cleanup. Unexpected residuals fail, never trigger cleanup writes.

## Evidence and proposed future scope

Repository evidence: `supabase/tests/database/mvp_pickup_orders.remote.sql`,
`apps/web/tests/order-sql-contract.test.mjs`; migrations
`20260928195456_mvp_2_owner_boundary.sql`, `20260928202627_mvp_3a_storefront_catalog.sql`,
`20260928203548_mvp_3a_catalog_items.sql`, `20260928221220_mvp_3b_ordered_categories.sql`,
`20260929054538_mvp_owner_verified_email.sql`, `20260929120000_mvp_pu2_catalog_options.sql`,
`20261001090000_mvp_guest_receipts.sql`, `20261002120000_mvp_pickup_orders.sql`.
Parent-supplied deployed catalog evidence is the local-only
`.pi/order-fixture-reconciliation/schema-metadata.txt` (11 tables; metadata only).
No committed test or document requires loading that artifact at runtime.
Historical failed proofs/consumed markers are unchanged; see task L105–L108.

Proposed scope for a **future separately authorized** single rollback proof:
identified target `https://jxebudqzcmxgdsegrrqw.supabase.co`, existing schema only;
Auth001–003, businesses010/011, receipt020, item030, **added category031**,
attempts040/041, group050, option051, storefront slug above, temporary settings010,
Auth confirmation/deletion timestamps, and operator-only ownership control.
No new fixed order IDs; generated order IDs remain inside the rollback.
Writes touch only these ten Auth/public fixture tables; Storage objects are
counted, not mutated. Keep20s statement/3s lock limits, collision refusal,
QW001/QW002 and outer rollback. Parent must review final SQL hash before asking
for consent; this proposal is not execution authorization or a frozen marker.

Static evidence: required command
`node --experimental-strip-types --test apps/web/tests/order-sql-contract.test.mjs`.
Initial RED exit1:7 passed/3 failed (463.399769ms); additional deterministic-key
regression RED exit1:10/1 (129.124067ms). First GREEN exit0:11/11 (141.327723ms).
Self-review then strengthened preservation of operator-only authority controls;
its static regression observed RED exit1:10/1 (128.876066ms). Final result and
proof hash are recorded in the transaction document. Exact stdout/stderr remain
in the worker tool transcript; existing MODULE_TYPELESS_PACKAGE_JSON warning.
These are **static source regressions**, not SQL parser/security/atomicity proof.

Self-review: S4 immutable receipt/idempotency/fences retained; S6 effective ACL,
current Auth-row owner/buyer/foreign isolation retained with app/operator split;
S8 no local/remote execution; S17 single-currency rejection retained; S20 complete
fixture audit/correction only. No unresolved metadata blocker identified; engine
proof remains pending. Independent risk review belongs to the parent. Races,
HTTP/API/UI/cart acceptance, original GET, Auth/Storage requests, migration replay,
photo/full-suite/type/lint/build and shared-CLI differential (unchanged) are not
executed here. No staged files, commits, marker changes or new dependencies.

## Parent delivery readback

Independent reviewer `mvfpfudr-17-kuy4` found no P1/P2 in the complete reconciliation and ran11/11 SOURCE checks (exit0). Parent reran the focused11 once (exit0,240.689015ms), checked the production-schema/quote/photo diffs empty, and recomputed the proposed SQL SHA256 as `f414eb52bfccf758ca9e93112962dd31faeb89f423dc1dee23d3e78191030420`. The reviewer did not independently recompute that hash: its optional query timed out and was not retried.

These are source checks, not PostgreSQL execution or native approval. Full-suite/photo checks remain explicitly deferred; historical engine failures and all spent markers are retained. No remote writes occurred during F1.

## Subsequent S21 execution

The exact proposed proof ran once on the identified target and completed without SQL error (empty tool result array; no per-case count reported). Its DO assertions and outer rollback completed; a separate read-only query observed all eleven exact fixture/Storage namespace counters zero, including category031. No remigration or Storage write occurred. Earlier source-only statements above describe the preparation phase, not a second execution.

S21 proves this sequential SQL bundle, not concurrent transactions, original receipt bytes, actual Auth/session/HTTP or UI behavior. The grant is consumed; no further backend writes are authorized by these results.
