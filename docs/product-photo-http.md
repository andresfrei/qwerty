# Trusted product photo HTTP boundary

`PUT /owner/catalog/items/[itemId]/photo` replaces or first attaches a product photo. `DELETE` detaches the catalog reference without deleting the public Storage object. Both operations require the trusted session runtime and the canonical photo-change service.

## Request contract

- `X-Photo-Version` is canonical PostgreSQL `bigint` text; the handler does not coerce it through JavaScript `Number`.
- `PUT` accepts raw image bytes, not multipart form data. The actual stream is counted even when `Content-Length` is missing. A declared length must be canonical, no larger than 4 MiB, and equal the bytes received. Overflow cancels the reader before returning `413 {"error":"input_too_large"}`.
- `DELETE` must have an empty body.
- Trusted `Origin`, `Host`, `X-Forwarded-Host`, `X-Forwarded-Proto`, and the request URL are checked at the photo boundary. A configured loopback proxy is accepted only through the same validated host/protocol rules as the existing callback boundary.
- The session is authenticated before the request body is consumed. Caller-supplied actor, business, and storage identifiers are not accepted.

## Responses

Success is `200` with `{ "photoPath": string | null, "photoVersion": string }`. Errors are stable envelopes: `400 invalid_input`, `401 unauthorized`, `403 request_rejected`, `404 not_found`, `409 conflict`, `413 input_too_large`, `422 invalid_image`, `503 unavailable`, and `405 method_not_allowed` with `Allow: PUT, DELETE`. Typed service errors are classified by their concrete error classes; forged `{code}` objects never select an authorization or conflict response. A missing or invalid configured site origin is unavailable (`503`), while a configured origin mismatch is rejected (`403`).

Every response is private and non-cacheable (`private, no-store`, `Expires: 0`, `Pragma: no-cache`, and `Referrer-Policy: no-referrer`). Provider messages and credentials never cross the boundary. Runtime cookie refreshes are applied only after identity verification; denied identity responses never propagate cookies.

The route is explicitly Node/dynamic and awaits Next 16's promise-based `params`. It exports only supported Next route methods/configuration: PUT, DELETE, GET, HEAD, POST, PATCH, and OPTIONS. Unsupported methods are explicit `405` handlers so they retain the private headers and HEAD body rule. `createPhotoRouteHandlers` lives in the HTTP helper as a server-side seam for deterministic tests; production handlers use the default runtime factory.

## Verification scope

`apps/web/tests/product-photo-http.test.mjs` uses only invented identifiers and in-memory runtime/ports. It covers origin and proxy rejection, missing identity, exact headers and JSON, body-size accounting/cancellation, first attach and replace, detach preservation, stale/CAS races, normalization and upstream failures, and awaited route params. It does not claim live Auth, Database, Storage, or network proof.
