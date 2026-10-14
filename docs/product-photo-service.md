# Trusted photo change service

`changeProductPhoto` coordinates normalized upload/replacement or explicit detach. It is a server-side application service, **not a live HTTP endpoint or a Supabase authorization policy**. No credentials are stored in this module.

## Operation

1. Validate the item UUID, canonical bigint version and requested operation.
2. Obtain the caller from a verified server session; read only an item owned by that caller. Missing/non-owned items have the same `not_found` result.
3. For `replace`, call the existing PHOTO-1 encoder and upload only its WebP bytes to a new `<business>/<item>/<uuid>.webp` path with `upsert: false`.
4. Atomically attach the new path (or `null` for `detach`) only if ownership and expected version still match. Increment the version exactly once, preserving bigint precision as strings.

## Required production adapter

`PhotoPorts` is trusted infrastructure, not user-configurable input. The HTTP layer must supply a verified identity, bounded request bytes, same-origin protection, and the canonical `normalizeProductPhoto` implementation. The persistence adapter must implement **one atomic ownership-and-version-checked write**. A separate owner SELECT followed by an unconditional privileged UPDATE is unsafe. Do not parse Postgres bigint JSON into a JavaScript number.

A future bucket must be public for product delivery, static WebP-only, <=409600 bytes, and deny direct client mutations. Do not install the original authenticated-owner upload policy: MIME/path validation does not enforce normalization. Privileged Storage credentials must remain in the server adapter, never a browser bundle or a user's request.

## Failure and public-file retention

`PhotoChangeError.code` is `invalid_input`, `unauthorized`, `not_found`, or `conflict`. Codec and infrastructure failures propagate to the future HTTP adapter, which must map them to safe public responses without exposing raw backend messages. Failed uploads never attach metadata. Lost ownership/version races never return success. There are no retries or delete calls.

Storage upload and metadata attachment are not one transaction: a failed attachment may leave an unreferenced normalized object. Replaced/detached images remain stored. Detach hides the catalog reference; it is **not immediate revocation** of known public URLs or caches. Cleanup is a separate, unauthorized operation.

## Local verification

```sh
node --test apps/web/tests/product-photo-service.test.mjs
node --test apps/web/tests/product-photo-normalizer.test.ts
```

The service suite exercises its exported interface with isolated in-memory persistence and real image encoding/decoding. It does not prove deployed RLS, an atomic database write, a wired HTTP boundary or Storage behavior. Those require the production adapter and separately permitted functional checks. Never run active-project Storage/Auth fixtures by implication.
