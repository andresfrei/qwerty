# Selected Tienda context (T1)

A Tienda operates on one internal `business.id`. A storefront is its optional public view (0..1 per business), not the ownership boundary. Selection lives in the URL per tab; it is never authority or a selected-store cookie. T1 supplies server context and additive API guards, not dashboard UI or another-store creation.

## Stable interface for T2–T4

| Export | Contract |
| --- | --- |
| `OwnerBusiness` | `{ id: string; name: string }`; internal business ID, UI label **Tienda**. |
| `parseBusinessSelection(URLSearchParams)` | `{ ok: true, businessId?: string }` or `{ ok: false }`. Accepts only absent selection or exactly one UUID; canonicalizes to lowercase. Rejects empty, malformed, duplicate and extra parameters. |
| `ownerHref(module, businessId?)` | Fixed local destinations: `home` → `/owner`, `orders` → `/owner/orders`, `catalog` → `/owner/catalog`, `store` → `/owner/store`. Carries a validated optional ID; malformed IDs throw. The Tienda page destination is reserved for T3, not implemented here. |
| `resolveOwnerContext(sessionClient, businessId?, onVerifiedOwner?)` | Fresh `auth.getUser()`; returns `null` for ineligible identity, otherwise `{ ownerId, business }`. An explicit missing/foreign business yields `business: null`, never the first store. Read/provider failures throw `OwnerContextError("unavailable")`. |
| `confirmedOwnerId(sessionClient, onVerifiedOwner?)` | Fresh identity only; returns the eligible owner ID or `null`. Calls the optional synchronous callback immediately after validation. |
| `VerifiedOwnerCallback` | `(ownerId: string) => void`; request-local notification for refresh eligibility, never a business grant. |
| `listOwnerBusinesses(sessionClient, page = 0)` | Fresh eligible identity, owned-only stable `created_at,id` ordering, 100 rows per page plus `hasMore`. Page is a nonnegative safe integer ≤1,000,000. Returns `null` without an eligible identity. A page is not an authorization cache. |

Gateway identity requires current confirmed email, nonanonymous authenticated role and email, obtained from `getUser`, not metadata or cached session claims. Each client must be caller-session scoped; never inject a service client. `findOwnedBusiness` is a low-level helper for a gateway that has already bound that identity (onboarding); ordinary server callers use `resolveOwnerContext`. It always adds `owner_id`, and selected lookups also add `id` independently of switcher pagination. Omitted selection retains first `created_at,id` ordering.

T2 should use a distinct explicit creation API, not selected `create_business`. T3 should distinguish ineligible identity, an empty owned list and an invalid explicit selection; do not silently navigate an invalid selection to the first store. T4 should pass the same URL ID into catalog, draft and photo calls, use the queue's existing scoped contract, and key/remount per-store forms with stale-response protection. A URL change alone does not authorize data or actions.

## Optional request parameter

Adapter contracts are additive: `CatalogGateway.ownerBusinessId(businessId?)` resolves that exact owned selection; `OnboardingGateway.firstBusiness(ownerId, businessId?)` resolves it only after `confirmedUser()` has bound the fresh owner. Existing zero-selection callers remain valid. `PhotoRuntime` and photo change bodies are unchanged; the request-local runtime passes its optional selection into `SupabasePhotoPortOptions.businessId`.

Bodies, method/type/origin policies, photo bytes, versions, CAS and storage formats remain unchanged. Only `?businessId=UUID` is added; no body business IDs or additional query keys are accepted.

| Boundary | Selected behavior | Rejection |
| --- | --- | --- |
| Catalog `/owner/catalog/actions` | Existing action resolves and writes the selected owned business. Existing item/category/group/option predicates still apply within it. | Invalid query: `400 invalid_request`, before client creation. Missing/foreign selected business: `401 unauthorized`, no write. |
| Onboarding `/owner/onboarding`, `create_draft` | Recovers or creates only that owned business's unpublished draft. Does not create a business. | Invalid query: `403 request_rejected`, before client creation. Missing/foreign selected business: `409 business_missing`, no write. |
| Onboarding `create_business` | Legacy endpoint remains first-existing resume/create when selection is omitted. Selected use is deliberately rejected; T2 owns explicit another-store creation. | Valid selection with this action: `400 invalid_request`, before client creation. |
| Product photo PUT/DELETE | Existing owner-item RPC must return an owned item whose business also matches selection. Mismatch becomes not-found before normalize/upload/CAS. Owning some other store is insufficient. | Invalid query: `400 invalid_input`, before runtime/auth. Mismatch or foreign/nonexistent item: `404 not_found`; no image or metadata writes. |

