# Staged owner dashboard (T3)

**Current status:** T4 activated the contextual routes described in [owner store routing](owner-store-routing.md). T5 completed independent source checks and bounded actual-component browser fixtures, not hosted Auth/RLS or hydrated Next acceptance.

**Historical T3 handoff:** The reusable Tienda UI is staged, **not activated**. Existing `/owner`, catalog and orders entry pages are untouched. The L20 parent correction resolves the pagination lint, selected creation-link/accessibility defects and definite no-write restoration dead end. Focused tests, typecheck and lint now pass; activation and independent browser/security acceptance remain T4/T5.

## T4 quick path

1. Create thin dynamic server wrappers for `/owner`, `/owner/store`, `/owner/stores/new` only in T4. Await the page's `searchParams`; call `loadOwnerDashboard(await createClient(), searchParams)` with the existing current-request session factory, never a service client or cached identity.
2. Render `OwnerDashboardView({ data })`, `{ data, module: "store" }`, or `{ data, create: true }` respectively. It preserves login redirects via `redirect(data.href)`. Its home/store renderers are not catalog/orders renderers.
3. Scope **all** existing catalog/orders/photo/draft clients before mounting a switcher there. Wrap them in `OwnerShell`; pass authorized selected data, and key every selected client root by `business.id`. Also remount the containing account tree on identity changes. Never combine selected B with a legacy first-A client.
4. Resolve the legacy missing-draft widget dependency below. Then verify browser layout at 390/1440, keyboard behavior, reduced motion, stale responses and actual native logout policy in T5.

## Stable exports

| File / export | Inputs and result |
| --- | --- |
| `owner-dashboard-data.ts`: `parseOwnerDashboardSearch` | `URLSearchParams` or Next search record; accepts only a single UUID `businessId` and optional canonical integer `storePage` (0–1,000,000). Arrays, duplicates, malformed values and extras reject. Only `businessId` goes into T1's strict parser. |
| `loadOwnerDashboard` | Request-session `SupabaseClient \| null`, optional search; returns discriminated `OwnerDashboardData`: redirect, invalid, unavailable, missing, empty or selected. `empty` is not a provider failure. |
| `owner-shell.tsx`: `OwnerShell`, `OwnerShellProps` | `ownedBusinesses: readonly OwnerBusiness[]`, `selectedBusiness: OwnerBusiness \| null`, `activeModule: home \| orders \| catalog \| store`, `account: { id }`, `pagination: { page, hasMore }`, optional `children`. Account is server-derived context, not an authorization claim. |
| `owner-dashboard-views.tsx`: `OwnerDashboardView` | `{ data, module?: OwnerModule, create?: boolean }`; use home/store/new wrappers as above. |
| `OwnerHomeView`, `StoreDetails` | `{ business, storefront: CreationStorefront \| null }`; pure real-value presentations, no counts or placeholder modules. |
| `create-store-client.tsx`: default `CreateStore`, `CreateStoreProps` | `{ accountId, contextBusinessId?, firstStore? }`; selected roots keyed by business ID. Empty account uses account ID as key. |
| `store-creation-client.ts`: `StoreCreationSession`, `parseCreationReply`, `validStorefront` | Persisted intent controller, strict wire validator, storefront validator. `CreationSnapshot` exposes recovery/field-lock state. |
| `store-publication-client.tsx`: default `StorePublication` | `{ businessId, accountId, isPublished }`; requires explicit authorized ID, keyed by that ID. |
| `catalog/catalog-editor.ts`: `sendOwnerMutation` | Existing `(path, payload, fetcher?)`, plus optional fourth `businessId`. Omitted argument preserves old target/body/options/results. Selected ID goes only into query, never body. |

Fresh identity is checked initially, by T1 resolve, and by T1 list. All owner IDs must agree or the request fails closed. Selected owned lookup is independent of the switcher page; storefront reads occur only after it succeeds. An explicit foreign/missing selection never chooses the first store. Switcher reads remain bounded at 100 plus `hasMore`, with read-only previous/more links and a truthful upper-bound message.

Navigation uses T1 `ownerHref`: `/owner?businessId=UUID`, `/owner/orders?businessId=UUID`, `/owner/catalog?businessId=UUID`, `/owner/store?businessId=UUID`. Switching preserves the module and resets list pagination. Pagination appends `&storePage=N` (or `?storePage=N` without selection). `+ Crear tienda` is a separate `/owner/stores/new?businessId=UUID` link preserving the validated selected ID; an empty account uses `/owner/stores/new` without a query. It is not a fifth module. The native dropdown trigger announces the selected name (or `Tus tiendas`), and pagination links use a separate `Páginas de tiendas` navigation landmark. Links do not display write loaders.

## Creation and publication safety

