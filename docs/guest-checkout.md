# Guest checkout session entry (T1)

## Contract

`POST /api/checkout/session` accepts only JSON `{ "slug": "pizza-shop" }`.
The streamed body is limited to 1,024 bytes; extra fields, non-string slugs,
invalid JSON/UTF-8 and other content types are rejected. Slug syntax and the
63-character limit come from the existing public `readStorefront` reader.
That reader must resolve a published storefront before any Auth client is created;
unknown/unpublished targets are not eligible. Catalog read failures also fail closed.
This reuses the existing public reader, including its catalog reads and latency,
rather than introducing a second publication definition or session-aware catalog.

The request must have the exact configured trusted site `Origin` and pass the
existing Host/forwarded-host/protocol checks. Configuration uses the existing
Supabase public configuration and `QWERTY_SITE_URL`; there is no new setting.

| Status | Exact JSON body | Meaning |
| --- | --- | --- |
| 200 | `{"ready":true}` | A server-validated identity is available for later checkout work. |
| 400 | `{"error":"Request rejected"}` | Untrusted request or invalid body. |
| 404 | `{"error":"Storefront unavailable"}` | Public reader cannot resolve the target. |
| 405 | `{"error":"Method not allowed"}` | Only POST is accepted (`Allow: POST`). |
| 503 | `{"error":"Checkout session unavailable"}` | Configuration, store, session verification or provider failure. |

Every response is `Cache-Control: private, no-store`, `Pragma: no-cache`,
`Expires: 0`, with `Referrer-Policy: no-referrer`. No user IDs, emails, profile,
role, tokens or account state appear in JSON. Successful SSR Auth cookies are
necessarily returned as Set-Cookie, not as response data.

## Session preservation

`getUser()` verifies existing owner, registered and anonymous sessions on the
server. It does not rely on client-supplied metadata for authorization.
`signInAnonymously()` runs only when no user exists and there is no error or the
SDK reports `AuthSessionMissingError`, and no existing standard Supabase auth
cookie (including chunks) is present. Unreadable existing cookies fail closed;
this conservative boundary does not offer automatic session repair/sign-out.
Invalid JWT, refresh, network and configuration failures never authorize an
identity switch. No login/signup-specific handler is reused.
A new signup must return both a user and a non-null SDK session with no error;
a user-only response fails with 503 and no cookie updates. Existing-session
reuse still relies on `getUser()`, which does not return a Session.

Cookie writes are staged against a detached request cookie jar using the existing
callback cookie helper. Only successful session validation/creation commits SSR
cookies; rejection, exception or provider failure commits none. SDK response
headers cannot override the private response policy. All state is request-local.
There is no cross-request anonymous-account deduplication guarantee: concurrent
missing-session requests may each create a guest. Order idempotency is later work.
GET, render, prefetch and public cart operations never create Auth users.
No existing Auth handler/helper implementation or owner permissions changed.

## Limits and evidence

This endpoint is not a checkout UI, placed order, registered account, verified
phone/email, saved contact, receipt upload or authorization to read order history.
No contact is persisted. Anonymous Auth uses the `authenticated` SQL role, so
owner access must continue to require ownership and confirmed email. A typed
email never recovers guest access or authorizes account/order linking. Losing the
guest session before linking will not be recoverable merely by entering email.

Local source flags `enable_anonymous_sign_ins` and `enable_manual_linking` remain
false. Runtime anonymous sign-in is **not enabled or proven by these tests**.
No configuration, migrations, database grants/data, running stack, hosted project,
provider or credentials were changed or inspected. Deterministic Request/Response
tests inject Auth/store boundaries; production-route tests also exercise the
installed SDK against intercepted synthetic fetch, including user-only signup
and successful session cookie propagation. They establish control flow, privacy,
cookie staging and failure behavior, not real Auth/DB/Storage/browser delivery. Real
integration proof belongs to T6 under separate authorization. Abuse/rate controls,
production SMTP readiness, contact/cart UI, private receipt storage, atomic order
submission and optional verified account linking remain explicit future work.
