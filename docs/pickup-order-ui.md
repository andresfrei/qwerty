# Private pickup UI — T4e source delivery

**Coverage: S2, S3, S4, S6, S17 and S22.** This connects the existing
[private API](pickup-order-api.md), without changing its fields, permissions or
states. All verification below uses fictional data and mocked traffic, not real
Auth, Storage, database, HTTP integration, concurrency, or full-checkout acceptance.

## Confirm deliberately — T4e-a

Checkout keeps the original cart/draft/receipt helpers unchanged. The existing
business key `qwerty:cart:v1:<businessId>` still contains version 2. Preparing the
session and staging the original file remain explicit, separate operations. They
never confirm purchase or payment. Contact/email grant no account authority.

“Confirmar compra” requires a ready session, staged receipt, valid contact/cart
and exactly one currency. Mixed currencies remain in the cart, without conversion.
A single-flight ref guards rapid clicks. Before POST, a fresh request UUID and
validated technical selectors are durably saved at `qwerty:pickup:v1:<slug>`.
Storage failure prevents POST and explicitly reports that no order was sent.
Only business ID, slug, request ID, receipt ID and an optional allowlisted
`correction` code persist; never contact, intent, DTO, credentials or file bytes.
References and correction hints do not authorize any read/write or prove absence.

The browser transport whitelists DTO fields, validates quantities/money/states,
checks totals, and binds responses to request/receipt and available original
contact/amount/line IDs and quantities. POST has exactly `requestId`, `receiptId`,
`contact`, `expected`, `lines`; no client actor, business, slug or version fields.
All requests are same-origin/no-store/redirect-error. No server service, Auth SDK,
secret configuration or provider payload enters the client graph.

Once sent, the intent/contact/cart/file controls freeze until an authoritative
result. Transport failures, 503, malformed/unbound responses and recovery misses
cannot confirm, clear, mint another key or newly unlock corrections. Deliberate
“Consultar intento” uses GET with the same saved reference. No automatic POST,
receipt replacement, new key or session preparation occurs.

Only exact `{error:"Order unavailable",code}` responses with an allowed status/code
pair permit price/selection/contact correction on this **same request ID**:

| HTTP | Correctable codes |
| --- | --- |
| 409 | `quote_changed`, `catalog_changed`, `unavailable` |
| 422 | `invalid_request`, `mixed_currency`, `invalid_selection`, `amount_out_of_range` |

`idempotency_conflict`, `receipt_used` and `invalid_receipt` remain frozen. Other
bodies/status combinations, extra error fields and malformed JSON remain unknown;
HTTP status alone never proves a safe correction. Session/owner failures do not
unlock an unknown attempt. Existing references without a correction code retain
their unknown/frozen behavior; invalid correction codes are not accepted.

A valid correction hint survives reload without saving PII. The user may accept an
updated catalog price, correct options/contact, explicitly prepare the session and
stage a receipt as needed, then confirm the revised intent with the original key.
A recovery miss cannot manufacture a correction hint; an existing prewrite hint
survives that read. Before any revised POST, the pending reference is saved **without**
the hint, so response loss/reload freezes again. A failed save sends nothing. Even
a tampered browser hint grants no authority: server replay/conflict checks on the
same key remain decisive. This is correction, not abandon/new-purchase UX.

Only a bound actor-scoped POST or recovery can clear the submitted cart, and only
if its serialized version-2 snapshot still exactly matches current browser storage.
Intervening edits and other businesses are preserved. Editing after a correctable
rejection invalidates the old in-memory submission snapshot. Recovering an older
winner can display it, but cannot clear the revised cart; revised POSTs bind their
own current intent/snapshot. Business navigation resets
local private confirmation state and ignores a late prior-business POST result.
After reload, only selectors survive: GET can recover the order but cannot replay
lost contact or clear a cart for which no original snapshot survives. References
are retained even after confirmation; no cleanup/retention policy is invented.

## Private tracking and recovery — T4e-b

- `/store/<slug>/orders/<id>` reads only the known-ID private endpoint, with no
  query string. A current owner may also read this endpoint, so it **never clears
  a buyer cart**, even if local references exist.
- `/store/<slug>/orders/recover` deliberately consults a saved request reference.
  Without one, it explains the limitation without email/history search.
- Neither route loads public catalog data or checks publication. A recovery
  reference remains usable after unpublication. The URL slug is a selector, not
  evidence of returned business identity; the API DTO omits that identity.
- Missing session offers no automatic sign-in, guest replacement or typed-email
  recovery. Miss/503 is not proof that a pending order does not exist.

