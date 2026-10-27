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
