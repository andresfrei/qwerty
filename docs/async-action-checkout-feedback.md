# Buyer actions show pending work without changing recovery

Checkout preparation, receipt attachment, order confirmation/recovery, private tracking and the read-only owner queue now use the shared `AsyncActionButton`. Existing domain callbacks still own immediate duplicate guards, persisted references, outcomes and edit locks.

## Outcome and retry boundaries

| Action | While the request is pending | After a failure or uncertain result |
| --- | --- | --- |
| Guest preparation | Preparando… | Keep contact/cart; explicit preparation retry remains available. |
| Receipt attachment | Adjuntando… | Keep the selected original file/contact/cart; a manual upload retry is safe. A staged receipt is not payment confirmation. |
| Order confirmation | Confirmando compra… | Keep the original persisted attempt, contact/cart/file/receipt. Unknown is paused, not an indefinitely spinning request; never automatically replay or mint another attempt. |
| Original-attempt recovery | Consultando… | Query the same reference. A failed query does not authorize a new submission; existing definitive-correction rules remain unchanged. |
| Private tracking/recovery | Consultando… | GET only; clear previous private results when refreshing and on denial/error. |
| Owner queue refresh | Actualizando pedidos… | GET only; clear previous private results. No operational owner actions were added. |

Only the active request shows a spinner. The shared presentation supplies stable sizing, decorative motion, polite status and reduced-motion styling; domain locks may outlive that spinner. Local cart controls remain synchronous, and navigation/download links remain links. Confirmed orders retain the existing exact submitted-cart snapshot cleanup rule.

## Verification scope

- Deferred-fetch public-callback tests cover seven buyer/read families: pending labels/disabled state, same-tick duplicate suppression, exact payload/query and retained data/reference on failure.
- Existing pickup-order UI tests cover corrections, generation changes, conditional cart cleanup, storage refusal, readers and transport.
- Scratch-only HEAD/current comparisons check request methods/bodies/query, pre-request reference persistence, storage writes, draft retention and lock effects across 28 scenarios. Historical source is not part of committed tests.

These are UI callback/regression checks, not certification of server authorization, payment, storage or business guards. Browser layout, keyboard and reduced-motion verification belongs to parent T4; no browser, foundation/native rerun, global typecheck/lint, full suite, build or photo parser was run by this unit.
