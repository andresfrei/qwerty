# Operate on the selected Tienda (T4)

All five owner routes now resolve fresh request-local owner context before rendering data or actions. Selection stays in the URL, not a layout identity cache, global variable or cookie. Explicit invalid or foreign selection never falls back to another Tienda.

## Quick path

1. Open `/owner`, then select a Tienda in the native dropdown. Its footer contains **+ Crear tienda**, retaining the current validated `businessId`.
2. Navigate between **Inicio**, **Pedidos**, **Catálogo** and **Tienda**. Each module carries that selection. Previous/more switcher links retain the module, selection and semantic pagination landmark.
3. Complete a missing draft on **Tienda** for that same business, or explicitly create another Tienda using the T2 creation UI. Neither action publishes automatically.

## Activated routes

| Route | Server behavior |
| --- | --- |
| `/owner` | Thin dynamic wrapper around `loadOwnerDashboard` and `OwnerDashboardView`. |
| `/owner/store` | Same resolver; Tienda details plus selected publication or same-business draft completion. |
| `/owner/stores/new` | Same resolver; T2 creation UI, not legacy first-business resume. |
| `/owner/catalog` | Same resolver; reads selected categories, items, option groups, options and settings only after authorization. |
| `/owner/orders` | Same resolver and shell; existing GET-only queue receives the authorized selected ID. |

Every page awaits `searchParams` and uses the current-request session factory. Omitted selection retains T1's first authorized `created_at,id` ordering. Invalid, missing/foreign, provider-unavailable, empty-account and authentication redirects remain distinct. An empty account mounts T2 creation; provider failure never becomes an empty account. Catalog read failures suppress its entire editor and data presentation, including partial results; provider error details remain private.

All catalog queries include the authorized `business_id`. Storefront is obtained by the common resolver, not a public-visibility ownership check. Groups are additionally restricted to returned selected item IDs, and options to those groups before rendering. No catalog or order mutation runs during server rendering.

## Client boundaries and locks

| Client | Selected contract |
| --- | --- |
| Catalog editor | All 11 actions, corrections and unpublish use `sendOwnerMutation(path, payload, undefined, business.id)`. Only the query gains `businessId`; bodies remain unchanged, including `isPublished: false`. |
| Photo editor | Optional `businessId` adds the same query to PUT/DELETE. Item ID, file body, content type, CAS version string and headers remain unchanged. Omitted prop preserves the legacy item-owner URL. |
| Missing-draft widget | A known business sends only selected `create_draft`. It cannot generate an ID or create a business row. Legacy null-business `create_business` still omits selection. |
| Order queue | Existing GET-only request and private-data clearing remain intact. Its catalog backlink carries the same selection; there are no status-changing controls. |

Containing shell and client roots use `<accountId>:<businessId>` keys; photos additionally include item ID. Empty-account creation uses the account/empty context. A store/account switch remounts forms rather than carrying another store's state forward. Catalog, photo and draft callbacks capture an effect-scoped token; cleanup invalidates it so late responses cannot update state, clear a file input or refresh a different context. Photo cleanup tracks both business and item dependencies. Queue generation cleanup continues to reject obsolete private rows.

The prior same-tick ref guards, initiating-form spinner, shared pending/saved/unknown locks, retained inputs and exact CAS precision are preserved. Unknown outcomes never schedule retries, automatic writes or new references. Read-only recovery links remain scoped to the selected Tienda/catalog. User-facing draft labels now say **Tienda**; legacy business API and Auth messages are not rebranded.

Existing clients were scoped first; catalog/orders and the shell followed; store/new wrappers were mounted next and home last. This avoids activating a B selector over a legacy first-A mutation client.

## Native logout policy

Orders metadata retains its private title and robots settings but no longer overrides the owner layout's `same-origin` referrer policy. The shell still uses native POST logout. Auth routes, CSRF checks, native feedback, global configuration and API/token HTTP `no-referrer` headers are unchanged. This is source/SSR evidence, **not actual browser Origin/referrer proof**; that remains T5.

## Verification

All commands used a 30-second tool limit and synthetic/mock data, without backend traffic.

