---
name: qwerty-architecture-decisions
description: "Trigger: architecture decision, technical tradeoff, system design, data model, tenant isolation, app structure, pilot scope. Keep Qwerty decisions aligned with agreed product intent and explicit uncertainty."
license: Apache-2.0
metadata:
  author: gentleman-programming
  version: "1.0"
---

## Activation Contract
Use for Qwerty architecture, product-boundary, or implementation-structure decisions. Do not use as generic framework or Supabase guidance; consult relevant specialist skills for those.

## Hard Rules
- Treat the business brief's intended MVP decisions as current product intent; do not imply they are implemented. The repository contains a Next.js web scaffold, but no product application or schema exists yet.
- Separate agreed decisions from proposals, hypotheses, and unresolved choices. The validation-plan pilot is an experiment, not an approved replacement for the full vision.
- Keep business data isolated: a user must access only businesses they belong to and data relevant to that business. Knowing an identifier grants no authority.
- Next.js App Router, TypeScript, Tailwind and pnpm workspaces are approved for the single web scaffold. Do not add another stack, invent requirements, or claim an unbuilt feature exists.

## Decision Gates
| Situation | Action |
| --- | --- |
| Decision is already agreed | Preserve it; explain only necessary consequences. |
| Pilot proposal conflicts with full vision | Label it as a test; seek explicit approval before changing product scope. |
| Requirement, role permission, or ownership boundary is unresolved | State alternatives and impact; defer irreversible design until decided. |
| Considering structure | Start with the smallest structure that supports the agreed MVP; split apps/packages only for a demonstrated need. |
| Tenant boundary is involved | Trace business membership and authorization across every access path before proposing a design. |

## Execution Steps
1. Read the relevant business-brief and validation-plan sections; identify decision status and affected actors/data.
2. State constraints, unknowns, and at most the viable tradeoffs; do not turn a hypothesis into a commitment.
3. Propose the smallest reversible design preserving tenant isolation and agreed workflows.
4. Mark decisions requiring product-owner approval and avoid implementation claims without repository evidence.

## Output Contract
Return the decision and rationale, constraints honored, assumptions/open choices, tenant-isolation implications, and what remains unimplemented.

## References
- `../../../docs/qwerty-business-brief.md` — intended product decisions and explicit open questions.
- `../../../docs/qwerty-validation-plan.md` — proposed pilot, hypotheses, and deferred pilot scope.
