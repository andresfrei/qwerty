# Private pickup orders — T4d source API

Source coverage: **S2–S4, S6, S17**. No UI, optional-account/history (T5),
fulfillment/payment transitions (PU5), or new backend permission.
[Transaction contract](pickup-order-transaction.md) remains authoritative.
S21 proves sequential rollback SQL assertions only; actual Auth/HTTP, original
receipt GET and committed two-session races still need separately reviewed consent.

## Endpoints

All require the current server-verified `getUser()` identity. Prepare the technical
session explicitly through the existing checkout-session POST first; these APIs
never sign up or replace a session. Typed contact/email, UUIDs and selectors grant
no authority. Registered unverified buyers may access their own known orders, not
owner queues or general history.

| Request | Contract |
| --- | --- |
| `POST /api/checkout/orders?slug=pizza` | Strict bounded JSON intent below; matching prior attempt returns 200, new confirmed order 201. |
| `GET /api/checkout/orders?slug=pizza&requestId=<uuid>` | Response-loss recovery for this actor/business/key only; found returns 200. Miss/error is 503 `outcome_unknown`, not proof of permanent absence. |
| `GET /api/checkout/orders/<uuid>` | Current authenticated RLS read. Buyer or current confirmed owner; invisible/missing returns indistinguishable 404. No query parameters. |
| `GET /api/business/orders?businessId=<uuid>` | Confirmed, explicitly nonanonymous `getUser()` plus current owning-business RLS membership in the same read statement. Latest 100 orders, descending `created_at,id`; bounded first page only, not a complete historical export. |

Unexpected/duplicate/missing parameters are rejected. Slug is lowercase kebab-case,
maximum 63 characters; UUIDs use the existing UUID syntax and normalize lowercase.
No other methods are supported (405 with Allow). GET must be bodyless. POST needs
trusted Host/forwarded origin and exact Origin, JSON media type (optional UTF-8
charset), no Content-Encoding, valid matching Content-Length when supplied, and a
streamed body of at most 1 MiB. Invalid shape/contact/options/UUIDs are rejected
before Auth or database work. The existing pure normalizer/quote are unchanged.

```json
{
  "requestId": "33333333-3333-4333-8333-333333333333",
  "receiptId": "44444444-4444-4444-8444-444444444444",
  "contact": { "name": "Buyer", "email": "buyer@fixture.invalid", "telephone": "1123456789" },
  "expected": { "currency": "ARS", "totalMinor": 100 },
  "lines": [{ "itemId": "55555555-5555-4555-8555-555555555555", "quantity": 1, "selection": [] }]
}
```

Expected amount/currency are assertions, never pricing authority. The server resolves
slug to business without publication filtering, looks up exact actor/business/key,
and compares **all normalized intent JSON** before any publication/catalog/pricing
check. Object key order is immaterial; normalized array order remains significant.
A matching replay returns immutable stored snapshots even after unpublish/reprice;
a changed contact, receipt, amount, selection or quantity conflicts. New attempts
use the coherent `pickup_order_catalog` RPC, unchanged Node pricing, then service-only
`finalize_pickup_order` with server actor/business/intent/quote. No client price,
actor or business payload is accepted. Mixed currencies are rejected, never converted.

## Responses and recovery

Success is `{ "order": <dto> }`; queue is `{ "orders": [<dto>] }` (possibly empty).
DTO fields are exclusively `id, requestId, receiptId, currency, totalMinor,
fulfillmentState, paymentState, createdAt, contact, lines`. Contact has
`name,email,telephone`; each line has `itemId,name,quantity,unitPriceMinor,
lineTotalMinor,selectionText`. No actor/business IDs, raw intent/quote, fingerprint,
provider payload, credentials, Storage path or embedded membership is returned.
States currently are `pendiente_de_pago` and separately `pendiente`; no PATCH exists.
An empty owner queue does not reveal whether a business exists or belongs to someone else.

