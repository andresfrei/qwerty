# Catalog configurations — T2 SQL source handoff

**Not activated.** This is source preparation for S1–S8 / T2, not an applied
schema, deployed-metadata inspection, SQL behavior proof or completed feature.
T1's exact domain contract remains [catalog-configurations.md](catalog-configurations.md).
T3–T5 integration and independent T6 SQL review precede any T7 application.

## Review boundary

New migration: `supabase/migrations/20261024202035_catalog_configurations.sql`.
Allocated with the existing Supabase CLI **2.118.0** using
`./node_modules/.bin/supabase migration new catalog_configurations`.
No historical migration, existing grant, legacy table column or old RPC changes.
The installed CLI advertised a newer version; no upgrade was performed.
The parent's current changelog/RLS review is context, not target inventory proof.

The single transaction has four review units, rather than four independently
advertised schema versions:

1. Immutable bounded/typed JSON helpers (Unit A).
2. Optional table, owner RLS, trigger-owned version and CAS RPC (Unit B).
3. Reference validation and coordinated legacy mutation guards (Unit C).
4. Service snapshot, insertion downgrade/freshness fence, finalizer and final
   capability publication (Unit D).

Each behavior unit is below approximately 400 source lines. The complete atomic
migration exceeds 400 lines intentionally: capability must never advertise a
partial installation. No shared templates, audit history, revision heads,
backfill, extension installation, data classification or item columns are added.

## Stable RPC contracts for T3 / T4

### Capability (public, no arguments)

`public.catalog_configuration_capabilities()` returns a typed SQL table with
`version integer`, `"schemaVersion" integer`, **exactly one row `(2, 1)`**.
PostgREST JSON is **`[{"version":2,"schemaVersion":1}]`**, not a bare object.
Execute: `anon`, `authenticated`, `service_role`; no tenant/private information.

Only a specifically typed missing-function/schema-cache-absence response may
mean legacy-only. Transport errors, permission errors, multiple/empty rows,
wrong keys/types/values and malformed responses mean unavailable, not absence.
T3 owns that adapter; this migration does not implement it.

### Atomic owner save

```sql
public.save_catalog_item_configuration(
  p_business uuid, p_item uuid, p_expected_version bigint,
  p_is_active boolean, p_document jsonb
) returns jsonb
```

Execute: **authenticated only**, SECURITY INVOKER. SQL independently requires
`private.owner_email_verified()` and `businesses.owner_id = auth.uid()`. Knowing
business/item IDs grants no authority. BFF fresh-session checks remain T3/T4 work.

- Expected version **0** creates a missing record; positive versions perform CAS.
- Success: `{"code":"saved","profile":{business_id,item_id,version,is_active,document}}`.
  Projection keys are precisely T1's `ProfileRecord` keys (UUIDs serialized as
  lowercase strings). Document arrays/UUID spellings are stored as submitted;
  T1 parsing normalizes references and array order before domain use.
- Conflict: **`{"code":"configuration_version_conflict"}`**. No row, version or
  document change; no optimistic retry or silent overwrite. No current private
  document is returned with conflict.
- Every accepted save advances version, including an identical-document save.
  A new record starts at 1. Version is positive JS-safe bigint, not schemaVersion.
  Callers may supply expected versions 0 through 9007199254740990. At the ceiling,
  further writes fail; do not wrap/reset/recreate versions.
- SQLSTATE `42501`, `configuration_forbidden`: owner RPC authorization rejected.
- SQLSTATE `23514`, `invalid_catalog_configuration`: malformed/null input or
  structural violation. A version-ceiling CHECK can instead have PostgreSQL's
  constraint message. `23503`: composite item FK violation.
- Direct duplicate INSERT raises `23505`, `configuration_version_conflict`.
  RPC duplicate-create returns the JSON conflict above.
- Isolation other than READ COMMITTED raises `25001`,
  `configuration_requires_read_committed`.
- Permission/RLS/constraint errors are not successful saves. Transport failures
  are not proven conflicts or proven absence; T4 must preserve unknown recovery.

No current-version integer may be assigned by an owner: INSERT privileges are
only `(business_id,item_id,is_active,document)` and UPDATE privileges only
`(is_active,document)`. BEFORE triggers own version; metadata identity is immutable
also under trigger enforcement. Direct owner INSERT/UPDATE gets the same shape,
relationship and dependent-profile guards as the RPC. No owner/service DELETE
or service configuration write is granted.

### Coherent service snapshot

```sql
public.pickup_order_catalog_v2(p_business uuid, p_slug text) returns jsonb
```

Execute: **service_role only**, SECURITY INVOKER, STABLE. One SQL statement / MVCC
snapshot extends the old payload (not the old function definition):