- First POST is exactly `{ businessId, name, slug }` to `/owner/stores/create`. UUID generation is once per submitted intent. `sessionStorage` key `qwerty:store-creation:v1:<accountId>` is current-tab/account scoped and contains only inputs, phase and canonical response, never credentials.
- Hydration/restoration finishes before any write. Inputs/reference and an unknown marker are persisted synchronously **before POST**. Storage failure means no POST; input values remain. SSR disables the write button and explains the JavaScript requirement in `noscript`.
- Ready 200/201 locks fields and uses canonical ID/name/address/publication; POST success navigates only while the originating account/context remains mounted. A restored ready result is never reset or automatically posted. An explicit **Preparar otra tienda** action is available only after ready; failed storage reset retains ready and cannot create again.
- Partial 409 locks ID and canonical name; manually corrected slug posts on the same ID. No-write errors retain that partial name lock. Unknown 503, lost/malformed/mismatched responses lock all fields and writes, stop the spinner and retain the reference.
- **Comprobar estado** is GET `/owner/stores/create?businessId=UUID`, no body, no automatic POST. Only recognized ready/partial GET replies settle prior unknown; errors/unavailable do not unlock. Restored unknown/pending markers and partial snapshots begin GET-only. A valid account-bound persisted `editable` state restores editable with the same reference and inputs: that phase is persisted only after a recognized definite no-write POST error (such as `invalid_request` or `unavailable`). Restoration never sends a request or generates a UUID; any retry is explicit and reuses that reference. No-write errors received by GET never clear prior unknown. No new provenance field or server authority is inferred from storage. Exact reason messages follow [T2](owner-store-creation.md).
- Publication sends existing `{ action: "set_published", isPublished }` through the catalog transport to `/owner/catalog/actions?businessId=UUID`. Existing domain rejection/unknown rules remain authoritative. Saved/unknown locks have no spinner and offer only the same selected Tienda's read-only refresh link. There is no automatic retry or local optimistic publication.
- Unmount/account/store changes ignore late fetch state/navigation. The preflight persisted unknown reference remains available for read-only recovery. No global retry manager exists.

### Missing-draft activation dependency

A business with no storefront shows truthful unpublished/incomplete information and **no write widget**. T4 must scope the existing draft-completion widget to the same authorized business using selected `create_draft`, or mount a same-ID completion client using T2. Do not mount the old first-store widget or generate a new business ID to complete an existing business. This staged dependency is intentional.

### Native logout policy dependency

`owner/layout.tsx` exports only metadata and children: `metadata.referrer = "same-origin"`. The shared shell uses native POST `/auth/logout`; existing RootNativeFeedback is unchanged. API/token response HTTP headers, Auth, CSRF and global Next configuration are untouched. **T4 must update the existing `owner/orders/page.tsx` child metadata `referrer: "no-referrer"`**, which otherwise overrides its parent. Actual browser header/referrer behavior is T5 evidence, not proven by the metadata test.

## Evidence and activation gate

Raw logs and preservation/differential tools are in `.pi/owner-store-dashboard/ui/`. Committed tests depend on neither Git nor `.pi`.

| Check | Observed result |
| --- | --- |
| Initial `node --test apps/web/tests/owner-dashboard-views.test.mjs` | RED exit 1, 0/8. Explicit missing `OwnerShell` UI assertion plus missing real data/view modules. |
| First full focused candidate | 28/29; one hook fixture used a random UUID with a fixed response ID, correctly triggering unknown. |
| One bounded correction batch | Deterministic UUID fixture; discriminated error variants fixed type narrowing; iterable callback and ARIA corrections. Added settled reset and field-lock edge coverage before final focused run. |
| `node --test apps/web/tests/owner-dashboard-*.test.mjs` | Previous stage 32/32; L20 correction exit 0, 36/36: 35 behavior tests plus the fixture-module load. Real hook/public callback, SDK-shaped deterministic data and server presentation interfaces; only actual pure presentations expanded. |
| Relevant legacy transport/async tests | Exit 0, 30/30 across catalog transport, shared async presentation and owner async feedback. No T1/T2 rerun counted. |
| `pnpm --filter @qwerty/web typecheck --incremental false` | Historical initial exit 2 (view union narrowing); previous final and L20 correction exit 0. |
| `pnpm --filter @qwerty/web lint` | Historical initial exit 1 (three errors), previous final exit 1 (`useSemanticElements`). L20 correction uses semantic pagination `nav`, exit 0 with only the existing storefront img warning. All failed logs retained. |
| `node .pi/owner-store-dashboard/ui/differential.mjs` | Exit 0, 22 base/current omitted-selection transport/normalizer comparisons; one intentional selected-query difference. |
| Preservation helper / `git diff --check` | 289 pre-existing protected fingerprints unchanged; tracked whitespace check clean. New-file whitespace is checked separately in scratch validation. |

L20 correction RED ran actual creation/view interfaces before source fixes: exit 1, 27/30, with intended failures for restored no-write becoming unknown, the dropped selected creation ID and the generic dropdown accessible name. The existing lint failure supplied pagination RED without a ceremony rerun. One coherent correction then passed all 36 focused checks, typecheck and lint. New coverage also confirms unknown restoration remains GET-only through GET no-write errors/transport loss and rejects invalid account/reference/input shapes. No transport change or legacy rerun was needed in this batch. Correction logs use the `correction-` prefix; the refreshed 289-file preservation baseline includes the parent's L20 tracker update, without overwriting the previous snapshot/logs.

T3 is staged/source-validated, not live acceptance. Source mock checks do not prove hosted owner/RLS isolation (risk 2), actual browser native logout/referrer behavior, CSS at 390/1440, or real cross-tab/database races (risk 4). No live account/provider operations, SQL/grant replay, build, broad suite, native-foundation rerun, dependency or protected-source changes were performed.
