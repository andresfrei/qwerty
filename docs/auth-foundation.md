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
