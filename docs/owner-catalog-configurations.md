# Owner configurations — session HTTP API

API ONLY. The route and verified-owner cookie propagation are wired; no controller,
human controls or catalog mounting yet. No schema application, activation or
SQL/Auth/RLS/race/browser proof.

## HTTP contract

`/owner/catalog/configurations` exports `GET` and `POST`; both require exactly
one `businessId` and one `itemId` query parameter, each a UUID. No default-business
fallback. Unsupported methods return `405 {error:"method_not_allowed"}` with
`Allow: GET, POST`. Responses are JSON, private/no-store, no-cache, expiry zero,
no-referrer and nosniff; there are no CORS allow headers.

Both methods check the trusted request target and Origin before session creation.
POST requires exact same Origin; GET permits an absent Origin but not a foreign
one. Query/resource/content-type/encoding/body/UTF-8/document checks all precede
identity calls. POST body is bounded to 263168 bytes while streaming (overflow
cancels the reader); the document independently obeys T1's 262144-byte/depth-12
limits. Declared body length must be valid and match actual bytes. GET accepts
no body/encoding or nonzero declared length.

The fresh confirmed nonanonymous owner identity is checked through the existing
owner-context machinery, followed by an independent `businesses.owner_id` lookup
for the explicit selection. Identity denial is 401; an unowned business or absent
selected item is 404. Eligible refreshed cookies accompany later 404/409/422/503
responses; invalid ingress or rejected identity never publishes refresh cookies.
No service-role client is created and no privileged snapshot RPC is used.

### GET: read-only observation

Ready response: `200 {capability:"ready",catalog:ProfileCatalog}`. The exact T1
projection contains only the selected root, its active fixed-combo children and
their groups/options/profile records. Missing profiles remain missing; inactive
unknown JSON documents and their current versions are retained. Invalid active
documents and unreadable/malformed rows return 503, never fake legacy/empty data.

Only the exact T3 capability response enables new-table reads. Genuine typed
absence returns `200 {capability:"legacy_only"}` with no new-table access.
Capability failure returns `503 {error:"unavailable"}`. Unavailable selected
products/options remain structurally readable; T1 selection validation still
controls purchasing. Exact scoped group/option counts must equal returned row
counts, protecting against PostgREST row truncation. T1 limits apply to this
projection only, not the whole legacy catalog.

GET never invokes save, increments a CAS version, changes a receipt or proves an
in-flight write cannot still commit. The controller never uses a missing
record or unchanged version as permission to retry an unknown POST.

### POST: one atomic CAS

Exact body: `{expectedVersion:number,isActive:boolean,document:unknown}`. Version
is 0 for creation or positive CAS, at most 9007199254740990. Active documents are
parsed/canonicalized through T1; inactive documents may be bounded JSON, including
JSON null. The proposed root plus its fixed children is validated through T1
before calling SQL. Group bounds/references/counts/restrictions are not inferred
from names; temporary agotado is not a structural failure. SQL remains the final
race/reference/dependent-profile authority.

Exactly one session-client call:

```ts
rpc("save_catalog_item_configuration", {
  p_business: businessId, p_item: itemId,
  p_expected_version: expectedVersion,
  p_is_active: isActive, p_document: canonicalDocument,
})
```

Results:

| Response | Meaning |
| --- | --- |
| `200 {code:"saved",profile:ProfileRecord}` | Exact T1 record, bound to business/item, version expected+1 and intended canonical state |
| `409 {error:"configuration_version_conflict"}` | Exact SQL conflict or typed duplicate; no retry |
| `403 {error:"configuration_forbidden"}` | Typed SQL 42501 rollback |
| `422 {error:"invalid_configuration"}` | Proposed T1 structure rejected before RPC |
| `422 {error:"configuration_rejected"}` | Typed SQL 23514/23503/25001/40P01/40001 rollback |
| `503 {error:"legacy_only"}` | Save disabled on genuinely absent schema |
| `503 {error:"unavailable"}` | Read/capability/session infrastructure failed before RPC |
| `503 {error:"outcome_unknown"}` | Transport/unrecognized error or malformed result after attempted RPC; it could have committed |
| `400 {error:"invalid_request"}` | Invalid exact request/document before identity |
| `400 {error:"request_rejected"}` | Invalid Origin/target |
| `413 {error:"invalid_request"}` | Body transport budget exceeded |

No diagnostics/private SQL error text escapes. No retry, profile upsert, deletion,
version reset, base-price write or receipt side effect is implemented. SQL advances
even identical saves; the controller avoids submitting unchanged drafts rather
than inventing a saved response at the old version.

## API implementation exports

`catalog-configuration-gateway.ts` exports `ConfigurationSave`,
`CatalogConfigurationGateway`, `ConfigurationRequestDependencies`,
`parseConfigurationSave`, `parseConfigurationRecord`, `configurationStateKey`,
`createCatalogConfigurationGateway` and `handleCatalogConfigurationRequest`.
Only the handler is an authorization boundary. Gateway methods are request-local
session dependencies, not independent authorization APIs.
