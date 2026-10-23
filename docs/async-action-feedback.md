# Consistent asynchronous action feedback

Qwerty uses an operation-specific indicator and pending label, scoped disabling and immediate duplicate protection for asynchronous actions. Outcome and recovery remain domain-owned; no global promise manager unlocks controls automatically.

## Interaction contract

- Show labels such as Ingresando…, Guardando…, Adjuntando… and Consultando… with a decorative indicator.
- Reserve the idle/pending dimensions; preserve keyboard feedback and use a static indicator under reduced motion.
- Disable the initiating and conflicting controls, not the whole screen. Keep submitted data and selected files.
- Separate pending from settled locked states. Unknown writes and saved catalog edits remain locked until their safe read-only recovery.
- Preserve original purchase references and snapshot-bound cart cleanup. Receipt attachment is not payment confirmation.
- Do not add loaders to synchronous cart edits or ordinary read-only links.

## Implementation map

| Surface | Guide |
| --- | --- |
| Pure shared button, props and CSS | [AsyncActionButton](async-action-button.md) |
| Native login/signup/recovery/logout | [Native forms](async-action-native-forms.md) |
| Business/store setup, catalog and photos | [Owner actions](async-action-owner-feedback.md) |
| Guest preparation, receipt, confirmation, recovery and GET readers | [Checkout and queries](async-action-checkout-feedback.md) |

## Verified delivery scope

The user selected **Cerrar con revisión visual manual pendiente**. Functional/source evidence is accepted for this delivery; compiled styles, fonts and actual private-screen visuals remain manual QA, not a passed automated check.

- Foundation: one final authorized9/9 bundle and TypeScript0; its marker is consumed.
- Owner:23new+18existing tests and30base/current differential scenarios.
- Buyer:7new+21existing tests and28differential scenarios.
- Independent review: S1/S3passed, no demonstratedP1/P2,30integrationtests/typecheck/lint0 (one existing image warning). The parent spotcheck also passed30/30.
- Shared presentation:192actual-SSR/source-CSS assertions at390/1440 passed. Parent inspected both screenshots: browser-default button styling, not complete production-theme mockups.

A canonical anonymous GET timed out once; no retry. Compiled CSS/fonts, hydrated private screens, real browser TLS/redirects and actual BFCache remain unverified. Full-suite, photo-parser and build runs remain explicitly deferred. The reviewer did not locate standalone Auth33raw outputs, so that separate narrative count is not independently certified. A whitespace wrapper returned1 on new-file differences without diagnostics; it is not recorded as a clean exit.

Historical native timeouts, fictional-host redirect failure and pre-correction entry-point gaps remain retained in .pi/async-action-feedback/foundation/. One human-authorized correction resolved the final native/motion/restoration checks. Evidence and independent command captures live under .pi/async-action-feedback/{foundation,owner,buyer,review}/.

Risk: item2(native serialization) and item4(photo duplicate/unknown safety). Bounded independent source review passed those boundaries. RDD is off; native assessment is unassessable due pre-existing untracked files, with no native approval. Protected Auth prerequisites remain outside this delivery; no clean-checkout acceptance is claimed.
