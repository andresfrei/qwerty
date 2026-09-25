# Qwerty local Portless environment

> **Current status — 2026-09-25:** Git and the Next.js scaffold now exist. This document preserves the historical Portless setup from 2026-09-25; unqualified repository, stack, and application notes in the scope, constraints, tasks, and evidence below describe that earlier state, not the current project. The landing feature is still future work.

## Objective
Reserve a stable local HTTPS hostname for the future single web app in the Qwerty monorepo, without choosing or scaffolding an unapproved frontend framework.

## Constraints
- Portless 0.15.5 is already installed globally. `portless doctor` reported HTTPS on port 443, trusted local CA, 3 healthy routes, zero failures/warnings. Do not reinstall, restart the shared proxy, re-trust certificates, expose LAN, or disturb other routes.
- Use `https://qwerty.localhost`, not an unqualified `https://qwerty-localhost` hostname. Reserve `apps/web` as the one eventual app path; no empty app or package yet.
- Current directory has no Git repository; no commit is possible. No frontend framework, package manifest, or Supabase integration is approved for implementation by this task.
- Verification may use an ephemeral loopback-only HTTP server and Portless route, with host synchronization disabled to avoid changing `/etc/hosts`; stop it afterward. Do not claim the final app is available until it exists.

## Tasks

### PL-1 — Pin Portless app hostname
- Status: done
- Change: root `portless.json` maps `apps/web` to `qwerty` as documented in Portless monorepo config.
- Acceptance: valid JSON, no extra apps/settings, future web package can use `portless` for `https://qwerty.localhost`.
- Checks: structural JSON check; exact configured path/name. No commit (no Git).

### PL-2 — Verify local HTTPS route safely
- Status: done
- Route: `gentle-ai-verify` for command-running independent verification.
- Acceptance: installed CLI/doctor remain healthy; a temporary route serves an HTTP response through trusted HTTPS at `qwerty.localhost`, using no host-file or proxy changes; temporary server/route is cleaned up. If unavailable, report exact blocker instead of treating config as a live app.
- Checks: `portless doctor`, transient service and `curl` result; no application build/test runner exists. No commit (no Git).

## Evidence
- 2026-09-25: Portless CLI 0.15.5 and Node 26.5.1 found; `portless doctor` 0 failures/0 warnings. Existing routes: torneo-pro, front.genesis, back.genesis; no qwerty route. Official docs confirm root `portless.json` `apps` map, HTTPS default and `.localhost` hostnames.
- 2026-09-25: PL-1 complete: created `portless.json` with only `apps["apps/web"].name = "qwerty"`; independent JSON parser check passed. PL-2 complete: delegated verifier ran `portless doctor` before/after with zero failures/warnings, served a unique marker from a temporary Node server through trusted HTTPS using `curl --resolve qwerty.localhost:443:127.0.0.1` without `-k` or host-file synchronization, and confirmed the temporary route was removed afterward while three existing routes remained. No app build/tests (there is no app) and no commit (there is no Git repository).

## Current next step
Before implementing the landing, select a lightweight linter and review its dependency scripts. The existing Next.js app and dev script already serve through Portless; keep this setup as the local HTTPS route.
