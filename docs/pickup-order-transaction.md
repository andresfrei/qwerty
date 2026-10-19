# Pickup order transaction — T4b source packet

**Latest remote state:** schema applied as migration `20261019195149`; the fully reconciled S21 SQL contract proof completed without SQL error and rolled back. Eleven exact fixture/Storage counters were observed zero afterward. This is sequential SQL evidence, not concurrent-session, HTTP, original-receipt GET or UI acceptance. Historical S18/S19 failures remain recorded below.
S4/S6/S8/S17; T4c needs independent review and NEW precise target/fixture consent.
Old S12/S15/S16 grants and consumed markers confer no permission. There is no
execution runner, configuration loader, network client, or fallback database.
The SQL files are review inputs, not commands to run during T4b.

## Trust and call contract

1. Future BFF verifies the current Auth actor, POST origin and strict request
   shape, then calls `normalizePickupIntent` from `order-quote.ts` unchanged.
   Neither actor nor business authority comes from typed contact/email/metadata.
2. Resolve `businessId` using trusted routing. Before any publication check or
   repricing, service reads `pickup_orders` by actor/business/request ID. Compare
   the **whole normalized version-1 intent** as JSON, not raw object key order,
   the current quote, or a catalog-dependent identity hash. A match returns its
   immutable result even if now unpublished. A mismatch is a conflict. SQL
   finalization repeats this check after serialization; a pre-read is advisory.
3. For a new attempt, service calls `pickup_order_catalog(businessId, slug)`.
   SQL returns `OrderCatalog` version1, or NULL if routing/publication fails.
   All business items/groups/options (including unavailable rows) are read in
   one statement; missing settings means surcharge0. The pure Node quote helper
   rejects malformed, oversized, unsafe, unavailable or mixed-currency catalogs.
4. Only `quotePickupOrder(...).ok === true` may supply `p_quote` to
   `finalize_pickup_order(actor, business, normalizedIntent, quote)`. Node remains
   trusted for validation and all price/selection math: SQL is NOT a second
   pricing engine. The SQL hash is NOT a pricing certificate. Malformed trusted
   payloads can raise cast/check errors; no error is a confirmed order.
5. SQL serializes receipt then actor/business/request with transaction advisory
   locks, reads the winner in a **new statement**, and only then checks receipt,
   quote and current canonical snapshot. `created` and `replayed` include the
   same stored order. Other codes: `invalid_request`, `idempotency_conflict`,
   `receipt_used`, `invalid_receipt`, `invalid_quote`, `mixed_currency`,
   `unavailable`, `catalog_changed`. A unique-constraint fallback also re-reads
   with fresh visibility for a trusted non-RPC writer. No invisible
   `ON CONFLICT DO NOTHING` result becomes success.
6. Require READ COMMITTED; other levels raise SQLSTATE25001. Use one finalization
   per short transaction, bounded statement/lock deadlines. Timeout, disconnect,
   deadlock or unknown response means **unknown outcome**, not safe resubmission
   with a new key. Recover using the original normalized intent and key.

The fence is the canonical JSONB payload's PostgreSQL UTF8 SHA256; Node passes
it through, never recomputes PostgreSQL JSON serialization. It covers routing,
publication (unpublished returns NULL), names, currencies, availability, prices,
selection bounds/modes, sort order and effective surcharge defaults. Rows are
UUID-sorted. A change anywhere in the business quote inputs can conservatively
reject an unrelated item attempt. Reverting to the exact same effective catalog
permits the same fingerprint. No revision history is promised.

**Freshness is at the final coherent snapshot, NOT commit time.** Catalog writers
are not locked; publication/price/availability may change after that snapshot.
There is no inventory reservation, stock decrement or global table lock.

## Persistence and readers

Immediate NOT NULL unique actor/business/request and receipt constraints are
independent of cooperative locks. Composite actor/business/receipt FK uses
RESTRICT, so a different actor/business cannot attach a staged receipt. The sole
receipt addition is the necessary composite unique key: no UPDATE, state change,
new receipt policy, Storage grant or private receipt GET change. Consumption is
only the durable unique reference. No Storage/SQL distributed atomicity claim.

