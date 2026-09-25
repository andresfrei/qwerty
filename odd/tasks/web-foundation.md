# Qwerty web foundation

## Objective
Create the smallest runnable monorepo foundation for one Qwerty web app, using the user-approved pnpm workspaces, Next.js App Router, TypeScript, Tailwind CSS and existing Portless HTTPS hostname. Do not implement the landing design or business application in this task.

## Scope and decisions
- One app only: `apps/web`; no speculative shared packages, Turbo, Supabase integration, store routes or tenant schema.
- Production domain reserved: `qwapp.lat`; future public store URLs `https://qwapp.lat/ar/<slug>` with default country AR, but do not create a nonfunctional store page.
- The local hostname is `https://qwerty.localhost`. Existing root `portless.json` maps `apps/web` to `qwerty`; ensure `pnpm dev` from root runs the app through Portless without recursion.
- Initial page is a small, explicitly nonfunctional placeholder, not the landing or a working CTA. Keep it non-indexable until launch-ready content exists. No invented product claims.
- Pin exact package versions and commit the lockfile when authorized; no remote push. `.mcp.json`, existing docs and design files are not part of this work unit.
- User confirmed the frontend stack. Git exists on unborn `feat/web-foundation` (branched from unborn main); no prior commit and all pre-existing files remain untracked. Do not accidentally stage unrelated files.
- TDD: scaffold has no meaningful domain RED test; verify installation, typecheck, production build, and a real trusted-HTTPS response through Portless. Lint is intentionally deferred until landing implementation after dependency/script review. Record exact results.

## Tasks

### WF-0 — Restore delegated-worktree routing
- Status: done
- Outcome: Start a fresh Pi session from this Git worktree so the coordinator can bind it; if the unborn HEAD still blocks delegation, seek explicit authorization for an initial commit before making one. Do not bypass the mandatory multi-file writer route inline.
- Evidence: both `gentle-ai-worker` and read-only `gentle-ai-explore` failed before launch with `could not register launched worktree: Select an existing worktree in the same Git clone as this session.` `session_worktree_register` also failed. This session began before `git init`; HEAD is unborn. No implementation files were written.

### WF-1B — Resolve blocked dependency build policy
- Status: done
- Outcome: Human now explicitly chose to remove `eslint-config-next`/ESLint from this scaffold and verify with TypeScript, Next build, and HTTPS. Remove the unused lint config/scripts and stale `allowBuilds` undecided entry, regenerate the pinned lockfile without allowing or running `unrs-resolver` postinstall, and keep pnpm's build-script policy enforced. If another lifecycle script is blocked, stop for a new decision; do not bypass protections. Save a reminder to select an audited lightweight linter when landing implementation begins.

### WF-1 — Bootstrap a runnable single-app workspace
- Status: in progress (all technical checks passed; work-unit commit awaits explicit user authorization)
- Route: one bounded `gentle-ai-worker` for multiple nontrivial files; independent command-running verifier after writer self-check.
- Acceptance: root pnpm workspace and app scripts work without recursion; one minimal Next.js page renders on Portless; Tailwind is wired; title/meta reflect only an unlaunched Qwerty site; placeholder stays noindex; `.gitignore` protects generated output/secrets; lockfile is reproducible; no unsupported functionality or framework sprawl.
- Checks: `pnpm install --frozen-lockfile` (after lockfile generation), typecheck, build, and HTTPS smoke response on `qwerty.localhost`; record failures/pending. Lint deliberately deferred, not silently skipped. No Git commit without explicit user authorization under repository safety policy; if blocked, leave task open and report the exact next action.
- Rollback boundary: only new root workspace/manifests/lockfile, `apps/web` foundation, Portless script override, `.gitignore` additions and a minimal startup note; preserve unrelated design/docs.

