# Shared asynchronous action button

Use one pending-action presentation across Qwerty. The caller owns synchronous duplicate guards, retained data, errors and safe recovery; this component never decides an operation's outcome.

## Usage

```tsx
import { AsyncActionButton } from "@/app/components/async-action-button";

<AsyncActionButton
  type="submit"
  pending={busy}
  locked={unknown || savedAwaitingReadRefresh}
  pendingLabel="Guardando…"
  className={existingButtonClasses}
>
  Guardar
</AsyncActionButton>
```

Keep the existing synchronous ref/attempt guard in the domain submit callback. Set it before the first asynchronous boundary. A rendered disabled button alone does not protect callbacks invoked twice before React renders.

## Public API

`apps/web/app/components/async-action-button.tsx` exports:

| Export / prop | Contract |
| --- | --- |
| `AsyncActionButton` | Pure, hook-free client presentation component; returns a button plus persistent visually hidden live status. |
| `AsyncActionButtonProps` | Native button attributes, replacing `children` with a string; adds the props below. |
| `children: string` | Required idle operation label, in Spanish. |
| `pendingLabel: string` | Required operation-specific pending label, e.g. `Adjuntando…`. |
| `pending: boolean` | Required externally owned pending state; displays indicator/text and sets `aria-busy`. |
| `locked?: boolean` | Additional domain lock, independent of pending; defaults false. |
| `disabled?: boolean` | Existing business prerequisite; ORed with pending and locked. |
| `type` | Native button type; defaults to `button`. Explicitly use `submit` inside a form. |
| `className` | Existing palette, padding, typography and dimensions; appended to `async-action`. |
| Native attributes / callbacks | Forwarded, including `name`, `value`, `form`, and `onClick`. Callback identity is preserved for existing callback harnesses. |

The button never awaits callbacks or changes locks. It does not clear fields/results. Retain existing unknown-outcome, saved-awaiting-read-refresh, generation, recovery-reference, and shared-catalog locks. Do not add loaders to synchronous cart edits. Domain owners render accessible success/error results and decide when a confirmed failure permits another attempt. There is no `finally` auto-unlock policy here.

## Shared presentation classes

These narrowly additive classes live in `apps/web/app/globals.css`:

| Class | Purpose |
| --- | --- |
| `async-action` | Scoped native-disabled cursor and keyboard focus-visible outline using existing olive. |
| `async-action-content` | Inline grid with a permanent indicator column and overlapping label column. |
| `async-action-reserve` | Invisible, aria-hidden idle/pending labels reserve the maximum width/height in both states. |
| `async-action-label` | The only exposed button text. |
| `async-action-spinner` | Decorative current-color border ring; aria-hidden; static under reduced motion. |
| `async-action-status` | Visually hidden polite, atomic status outside the busy button. |

`async-action-turn` is the only new keyframe. No palette/font changes or unrelated global disabled styles are introduced. Idle indicator space is intentionally reserved; feedback does not resize the button during pending. Buttons are not replaced or programmatically refocused. Native disabling may remove browser focus; cleanup/pageshow restores availability without stealing focus.


## Verification

Four actual-component presentation tests passed within the authorized nine-test foundation bundle. Stable dimensions, accessible names, disabled/locked state, keyboard focus and reduced motion also passed the independent source-CSS-only fixture at 390/1440. This does not certify compiled production styling or hydrated private screens; the user accepted separate manual visual QA.
