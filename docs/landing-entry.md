# Landing entry: `/ingresar`

The public landing uses an always-labelled **Ingresar** native link to `/ingresar`.
Its label does not need a session lookup. This unit supplies the destination resolver;
it does not implement the landing composition or change Owner.

## Request contract (S3)

The server-only App Router GET adapter delegates to a request-local handler:

| Fresh result | HTTP status | Literal relative `Location` |
| --- | --- | --- |
| Confirmed, non-anonymous authenticated Owner-eligible identity | 303 | `/owner` |
| Absent, expired, unconfirmed or otherwise ineligible identity | 303 | `/auth/login?status=required` |
| Missing configuration or thrown configuration/provider failure | 303 | `/auth/login?status=unavailable` |

Bodies are empty. No identity, token, provider error or session detail is returned or
logged. Request URL, Host, forwarded Host, `next`, `returnTo`, callback and business
parameters do not select destinations, businesses or cookies.

Every response from the handler enforces `Cache-Control: private, no-store,
no-cache, must-revalidate, max-age=0`, `Pragma: no-cache`, `Expires: 0` and
`Vary: Cookie`. These and the literal Location are set **after** SDK metadata.

## Identity and refresh boundary

Each GET creates a new Supabase server client using the existing public-key
configuration helper and `createCallbackCookieState`. The unchanged
`confirmedOwnerId` helper calls fresh `auth.getUser()` once. No `getSession`,
claims-only decision, business query, mutation or store selection is involved.
Malformed missing/non-string identity IDs fail closed.

SDK refresh cookies and metadata are staged per request. They are published only
after the fresh identity passes the existing Owner eligibility helper. Denials and
provider exceptions discard staged refresh state, including deletion cookies.
The callback cookie helper still updates the request-local cookie view as designed.

**This redirect grants no business permission.** `/owner` performs its existing
fresh authorization and owned-business checks independently. Login, confirmation,
password recovery and its path-scoped proof cookie are unchanged. There is no new
global recovery-session guard and no claim that such a guard exists.

## Methods and validation limits

Only GET is exported by `route.ts`. Next owns default unsupported-method 405 and
automatic OPTIONS handling. Next's implicit HEAD invokes GET with a HEAD request;
the handler's method guard returns an empty private 405 with `Allow: GET` without
configuration or provider access. Direct non-GET handler calls have that same
fail-closed contract. Framework-generated OPTIONS/405 headers are not supplied by
this handler and are not asserted as private handler responses.

`apps/web/tests/landing-entry.test.ts` exercises the public NextRequest →
NextResponse handler with a mock Supabase public `auth.getUser` port and the actual
shared eligibility/cookie helpers. It covers fresh identity, denial variants,
refresh publication/discard, request isolation, fixed destinations, cache/header
precedence and method rejection. A small source assertion protects GET-only route
wiring; it is not a running Next server integration test.

Risk item 2: security-sensitive identity/refresh boundary. Independent verification
and native risk assessment remain the parent's responsibility. These local tests
do not prove live provider refresh, deployment/proxy behavior or browser navigation.