## Evidence
- 2026-09-25: User approved pnpm workspaces + one Next.js/TypeScript/Tailwind app. `git switch -c feat/web-foundation` created the branch before source edits; no commits. Current npm registry reports next 16.3.6, react 19.3.0, tailwindcss 4.3.3; installed pnpm 11.20.0 and Node 26.5.1. Official Next/Tailwind/pnpm docs consulted for manual setup and workspace configuration. Portless 0.15.5 HTTPS proxy was verified earlier.
- 2026-09-25: Routing blocker in prior session: it began before Git existed; writer/scout could not register the unborn worktree. No scaffold or dependency files were written.
- 2026-09-25: New Pi session from the repository successfully registered `/home/andresfrei/dev/qwerty` as its session worktree despite unborn HEAD. WF-0 resolved without an initial commit; WF-1 delegated successfully.
- 2026-09-25: Bounded writer created root workspace and `apps/web` scaffold, minimal noindex placeholder, Tailwind v4 config, README and lockfile; no commit/push. `pnpm install` and frozen install exited with `ERR_PNPM_IGNORED_BUILDS` for `unrs-resolver@1.12.2`; lint, typecheck, build stopped at the same gate and HTTPS smoke was not run. `pnpm-workspace.yaml` contains the pnpm-generated undecided allowBuilds entry. User initially declined approval. Native assess was unavailable (`package-local-binary-missing`), so no validated candidate or review closure exists.
- 2026-09-25: User explicitly authorized a different approach: remove `eslint-config-next` and ESLint from the scaffold, retain pnpm script security, verify with TypeScript/build/HTTPS, and remember to add a vetted lightweight linter with the real landing. No new generic coding skill.
- 2026-09-25: WF-1B complete: parent removed only the generated ESLint config after delegated writer refused file deletion; bounded writer removed lint dependencies/scripts and stale allowBuilds entry, regenerated lockfile with zero `unrs-resolver` references. `pnpm install`, `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm build` passed under ordinary pnpm policy; no lifecycle script approval. Next build added `.next/dev/types` to `apps/web/tsconfig.json` and generated `apps/web/tsconfig.tsbuildinfo`; parent added `*.tsbuildinfo` to `.gitignore` to keep generated state out of Git. Native assess unavailable (`package-local-binary-missing`) so an independent verifier was required.
- 2026-09-25: Independent verifier reran frozen install, typecheck and build successfully. Temporary `PORTLESS_SYNC_HOSTS=0 pnpm dev` served `https://qwerty.localhost/` with trusted TLS (curl without `-k`), HTTP 200, expected placeholder content and `robots: noindex, nofollow`; Tailwind CSS asset returned 200. It stopped the app process group and confirmed Qwerty route removed while shared proxy remained active. Next dev generated `apps/web/AGENTS.md` and `apps/web/CLAUDE.md`; inspected both and confirmed managed source in Next's `generate-agent-files.js`. No lint (explicitly deferred) or product tests (scaffold only).
- 2026-09-25: User explicitly authorized one local work-unit commit restricted to scaffold files and this task document; no push or unrelated existing .mcp/design/docs/skills. Commit review spotted initial English placeholder and `lang=en`; valid app-level RED via HTTPS 200 confirmed assertions for es-AR/Spanish failed. Scoped writer read installed Next guides (pnpm symlink requires `find -L` for discovery), localized `apps/web/app/layout.tsx` and `apps/web/app/page.tsx`; typecheck and build passed. Independent runtime GREEN confirmed HTTPS 200, `lang=es-AR`, Spanish copy/metadata/title, noindex/nofollow; route cleaned up. Next switches generated `next-env.d.ts` imports between `.next/types` on build and `.next/dev/types` on dev; leave framework-managed file intact. Added `.codegraph/` to .gitignore after agent index appeared. Local commit is still pending final staged review; no push.

## Next step
Stage only final scoped changes, check staged diff/secret paths and create the explicitly authorized local Conventional Commit. Record its hash here as evidence. Then design the real landing in a separate unit; choose a vetted lightweight linter before implementation.