```ts
{ version: 2, schemaVersion: 1, businessId: UUID, slug: string,
  surchargeMinor: number, items: T1Item[], groups: T1Group[], options: T1Option[],
  profiles: {business_id: UUID, item_id: UUID, version: number,
             is_active: boolean, document: unknown}[],
  fingerprint: string /* 64 lowercase SHA-256 hex */ }
```

Items/groups/options retain the exact fields documented in T1. Root arrays sort
by item/group/option ID; profiles sort by item ID. The payload before fingerprint
is hashed as UTF-8 PostgreSQL canonical `jsonb::text`. All profile states,
versions and documents, including inactive drafts and unavailable items/options,
participate. JSONB object-key order is canonical; authored array reordering can
change the fingerprint. Missing/mismatched/unpublished storefront yields SQL
NULL (PostgREST `null`). No publication/private-row data leak through capability.

This whole-business privileged payload is **not** a public response and must not
be spread into a T1 catalog. T3/T5 explicitly project only the needed root and its
fixed children, their groups/options and records, removing wrapper fields before
T1 validation. Apply the 1000-row-per-array / 2 MiB domain limits to that needed
projection, not all historical business rows. SQL imposes no new business-wide
legacy catalog size cap. Larger snapshots still need a bounded transport budget
in T3; that adapter is not supplied here.

Public table RLS permits only active profiles of published, available parents.
It does **not** inspect child availability or require visible children. Otherwise
an unavailable child could hide an active parent profile and create false legacy
fallback. Child IDs in a document are not authority: T3/T5 must drop an unavailable
combo, not expose private missing-child details or downgrade to legacy.

### Version-2 finalization

```sql
public.finalize_pickup_order_v2(
  p_actor uuid, p_business uuid, p_intent jsonb, p_quote jsonb
) returns jsonb
```

Execute: **service_role only**, SECURITY INVOKER. Uses the **same pickup_orders**
and guest receipt tables, their existing unique constraints and immutable JSON
columns. V1 rows and v1 RPCs are not rewritten.

T3 sends normalized intent `{version:2,slug,requestId,receiptId,contact,expected,lines}`.
Each line retains `{itemId,quantity,selection}`; selection is T1's exact
legacy/leaf/combo selection, not an invented SQL schema. Quote retains
`{version:2,snapshotFingerprint,businessId,currency,totalMinor,contact,lines}`.
Quote lines carry trusted T1 descriptions/groups/component snapshots and prices;
SQL stores that JSON unchanged. T3 must validate exact shape, lengths, bindings,
selection/versions/current availability, arithmetic and component snapshots.
The SQL metadata fence checks version, business, contact, currency, expected
total, nonnegative JS-safe integer total, equal line count, 1 MiB intent/quote
limits and line currencies. **Fingerprint is freshness, not price certification.**
SQL deliberately does not reimplement Node's pricing or certify client quotes.

Result shapes:

- `{"code":"created","order":<complete pickup_orders row>}`
- `{"code":"replayed","order":<same immutable stored row>}`
- `{"code":<one of invalid_request, idempotency_conflict, receipt_used,
  invalid_receipt, invalid_quote, mixed_currency, unavailable, catalog_changed>}`

SQL performs READ COMMITTED enforcement (`25001`,
`pickup_requires_read_committed`), receipt advisory 8101 before attempt 8102,
replay/intent equality **before catalog/quote**, receipt uniqueness/ownership and
staged-state checks, then quote metadata and business lock, fresh v2 snapshot,
and insertion. Unique-violation recovery re-reads the committed attempt/receipt;
unknown violations rethrow, never invisible ON CONFLICT success. T3 must reread
attempt after failures/transport uncertainty rather than retrying a write.

A new BEFORE INSERT trigger fences **old and direct trusted writers**:
new v1 orders referencing an active profile raise `23514`, `profile_required`.
Old replay is unaffected because it returns before INSERT. V2 INSERT rechecks its
snapshot fingerprint under the business lock; invalid/stale data raises `23514`,
`catalog_changed`. Unsupported intent version raises `23514`, `invalid_request`.
Old RPC callers may therefore get an exception rather than a new JSON code;
T3 must fence profiled v1 requests before that path and preserve recovery.

## Storage, structural rules and grants

`public.catalog_item_configurations` has `(business_id,item_id)` primary key,
composite FK to existing `catalog_items(business_id,id)`, positive safe `version`,
nonnullable boolean `is_active` and nonnullable JSONB `document`; RLS is enabled
and forced. No new IDs, legacy item grants or DELETE privileges.

