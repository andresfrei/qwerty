# Create another Tienda and recover its outcome (T2)

Use `/owner/stores/create`, not legacy first-store onboarding. Each client-generated UUID identifies one creation attempt and its business, never ownership. This API creates an unpublished storefront, not a published store, dashboard or shared-catalog branch.

## Quick path for T3

1. Generate `crypto.randomUUID()` once for an explicit new-store intent. Persist the attempt/reference and inputs before POST, scoped to the current account/tab. Never store credentials with the attempt or reuse it for another account.
2. POST the exact three fields below with same-origin credentials and JSON. Keep the reference until the result is settled; disable duplicate submissions while pending.
3. If the response is lost, malformed, unrecognized, or says `outcome_unknown`, freeze all mutation controls and use only GET recovery. Never automatically POST again or generate another UUID.
4. A canonical ready response navigates using its `businessId`. Known partial state permits an explicit slug correction on that same ID; canonical business name stays locked. No automatic write follows any GET.

```ts
import type {
  StoreCreationInput,
  StoreCreationResponse,
  CreationStorefront,
} from "@/app/owner/stores/store-creation-contract";

const attempt: StoreCreationInput = {
  businessId: crypto.randomUUID(), // persist before sending
  name: "Mi tienda",
  slug: "mi-tienda",
};
const response = await fetch("/owner/stores/create", {
  method: "POST", credentials: "same-origin",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(attempt),
});
const result: StoreCreationResponse = await response.json();
// Validate/discriminate the returned body; a TS annotation is not runtime validation.
// On transport/parse failure, retain attempt and enter outcome_unknown locally.
const recovery = await fetch(
  `/owner/stores/create?businessId=${encodeURIComponent(attempt.businessId)}`,
  { credentials: "same-origin", cache: "no-store" },
); // explicit read only; never schedule a write from this result
```

The contract module also exports `StoreCreationGateway` and `StoreCreationWriteError` for server adapters. T3 uses only the wire types. The server entry point is `handleStoreCreation(request, { createGateway, trustedOrigin? })`; the session adapter is `createStoreCreationGateway(client, onVerifiedOwner?)`. Production routes obtain trusted origin and public SDK configuration through the existing helpers, not client input.

## Exact wire and field locks

`business` is exactly `{ id: string, name: string }`; `storefront` is exactly `{ slug: string, display_name: string, is_published: boolean }`. No owner IDs, private rows or database errors are returned. Responses are JSON with no extra fields beyond the shapes below.

| HTTP | Exact JSON shape | T3 action / field locks |
| --- | --- | --- |
| 201 | `{ state: "ready", businessId, business, storefront }` | A storefront was inserted. Lock creation fields; navigate with canonical ID. |
| 200 | Same `ready` shape | Canonical existing/resumed storefront, possibly already published. Lock creation fields; do not reset publication or replace supplied canonical values. |
| 409 | `{ state: "partial", businessId, business, reason: "slug_unavailable" }` | Business retained; no owned storefront after duplicate reread. Lock ID/name, allow explicit slug correction and POST on **same** ID. |
| 409 | Same `partial` shape, `reason: "draft_rejected"` | Received known SQL rejection of draft insert. Business retained. Same locks; show failure, no automatic retry. |
| 409 | Same `partial` shape, `reason: "storefront_missing"` | GET found an owned business without a storefront. Same locks; explicit same-ID draft completion is permitted, not automatically triggered. |
| 503 | `{ state: "outcome_unknown", businessId }` | Lock ID/name/slug and all write controls; retain inputs/reference. Only GET recovery. Never infer permanent absence or suggest a new attempt automatically. |
| 400 | `{ error: "invalid_request" }` | This request made no writes and created no session client. Correct input/query/type/size while retaining reference; a previous unknown state is not cleared by this error. |
| 403 | `{ error: "request_rejected" }` | No session client or writes. Check trusted ingress/origin, not business data. Retain attempt. |
| 401 | `{ error: "unauthorized" }` | Current identity is ineligible; no owned reads/writes or cookies. Retain account-scoped attempt; require authentication without replaying writes. |
| 503 | `{ error: "unavailable" }` | Configuration/client/fresh-identity stage unavailable; no business reads/writes. Retain reference. Does not settle any previous unknown attempt. |
| 405 | `{ error: "method_not_allowed" }` | No session client/writes. `Allow: GET, POST`. |

Once unknown, only a recognized GET `ready` or `partial` result changes the recovery state; GET errors/unknown keep it frozen. A partial read is a snapshot, not a promise that an earlier POST cannot finish later. An explicit same-ID correction may therefore resume a winning canonical storefront unchanged instead of applying the entered slug. Do not claim an atomic two-insert transaction or cross-session business-name uniqueness.