| Status | Exact body / meaning |
| --- | --- |
| 400 | `{"error":"Request rejected"}` |
| 413 | `{"error":"Request too large"}` |
| 401 | `{"error":"Session required"}` |
| 403 | `{"error":"Owner access required"}` |
| 404 | `{"error":"Order not found"}` (known-ID read only) |
| 405 | `{"error":"Method not allowed"}` |
| 422 | `{"error":"Order unavailable","code":"<code>"}`: `invalid_request`, `mixed_currency`, or Node `invalid_selection` / `amount_out_of_range` |
| 409 | Same error shape: `idempotency_conflict`, `receipt_used`, `invalid_receipt`, `catalog_changed`, `unavailable`, or Node `quote_changed` |
| 503 | `{"error":"Order unavailable","code":"unavailable"}`: configuration/read/provider failures or trusted SQL `invalid_quote` |
| 503 | `{"error":"Order outcome unknown","code":"outcome_unknown","requestId":"<original uuid>"}`: uncertain finalization/recovery |

On gate changes, rejected SQL statuses, malformed responses or thrown finalization
errors, one fresh scoped lookup checks a committed winner. No finalization retry,
new attempt key or invisible ON CONFLICT assumption. Unknown/malformed SQL outcomes,
timeout/disconnect or failed recovery lookup remain unknown unless a bound stored
winner is visible. The SDK fetch has an 8-second per-request deadline and no-store;
a deadline does **not** imply rollback or guarantee that the database stopped.
No SQL isolation/deadline configuration change is introduced here.

Keep the same request ID, normalized intent, cart/contact and staged receipt while
recovering. Recover with GET, or retry the exact POST; only an authoritative order
DTO confirms success. Never delete receipt/order/cart or generate a replacement
attempt merely because a response was lost or recovery currently misses.

All responses are private/no-store, no-cache, no-referrer and nosniff. Detached
staged auth cookies are applied only after successful server identity verification,
including unknown outcomes and verified-but-forbidden responses; failed verification
never commits staged clearing/replacement cookies. Private readers use the same
SSR client's current token, not service reads. The owner queue embeds
`businesses!inner(id,owner_id)` and filters both current actor and explicit business,
so buyer RLS cannot independently authorize a queue and ownership isn't checked in
a separate TOCTOU-prone service query. Privileged attempt responses also validate
actor/business/request bindings and stored DTO consistency before disclosure.

## Evidence and review

Injected Request/Response tests exercise submission, replay, pricing rejection,
response loss, fresh winners, recovery, known-ID and owner-only boundaries.
Installed SSR/Supabase SDK tests execute actual route exports using in-memory
TypeScript compilation and server-owned mocked fetch. No credentials, real network,
app server, schema changes, source `.env` reads, full suite, photo tests or build.
These mocks validate HTTP/SDK binding, **not** actual RLS, race/atomicity or provider behavior.

Review in two dependent units: HTTP/service with shared fixtures and negative/recovery
tests (`fb066e4`, 457 insertions/1 deletion, including workflow docs and tracking),
then concrete SDK/Next bindings with SDK tests and this full wire contract. The first
cohesive slice exceeds the advisory400-line target by58 changed lines to keep its
admission/replay/private-reader behavior with all corresponding negative controls.

Observed checks (stdout/stderr and exit trailers under `.pi/order-api/`):
- Initial behavior RED: explicit 501 handler stub; exit1, expected status/JSON assertions failed (`red.*`).
- First GREEN: 66/66, exit0 (`green-1.*`); expanded final check 76/76, exit0 (`final.*`).
- Self-review known-ID nonbuyer guard: targeted RED expected404/actual200, exit1 (`known-owner-red.*`); corrected focused suite **77/77, exit0** (`correction-green.*`).
- `pnpm --filter @qwerty/web exec tsc --noEmit --incremental false`: exit0 (`type-correction.*`).
- `pnpm --filter @qwerty/web lint`: exit0 (`lint-correction.*`); existing storefront `noImgElement` warning only. Initial new implicit-any lint errors were fixed, not suppressed.
- All 67 protected-path SHA256 values matched the source-start manifest; unchanged helpers were not differentially tested.

**Risk item 2:** authentication, session/cookie authority, privileged replay and
private owner/buyer reads. Independent `mvfrltur-1a-q7s3` SOURCE review passed S2/S3/S4/S6/S17 with no P1/P2; repository77/77 and isolated89/89 (including12 independent mocked-SDK probes) exited0. Parent77/77 exited0. Native review remains unknown/unassessable; no approval is inferred. **Concurrency (item4):**
fresh-winner mock cases do not prove two-session visibility, constraints or the
SQL unique-violation branch. Those live gates and actual Auth/HTTP/original GET remain
open; S18/S19/S21 are spent and no new execution grant is inferred.