Active documents enforce exact required keys/types, UUID syntax and normalized
reference uniqueness, safe nonnegative integers/prices, matrix <=4096, components
<=32, total fixed instances <=100, restriction groups <=100, picks per component
<=1000, allowlist IDs <=1000, depth <=12, document <=262144 bytes. Referenced
business/item/group/option membership is checked in SQL, not merely BFF code.
Pizza requires exactly two typed distinct groups with 1..1 and 1..2 bounds and
one unique matrix row for every existing size × flavor (including disabled rows).
Dozen requires exactly one quantity group with 12..12 bounds. Combo has no parent
groups, same-business/currency fixed children, no self/active nested combo,
fixed-group counts/distinct quantities, option membership and allowlist inclusion.
No satisfiability solver or availability-based structural rule is introduced.

Inactive documents may be any bounded JSON, including **JSON `null`**. SQL NULL
is always rejected. The SQL byte cap intentionally uses canonical `jsonb::text`,
which includes spaces and may be larger than JS compact JSON. This is a
**conservative storage adjustment**, not exact JS byte equivalence: near-limit
otherwise-valid JS documents may be rejected, never silently truncated. Inactive
numeric JSON is conservatively bounded by the maximum finite JS number; active
numeric fields have the much tighter safe-integer checks. JSONB/normal JSON
parsing has already collapsed duplicate object keys; duplicate semantic reference
entries in arrays are rejected, not collapsed. Raw duplicate-key rejection would
require a different raw-text API and is not claimed by T1 or this JSONB API.

Public/owner/service SELECT is granted on the new table, with public vs owner
policies as above (service retains its existing BYPASSRLS semantics for snapshots,
not owner writes). Owner checks reuse the **existing** verified-email helper; no
new SECURITY DEFINER function or bypass policy is added. Every new function
revokes default PUBLIC EXECUTE with explicit signatures. Authenticated gets save
and needed invoker validation helpers; service gets snapshot/finalizer and their
helpers. Trigger function EXECUTE remains revoked (PostgreSQL trigger invocation
is not a user-callable RPC). No unrelated private function grants are replayed.

## Lock ordering and proof limits

Business guard: transaction-scoped advisory `(8103, hashtext(business UUID))`.
There is no global mutex; hash collisions can unnecessarily serialize tenants,
not mix their data. Mutation and finalization paths reject non-READ-COMMITTED.

- Legacy item/group/option UPDATE already holds its row lock. BEFORE takes the
  business lock; AFTER validates every current active profile in that business,
  including dependents. Reparenting, semantic bounds, currency and child-profile
  transitions cannot leave dangling current references. Names, normal prices and
  agotado updates remain allowed when structurally valid.
- Existing-profile CAS likewise takes its row lock by ordinary UPDATE **before**
  the business lock. There is no advisory-then-SELECT-FOR-UPDATE cycle.
- New-profile creation takes the business lock, performs a **plain existence
  recheck**, then inserts. Direct INSERT also rechecks existing identity before
  uniqueness work. No legacy item/group row is locked just to validate references.
  Composite FK KEY SHARE is compatible with normal non-key legacy updates.
- Settings and storefront INSERT/UPDATE also take the business lock, preventing
  publication/surcharge changes between v2 finalizer freshness check and INSERT.
- Finalization takes receipt 8101, attempt 8102, then business 8103; catalog
  mutation never acquires receipt/attempt locks or order row locks. Trigger is
  reentrant for the same business. Plain reads never wait for legacy row locks.
- AFTER-row validation is VOLATILE and uses fresh SPI statements after the guard
  wait, seeing committed predecessor changes plus this transaction's own changes.
  RLS dependencies are acyclic: profile policy -> item/storefront -> businesses;
  no legacy policy reads profiles and no hidden recursive RLS is introduced.

This is a source design argument, **not observed race acceptance**. Arbitrary
multi-statement/multi-row transactions can still acquire rows/businesses in
opposite order and deadlock. A deadlock rolls back, never certifies success; the
future caller must treat that as failed/unknown and reread, not blindly retry an
order. Operational callers should use one-business, one-save transactions.
Privileged DDL/trigger disabling, replication-role bypass and arbitrary legacy
DELETE by an administrator are outside application privileges and not defended.
No production DELETE grant is introduced; independent review must verify actual
inherited privileges before application.

### Required two-session schedules (source acceptance cases, not executed)

Use a separately consented isolated fixture environment; all identities must be
fresh generated values. These schedules reference the fixture roles/items in
`mvp_catalog_configurations.test.sql`. Do **not** run them against real records or
assume uncommitted rollback-only fixtures are visible to a second connection.
A future concurrency harness needs an explicitly approved fixture-visibility
strategy; the rollback-only single-connection files do not supply one.

