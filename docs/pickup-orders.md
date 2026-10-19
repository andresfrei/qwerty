# Pickup order source contracts

**Status:** T4a pure intent/quote preparation only. No order API, transaction, table, tracking page or owner queue is delivered by this module. Real persistence/authorization/concurrency proof requires the later reviewed SQL packet and new explicit remote consent.

## Intent and quote version1

`normalizePickupIntent(input, slug)` accepts only `requestId`, `receiptId`, `contact`, `expected` and `lines`. UUIDs normalize to lowercase; contact trims but remains unverified. Lines contain only item UUID, quantity and group/pick UUID+quantity selections. Group/pick IDs and line variants are unique; ordering is canonical independently of current catalog sorting. Extra actor, business, name or price fields are rejected, not trusted.

Bounds: 1–100 distinct lines, line quantity1–99 (the existing cart limit), at most1000 groups/picks across the request, positive safe-integer pick quantities and nonnegative safe-integer expected minor units. Contact uses existing validation. The function copies rather than edits the input; it performs no Auth/network/storage work.

Intent identity deliberately excludes a recalculated quote and snapshot fingerprint. The future BFF must authenticate/check origin/shape, then resolve a prior attempt **before** requiring current publication or repricing. Catalog changes must not invalidate replay of an already committed identical intention.

`quotePickupOrder(intent, trustedCatalog)` requires a normalized intent and a coherent server-provided catalog snapshot, version1 with a fingerprint. This function does not authenticate the caller, establish publication, prove fingerprint freshness, read a receipt, create an order or grant access. The BFF/SQL integration must establish those conditions separately.

The quote derives business, item/option names, descriptions and amounts from the trusted snapshot. It reuses the existing selection/pricing helpers without modifying their current client consumers; a strict server boundary first rejects repeated groups/picks, distinct picks with quantity other than1, foreign/unavailable associations, incomplete selections and unsafe computed amounts. Pizza sizing/halves/configured surcharge and exact12-unit dozens retain their existing rules.

One order has one currency. Mixed currencies return `mixed_currency`, leaving the intent/cart untouched; there is no conversion or ARS-only restriction. An otherwise valid quote differing from client `expected` returns `quote_changed` with the server quote for explicit later review, never silent acceptance of a new price/currency. Source snapshots/outputs are copied; immutable *durable* snapshots remain later work.

## Verification boundary

The new pure contract first returned an explicit `not_implemented` stub: five behavioral tests failed, rather than claiming reproduction of an old production bug. Its implementation then passed18 focused cases (five new quote tests and13 unchanged selection/pricing tests). Inputs are frozen/compared and a fake fetch counter stays zero; no database records or remote counters were exercised.

Full source suite376/376 (job28exit0), typecheck `--incremental false` and lint exit0 (one pre-existing `<img>` warning) passed. Delivered in `fa505a140aff2facf629db5145988625d4177abb` (four files,194+/2−; no push). One optional format attempt exited1/processed0 because the repository disables formatting (and excludes tests from its file set); neither verified file changed. No override/retry/config change was made. This is not a formatting-success claim. Native assessment remained unassessable/unknown because of untracked scope; with no named high-risk item in this unwired pure unit, its returned RDD-off plan requires self-verification and no independent verifier. No existing helper/consumer was edited; CLI differential and browser/runtime tests are not applicable to this unit. These tests cannot prove SQL atomicity, idempotent races, current publication, receipt ownership/consumption, session recovery or tenant-private order access. Existing T3b/T3c evidence remains separately scoped; old S12/S15/S16 permissions cannot authorize new backend changes.
