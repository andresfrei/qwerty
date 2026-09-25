# Landing visual exploration

> **Current status — 2026-09-25:** Git and the Next.js scaffold now exist. This document preserves the historical state from 2026-09-25; unqualified repository, stack, and application notes in the scope, constraints, tasks, and evidence below describe that earlier state, not the current project. The landing feature remains future work. The mobile problem-flow PNG is a 291px-wide downsample of the conceptual 390px frame; re-export/verify native 390px output before implementing its responsive section.

## Objective
Refine the existing Qwerty hero in OpenPencil according to the saved feedback, then design the next visual chapter that moves from scattered operational problems to one connected order flow, in desktop and mobile layouts.

## Problem and why
The first hero is visually accepted but its subtitle, commission hierarchy, payment/courier states, and scroll cue need a final copy pass. The next section must explain the operational problem and transition to the product flow without adding generic SaaS decoration or implying an unbuilt feature is live.

## Scope and constraints
- Single editable source: `design/qwerty-hero.pen`; export visual previews under `design/`.
- Preserve the accepted wordmark, H1, cream/ink/lime palette, two order examples, and restrained Manrope typography.
- Produce desktop and mobile views; mobile text must remain legible at 390px.
- The design is conceptual; mock data must be labeled illustrative. The landing is for a future functional product, not a currently working CTA.
- No testimonials, logos, fabricated usage metrics, invented integrations, or new product features.
- No application code, schema, or backend changes. The directory currently has no Git repository; work-unit commit is unavailable and must not be claimed.
- TDD mode: not applicable to editable visual design; verification is rendered visual inspection plus structural/font checks.
- Delivery strategy: ask-on-risk; authored code lines forecast 0, design and PNG artifacts excluded.

## Tasks

### LV-1 — Refine the accepted hero
- Status: done
- Route: parent inline OpenPencil edit of one design source and derived PNGs; no 2+ source-file writer trigger.
- Change eyebrow, subtitle, commission emphasis, scroll arrow, bottom feature list, payment card, and courier pending-settlement state as saved in Engram `landing-hero-mockup`.
- Acceptance: desktop and mobile exports show no clipped text; payment belongs visibly to order #149; courier has delivered 3/3 but still owes $55,500; H1 and two order examples remain.
- Checks/evidence: export both frames, visually inspect actual PNGs; confirm Manrope is available; inspect layout/bounds and note tool diagnostic false positives if render contradicts them.
- Commit: unavailable because `/home/andresfrei/dev/qwerty` is not a Git repository.

### LV-2 — Design problem-to-flow transition
- Status: done
- Route: delegated read-only design mapping (`gentle-ai-explore`), then parent inline OpenPencil edit of the same design source and derived previews.
- Create desktop and mobile frames for a problem section and an immediately adjacent visual transition to the unified order flow.
- Acceptance: a merchant can see the concrete scattered-work problem, one clear order as the thread, and the payment as a parallel state rather than a fixed step after cooking; no overflowing or illegible labels at mobile width.
- Checks/evidence: export frames, inspect previews at native mobile width and desktop, verify typography and no unintended clipping/overlap.
- Commit: unavailable because the directory is not a Git repository.

## Progress
- 2026-09-25: Recovered the saved feedback and current editable OpenPencil design; task document created before new design edits.
- 2026-09-25: LV-1 complete. Desktop and mobile renders inspected: H1/two orders intact, payment explicitly tied to #149, 3/3 courier deliveries awaiting $55,500 settlement, commission above CTA, and no clipping. Exported `design/qwerty-hero-desktop.png` and `design/qwerty-hero-mobile.png`; saved editable `design/qwerty-hero.pen`. Font availability previously verified; no code tests apply. Commit unavailable (no Git repository).
- 2026-09-25: LV-2 complete. A read-only design scout proposed restrained desktop/mobile hierarchy. Created desktop and mobile problem-to-flow frames in the editable `.pen` file, exported `design/qwerty-problem-flow-desktop.png` and `design/qwerty-problem-flow-mobile.png`, and visually inspected both. Payment is shown as a parallel state of order #149; mobile labels remain legible. Manrope status is faithful and the critical-overlap check reported zero. Exporting directly from the newly created page failed with `Raster export selection must stay on a single page` because the tool retained the old active page/selection; inspected page ancestry, then rendered the frames on the existing hero page and exported them successfully. An extra draft desktop frame remains on the new exploration page; it is not the exported source. No code tests apply; commit unavailable (no Git repository).

## Current next step
Before implementing the landing, select a lightweight linter and review its dependency scripts. Use these conceptual frames to guide the design; do not claim that unbuilt product capabilities are live.