| Schedule | Session A / holding step | Session B / waiting step | Required outcome |
| --- | --- | --- | --- |
| Same-row CAS | Save pizza at version v; hold transaction | Save same row expected v | B waits on row, then conflict; exactly v+1 and one document |
| Create/create | Create absent standard profile; hold business guard | Create same absent item expected 0 | B waits business; plain recheck returns conflict, no uniqueness/row-lock cycle |
| Direct UPDATE vs RPC create | Direct UPDATE existing pizza, after row lock before guard | RPC create expected 0 on same item | No SELECT FOR UPDATE under guard; conflict/duplicate, never overwrite |
| Config vs legacy reparent | Save active pizza; hold guard | UPDATE flavor group item_id to spare | Reparent waits and fails 23514 after fresh validation |
| Legacy reparent vs config | Reparent inactive pizza flavor group; hold guard | Activate old pizza doc | Activation waits, then fails membership check; no dangling profile |
| Child transition vs parent | Parent saves combo pointing legacy standard | Activate standard as combo | Serialized loser rejects nested combo; reversed schedule rejects parent |
| Currency vs parent | Change legacy child to USD | Save ARS combo referencing it | Serialized second mutation rejects; reverse schedule rejects currency change |
| Availability vs fixed reference | Save combo with fixed flavor | Mark child option/item agotado | Both commit; dependent purchase unavailable, unrelated dozen quotable in T1/T3 |
| Finalize vs activation | Old finalizer holds 8101/8102, before INSERT business guard | Activate ordered item profile | If activation commits first, old INSERT fails profile_required; if INSERT wins, historical v1 row remains valid |
| V2 freshness vs edit | V2 finalizer holds business guard after fresh fingerprint | Rename/price/settings/publication/config UPDATE | Mutation waits; order stores accepted old snapshot; reversed schedule yields catalog_changed/unavailable |
| Attempt/receipt race | Two finalizers same attempt or receipt | Same receipt-first/attempt order | One created, one replay/conflict/receipt_used, one receipt consumption |
| Cross-business | A holds guard for fixture business A | Independent fixture B save/order | No shared tenant lock except documented hash collision; tenant isolation holds |

Capture wait/commit/rollback outcomes and durable counters in a real two-session
runner after explicit T7 consent. Single-session assertions cannot substitute.

## Validation prepared and application gates

Prepared pgTAP files (not run):

- `supabase/tests/database/mvp_catalog_configurations.test.sql`: owner/nonowner,
  unconfirmed, direct writes, FK/membership, CAS/conflict counters, matrix/JSON
  bounds, currency/nesting, legacy mutation guards, agotado and public RLS.
- `supabase/tests/database/mvp_pickup_orders_v2.test.sql`: service ACLs, v1 normal
  order/replay/downgrade fence, coherent profiles/hash changes, quote metadata and
  stale hash, replay before catalog, durable receipt/attempt uniqueness.

They require **already-installed pgTAP**, existing Supabase auth roles/functions
and all prerequisite schema objects. They create synthetic users/businesses and
receipt metadata only inside BEGIN/ROLLBACK. A runner with SET ROLE and fixture
insert authority is needed. They do not install extensions, contact Storage,
read environment files, upload files, change real users or prove availability
pricing (that is T1/T3). `pg_prove`/a consented database runner is future work.

`node --test apps/web/tests/catalog-configurations-sql.test.mjs` checks source
structure and lexical delimiter balance, without Git/.pi/fixed historical IDs.
It is **not a PostgreSQL parser, SQL execution or concurrency proof**. No installed
offline PostgreSQL parser was found; no parser/dependency was installed.

Before any future apply, independently verify target, migration ordering, PG
support for builtin SHA-256, exact prerequisite composite key and columns,
Auth/receipt constraints, invoker column privileges, RLS helper execution,
existing service grants/BYPASSRLS, no inherited owner DELETE/metadata grants,
transaction isolation and lock semantics. Present exact DDL/ACLs and target to
the human. Do not replay old grant migrations or install extensions by inference.
No deployed metadata inventory/application/fixtures/diagnostic SQL was authorized.

Rollback/recovery: an application failure before COMMIT rolls back the entire
migration. After a successful application, stop profile activation and fence new
v2 writers before any separately reviewed repair. Do not drop the table, reset
versions, delete configurations/orders, strip stored v2 JSON, restore old grants
or remove the downgrade fence as an automatic rollback. Preserve immutable v1/v2
orders and use a separately authorized additive forward repair. This handoff
contains no destructive rollback action.
