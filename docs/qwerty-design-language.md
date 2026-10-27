# Qwerty design language

Preserve the current landing's subtlety, not its layout everywhere.
The user provisionally likes this direction; this is a reusable reference, not
production, account, provider or native-review approval. Categories is the first
future Owner pilot, not a whole-Owner redesign or a new product specification.

## Principles before recipes

- Keep cream, ink, lime, forest and restrained Manrope as the shared brand.
- Use hierarchy, whitespace and thin dividers before adding boxes or decoration.
- Give surfaces subtle neutral depth where useful; avoid heavy colored shadows.
- Make state meaning explicit in text, not color alone. Preparation, delivery,
  payment verification and courier settlement remain separate facts.
- Keep examples labelled conceptual, including illustrative states and amounts.
  A receipt upload is not confirmed payment; delivery is not settled courier cash.
- Visual polish proves no operational, fiscal or printing integration, customer
  outcome or production readiness. Do not add claims to justify a composition.

## Shared source tokens

Use the existing variables from [global CSS](../apps/web/app/globals.css), not a
parallel palette. These are current values, not a mandate to restyle every surface.

| Role | Existing token/value |
| --- | --- |
| Page / text | `--cream: #faf9f5` / `--ink: #1d1d1b` |
| Secondary text / dividers | `--muted: #697069` / `--line: #e7e7df` |
| Accent / soft accent | `--lime: #b7eb32` / `--soft-lime: #eaf3d2` |
| Dark field / focus | `--forest: #203d2c` / `--olive: #315033` |
| Success | `--success: #3d6b43` |
| Transfer | `--transfer-bg: #fff6dc` / `--transfer-text: #75633c` |
| Settlement | `--settlement-bg: #f6e8b5` / `--settlement-text: #6c5a2c` |

The global family is `"Manrope Variable", "Manrope", sans-serif`. Semantic tokens
are available for distinct states; the paper illustration deliberately uses ink
instead of colored payment pills. Labels must still convey the actual status.

## Order-specific paper, not a dashboard theme

The [landing stylesheet](../apps/web/app/landing/landing.css) scopes its selectors
under `.qwerty-landing`; do not import it into Owner or Auth.
The accepted correction is white printed paper with dark ink, **not a green
receipt/dashboard card**. Forest purpose blocks and lime CTA/progress sit outside it.

Receipt-local recipes: system monospace, dashed/dotted rules, 2px corners and a
7px decorative tear in reserved margin, never across data or the disclaimer.
Its neutral shadow is `0 12px 28px rgb(29 29 27 / 9%), 0 2px 3px rgb(29 29 27 / 6%)`.
These identify an illustrative order; do not turn tables, forms or sidebars into
receipts, or make monospace and torn edges a general management-UI treatment.
The compact mobile hero is a separate summary, not a squeezed operations panel.

## Translate to Owner without rebuilding it

Carry over clear hierarchy, quiet surfaces, deliberate spacing, thin separators,
legible state labels and restrained emphasis. Keep existing Next, Table, RHF,
server paging and guards; no second component framework or new dependencies.
Keep row density static and actions explicit. Do not copy marketing hero sizes,
large narrative gaps, sticky chapters or story layouts into management screens.
Categories is the first bounded pilot; this archive changes no CRUD policy,
permissions, keyboard acceptance, backend behavior or operational requirements.

## Motion is optional feedback

Motion should be purposeful, brief and interruptible, never a prerequisite to read
or act. Default HTML/CSS stays readable and static; opt positive motion into
`prefers-reduced-motion: no-preference`. Reduced motion must win in **computed CSS**,
not merely appear in a reset that more-specific component selectors can override.

Current landing examples are a 360ms stage entrance (10px travel, opacity .65 to 1)
and a 420ms progress transform. These are examples, not universal durations or
required waits. A new stage replaces content immediately and retargets progress;
no queued timers, animation-dependent reveal, or content hidden until JavaScript.
Preserve native links, focus and readable no-JS content. Never animate auth,
locks or durability delays, or manufacture a waiting period for visual effect.

## Evidence and use boundaries

[Story source](../apps/web/app/landing/landing-story.tsx) supplies conceptual labels,
separate financial states, native anchors and progressive enhancement.
[Landing narrative](landing-narrative.md) records the paper correction, motion and
historical functional evidence, including failed runners; it is not fresh proof.
Its earlier Owner-pause note is historical, not the current Categories direction.
[Business brief](qwerty-business-brief.md) remains product intent, not acceptance.
Read-only archival needs source/link checks, not a browser or build. Future UI
changes require their own scoped authorization and fresh applicable verification;
this reference grants no browser session, integration work, publication or approval.
