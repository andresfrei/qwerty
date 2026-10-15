# Trusted product-photo runtime

`apps/web/app/lib/product-photo-runtime.ts` is the server-side request seam for trusted product-photo changes. It exports the frozen `createPhotoRuntime(request)` factory and the `authenticate`, `change`, and `applyCookies` methods without changing the existing service, adapter, or normalizer APIs. The module carries Next's `server-only` marker and rejects a browser context before reading configuration or creating any SDK.

## Session boundary

Each runtime owns one request and one public SSR client. The public client reads request cookies and calls `auth.getUser()`. A confirmed, non-anonymous UUID identity is accepted only when the result envelope has an explicit `error: null`. The installed Supabase session-missing/invalid-session predicates preserve ordinary unauthenticated behavior as `authenticate() === null`; transport errors, missing configuration, malformed envelopes, and other provider failures become sanitized `PhotoRuntimeError("unavailable")`. Anonymous and unconfirmed users remain unauthorized. The verified actor is cached for the request, so submitted or adapter-supplied actor values cannot replace it.

The exact public `SupabaseConfig` used for successful verification is snapshotted and reused for the private client. Configuration is not reread between public verification and the operation.

Cookie updates from SSR refreshes are staged in request-local state. Request parsing and response serialization use the installed `@supabase/ssr` helpers, including URI decoding and cookie attributes. Cookies are forwarded only after a confirmed identity has been verified. Staged provider headers are limited to the helper's cache fields, and final runtime headers always enforce private, no-store cache behavior, `Expires: 0`, `Pragma: no-cache`, and `Referrer-Policy: no-referrer`.

## Private operation client

The privileged Supabase client is created lazily, only after public identity verification and only for `change`. Production reads the server-only `SUPABASE_SECRET_KEY`; after trimming, it must use the modern nonblank `sb_secret_` format and never falls back to a public key. It uses the snapshotted public project URL and disables persisted sessions, URL session detection, and automatic token refresh. The private client receives no public cookie state.

`change` composes the existing service and Supabase adapter with the canonical `normalizeProductPhoto` function by default. Test-only dependencies may replace configuration, SDK factories, or normalization while retaining the same public seam. Adapter, normalizer, and service errors remain typed and sanitized; unexpected failures become `PhotoRuntimeError("unavailable")`.

## Verification boundary

`apps/web/tests/product-photo-runtime.test.mjs` uses invented keys, an in-memory server-only test loader, isolated fake SDK clients, and request-local cookie state. It covers the browser guard, server-only marker, Supabase session-missing behavior, strict auth envelopes, anonymous/unconfirmed identities, config snapshotting, secret validation, cookie helper parity, final security headers, lazy private-client configuration, verified-actor propagation through real service/adapter orchestration, malformed Storage success, unavailable configuration, and canonical-normalizer binding. It makes no Auth, Database, Storage, live-network, or endpoint call.
