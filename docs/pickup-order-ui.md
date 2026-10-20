# Private pickup UI — T4e source delivery

**Coverage: S2, S3, S4, S6, S17 and S22.** This connects the existing
[private API](pickup-order-api.md), without changing its fields, permissions or
states. All verification below uses fictional data and mocked traffic, not real
Auth, Storage, database, HTTP integration, concurrency, or full-checkout acceptance.

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


This work unit delivers browser transport, private read views and owner navigation with their tests. Checkout confirmation/correction wiring follows in the dependent unit; it is not an operational end-to-end claim.
