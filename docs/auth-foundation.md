# Existing Auth foundation

This versions existing Auth source for the landing dependency, not a new Auth design.
Source and tests are retained unchanged; the full foundation is complete only after
all six work units. No pending Owner, Categories or sidebar implementation is copied.
Existing shared helpers/configuration remain the frozen committed versions.

## Recovery proof

[Recovery proof](../apps/web/app/lib/supabase/recovery-proof.ts) is HMAC-bound to
user/session identity, expires after 15 minutes and uses an HttpOnly, SameSite=Lax
cookie scoped to `/auth/update-password` (Secure on HTTPS).
The retained [proof tests](../apps/web/tests/recovery-proof.test.ts) cover key,
identity/session, tampering, expiry and cookie boundaries.

## Login and signup

`/auth/login` and `/auth/signup` render native forms posting to their `/submit` routes.
[Shared POST handling](../apps/web/app/lib/supabase/auth-post.ts) keeps validation,
trusted-origin/host checks, staged cookies and fixed destinations together.
Retained [POST tests](../apps/web/tests/auth-post-boundary.test.ts) cover rejected
ingress and disabled GET surfaces; they do not exercise provider-success login/signup.

## Confirmation

`/auth/confirm` delegates to the [handler](../apps/web/app/auth/confirm/handler.ts).
Email confirmation targets `/owner`; recovery targets `/auth/update-password`;
invalid/failed confirmation targets `/auth/error`, never a caller-selected URL.
Recovery proof is issued only after OTP session, verified claims and fresh user agree.
Failure discards staged OTP cookies. [Callback tests](../apps/web/tests/auth-confirm.test.ts)
use injected clients and signing keys, not a live email/provider flow.

## Recovery request

`/auth/forgot-password` posts to `/auth/forgot-password/submit`.
Its [handler](../apps/web/app/auth/forgot-password/submit/handler.ts) uses a
non-persistent client and neutral check-email responses for provider outcomes.
[Existing tests](../apps/web/tests/forgot-password.test.ts) inject provider methods
and assert rejected inputs do not dispatch.

## Password update

`/auth/update-password` posts to `/auth/update-password/submit`.
The [handler](../apps/web/app/auth/update-password/submit/handler.ts) requires trusted
ingress, matching passwords, fresh identity/claims and recovery proof before updating.
Success follows global sign-out and a fixed login status redirect. Update/sign-out
errors never claim success; a password update may precede a later sign-out failure.
[Tests](../apps/web/tests/update-password.test.ts) use fake clients and mutation counters.
Proof gates password update only, not global Owner access. The frozen Owner gateway
independently requires fresh confirmed identity and ownership filtering.

## Session edges

`/auth/logout` is POST-only, checks fresh identity, signs out locally and returns to
a fixed login status page. [Rejection tests](../apps/web/tests/logout-boundary.test.ts)
do not exercise successful provider logout.
[Proxy](../apps/web/proxy.ts) covers `/owner/:path*` and `/auth/confirm`, propagating
staged refresh cookies/headers without granting authorization.
[Proxy tests](../apps/web/tests/supabase-proxy.test.ts) cover response propagation and
missing configuration. The server helper remains the existing SSR cookie adapter.

## Configuration and privacy

Preferred pair: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
Legacy fallback: `SUPABASE_URL`, `SUPABASE_ANON_KEY`. Trusted site origin:
`QWERTY_SITE_URL`; recovery signing key: `QWERTY_RECOVERY_SIGNING_KEY`.
No configuration values or credentials are packaged or inspected.
Existing no-store/referrer rules and native-form exceptions remain unchanged.
Fixed destinations and neutral signup/reset outcomes preserve privacy intentions.
These source checks are not a production security guarantee.

## Verification and limits

The 28 existing source/test additions total 2,894 lines and match their source snapshot
byte-for-byte. Direct offline Node ran 53 Auth cases plus seven existing regressions:
60 passed, zero failed/skipped/cancelled, zero guarded fetch attempts. Child application
configuration was removed before tests; injected clients never contacted providers.
Ordinary direct `tsc --noEmit --incremental false` passed. Biome checked 20 app files
and proxy separately: both exit0, one existing unused `options` warning in proxy.
Module-format warnings were retained. No product code was changed to silence warnings.
Independent source verification found no candidate-caused severe blocker; it is not
native review approval. Native assessment was unassessable before staging because
untracked selection was required; no native START/receipt/approval was produced.
Generated Next route/root-parameter declarations, production build, live email/account/
provider flows, database operations, browser QA and deployment were not performed.
The declaration imports are present; stale generated routes were not copied.
