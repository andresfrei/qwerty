# Set up the owner's first store

Confirmed owners can now create their first business, create an unpublished storefront, edit the existing catalog and publish a customer-facing `/store/<slug>` link. This is source implementation with synthetic verification—not proof of real signup, email delivery or hosted persistence.

## Quick path

1. Open the existing `/auth/signup`, enter your own credentials and confirm the email yourself. The agent does not create accounts or bypass confirmation.
2. At `/owner`, enter the business name. Then enter the storefront display name and an editable suggested address (lowercase letters, numbers and hyphens; at most 63 characters).
3. Open **Configurar catálogo**. Create a category, then products, option groups and options. After each saved catalog change, use **Actualizar catálogo (solo lectura)** before the next change.
4. Configure availability, order and the fixed two-flavor surcharge. Review the existing customer description/price preview and photo controls below the editor.
5. Publish and use **Ver tienda para hacer pedidos**, not the owner editor URL. An empty catalog may still be published; the UI warns rather than changing that existing contract.

## Recovery and boundaries

| Situation | Behavior |
| --- | --- |
| Business already exists | Resume the first owned business, ordered by `created_at,id`. This is not a new multi-store manager. |
| Business saved, draft not saved | Keep the business. Refresh `/owner` and continue its draft setup; never delete it or silently create another. |
| Draft already exists | Resume it without overwriting its address, display name or publication state. |
| Address conflict | Show “Esa dirección no está disponible”; disclose no other owner or private store. |
| Explicit validation denial | Retain inputs and allow correction. |
| Lost, malformed or unavailable response | Treat the outcome as unknown, freeze mutations and offer read-only refresh. Do not claim the write failed or automatically repeat it. |
| Concurrent sessions | No owner-wide business uniqueness or atomic two-insert guarantee is invented. Separate sessions can race; refresh and inspect the first business. |

The new onboarding POST accepts only `{action:"create_business",name}` or `{action:"create_draft",displayName,slug}`. Identity comes from server `getUser`; an authenticated, nonanonymous, confirmed email user is required. The caller-session SDK and existing current-confirmed/nondeleted-owner RLS remain authoritative. Client-supplied owner, business or publication authority is rejected. Origin/Host/forwarded headers, path/query, JSON shape and a 2 KiB streamed body limit are checked before creating the client. Responses are private/no-store. Refresh cookies stay staged until a fresh `getUser` check establishes an eligible owner. Rejected, null, unconfirmed, anonymous or wrong-role identities discard the complete staged batch without replacing browser cookies. A later business-read failure does not undo verified identity, so its 503 response can still commit a valid refresh. No service credentials, new tables, RPCs or permission changes are introduced.

Catalog forms use the unchanged `/owner/catalog/actions` JSON contract and `validateCatalogAction`. Decimal text is converted to safe integer minor units without floating-point multiplication; currencies remain uppercase ISO-three-letter values. Option groups retain `distinct` and `quantity` modes: use minimum/maximum 12 for exactly twelve units, or distinct selections for flavors/sizes/halves. Existing pricing/description preview and PhotoEditor wiring remain intact. Availability is editable for products and individual options; order is editable for categories, products, groups and options.

## Verification and remaining evidence

- Meaningful stub RED: onboarding returned 501 instead of 201; setup lacked a form; catalog lacked the `create_category` form. These were assertion failures, not missing modules.
- New focused tests: HTTP denials, verified identity, RLS-shaped SDK queries, recoverable drafts, private conflicts, unknown outcomes, double clicks, all eleven catalog action callbacks, minor-unit boundaries and actual installed SSR SDK cookie refresh with fully intercepted fetch.
- Existing focused catalog actions/options and Auth-boundary tests pass. TypeScript and project lint pass. Full suite, photo diagnostics and build remain deliberately deferred.
- Runtime-owned in-memory differential compares the original pages at the recorded base commit with current pages. Existing catalog reads/navigation/logout/PhotoEditor props match; owner ordering plus its own-storefront read are intentional additions. The 103 protected hashes remain unchanged. Committed tests never read Git history.
- Original browser attempt remains failed (exit2, selector timeout after seven mobile screenshots). Preserve its logs/report/PNGs; its fixture-header encoding artifact was not a production-copy defect.
- Separately authorized S6 job30 executed the exact corrected mock artifact once, exit0 in17s. Twenty distinct retry1 PNGs cover390/1440 owner/business/draft/private conflict/category/product/groups/options/publication/buyer-link/unknown retention. Keyboard, reduced motion, no overflow, retained inputs and no page errors/unexpected requests passed. This uses existing compiled CSS and intercepted API—not real Next SSR, signup, mail or database persistence.


Logs and safe reports are in `.pi/owner-first-store/`. The browser harness imports actual components and does not import production code from `.pi`. It neither opens real owner SSR nor permits backend traffic.

## Review handoff

Review the onboarding HTTP/SDK boundary first, then the two client state machines and exact catalog action bodies. Existing owner pages still depend on pre-existing, untracked Auth modules (`app/lib/supabase/server.ts` and `app/auth/access-validation.ts`); those files and their dependency closure were not adopted or edited. The new onboarding route uses the installed SSR SDK and existing public configuration directly, not that untracked server factory.

Reviewable dependent delivery units (parent only):

1. Onboarding handler/gateway/route with HTTP and SDK tests (~350–400 lines, risk 2: session/tenant boundary).
2. Owner setup UI/page composition with fixtures and React tests (~200–300 lines, risk 2: partial/unknown recovery).
3. Catalog controls/adapters/page composition with action/transport tests (~350–450 lines, risk 2: merchant writes/publication).
4. Documentation and runtime-owned evidence, if retained, separate from production dependencies. Split the catalog slice at the pure adapter/transport tests if a strict 400-line review cap is needed.

The independent P2 cookie-forwarding defect has an installed-SDK public-route RED/GREEN regression: rejected identity previously emitted `Set-Cookie`; the request-local gate now prevents it while retaining refresh cookies after a verified owner's later read failure. Correction evidence is in `correction-*.log` and `correction-verification.json`.

The corrected artifact SHA256 `d6aa6a2cf539dfefd2012e5142acb0b39ece4fc28149e40a973c6327052f8ccd` ran only after explicit S6 consent and an exclusive used marker. Its grant is consumed. Results use `retry1-*`; all original failed-evidence hashes remained intact. The initial security review's sole P2 was fixed with an installed-SDK RED/GREEN; limited independent recheck passed eight identity/cookie scenarios, including rejected identity with no cookies and verified identity/read503 with retained refresh. No second full review or native approval is inferred.


Human email confirmation, SMTP/template/Site URL readiness, real hosted RLS behavior and actual buyer ordering acceptance remain separate pending work. No provider configuration, live project data, signup email, migration, dependency, service, deployment or push was changed by this implementation. Existing untracked Auth prerequisites remain in this working tree; no clean committed-app build is claimed.
