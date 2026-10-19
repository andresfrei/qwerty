# Private receipt staging

Receipts can be staged for an **existing server-verified guest or registered session**. This is not order submission, payment confirmation, account creation, history recovery or attachment UI. T3c/T4 own those later steps.

## Verified remote checkpoint

On 2026-10-19, the single S16 run (job24) completed the actual isolated Next build and real Supabase Auth/Database/Storage/HTTP proof for original PNG/PDF POST → GET, owner-self upload, foreign-owner/wrong-business/direct-access denials and unchanged-byte/state controls. The exact target was `https://jxebudqzcmxgdsegrrqw.supabase.co`; settings returned Anonymous Sign-ins enabled. Build exit0/32746ms; final acceptedtrue, sourceUnchangedtrue and ownedProcessesClosedtrue. Cleanup reported no errors; this is not an independent no-residue audit or a clean committed full-app build/deployment.

Previously applied/read-back units are owner verification `20261018020731`, catalog options/settings `20261018020749` and private receipts `20261018020759`. Separate primary-session S14 SQL verification passed receipt29/29 and targeted owner/catalog33/33, with unconditional rollback and no retained SQL fixtures. No migration replay is needed. Do not change SMTP, hosted Site URL, manual linking or other providers.

Historical failures remain in the feature Log and local artifacts: initial alias guard refusal, normalized-only provider mismatch, job20's lost failure phase and job22's transport timeout. Source tests, SQL checks, synthetic packaging and actual remote proof are separate evidence—not interchangeable claims. Neither the UI nor an atomic order exists yet.

See [storage and owner boundaries](guest-receipt-storage.md) and [public proof source and limits](guest-receipt-proof.md). Future live execution needs a fresh scoped authorization; S15 and S16 are consumed.

## HTTP contract

| Request | Success | Requirements |
| --- | --- | --- |
| `POST /api/checkout/receipts?slug=pizza` | `201 {"receiptId":"<server UUID>"}` | Same-origin POST; exact `Content-Type: application/octet-stream`; raw original bytes, 1–10,485,760 bytes. |
| `GET /api/checkout/receipts/<receiptId>?slug=pizza` | `200` original bytes | Verified original buyer and exact published business. Origin may be absent for navigation; if supplied, it must match. |

Only one `slug` query parameter is allowed. There are no actor, business-ID, object-path, MIME, hash, filename or contact-authority parameters. POST does not accept multipart, JSON, MIME parameters or Content-Encoding. Content-Length is optional, must be a nonnegative safe decimal integer when supplied, and must match the observed body. Both declared size and actual streamed bytes are capped; oversized streams are cancelled before validation/storage.

The server checks trusted configuration/host/origin, publication and `auth.getUser()` before consuming the upload. It never signs in anonymously, signs up, uses `getSession()` as proof, or treats typed email/phone/user metadata as authority. Only T1 deliberately establishes a missing guest session. Failed requests do not commit refreshed/cleared cookies; successful requests commit only staged SDK cookie writes, not arbitrary provider response headers.

