# Landing first chapter

## Objective
Replace the temporary Qwerty homepage with a responsive, semantic first landing chapter: hero followed by the existing problem → flow story. Match the approved design language while making clear that the product is still in development.

## Scope and boundaries
- Start from `main` on `feat/landing-first-chapter`; one Next.js web app, no Supabase, checkout, store route, email capture, registration or fake demo.
- Use existing `design/qwerty-hero-*.png` and `design/qwerty-problem-flow-*.png` as visual references, not webpage screenshots. OpenPencil source is unavailable in this session (desktop app disconnected); do not claim to have inspected/edited `.pen`. The mobile problem-flow export is 291px downsampled; inspect the implemented webpage at native 390px, not the export.
- Keep current approved mockup copy and its three problem cards; user explicitly declined applying later four-card feedback to the mockup. Only functioning CTA is in-page navigation to the flow section. No dead login/trial buttons. Label all order amounts/states illustrative and the offer conceptual, including third-party fee qualification for the planned no-Qwerty-commission model.
- SEO foundation: es-AR, meaningful title/description, canonical root under `qwapp.lat`, semantic heading/link/section structure. Keep `robots noindex,nofollow` while the product/landing remains unlaunched. Do not add sitemap, structured data about unavailable software, store routes, or fabricated proof.
- Choose a lightweight linter only after inspecting exact package/lifecycle metadata. Keep pnpm's build-script policy enabled; user explicitly rejected the prior `unrs-resolver` postinstall. Do not approve/bypass blocked scripts.
- Implement with server-rendered markup, no unnecessary client JS or extra packages beyond vetted lint/font requirements. Small work-unit commits on the feature branch; no push/PR/merge without a separate decision and repository policy checks.
- For this static presentation work, behavior-first RED is a meaningful served-HTML contract (headline, flow landmarks, noindex); observe it before implementation. Then validate types, build, lint, HTTPS, accessibility basics and screenshots at 390px and desktop. CSS/visual quality requires rendered inspection, not only tests.

## Tasks

### LC-1 — Vet and add deterministic lint
- Status: done
- Audit: `@biomejs/biome@2.5.14` and Linux binding exact tarball metadata show no lifecycle scripts or regular dependencies; optional platform binaries only. It is a general TSX/React linter, not Next-specific ESLint rule coverage. If install introduces a blocked script or unrs, stop and request a new decision.
- Outcome: pinned linter, minimal config/script and reproducible lockfile; `pnpm lint` plus frozen install pass without policy bypass. No unrelated style churn.
- Verification: inspect manifest/lockfile, run lint on existing scaffold and fix only any relevant violations. Commit this tooling work unit with tests/docs alongside it.
- Commit: pending.

### LC-2 — Build the landing hero
- Status: in progress
- Outcome: brand/hero copy and illustrative order/payment/courier examples rendered as accessible HTML/CSS, not a PNG; no fake CTA; responsive 390px and desktop. Keep payment pending and courier delivered-but-unsettled distinct.
- Verification: observed HTML RED then GREEN, lint/typecheck/build, visual screenshot inspection and overflow checks at 390px and desktop. Commit hero with its checks and copy evidence.
- Commit: pending.

### LC-3 — Connect problem to order flow
- Status: pending
- Outcome: three dispersed-work cards, then four flow cards and separate payment strip linked by order #149; adjacent sections, anchored real navigation, no claim of implemented functionality.
- Verification: rendered HTML contracts, 390px and desktop screenshots, no horizontal overflow, accessible heading order/contrast check, trusted HTTPS, noindex/canonical; note any failed or skipped checks. Commit this cohesive section with its evidence. PR only after separate repository policy/issue/check review and user authorization.
- Commit: pending.

## Evidence
- 2026-09-25: `main` was clean at `2f3696d` before branching. Read Next 16 installed guides for pages/layouts, CSS, fonts and metadata. Scout inspected existing PNGs; accepted baseline is cream/ink/lime, Manrope, compact statuses and separate transfer/courier settlement. OpenPencil responded app disconnected, so use exported visuals and report source-inspection limitation. Biome 2.5.14 registry metadata and dry-run tarballs show no scripts, no regular deps and expected native optional binaries; pnpm policy remains enforced. Chromium headless binary exists locally for screenshot verification.
- 2026-09-25: App-level HTML RED at HTTPS 200: `Tus pedidos.`, problem/flow headings and in-page anchor absent in placeholder, while es-AR and noindex remained correct. LC-1 writer added exact-pinned Biome 2.5.14, minimal formatter-disabled config and root/app lint scripts; no unrs or build-script allowlist. Writer's `pnpm build` passed but Next regenerated `next-env.d.ts`; parent returned it to tracked dev version. Independent verifier passed frozen install, lint (3 app files), typecheck and diff check under ordinary pnpm policy; Biome does not provide Next-specific ESLint rules. No blocked scripts or package-policy bypass.

## Next step
Commit LC-1 tooling unit, then implement LC-2 hero against the already observed RED; preserve the approved copy and noindex.
