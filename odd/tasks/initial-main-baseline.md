# Initial main baseline

## Objective
Publish the first `main` for the empty Qwerty GitHub repository. Preserve the verified web foundation and include the previously created product briefs, visual sources/previews, and two project skills as the initial project baseline. Keep the Supabase MCP configuration local.

## Boundaries
- User explicitly selected all existing Qwerty project work except `.mcp.json` for the first `main`; landing implementation and its PR are later work.
- Remote `origin` has no branch or default branch. No meaningful PR is possible for this root bootstrap. Publish `main` only after reviewing the complete candidate and checking the remote is still empty. Never force-push or merge an unrelated branch.
- Current branch `feat/web-foundation` has scaffold root commit `5a9272b7afd2869d530556e5cd396bcc79ef4918`; tracked `odd/tasks/web-foundation.md` contains uncommitted post-commit evidence. Other intended historical assets are untracked.
- Keep `.mcp.json` ignored locally; never stage it. Do not add secrets, generated runtime indexes or placeholder claim of a live product.
- Update present-tense project-facing descriptions that became stale after the scaffold: a basic web app exists, but no functional product, database schema or landing exists. Preserve historical dated observations.
- No runnable product behavior change in this unit; structural and content checks replace TDD. The already committed scaffold passed frozen install, typecheck, build and trusted HTTPS smoke. Do not claim PR checks/merge.

## Tasks

### MB-1 — Curate initial tracked project context
- Status: in progress
- Route: bounded writer for the affected docs/skills and `.gitignore`; parent stages only explicit allowlist.
- Acceptance: product/design/task documents and both Qwerty skills are included; `.mcp.json` remains ignored/untracked; present-tense statements accurately distinguish working placeholder from unbuilt product.
- Checks: inspect staged path list, secrets patterns, binary sizes and `git diff --cached --check`; independently verify documentation/skill consistency. Commit this cohesive baseline work unit on `feat/web-foundation` with a Conventional Commit.
- Commit: pending.

### MB-2 — Establish and verify remote main
- Status: pending
- Route: parent handles audited Git branch/push; independent read-only check afterward.
- Acceptance: remote still empty immediately before publication; `main` points to the reviewed baseline, remote `origin/main` matches and is GitHub's default branch; local `main` tracks origin/main; no PR/merge was fabricated; local working tree clean of tracked changes; existing unrelated untracked files are handled without accidental staging.
- Checks: read-only remote check, branch/ref status, GitHub default branch; report any unmet branch protection/default configuration instead of force-updating. Commit/push only the explicit base; no landing feature PR.
- Commit: link the MB-1 commit; additional status/evidence documentation commit only if necessary to avoid dirty tracked files.

## Evidence
- 2026-09-25: `git ls-remote origin` shows no refs and GitHub reports empty default branch. Scout mapped intended untracked assets; no apparent secrets in them; design binaries total under 1 MB. Found stale architecture skill and dated business brief describing pre-scaffold state; adjusted current status while preserving historical evidence.
- 2026-09-25: Bounded writers corrected the architecture skill/brief and framed three historical task documents; independent verifier caught obsolete linter-audit wording, then parent corrected it. Exact `/.mcp.json` ignore rule added. Staged 15 explicit intended paths: docs, design, skills, ODD tasks, ignore rule; diff check clean and origin still empty. Text secret scan clean except localhost URLs. `.pen` is a ZIP containing canvas, thumbnail, metadata; parent checked embedded canvas/meta for private-key/credential/URL markers (zero matches). Independent verifier found the mobile problem-flow PNG is 291px wide (export downsample); documented re-export/390px review for future landing, not a live product asset. Parent ran `pnpm typecheck` and `pnpm build` successfully; Next regenerated `next-env.d.ts` between dev/build variants and the worktree was returned to its staged version. Frozen install already passed on the unchanged scaffold; no product tests apply to docs/assets. No PR or merge exists for empty remote.

## Next step
Complete MB-1 commit with exact staged allowlist. Then create local `main` from its tip and publish only after a fresh empty-remote check. Landing remains a separate feature/PR.