Both routes are dynamic, noindex and no-referrer. Their server shells contain no
private order data; browser GETs use the existing current-session authorization.
Refresh removes previous private data before reading; failure never displays a
stale successful DTO. Storage acquisition and reads are guarded, including browser
`localStorage` getters that throw `SecurityError`. Recovery mount explains storage
unavailability without GET, a thrown effect or automatic session creation. Order progress and payment verification are shown separately.
A received order and attached receipt are never funds confirmation. T5 and PU5
registration/lifecycle/payment mutations remain future work, without pretend buttons.

## Owner queue — T4e-c

`/owner/orders?businessId=<uuid>` uses only the existing owner queue API. It shows
at most the latest 100 visible orders, not a complete history, and offers refresh
only. Loading/empty/401/403/provider failure have safe Spanish feedback. Each read
clears previous private data before showing new results. Empty does not disclose
whether the selected business exists or belongs to the user. A single link in the
existing catalog business branch uses `business.id`, without changing its Auth,
imports, queries or mutations. No optional owner-home/Auth files are adopted.

## Evidence and limitations

Focused tests execute public transport functions and actual React callbacks, not
just source regexes. Existing prepare-session/raw-upload/reprepare tests remain.
Tests cover binding failures, unknown outcomes, key persistence, reload GET only,
quota/getter refusal, duplicate guards, mixed currencies, intervening edits,
business navigation and owner/known-ID cart non-clearing. Before POST, denied
storage shows a visible refusal without a key, write, false latch or POST. After
authoritative confirmation, cleanup acquisition/write failure preserves the cart
and confirmation, explains the local cleanup failure and never becomes unknown.

Strict TDD evidence under `.pi/order-ui/`: initial transport/readers REDs fail on
missing implementation; confirmation RED fails on the absent actual action.
A meaningful later navigation RED fails `Ana !== ''`; its correction and all
focused tests pass. The first combined confirmation run also exposed the missing
version envelope in snapshot comparison; corrected snapshots match `persistCart`.
No missing-module failure is represented as a successful HTTP-status assertion.

The authorized two-P2 correction batch adds seven actual-callback regressions.
`correction-red.*` observed five intended failures: locked correction controls,
old-winner clearing and throwing storage getters before POST, on recovery mount,
and after confirmation. `correction-green.*` passes **30/30**, including the original
contact/receipt/wiring cases, revised-POST response loss, legacy references,
malformed/unsafe rejection bodies and post-confirmation write denial. Correction
code removal before send and same-key reuse are asserted directly.

`differential.mjs` compiles baseline `166cf52` and current checkout independently
in memory. Seven preparation/upload/retention phases match exactly: calls, raw
bytes, cart/storage writes, contact and selected filename, including session loss
and explicit reprepare. Git history is used only by this scratch verifier, never
committed tests. Intended differences are the added confirmation/recovery UI and
updated readiness guidance, outside those legacy behavior traces.

Standalone actual-component Chromium proof runs at 390 and 1440 with reduced
motion, keyboard confirmation, and no horizontal overflow. It covers confirmed,
lost-response, reload recovery, mixed currencies, private tracking, owner queue,
error and empty states (16 PNGs under `.pi/order-ui/artifacts/`). Every request is
intercepted: HTML, existing local compiled CSS/fonts and mocked API. No project
SSR, runtime port, real network or backend is used. This is not a fresh Tailwind/
Next build or full-route acceptance. Screenshots use fictional contacts/items.
No public fixture files were created. Four representative PNGs were visually
inspected; automated metrics cover every captured state. That original full-UI
proof is historical evidence, not rerun for the correction batch.

`correction-browser.mjs` ran once after the corrections, using fresh contexts at
390/1440: actual 409 reprice → reload → GET503 → same-key revised confirmation,
unknown-frozen reload and storage getter denial before POST, on recovery mount,
and after authoritative confirmation. Ten fresh `artifacts/correction-*.png`
files and `correction-browser.result.json` record no overflow, reduced motion,
keyboard confirmation, no page errors and no unexpected traffic. Two correction
screenshots were inspected. Correction typecheck/lint and the existing seven-phase
legacy differential all exited0; lint retains only the old storefront image warning.

The protected SHA256 manifest is checked independently of Git status. Exact
commands, exits and slice forecasts are retained in the worker handoff and
`.pi/order-ui/` logs. Source is delivered in dependent work-unit commits; no push, deployment,
full/photo suite, migration, Auth mutation or remote proof is included.

**Risk item 2:** private current-session authority is enforced by existing API;
these mocks do not prove real cookies/Auth/RLS. **Risk item 3:** the shared checkout
event path and cart persistence changed; legacy differential and existing tests
protect it. Initial independent verification passed S2/S3/S6/S17 and found two P2 defects in S4/S22; one correction and limited recheck resolved both, with30/30 tests exit0 (also30/30 parent). No second whole-feature sweep or native approval is inferred. **Risk item 4:**
client single-flight and binding mocks are not database/two-session race proof.
S21 is spent; no further backend execution is authorized by this delivery.
