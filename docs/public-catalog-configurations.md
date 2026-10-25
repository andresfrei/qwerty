# Public configurations — anonymous reader available but unmounted

SOURCE prefix only; anonymous reader available but unmounted. No browser/CSS, remote
activation or SQL/Auth/RLS/race proof. Independent SOURCE review was of final bytes, not
this intermediate prefix.

## Public reader contract

`configured-storefront-reader.ts` exports
`readConfiguredStorefront(slug, fetcher = fetch): Promise<ConfiguredStorefrontRead>`
and `PUBLIC_CONFIGURATION_MAX_BYTES = 1048576`.

Successful output retains the existing public `storefront` and `categories`, adds
`capability: "ready" | "legacy_only"` and `configurations`, keyed by public root ID:

- `{status:"legacy"}`: a complete successful active-profile read found none.
- `{status:"ready",catalog:ProfileCatalog}`: **explicit public** T1 projection of
  this root, fixed children, groups, options and active profile metadata only.
- `{status:"unavailable"}`: invalid active document or unreadable/invalid dependency;
  no document, missing child ID/name, price fallback or diagnostic accompanies it.

Only the strict T3 capability classifier enables the new table. Typed absence
returns legacy-only plus an empty configuration map, not a fabricated ready map.
Transport/permission/malformed capability yields `{status:"unavailable"}`; a caller
must retain its cart and must not treat every product as legacy. Other top-level
not-found/misconfigured/unavailable states follow the existing reader. A mismatched
returned slug rejects before any advanced reads.

All requests use the existing public-key factory, anonymous REST credentials,
`credentials:omit`, `redirect:error` and `cache:no-store`, never owner cookies,
service-role or a private catalog RPC. New row reads bind business/references,
require exact count metadata and cap each query at 1000 rows. Profile root IDs are
queried in batches of 100; T1's row/byte ceilings apply per dependent projection,
not to all legacy products. New responses stream-bound UTF-8 to 1 MiB, depth 24,
with a five-second fetch signal; overflow cancels the stream. These are technical
limits, not commercial limits. No truncation is accepted.

Unavailable options remain public metadata with their actual boolean: do **not**
copy the old checkout reader's `is_available=true` option filter. T1 needs the full
pizza matrix/fixed-choice structure; selection still rejects agotado. Missing or
unavailable *items* are not exposed via a privileged fallback. Even a forged
successful supplemental response containing an unavailable child rejects. Missing
children disable only dependent combos; unrelated valid items remain usable.