Contact and quote snapshots are immutable in this unit. Initial fulfillment is
`pendiente_de_pago`, payment separately `pendiente` (primary roadmap S9).
No PU5 transition, refund, kitchen toggle or lifecycle permission is introduced.
Orders have exactly one currency; no FX, unlike-currency sums or client mutation.
The future UI must preserve cart/contact/receipt on rejection and clear only on
confirmed success. This source packet does not wire that UI or HTTP handlers.

New table: authenticated SELECT only, RLS buyer OR current confirmed owning-business
owner, using the existing `private.owner_email_verified()` current Auth-row guard.
Membership, matching typed email and forged JWT confirmation/metadata confer no
read authority. No anon access. Service has SELECT/INSERT only on orders plus
explicit catalog SELECT dependencies; existing receipt SELECT already exists.
No new SECURITY DEFINER, UPDATE/DELETE, default privilege rewrite or old-grant
revocation. Service's platform BYPASSRLS is a **trusted bypass**, not contained by
FORCE RLS, and direct service INSERT can bypass Node/finalizer validation. Never
expose service credentials or either RPC to a browser. Migration owner/operator
can of course alter data; immutability describes application role capabilities.

## Rollback permission/contract proof — repaired candidate, not executed

`supabase/tests/database/mvp_pickup_orders.remote.sql` is an executable operator
packet, with20s statement/3s lock limits and an unconditional fixture-subtransaction
rollback followed by residue assertions and outer ROLLBACK. Unexpected errors also
abort/roll back. Collision checks precede writes; never adopt existing fixture IDs.
No Storage object is uploaded; metadata fixture alone does not prove original GET.
Global counter comparisons require an isolated/quiescent reviewed target window.

Auth IDs810…001–003, businesses810…010/011, receipt810…020, item810…030,
category810…031, attempt810…040/041, optional group810…050 and option810…051
are exact in SQL. S20 source reconciliation adds the same-business category before
the item; see the [complete compatibility matrix](pickup-order-fixture-compatibility.md).
Future scope includes only those fixtures, their Auth timestamps, storefront,
optional options/settings and rollback. No broad deletion or fixture cleanup API.
The packet checks browser RPC/INSERT denials, unchanged receipt/row/Storage
counters, FK mismatch, NULL key, receipt DELETE restriction, single-currency
rejection, name/price/currency/availability/default/group/option fingerprint
changes, unpublished rejection, creation, replay before reprice/publication,
conflicting intent, reused receipt, buyer/confirmed-owner versus same-email
stranger, currently unconfirmed/deleted owner and all-role UPDATE denials.
These are **authored assertions**, not observed engine PASS results.

The packet also probes cross-business FK rejection, anon SELECT, all-role order
DELETE denial, authenticated owner-identity UPDATE denial, and a distinct
operator-only synthetic ownership rewrite (not an app transfer feature).
T4c must additionally prove immediate unique
constraints under races, full original receipt GET byte/metadata preservation with
real staging, and HTTP rejection cart/contact preservation. Validate ACLs including inherited/default
and column privileges; do not infer effective denial from these source greps.

## Two-session fresh-winner recipe — NOT EXECUTED

This deliberately requires a separately reviewed T4c setup/cleanup transaction:
committed fixtures and a committed winner are necessary to prove fresh visibility.
It cannot be honestly labelled an entirely rollback-only race. No automation in
this packet runs it, reads credentials or accepts/reuses an old consent marker.

Proposed exact race namespace uses820 instead of810 in every SQL fixture UUID,
slug `proof-pickup-82000000`, and owner email `owner-82000000@fixture.invalid`.
Review/adopt a new setup file in T4c before execution: copy only the explicit
fixture INSERTs from the rollback packet, add a second same-actor/business receipt
820…021 with its exact triple path, and collision-check every ID/slug before
COMMIT. Never replay the whole historical migration chain or this proof as setup.
Use real newly staged receipt objects instead when proving HTTP/GET, under a
separate exact Storage fixture grant. Freeze and record normalized intent I and
Node quote Q produced from this fixture, using existing `normalizePickupIntent`
and `quotePickupOrder`. Both sessions receive identical I/Q JSON in memory, not
private config files. Those reviewed literal JSON values are T4c packet inputs.

For each scenario use a fresh reviewed attempt (820…040 then041 then042 then043)
and receipt pair; reset only owned orders between scenarios with exact captured
order ID + actor + business + request + receipt predicates. Record before/after
order rows, receipt metadata JSON, original receipt bytes/hashes and owned counts.

