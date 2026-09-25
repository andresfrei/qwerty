# Qwerty project skills

> **Current status — 2026-09-25:** Git and the Next.js scaffold now exist. This document preserves the historical skill-authoring state from 2026-09-25; unqualified repository, stack, and application notes in the scope, constraints, tasks, and evidence below describe that earlier state, not the current project. The project skills created here remain available for current architecture and visual-design work.

## Objective
Create two small project-scoped Agent Skills so future architecture and visual-design work follows Qwerty's actual decisions and mockups rather than generic SaaS defaults.

## Scope and constraints
- Place portable skills in `.agents/skills/` for project-only discovery; no third-party installer or global skill edits.
- Base rules on `docs/qwerty-business-brief.md`, `docs/qwerty-validation-plan.md`, `design/qwerty-hero.pen` and rendered previews. Keep full vision distinct from pilot hypotheses and unimplemented features.
- Follow the Agent Skills specification, Pi skill discovery, and the local skill-creator style guide: concise trigger-rich frontmatter, actionable gates, no duplicated generic React/Supabase guidance.
- Architecture skill concerns choices, boundaries and unresolved requirements; visual skill concerns copy, hierarchy, illustration and responsive proof. Neither selects an unapproved frontend stack or invents product behavior.
- No Git repository exists here. Work-unit commits cannot be made until Git is explicitly initialized; do not claim one.
- No application code or Supabase schema changes. TDD is not applicable to static skill instructions; verify structure, discoverability, references and realistic trigger/non-trigger scenarios.

## Tasks

### QS-1 — Author architecture and visual skills
- Status: done
- Route: one bounded `gentle-ai-worker` for the two nontrivial skill files, with narrow allowed edit surfaces.
- Acceptance: each `SKILL.md` is project-specific and short; architecture distinguishes committed decisions from pilot hypotheses and prevents premature multi-app/package structure; visual skill uses existing design direction and preserves separate order/payment/courier states, conceptual claims and readable 390px previews.
- Checks: readback against source docs and skill style rules; no invented stack or product status.
- Commit: unavailable (directory is not a Git repository).

### QS-2 — Verify and index the project skills
- Status: done
- Route: independent read-only verification; parent updates skill registry and task evidence.
- Acceptance: valid names/frontmatter/paths; right positive and negative trigger cases; both skills discoverable from project root, registry updated; no installer run.
- Checks: structural validation and skill discovery, read-only checks of scoped content; note any tool limitations.
- Commit: unavailable (directory is not a Git repository).

## Evidence
- 2026-09-25: Reviewed autoskills.sh and agentskills.io best practices/specification/evaluation/description guidance; Pi skill-loading docs and local style guide. Read-only scout mapped the existing project docs and previews. AutoSkills relies on a stack manifest such as `package.json`; Qwerty has none yet, so automatic installation is premature.
- 2026-09-25: QS-1 complete. Created `.agents/skills/qwerty-architecture-decisions/SKILL.md` and `.agents/skills/qwerty-visual-design/SKILL.md`. Writer checked frontmatter/section order and skill-relative reference resolution; parent read back both. A follow-up corrected reference paths and binary `.pen` handling. Native review assessment was unavailable (`package-local-binary-missing`), so an independent verifier was required under QS-2. No commit: no Git repository.
- 2026-09-25: QS-2 complete. Independent read-only verifier executed Python structural/reference checks: matching names, single-line descriptions (209/197 chars), six sections in order, 2 and 7 valid skill-relative references, and both exact project-scoped registry rows; all passed. Reviewed 2 positive and 2 near-miss negative routing examples per skill as reasoning tests, not live trigger runs. The active session and auto-generated `.atl/skill-registry.md` list both skills; saved project index to Engram. Fresh Pi reload/CLI discovery and live trigger behavior were not tested. No build/test runner applies to static instructions; no Git commit possible.

## Current next step
Use both project skills on the next Qwerty architecture/design task. Before implementing the landing, select a lightweight linter and review its dependency scripts; this historical task is not a live product change.
