# Validate original receipts before private storage

T3a adds a Node-only file validator, not an upload endpoint or a completed purchase. It retains JPEG, PNG, static WebP and PDF bytes without the product-photo compression pipeline. Private storage, authorization and attachment delivery remain T3b; checkout attachment/retry UI remains T3c.

## Integration contract

Call `validateReceiptFile({ bytes, claimedMime? })` from `app/lib/receipt-file.ts` **after request authentication/origin/body limits and before any storage or order mutation**. File names are not authoritative. A nonempty claimed MIME must match the detected type. Missing MIME is permitted when bytes identify a supported type.

Success returns an owned byte copy, exact `sizeBytes`, server-derived `contentType`, SHA-256, and either image `width`/`height` or PDF `pages`. Store those original bytes, not the discarded decoded pixels. Failure throws `ReceiptFileError` with a stable `code` and sanitized message; raw parser errors never reach callers. An upload/order caller must preserve cart/contact and must not create an order after failure.

`createReceiptValidator` is a trusted composition/testing factory. Its process factory must never come from a request or file. The exported singleton has the production defaults below. No Storage/Auth/DB client is imported by this unit.

## Processing limits

| Boundary | Limit |
| --- | --- |
| File bytes, before parsing | 10,485,760 inclusive; larger input starts no process |
| Static image | Full sharp decode; at most 25,000,000 pixels and 16,384 per side |
| PDF | 1–100 pages; page tree and every page's operator list parsed |
| Parallelism | Two child processes per validator/server process; no waiting queue |
| Deadline | 5 seconds from process creation through processing; SIGKILL on expiry |
| Child JavaScript old heap | 128 MiB; **not a hard RSS/native/ArrayBuffer limit** |

The child has no inherited environment credentials, accepts bytes over IPC rather than paths/URLs, suppresses raw decoder diagnostics, and is killed on success, rejection or deadline. A slot is released only after its actual `close` event. Busy, timeout and crash failures permit subsequent retry. Separate OS processes let SIGKILL terminate native image/PDF work as well as blocking JavaScript; unlike `Promise.race`, the abandoned computation does not keep running. Deployment still needs OS/container memory and request/rate/body limits: this is **not a sandbox or a global memory/abuse guarantee**. Each server process has its own parallelism budget.

## What validation establishes

- JPEG/PNG/WebP metadata must match their signatures; the full static image decodes with sharp warnings treated as errors. Animation, truncation and excessive image dimensions are rejected. PNG chunks are traversed with bounded lengths before decoding: an `acTL` chunk rejects APNG even when sharp exposes only its default frame and omits `metadata.pages`. Payload bytes resembling `acTL` do not count as a chunk. Truncated chunk headers/payloads/CRCs and oversized lengths fail closed; this guard is not a whole-PNG conformance validator. No output re-encoding changes receipt fidelity.
- PDF.js **6.4.299** is pinned, with a Node `>=22.13.0` or `>=24` requirement; local development uses Node 24.21.0. No package lifecycle scripts were run during installation.
- PDFs need a complete header/EOF/startxref envelope and a plausible classic xref or xref-stream target, followed by actual PDF.js document, page and operator-list processing. Obvious truncated/bad-xref recovery candidates are rejected.
- Password-protected **and empty-password encrypted** PDFs are rejected. The latter can open without a password prompt, so encryption metadata/permissions are checked separately.
- PDF document actions are not executed and no page is canvas-rendered. Evaluation/system fonts/wasm and external fetch are disabled. No file-selected URL or auxiliary resource URL is supplied. PDF.js's image-processing pixel cap may skip oversized embedded images; acceptance is not a full fidelity/renderability test of every embedded object.

PDF.js can repair structures and `stopAtErrors` only controls particular parsing operations. Passing these checks is **not formal whole-PDF conformance**, validation of every unused object/stream, antivirus, content disarm/reconstruction, payment confirmation, or legibility/authenticity certification. Original PDFs can contain active content; no sanitization claim is made.

## Delivery and proof boundaries

T3b must expose authorized private forced downloads only (`Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, private/no-store); never a public bucket or inline PDF preview. This module does not implement or prove that boundary. Next.js endpoint wiring and child-file deployment tracing must be demonstrated when T3b imports this validator; source tests do not establish bundled/deployed worker resolution.

Run from the repository root:

```sh
node --experimental-strip-types --test apps/web/tests/receipt-file.test.mjs
node --experimental-strip-types --test apps/web/tests/*.test.ts apps/web/tests/*.test.mjs
pnpm --dir apps/web typecheck
pnpm --dir apps/web lint
```

Fixtures are generated locally, including genuine Standard Security Handler encrypted PDFs checked against the installed parser, an exact 10 MiB file, text/scanned/multipage documents, image corruption/animation, and real child-process timeout/crash/busy recovery. Public-API PNG regressions include a genuine two-frame APNG with CRC-bearing chunks and independently compressed frame pixels, a valid static PNG whose IDAT contains literal `acTL`, and malformed/truncated chunk lengths. These are deterministic Node file-boundary tests, **not local Supabase integration, browser, hosted, email or purchase acceptance**.

Review scope: child `feat/guest-receipt-validation` against parent `76d021d`, not the aggregate MVP branch. Rollback removes this validator, its tests/docs and the PDF.js dependency/lock additions without changing catalog/cart/Auth/photo behavior.

## Sources

- [Pinned PDF.js API source](https://github.com/mozilla/pdf.js/blob/v6.4.299/src/display/api.js) and [document encryption metadata](https://github.com/mozilla/pdf.js/blob/v6.4.299/src/core/document.js)
- [Node 24 child processes](https://nodejs.org/docs/latest-v24.x/api/child_process.html)
- [Sharp input options](https://sharp.pixelplumbing.com/api-constructor/)
- [OWASP file upload guidance](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)