### Request validation

- POST accepts only `{ businessId, name, slug }`, with no query parameters. Reject `ownerId`, `is_published` and all extra/missing fields.
- UUID uses the shared selection parser and canonicalizes lowercase. It is a reference only. Business name is trimmed, nonempty, at most 120 JavaScript string code units. Display name for a newly inserted storefront comes from the canonical business name, not a replayed name.
- Slug is 1–63 characters, lowercase ASCII alphanumeric segments separated by single hyphens. No slug normalization or availability preflight is promised.
- POST requires `application/json`, optionally `charset=utf-8`; maximum streamed body is 2048 bytes, including whitespace, regardless of Content-Length. Invalid UTF-8, stream failures and oversized/invalid declared lengths reject before session client creation.
- GET requires exactly one valid `businessId` query parameter and no body. It never inserts, updates, deletes or publishes anything. Missing/foreign business and unavailable reads are nonenumerating `outcome_unknown`, not authoritative absence after a possible in-flight POST.
- Both require trusted Host, consistent forwarded Host/protocol, allowed URL ingress and no cross-site Fetch Metadata. POST requires exact trusted Origin. GET may omit Origin; if present it must match. The route path must match exactly. Existing shared ingress policy is reused, not expanded.

Every response sets `Cache-Control: private, no-store`, `Pragma: no-cache`, `Expires: 0`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff` and `Content-Type: application/json`.

### Suggested Spanish feedback (new UI only)

- Pending: **“Creando tienda…”**; keep the reference and block repeat submission.
- Slug conflict: **“La dirección no está disponible. Elegí otra para esta misma tienda.”**
- Partial: **“La tienda está creada; falta completar su dirección.”**
- Unknown: **“No pudimos confirmar el resultado. Conservamos los datos; comprobá el estado antes de continuar.”** Action: **“Comprobar estado”**, GET only.
- Validation: **“Revisá el nombre y la dirección de la tienda.”**

Do not replace existing authentication messages. Do not display raw provider errors, claim that a store was not created after a missing read, or offer automatic creation with another reference.

## Authority, races and evidence limits

Fresh `confirmedOwnerId(client, onVerifiedOwner)` uses current SDK `getUser`, confirmed email, nonanonymous authenticated identity and email. The callback marks request-local staged cookies eligible immediately before owned reads. Eligible refresh survives late 409/503, including foreign collisions; rejected identity and preidentity invalid requests discard cookies. Eligibility never depends on `response.ok`. No metadata/client owner claim or service key grants authority.

Every business lookup uses both the proposed ID and verified owner predicate. Existing owned business/storefront rows resume unchanged; there is no first-store fallback, upsert, update, delete or cleanup. A new business INSERT uses exactly `{ id, owner_id, name }`; its storefront INSERT uses `{ business_id, slug, display_name, is_published: false }`. PK duplicates reread only the owned row. A foreign collision stays ambiguous; no foreign constraint detail is inspected or exposed. Storefront duplicates reread canonical storefront before reporting slug conflict. Transport/SDK/malformed write responses are unknown; POST does not replay them. Two UUIDs with the same business name remain independent.

The explicit-ID prerequisite is resolved by `supabase/migrations/20261024140222_owner_store_creation_id.sql`, SHA-256 `f6dc243395f1ecaf32c51020af7843e1620b88ff3ac94de050337f3989058a93`. Parent L17 records actual one-bit permission verification and unchanged RLS/policies/defaults/other privileges. This worker only checked source/hash and consumed that receipt; it did not query or reapply remote SQL. Existing schema supports nonunique owner IDs and storefront PK/FK business IDs (0..1 storefront).

`apps/web/tests/owner-store-creation.test.mjs` exercises actual public route handlers, installed SSR/SDK refresh and synthetic REST transport, including concurrent same-ID mock PK enforcement. Its mock constraints are not actual PostgreSQL/RLS acceptance. Recovery queries observe data through the public handler; tests do not inspect production private storage. All URLs/keys/sessions are synthetic and fetch is intercepted.

New-endpoint historical differential is **N/A**: it did not exist at base. Protected-source fingerprints establish that T1, legacy onboarding/no-selection APIs and all other pre-existing repository files captured by the scoped preservation helper remain unchanged; no legacy behavior is intentionally changed. No extra T1 replay is counted. Risk 2 (real owner-data/RLS authorization acceptance) and Risk 4 (real database concurrency/browser recovery) require independent follow-up; no actual owner records, browser, live provider, SQL, build or broad suite were exercised.
