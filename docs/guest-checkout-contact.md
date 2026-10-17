# Guest checkout contact entry

## Delivered boundary

T2b adds `/store/<slug>/checkout` and a nonempty-cart “Continuar compra” link.
The dynamic server page awaits the route parameters and reads only the public
T2a catalog. Missing/unpublished stores use not-found handling; unavailable or
misconfigured reads show a retry-later state. Rendering, hydration and navigation
never initialize Auth. The existing server page passes its authoritative public
slug to the storefront client; that is its only change.

The checkout uses the existing business-scoped `qwerty:cart:v1:<businessId>` key
and version-2 payload, not another cart. `normalizePersistedCart`, `reconcileCart`,
`addSelectedCartItem`, `setCartQuantity`, `priceSelection`, `validateSelections`,
`describeSelection`, `cartTotalsByCurrency` and `formatMoney` retain their existing
implementations. Quantity updates isolate a line before calling the shared helper
because it accepts either an item ID or a configured key.

## Review before readiness

Configured distinct groups expose independent choices for sizes/flavors and
configured quantity groups expose per-option unit counts. Shared validation
controls limits (including at most two flavors and exactly twelve dozen units);
shared pricing includes deltas and the configured two-flavor surcharge. Ordinary
items need no artificial groups. Cart quantities are separate from pack contents.

Unavailable products and changed/incomplete selections remain visible, block
continuation and suppress the aggregate total. Removed options/groups can be
explicitly removed. Changed prices/currencies require explicit acceptance of the
new unit price; incomplete selections can be corrected. Existing selection data
is retained on reconciliation failure rather than silently dropped. Prices remain
orientative: future order submission must independently validate them server-side.

## Contact and session request

Name, email and telephone are required controlled fields. Validation bounds name
to 120, email to 254 and telephone to 50 characters. Telephone accepts ordinary
contact punctuation without an OTP/country-code/identity requirement. Both email
and phone remain unverified. Entering contact details does not query or disclose
accounts, saved details or earlier orders. Registration remains optional and later.

Only a deliberate valid form submit calls `POST /api/checkout/session`, with JSON
`{ "slug": "<public-slug>" }`, same-origin credentials and no-store caching.
Contact never enters this request, URLs or localStorage. The component uses a
per-instance ref guard plus disabled controls while the request is pending. The
client never imports an Auth SDK, signs out, edits cookies or replaces an owner
session. T1 remains responsible for validating/reusing the server session.

A successful response must be exactly `{ "ready": true }`. Network failures,
rejections, 503 and malformed replies leave contact, cart and selections intact
with generic retry feedback. Readiness neither clears the cart nor submits an
order. The UI explicitly says “Todavía no se envió ningún pedido” and offers no
pretend receipt/order action. Receipt storage, atomic order creation, tracking,
account linking and production Auth readiness are not delivered here.

## Verification scope

Deterministic tests execute the real controller/shared helpers, exact synthetic
request/response contract, actual client event handlers in a hook harness, and
React server rendering. The event harness covers mount without network calls,
rapid repeated submit, failed-request retention, retry, readiness without clearing,
and contact exclusion from persisted data. Source assertions cover server and
storefront wiring; they are not browser evidence. Existing cart/browse tests
remain green and the storefront source diff contains only the slug prop and new
link.

A separate previous/current behavioral differential passed nine synthetic
interaction phases in isolated processes: product presentation, add/repeated-add,
quantity changes, totals, persisted reload, removal and all cart write sequences.
Only the explicitly requested checkout anchor was normalized. Its transient
Git baseline/script live under `.pi/checkout-t2b-differential/`; no delivered test
depends on Git history.

Real-browser proof subsequently ran the actual Next application, CSS and client
hydration from an isolated current-source copy, with no `.env` files. Public REST
data was synthetic, and the session POST was intercepted rather than reaching
Auth. The isolated webpack build passed, and Chromium checks passed at 390×844
and 1440×900. Both configured pizza sizes/two flavors/surcharge and exactly twelve
empanada contents, preserved contact/cart through a simulated 503 and readiness,
and checked the exact slug-only POST and a second business's empty cart.

Screenshots were inspected for mobile/desktop layout and feedback. Every sampled
phase had no horizontal overflow. No unexpected page errors or network failures
occurred; the injected 503 produced its expected console message. The fixture
recorded 39 reads, zero forbidden calls, zero Auth calls and zero writes. Original
source hashes were unchanged; both loopback services and browser processes were
closed. Evidence: `.pi/checkout-t2b-browser/artifacts/result.json`, process logs
and screenshots. The build emitted a scratch-HOME/workspace tracing warning;
it was not a failed build.

This proves application UI behavior with mocked services, not real Supabase
session creation, private receipt access, durable orders, email delivery, hosted
deployment, a clean committed checkout, or human visual acceptance. The browser
runner uses the separately installed global tooling; no web dependency was added.
Complete keyboard coverage and focus behavior on every device are not claimed.
