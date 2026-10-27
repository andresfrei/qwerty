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

## Approved Pattern and Owner Translation
- Use the [design-language guide](../../../docs/qwerty-design-language.md) for the provisionally accepted source-grounded pattern: quiet cream/ink/Manrope hierarchy, thin dividers and neutral depth. Order illustrations are white printed paper, not the rejected green dashboard card.
- Paper/ink, receipt-local mono, dashed rules and tear edges belong to order examples, not every table/form/sidebar. Translate hierarchy and spacing to Owner; retain Next/Table/RHF, server paging, guards, static row density and explicit actions. Categories is the first future pilot, not a whole-Owner redesign.
- Motion is purposeful, brief and interruptible: readable static defaults, positive motion only under no-preference, effective computed reduced-motion CSS, preserved focus/no-JS reading. The landing's 360ms entrance/420ms progress are examples, not required waits. Never hide content until JS or animate auth/locks/durability delays.
- Documentation archival/read-only source review is not a UI build: use source-backed structural checks without launching tools or claiming rendered verification. UI changes need separately authorized, applicable visual/functional checks; style acceptance grants no new browser session or account/production proof.

## Decision Gates
| Situation | Action |
| --- | --- |
| Read-only review | For visual review, inspect existing desktop/mobile previews and report unavailable source inspection if OpenPencil is unavailable. For documentation archival, inspect source only; no rendered verification is implied. |
| Visual changes | Open `.pen` via OpenPencil when available; render/export and inspect updated desktop/mobile previews. Otherwise use existing PNGs and report the limitation; do not claim rendered verification. |
| Depicting a capability | Verify it in the brief; label proposed or conceptual behavior, never imply implementation. |
| Payment or delivery state | Show its owner, relation to the order, and pending/confirmed/settled status separately. |
| Responsive change | Check legibility and overflow at 390px and desktop; simplify rather than shrink dense copy. |
| Request conflicts with the source or approved product intent | Surface the conflict; do not silently redesign or invent a resolution. |

## Execution Steps
1. For visual artifact changes, open `.pen` through OpenPencil if available; otherwise inspect PNGs and report the limitation. For source/documentation archival, inspect the relevant source instead. Read the product brief.
2. Set one message, hierarchy, and factual status for each state; compose in the established style.
3. For visual artifact changes, render/export desktop and 390px mobile previews; inspect clipping, contrast, legibility, and state ambiguity. For read-only visual reviews, inspect existing previews only. For documentation-only archival, check source facts, links, frontmatter and scoped diff whitespace instead.
4. Remove unsupported claims; record unresolved choices rather than guessing.

## Output Contract
Return changed artifacts, the factual basis for copy/states, applicable desktop and 390px checks (or documentation-only structural checks), and unresolved decisions or limitations.

## References
- [Qwerty design language](../../../docs/qwerty-design-language.md) — reusable principles, order-only paper treatment, Owner translation and motion boundaries.
- `../../../design/qwerty-hero.pen` — editable visual source; binary, open through OpenPencil.
- `../../../design/qwerty-hero-desktop.png` and `../../../design/qwerty-hero-mobile.png` — accepted hero previews.
- `../../../design/qwerty-problem-flow-desktop.png` and `../../../design/qwerty-problem-flow-mobile.png` — conceptual problem-to-flow previews.
- `../../../docs/qwerty-business-brief.md` — intended behavior and current implementation status.
- `../../../docs/qwerty-validation-plan.md` — pilot hypotheses; not an approved replacement product.