The public role reads publication independently of the privileged Storage client. The server derives buyer ID from the verified user, business ID from the published slug, a random receipt ID, and `${businessId}/${actorId}/${receiptId}`. Existing `validateReceiptFile` semantics determine content type, exact size and SHA-256; original bytes are retained. See [T3a validation reference](#t3a-validation-reference) below for parser limits and fidelity caveats.

### Errors and delivery

All responses use `Cache-Control: private, no-store`, `Pragma: no-cache`, `Expires: 0`, `Referrer-Policy: no-referrer` and `X-Content-Type-Options: nosniff`.

| Status | Exact JSON body |
| --- | --- |
| 400 | `{"error":"Request rejected"}` |
| 401 | `{"error":"Session required"}` |
| 404 | `{"error":"Receipt not found"}` |
| 405 | `{"error":"Method not allowed"}`; `Allow: POST` for collection, `Allow: GET` for item |
| 413 | `{"error":"Receipt exceeds 10 MiB"}` |
| 422 | `{"error":"Receipt file rejected","code":"<T3a validation code>"}` |
| 503 | `{"error":"Receipt unavailable"}`, or `{"error":"Receipt file rejected","code":"busy|processing_timeout|processing_failed"}` |

Downloads use the validated stored MIME and fixed `Content-Disposition: attachment; filename="receipt.png"` (or `receipt.jpg`, `receipt.webp`, `receipt.pdf`). No public/signed URL or inline preview is returned. Metadata/path, byte length and SHA-256 are checked before delivery. Unknown receipt, foreign buyer/business, malformed identifier and invalid stored metadata share the 404 body. Provider failures are opaque 503s, not raw provider details.

A receipt ID, business ownership, equal contact email, or confirmed email alone never grants receipt access. Before an order exists, only the original buyer's verified actor plus the exact business can retrieve staged originals. Receipt access never inherits owner-policy authority; the separately reviewed verified-owner prerequisite is documented with storage boundaries.

## Database and Storage access

The reviewed receipt migration is applied. Its bucket/table/RLS/service boundary and exact rollback-safe SQL proof sources are described in [storage boundaries](guest-receipt-storage.md). No browser or owner bypass, public/signed URL, unvalidated upload, order reference or attached-state transition is introduced.

## Deployment and failure limits

- Server-only `SUPABASE_SERVICE_ROLE_KEY` must belong to the same trusted Supabase deployment as the public config. Never prefix it with `NEXT_PUBLIC_`, serialize it or put it in browser bundles. Existing public config and `QWERTY_SITE_URL` validation are reused.
- Node runtime only. Start with `apps/web` as CWD and preserve `app/lib/receipt-file-worker.mjs` plus traced Sharp/PDF.js/native dependencies. `next.config.mjs` adds only receipt bundling/tracing composition; existing owner/auth response headers are preserved.
- The parser retains T3a's killable child, process limits, original-byte copy and APNG/encrypted-PDF guards. No parser/process path is selected from payload data. Capacity is per Node process, not a distributed upload quota or complete abuse defense.
- Storage and Postgres are not a transaction. Upload or metadata failure returns no receipt ID and creates no order. A partial upload or failed metadata insert can leave a **private orphan**. A retry uses a fresh random resource; no overwrite or automatic orphan deletion is attempted.
- There is no idempotent upload promise, retention period, abandoned-data cleanup, antivirus/CDR certification, cart mutation or loss-of-session email recovery. Production quotas/rate limits, retention/privacy decisions and parser deployment checks remain operational prerequisites.

## T3a validation reference

The existing Node-only validator retains JPEG, PNG, static WebP and PDF bytes without the product-photo compression pipeline. Its public API and default guards are unchanged by T3b.

Call `validateReceiptFile({ bytes, claimedMime? })` from `app/lib/receipt-file.ts` **after request authentication/origin/body limits and before any storage or order mutation**. File names are not authoritative. A nonempty claimed MIME must match the detected type. Missing MIME is permitted when bytes identify a supported type. The raw-binary staging contract deliberately supplies no claimed MIME.

Success returns an owned byte copy, exact `sizeBytes`, server-derived `contentType`, SHA-256, and either image `width`/`height` or PDF `pages`. Store those original bytes, not the discarded decoded pixels. Failure throws `ReceiptFileError` with a stable `code` and sanitized message; raw parser errors never reach callers. An upload/order caller must preserve cart/contact and must not create an order after failure.

`createReceiptValidator` is a trusted composition/testing factory. Its process factory must never come from a request or file. The exported singleton has the production defaults below. The validator itself imports no Storage/Auth/DB client.

### Processing limits

| Boundary | Limit |
| --- | --- |
| File bytes, before parsing | 10,485,760 inclusive; larger input starts no process |
| Static image | Full sharp decode; at most 25,000,000 pixels and 16,384 per side |
| PDF | 1–100 pages; page tree and every page's operator list parsed |
| Parallelism | Two child processes per validator/server process; no waiting queue |
| Deadline | 5 seconds from process creation through processing; SIGKILL on expiry |
| Child JavaScript old heap | 128 MiB; **not a hard RSS/native/ArrayBuffer limit** |

The child has no inherited environment credentials, accepts bytes over IPC rather than paths/URLs, suppresses raw decoder diagnostics, and is killed on success, rejection or deadline. A slot is released only after its actual `close` event. Busy, timeout and crash failures permit subsequent retry. Separate OS processes let SIGKILL terminate native image/PDF work as well as blocking JavaScript; unlike `Promise.race`, the abandoned computation does not keep running. Deployment still needs OS/container memory and request/rate/body limits: this is **not a sandbox or a global memory/abuse guarantee**. Each server process has its own parallelism budget.

### What validation establishes

- JPEG/PNG/WebP metadata must match their signatures; the full static image decodes with sharp warnings treated as errors. Animation, truncation and excessive image dimensions are rejected. PNG chunks are traversed with bounded lengths before decoding: an `acTL` chunk rejects APNG even when sharp exposes only its default frame and omits `metadata.pages`. Payload bytes resembling `acTL` do not count as a chunk. Truncated chunk headers/payloads/CRCs and oversized lengths fail closed; this guard is not a whole-PNG conformance validator. No output re-encoding changes receipt fidelity.
- PDF.js **6.4.299** is pinned, with a Node `>=22.13.0` or `>=24` requirement; local development uses Node 24.21.0. No package lifecycle scripts were run during installation.
- PDFs need a complete header/EOF/startxref envelope and a plausible classic xref or xref-stream target, followed by actual PDF.js document, page and operator-list processing. Obvious truncated/bad-xref recovery candidates are rejected.
- Password-protected **and empty-password encrypted** PDFs are rejected. The latter can open without a password prompt, so encryption metadata/permissions are checked separately.
- PDF document actions are not executed and no page is canvas-rendered. Evaluation/system fonts/wasm and external fetch are disabled. No file-selected URL or auxiliary resource URL is supplied. PDF.js's image-processing pixel cap may skip oversized embedded images; acceptance is not a full fidelity/renderability test of every embedded object.

PDF.js can repair structures and `stopAtErrors` only controls particular parsing operations. Passing these checks is **not formal whole-PDF conformance**, validation of every unused object/stream, antivirus, content disarm/reconstruction, payment confirmation, or legibility/authenticity certification. Original PDFs can contain active content; no sanitization claim is made.

Fixtures are generated locally, including genuine Standard Security Handler encrypted PDFs checked against the installed parser, an exact 10 MiB file, text/scanned/multipage documents, image corruption/animation, and real child-process timeout/crash/busy recovery. Public-API PNG regressions include a genuine two-frame APNG with CRC-bearing chunks and independently compressed frame pixels, a valid static PNG whose IDAT contains literal `acTL`, and malformed/truncated chunk lengths. These are deterministic Node file-boundary tests, **not local Supabase integration, browser, hosted, email or purchase acceptance**. Run `node --experimental-strip-types --test apps/web/tests/receipt-file.test.mjs` from repository root for the focused T3a boundary.

### Sources retained from T3a

- [Pinned PDF.js API source](https://github.com/mozilla/pdf.js/blob/v6.4.299/src/display/api.js) and [document encryption metadata](https://github.com/mozilla/pdf.js/blob/v6.4.299/src/core/document.js)
- [Node 24 child processes](https://nodejs.org/docs/latest-v24.x/api/child_process.html)
- [Sharp input options](https://sharp.pixelplumbing.com/api-constructor/)
- [OWASP file upload guidance](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)
