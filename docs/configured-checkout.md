# Configured checkout — pure adapter

SOURCE preparation only; not deployed or activated. This prefix has pure adapters only:
no SDK wiring, HTTP v2, owner editor or public UI. SQL/Auth/RLS/races/browser remain
unproved.

## Capability contract shared with T4/T5

`apps/web/app/lib/catalog-configuration-runtime.ts` exports:

- `CatalogConfigurationRpc`: minimal server-owned `rpc(name,args)` dependency.
- `readCatalogConfigurationCapability(client)`:
  `Promise<"ready" | "legacy_only" | "unavailable">`.
- `createCatalogConfigurationRuntime(client)`:
  `{configurationCapability(), configuredCatalog(business,slug)}`.
- `CatalogConfigurationRuntime`, `CatalogConfigurationCapability`,
  `ConfiguredCatalogSnapshot`, `CONFIGURED_SNAPSHOT_MAX_BYTES` (16 MiB).
- `validateConfiguredCatalogSnapshot(value,business,slug)`:
  fresh private snapshot or `null`.
- `projectConfiguredCatalog(snapshot,itemId)`:
  T1 `ProfileResult<ProfileCatalog>`, never a wrapper or public DTO.

Capability calls `catalog_configuration_capabilities` with `{}`. Only the exact
single-row `[{version:2,schemaVersion:1}]` is ready. Only `PGRST202` with the exact
public function name and no-argument schema-cache message/details is legacy-only.
Both PostgREST detail forms (with/without the unnamed JSON argument alternative)
are recognized. An unrelated function/parameter signature, transport/permission
failure, empty/multirow/bare-object response or unknown fields/types is unavailable.
There is no undefined-method fallback and no capability cache in this adapter.

## Private snapshot / projection

`configuredCatalog` calls only service RPC `pickup_order_catalog_v2` with exact
`{p_business,p_slug}`. RPC errors throw unavailable, including a missing v2 RPC
after ready capability; they never select legacy. SQL NULL remains `null`.

The adapter checks exact wrapper keys, version 2/schemaVersion 1, business/slug
binding, SHA-256 format, row keys/types/identity uniqueness and same-business
item/group/option/profile references. Payloads are bounded to 16 MiB and depth 24.

Projection selects only the requested root, its configured fixed children, their
groups/options and profile records, explicitly constructs the exact T1 fields,
and calls `validateProfileConfiguration`. T1's 1000 rows/2 MiB ceilings apply only
to this projection, not every historical business row. Active invalid profiles
fail, never become legacy. Availability is not structural: exhausted fixed choices
leave unrelated projections valid; purchase selection validation remains T1's job.
The returned projection is fresh; wrappers/private unrelated data are not spread.

These helpers do not authorize actors, verify receipts, certify prices or expose
HTTP data. Only server-owned composition may supply the privileged RPC client.
No capability result proves deployed SQL correctness or permits profile activation.