| Exact command | Observed result |
| --- | --- |
| `node --test apps/web/tests/owner-store-routing*.test.mjs apps/web/tests/owner-store-client-context*.test.mjs` | RED: 3/38 pass, 35 intended failures before implementation. Initial GREEN: 38/38. After additional alternate/handler cases and the lint correction: 53/53 behavior tests. |
| `node --test apps/web/tests/owner-dashboard-*.test.mjs apps/web/tests/owner-first-store-ui.test.mjs apps/web/tests/owner-catalog-ui-*.test.mjs apps/web/tests/owner-async-action-feedback.test.mjs apps/web/tests/pickup-order-ui-queue.test.mjs` | Initial and final: 68/68, comprising 67 behavior tests plus one directly executed fixture module. Existing photo public-callback cases are included in `owner-async-action-feedback.test.mjs`. |
| `pnpm --filter @qwerty/web typecheck --incremental false` | Initial and post-correction exit 0. No incremental output. |
| `pnpm --filter @qwerty/web lint` | Initial exit 1: three unnecessary effect-dependency errors. One focused source correction made the token initialization explicitly depend on context. Final exit 0, only the pre-existing storefront img warning. |
| `node .pi/owner-store-dashboard/routing/differential.mjs` | Final exit 0: 45 HEAD/current public-callback comparisons. First scratch invocation failed to resolve TypeScript from the scratch directory; explicitly resolving installed web dependencies fixed the helper. Both logs retained. |
| `node .pi/owner-store-dashboard/routing/preservation.mjs` | 1,998 pre-existing protected fingerprints unchanged, including T1/T2/T3 prerequisites, Auth/session factory, SQL and trackers. |
| `git diff --check` | Exit 0. New/untracked delivery files receive a separate whitespace check in scratch. |
| `node .pi/owner-store-dashboard/routing/shipping-check.mjs` | Exit 0: whitespace/newlines clean across all 18 delivery files; 298 changed source lines, 174 test/fixture lines and 72 guide lines (544 total additions/deletions). |

The differential invokes old/current public callbacks for all 11 catalog actions through success, rejection and unknown outcomes, both photo methods through success/conflict/rejection/unknown, and first-business/draft callbacks. It compares payloads, methods, CAS strings, blob identity, input values, refresh effects and pending/settled locks. Two known-business draft cases intentionally gain the selected query. Selected catalog/photo query additions, scoped backlinks and Tienda labels are intentional; omitted catalog/photo/create-business transport contracts remain unchanged. Git history is used only by scratch verification, never shipping tests.

New tests exercise actual server pages, real pure shell SSR, hook callbacks and existing public handlers. They cover owned A/B, foreign/malformed selection, omitted selection, empty accounts, redirects/provider failure, selected reads, account/business keys, stale cleanup, all action queries, false publication, string CAS and same-ID missing-draft completion with zero business inserts. Hook fixtures model effect dependencies and cleanup rather than stubbing successful behavior.

## Review boundary

T4 changes 11 source files, six test/fixture files and this guide: 544 changed shipping lines (298 source + 174 tests + 72 documentation). This is one cohesive routing/client transaction and exceeds the advisory 400-line delivery guideline when tests/docs and route replacements are included; do not count pre-existing T1–T3 source as newly authored T4 work. The parent owns independent review, tracking and commit slicing.

- **Risk 2:** mock owner predicates and SDK-shaped reads are not actual hosted owner/RLS acceptance. No real owner rows, grants, SQL or provider operations occurred. Fresh role/identity fixtures are synthetic logs, not real data.
- **Risk 4:** cleanup and keys are source/mock evidence, not real browser cross-tab/database concurrency proof. Native logout browser policy, 390/1440 layout, keyboard and reduced-motion checks remain T5.
- The default session factory and owner layout are protected untracked prerequisites; they were consumed read-only, not adopted or modified.
- No foundation-nine replay, browser, broad suite, image parser, build, dependency change, Auth change, staging or commit is claimed.

See [context](owner-store-context.md), [creation](owner-store-creation.md) and the historical [staged UI](owner-store-dashboard-ui.md) contracts for preceding units. Raw T4 logs and nonshipping helpers are under `.pi/owner-store-dashboard/routing/`.
