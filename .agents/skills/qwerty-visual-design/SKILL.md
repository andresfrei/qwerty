---
name: qwerty-visual-design
description: "Trigger: Qwerty visual design, landing page, mockup, hero, product copy, responsive layout, design review. Extend the current Qwerty visual language without presenting concepts as a live product."
license: Apache-2.0
metadata:
  author: gentleman-programming
  version: "1.0"
---

## Activation Contract
Use for Qwerty visuals, landing composition, copy, or design review. Ground work in source/previews; unapproved feedback is not a design decision.

## Hard Rules
- Match the source's cream/ink/lime palette, restrained Manrope, hierarchy, whitespace, and operational states. `.pen` is binary: open through OpenPencil; otherwise use PNGs and report the limitation. Never read it as text.
- Mockups are conceptual. A future launch landing may describe intended capabilities, but visuals/mock data prove no working product, integration, customer, metric, or outcome. Label illustrative states/amounts; invent no claims.
- Keep order progress, payment verification, and courier delivery/settlement distinct. A delivered order does not prove payment confirmed or courier cash rendered; a receipt is not confirmation.
- Do not add features, testimonials, logos, integrations, or copy decisions based on unapproved feedback.

## Decision Gates
| Situation | Action |
| --- | --- |
| Read-only review | Inspect existing desktop/mobile previews; report unavailable source inspection if OpenPencil is unavailable. |
| Visual changes | Open `.pen` via OpenPencil when available; render/export and inspect updated desktop/mobile previews. Otherwise use existing PNGs and report the limitation; do not claim rendered verification. |
| Depicting a capability | Verify it in the brief; label proposed or conceptual behavior, never imply implementation. |
| Payment or delivery state | Show its owner, relation to the order, and pending/confirmed/settled status separately. |
| Responsive change | Check legibility and overflow at 390px and desktop; simplify rather than shrink dense copy. |
| Request conflicts with the source or approved product intent | Surface the conflict; do not silently redesign or invent a resolution. |

## Execution Steps
1. For changes, open `.pen` through OpenPencil if available; otherwise inspect PNGs and report the limitation. Read the product brief.
2. Set one message, hierarchy, and factual status for each state; compose in the established style.
3. For changes, render/export desktop and 390px mobile previews; inspect clipping, contrast, legibility, and state ambiguity. For read-only reviews, inspect existing previews only.
4. Remove unsupported claims; record unresolved choices rather than guessing.

## Output Contract
Return changed design artifacts, the factual basis for copy/states, desktop and 390px checks, and unresolved decisions or limitations.

## References
- `../../../design/qwerty-hero.pen` — editable visual source; binary, open through OpenPencil.
- `../../../design/qwerty-hero-desktop.png` and `../../../design/qwerty-hero-mobile.png` — accepted hero previews.
- `../../../design/qwerty-problem-flow-desktop.png` and `../../../design/qwerty-problem-flow-mobile.png` — conceptual problem-to-flow previews.
- `../../../docs/qwerty-business-brief.md` — intended behavior and current implementation status.
- `../../../docs/qwerty-validation-plan.md` — pilot hypotheses; not an approved replacement product.