Errors contain no foreign business identifiers. All keep their existing private/security headers.

### Refresh eligibility is identity-only

A caller's staged refresh becomes eligible immediately after fresh SDK identity verification, **before any business read**. Later missing/foreign selection, read failure, action rejection or HTTP 400/401/404/409/503 does not revoke that eligibility. The refreshed session belongs to the verified caller, not to the selected store. Business authorization and no-write denials are unchanged.

`resolveOwnerContext(..., onVerifiedOwner)` forwards the callback to `confirmedOwnerId`, which invokes it only after a confirmed, nonanonymous, authenticated/email identity passes `getUser`. It runs before `findOwnedBusiness` can throw or return null. `createSupabaseCatalogGateway(sessionClient, onVerifiedOwner?)` exposes the same optional callback for its route. T2 should capture it in a request-local flag and commit staged cookies based on that flag alone; do not wait for context resolution or action success. Callbacks should only record identity eligibility synchronously, not perform authorization or writes.

Onboarding retains its existing request-local `verifiedOwner` flag. Photo retains its existing fresh-actor runtime verification and cookie eligibility; its selected HTTP path no longer suppresses those cookies on late failures. Rejecting/null/unconfirmed/anonymous identity never permits staged cookies. Owner-context gateways also reject missing email or wrong role. Malformed selection and invalid ingress reject before creating a client and cannot refresh cookies. Catalog's no-selection adapter and all no-selection HTTP/cookie contracts remain untouched. No global mutable context was added; photo selection is snapshotted in each runtime closure.

### Intentional query differences

Previously onboarding rejected every query; it now accepts selected `create_draft`. Catalog and photo previously ignored arbitrary queries; they now reject malformed, duplicate and extra keys, as required. Catalog selected writes now target the selected business rather than the legacy first business. Photo selected mismatches now reject instead of mutating the owned item in another store. Catalog's identity predicate now explicitly matches onboarding's confirmed/nonanonymous authenticated-owner contract and filters `owner_id`, rather than relying only on the old email-confirmed check and RLS visibility.

## Verification and limits

- `owner-store-context*.test.mjs` exercises real handlers/gateway interfaces, two owned stores, foreign/missing selection, switcher truncation, fresh identity, exact rejection bodies, security headers, no unauthorized writes and photo pre-side-effect mismatch. Installed SDK/HTTP tests cover retained eligible refresh on late errors, discarded refresh after rejected identity, pre-client query rejection and concurrent request isolation across catalog/onboarding/photo.
- Scratch differential: `.pi/owner-store-dashboard/context/differential.mjs` loads base/current source through public handlers; compares exact status/body/headers/cookies and write/counter effects. It asserts 20 unchanged no-selection cases, three selected photo late-error refresh comparisons against the legacy handler, and nine intentional query differences. Git history is runtime scratch only, never a committed test dependency.
- `.pi/owner-store-dashboard/context/source-check.mjs` checks 30 protected source fingerprints and nine touched tracked-source base fingerprints against required HEAD. Its tracker fingerprint incorporates the parent's L9 update captured before this correction; no tracker edit is performed by the worker. Initial status and complete initial hash output are also recorded in the worker transcript.
- Risk item 2: deterministic SDK/RPC behavior is not hosted RLS proof. No schema, grants, real records, service credentials, provider configuration or live POSTs changed. The existing photo private adapter remains unchanged except for its additional owned-item business match.
- Risk item 4: selected runtime constraints and refresh staging are request-local; parallel mixed eligible/rejected-identity requests across all three boundaries are covered. Real browser multi-tab behavior, UI stale responses and component remounts remain T3/T4 work.

No full suite, image-parser suite, build, browser or live-provider acceptance is claimed. See the worker handoff for exact command outcomes, including the original TypeScript failure and the correction's single test-fixture correlation fix. Historical validation remains in `validation.md`; current evidence is in `.pi/owner-store-dashboard/context/correction-validation.md`.
