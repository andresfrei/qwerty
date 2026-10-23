# Preserve native authentication form origins

Five form documents now use `Referrer-Policy: same-origin` so native same-origin POST navigation retains the canonical Origin. The exact Origin/Host guards are unchanged: missing, `null`, or forged origins must still be rejected with `{"error":"Request rejected"}`.

## Policy boundary

| Surface | Referrer policy |
| --- | --- |
| `/auth/login`, `/auth/signup`, `/auth/forgot-password`, `/auth/update-password`, `/owner` | `same-origin` |
| Generic `/auth/:path*` and `/owner/:path*`, including submit, logout, confirmation, error and nested private pages | `no-referrer` |

The five exact overrides follow both generic rules. Every override retains the same Cache-Control, Pragma and Expires protection. `same-origin` suppresses cross-origin referrers, but permits same-origin referrers on these documents; callback/token and nested private surfaces deliberately retain `no-referrer`. No CSRF guard, Auth implementation, cookie behavior, tracing configuration or dependency changed.

## Evidence and limits

The reported rejection was previously live-reproduced by the parent with `Origin: null`; that is not proof that a regular account can log in. A fresh isolated Chromium replay reproduced the browser cause before the source fix:

- Node with system CA trust fetched the anonymous canonical login HTML and an allowlist of safe response headers. No cookies or credentials were sent or retained.
- The full HTML was replayed at `https://qwerty.localhost/auth/login` through route fulfillment, with JavaScript disabled and service workers blocked. Every unmatched request was aborted; native submission used dummy `.invalid` credentials and was intercepted locally, never sent to Auth or a backend.
- Original `no-referrer`: exactly one native POST observed with Origin string `null`; the canonical-Origin assertion failed (RED).
- Corrected source-resolved policy: exactly one native POST observed with Origin `https://qwerty.localhost` (GREEN). One unmatched stylesheet request was blocked; no backend traffic occurred.

This is synthetic native-navigation evidence, **not** browser TLS acceptance, hydrated UI verification, real-account login, recovery/email delivery or hosted-provider acceptance. The prior certificate failure was not retried or bypassed. Real-account proof remains human-only.

## Review and checks

Review `apps/web/next.config.mjs` and `apps/web/tests/auth-form-origin.test.mjs` first. Local evidence is under `.pi/auth-form-origin/` (fixtures and scratch probes are not intended as production tests):

- `node --test apps/web/tests/auth-form-origin.test.mjs`: six intended failures before overrides, then six passes. The initial test helper's wildcard slicing was corrected before implementation; both failure captures remain.
- The authorized 19-file Auth/owner suite: 91 passes, run once.
- `npm --prefix apps/web run typecheck -- --incremental false` and `npm --prefix apps/web run lint`: exit 0.
- `node .pi/auth-form-origin/differential.mjs`: exported base-vs-changed config resolves 15 paths; only the five document policies differ, with cache protection and unrelated configuration unchanged. Reading Git history is confined to this scratch probe, never a committed test.
- `replay-red.stdout` retains the canonical-Origin assertion failure; `replay-green.stdout` records method/Origin and the successful result. Paired `.stderr` and `.exit` files retain command outcomes.

Independent security verification passed six policy tests and 20 isolated public-handler cases: 16 missing/null/forged-Origin or forged-Host denials and four trusted-Origin/local-invalid redirects, each with no response cookies, unchanged input cookies and zero provider fetches. The parent repeated six policy tests and observed the running server's new document policies, unchanged endpoint policies and canonical/null/forged POST results. A first HTTP assertion incorrectly rejected Next dev's documented exact `no-cache, must-revalidate` rendered-page override; the corrected check accepts only that existing development exception, never on Route Handler POST responses. It passed nine GET and three local-invalid POST checks.

Risk: item 2 (document security headers). Native assessment remains unassessable because unrelated untracked files exist; RDD is off, and independent verification is not native approval. Existing dirty and untracked Auth prerequisites remain outside this work unit; this is not a clean-checkout acceptance claim. Full-suite, photo diagnostics and build remain explicitly deferred. Real-account login still requires the human to reload the login page and enter credentials only in the browser.
