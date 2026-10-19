# Pickup order transaction — T4b source packet

**Source only. Nothing here has been applied or executed against PostgreSQL.**
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