**Session A** (operator connection with permission to SET ROLE):

```sql
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout = '20s';
SET LOCAL lock_timeout = '3s';
SET LOCAL ROLE service_role;
-- Substitute only the independently reviewed I/Q literals, not client quote data.
SELECT public.finalize_pickup_order(
  '82000000-0000-4000-8000-000000000001',
  '82000000-0000-4000-8000-000000000010', :'I'::jsonb, :'Q'::jsonb);
-- Assert created and retain exact returned order, DO NOT commit yet.
```

**Session B**, start while A remains open (separate connection, not pooled into A):

```sql
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout = '20s';
SET LOCAL lock_timeout = '3s';
SET LOCAL ROLE service_role;
SELECT public.finalize_pickup_order(
  '82000000-0000-4000-8000-000000000001',
  '82000000-0000-4000-8000-000000000010', :'I_B'::jsonb, :'Q_B'::jsonb);
-- Must block before A completes; observer records pg_blocking_pids(B_pid).
-- Coordinate A's completion inside the3s lock budget; no timeout retries.
```

Then A executes COMMIT (or ROLLBACK in the rollback-control case). B must return
the exact outcome below; compare returned order ID and complete immutable JSON,
not just non-error status. B ROLLBACK after recording. Observer uses a fresh
READ COMMITTED SELECT to assert the durable counts and unchanged receipts/bytes.

| Case | B payload / A completion | Required B outcome / durable orders |
| --- | --- | --- |
| Same key, same receipt | identical I; Q_B=NULL; A COMMIT | replayed, exact A order /1 |
| Same key, different receipt | I_B.receiptId=820…021; A COMMIT | idempotency_conflict /1; receipt021 unchanged |
| Different key, same receipt | I_B.requestId=next unused UUID; A COMMIT | receipt_used /1 |
| Same key, same receipt | identical I/Q; A ROLLBACK | created; B ROLLBACK leaves0 |

Additional race controls: reverse which session wins; A publishes/reprices only
after its order, then B still replays; a direct trusted INSERT without advisory
locks wins before finalizer INSERT, exercising the unique_violation fresh-read
branch. The last case requires a reviewed breakpoint/barrier harness in T4c;
a sequential call cannot prove that exceptional branch. Repeatable-read caller
must raise25001 with all rows/receipts/counters unchanged. Unexpected SQLSTATE,
NULL order, wrong ID, timeout or invisible-winner result fails that case; stop,
retain evidence and do not auto-retry.

Cleanup is a NEW reviewed operator-only packet, exact captured order IDs and
fixture ownership predicates, order first, options/groups/settings/items/
storefront/receipts/business then exact Auth IDs. Check residue after cleanup.
Do not grant application DELETE, disable FK/RLS, cascade unrelated data, reset,
or use an unbounded prefix deletion. Incomplete cleanup must be reported, not
hidden. No race/atomicity/security certification is claimed by this recipe.

## Review slices and evidence

Original packet slices before the P2 correction: migration+source-contract tests
(295 lines), rollback-engine packet+this transaction/race document (544 lines).
The second cohesive overage
keeps executable assertions, authorization limits and two-session protocol
reviewable together rather than compressing SQL or omitting negative controls.
Existing shared CLI/helpers were not changed: differential CLI testing is N/A.

Official references consulted read-only: Supabase changelog and database-functions
security/revoke docs; PostgreSQL transaction isolation and function volatility
(snapshot-per-statement versus STABLE snapshot) docs. Source checks are explicitly
not a SQL parser, a substitute database, an ACL audit or a concurrency proof.

Observed T4b foreground checks (full stdout/stderr retained in tool transcript):
- `node --experimental-strip-types --test apps/web/tests/order-sql-*.test.mjs`:
  exit0,5/5 on final source (268ms); four SOURCE lints and one existing-Node fixture check.
- `node --experimental-strip-types --test apps/web/tests/*.test.*`: timed out at
  30s, no complete suite result; before timeout the existing product-photo-normalizer
  test `admits at most two concurrent jobs and releases a slot after failures`
  reported failure. No timeout retry and no unrelated-file repair. The failed/
  timed-out full-suite result remains unchanged; the user explicitly deferred
  further photo/full-suite reruns in task log L99, not converted them to PASS.
- `pnpm --filter @qwerty/web exec tsc --noEmit --incremental false`: exit0, no output.
- `pnpm --filter @qwerty/web lint`: exit0,62files; existing `noImgElement` warning
  at `app/store/storefront-client.tsx:49`. Node retained MODULE_TYPELESS_PACKAGE_JSON.
- `git diff --check`: exit0 (tracked-diff check; new files are still untracked).

No meaningful engine RED/GREEN is available without an authorized engine;
static checks are not engine behavior proof. No new production JavaScript behavior
was implemented; the executable Node fixture check exercises the existing T4a
normalizer/quote only. Full-suite validation remains incomplete and explicitly
deferred under L99; T4b is not marked complete, deployed or independently approved here.

### Independent P2 source-proof correction — SQL still NOT EXECUTED

Independent review `mvfn50h0-12-rqtn` identified a source-derived false-positive
path, not an executed SQL reproduction or demonstrated production bypass:
`insufficient_privilege` (42501) from an INVOKER call may come from downstream
orders/receipt SELECT, even when function EXECUTE was accidentally exposed.
The rollback packet now checks effective `has_function_privilege` EXECUTE for
both `public.pickup_order_catalog(uuid,text)` and
`public.finalize_pickup_order(uuid,uuid,jsonb,jsonb)` before fixtures or calls:
`anon` and `authenticated` must be denied; `service_role` must be allowed.
These checks naturally include inherited-role and PUBLIC grants; PUBLIC is not
passed as an actual role name. Existing invocation-denial probes remain as
supplements, never the sole evidence for the EXECUTE boundary.

Only `node --experimental-strip-types --test apps/web/tests/order-sql-contract.test.mjs`
was run for this correction: static SOURCE RED exit1 (5passed/1failed,253ms),
`AssertionError [ERR_ASSERTION]: missing effective EXECUTE assertion: anon/public.pickup_order_catalog(uuid,text)=false`;
then focused GREEN exit0 (6/6,164ms). The new regression requires all six effective
role/signature/expected-result assertions with raising failure branches before
invocation, rejects PUBLIC-as-role checks, and retains supplemental 42501 probes.
Stdout/stderr are retained in the tool transcript, with the existing
MODULE_TYPELESS_PACKAGE_JSON warning; no separate output-file path was returned.
No SQL engine, full suite, photo test, typecheck or lint was run in this correction.
Self-review was limited to this P2: S6 proof distinguishes effective ACLs from
underlying table denials; S8 remains source-only with no backend or fixture action.

## Source delivery

Schema/core source slice: `0cc7dcc2c13c768ffd16967b28ee1cf2227da673` (373+/1−).
Rollback-proof/protocol slice: `092c0168bcea915c6f28e7145a7f7147dc89f88e` (552+/1−; cohesive overage retains the complete negative controls and race recipe).
Independent SOURCE review and P2-only recheck passed; parent focused6 passed. Packaging whitespace checks initially failed and were corrected in the final slice; no history rewrite. No push, PostgreSQL execution or native approval.
Photo/full-suite rerun is explicitly deferred by the user in featureL99; its earlier failure/timeout is not a PASS.
The first bounded schema application and rollback proof were authorized by S18/L104. Schema application succeeded; the proof failed compilation. That grant is consumed, not permission to retry or reapply. Committed race fixtures and original-receipt HTTP/Storage tests remain outside its scope.

## S18 remote evidence and current blocker

Target: `https://jxebudqzcmxgdsegrrqw.supabase.co`. Applied migration `20261019195149`; readback confirms FORCE RLS, INVOKER entrypoints, expected effective EXECUTE/table permissions, immediate uniqueness and the composite RESTRICT receipt reference. Metadata is not a row-isolation or race test.

The one proof attempt failed SQLSTATE42601 at `IF visible_count <> CASE WHEN role_name = stranger::text THEN 0 ELSE 1 END THEN`. No DO-body assertions or fixture writes ran. A subsequent read-only check found zero rows in each of the ten exact fixture/Storage namespace counters; no global or independent residue audit is claimed. The executed SQL file remains byte-identical for audit, including its original pre-execution header.

S19 authorized the proof-only CASE syntax correction and one fresh run; the schema was not reapplied. The corrected script compiled but failed fixture setup. S18 and S19 are consumed; nothing is retried automatically.

Security advisor output: two INFO no-policy notices for the intentionally private memberships/receipt tables ([reference](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)) and eight anonymous-role access warnings, including `pickup_orders` ([reference](https://supabase.com/docs/guides/database/database-advisors?queryGroups=lint&lint=0012_auth_allow_anonymous_sign_ins)). Guest-role reads are intentional, but effective row isolation remains unproven until the contract proof runs; these notices do not by themselves establish a bypass.

## S19 correction and remaining fixture blocker

The only SQL edit adds parentheses around the reader CASE expression; expected buyer/owner visibility1 and stranger0, fixtures, assertions, rollback and3s/20s limits remain unchanged. A new SOURCE regression observed RED then7/7 GREEN; independent correction review also passed7/7. Neither is an engine contract PASS.

The one S19 proof (SHA256 `a9fec23b2dcb6c3ad4ad541840d218af2d5e4eca63b588a00df025d6d1a333b7`) passed compilation, then failed SQLSTATE23502 because its `catalog_items` fixture omitted required `category_id`. Ten exact fixture/Storage counters were observed zero afterward. The schema remains applied; no remigration, retry or category-fixture patch occurred.

At the S19 stopping point, complete fixture reconciliation required a new decision.
S20/L108 subsequently authorized that source repair and metadata reads, not another
execution. Races and original-receipt HTTP/Storage proof remain outside these grants.

## S20 complete source reconciliation — engine proof pending

The [compatibility matrix](pickup-order-fixture-compatibility.md) audits all11
fixture-relevant deployed tables and every setup/mutation/default/guard expectation.
The corrected candidate adds category031 and same-business item binding, explicit
settings columns, explicit non-SSO Auth flags, symmetric collision/residue checks,
and deterministic041 negative attempts. Receipt uniqueness now uses the valid
buyer/business, isolating23505 from actor-FK precedence. No production guard changed.
Application owner-identity mutation must deny42501; the prior operator-only dynamic
owner RLS control remains, explicitly not a supported ownership-transfer feature.
State UPDATE denials and rejection unchanged-count checks are strengthened.

Final candidate SQL SHA256:
`f414eb52bfccf758ca9e93112962dd31faeb89f423dc1dee23d3e78191030420`.
This is a proposed review hash, not a frozen consent marker. Added exact ID:
`81000000-0000-4000-8000-000000000031` in `public.catalog_categories`.
Full proposed future target/table/fixture scope is in the matrix; new review and
precise execution consent are still required. S18/S19 remain consumed.

Focused command only:
`node --experimental-strip-types --test apps/web/tests/order-sql-contract.test.mjs`.
Static RED7passed/3failed exit1; deterministic-key follow-up RED10/1 exit1;
GREEN11/11 exit0; preservation-control regression RED10/1 exit1; final
GREEN11/11 exit0 in152.212527ms. Exact stdout/stderr are retained in the worker tool
transcript, including the unchanged MODULE_TYPELESS_PACKAGE_JSON warning.
No static test loads the local metadata artifact or simulates a database.

Self-review S4/S6/S8/S17/S20 completed at source level; parent independent risk
review remains pending. No unresolved metadata blocker identified. Corrected SQL
**not executed**; no parser, permission, atomicity, race, orders/API/UI or GET PASS.
No backend writes, marker edits, schema changes, full-suite/photo reruns, typecheck,
lint, build, dependency or shared-CLI changes; differential CLI is N/A. Earlier
failures/history and unrelated work remain untouched. Parent owns selective commits.

## S21 sequential SQL result

The exact reviewed proof `f414eb52bfccf758ca9e93112962dd31faeb89f423dc1dee23d3e78191030420` was executed once under S21/L112 on the identified remote. PostgreSQL completed the error-raising DO assertions and outer ROLLBACK without an exception; the tool returned an empty result array, not an individual-case total. No retry or migration reapplication occurred.

This exercised effective SQL EXECUTE/table denials, same-actor/business receipt FKs and uniqueness, creation/replay/conflict, current-catalog fingerprints, single currency, buyer/current-confirmed-owner/foreign visibility and immutable-write controls inside one operator transaction. A separate read-only query found all eleven exact namespace counters zero (including category031); this is not a global or independent residue audit.

The S21 grant is consumed. Two-session races, actual Auth/session/HTTP/cart behavior and original-receipt GET remain unproven and require their own exact fixture/cleanup scope. T4d source implementation may now use this verified sequential contract, with injected tests only; no remaining acceptance requirement is waived.
