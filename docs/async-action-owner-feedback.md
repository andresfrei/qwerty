# Owner actions show progress without releasing outcome locks

Owner setup, every catalog mutation, and photo replace/remove use the shared `AsyncActionButton`. Domain callbacks still own requests, duplicate guards, payloads, and recovery. Only the initiating action spins; conflicting controls are disabled without removing entered data.

## Review path

1. Setup uses distinct business/storefront pending labels and preserves the existing unknown-outcome lock.
2. Catalog identifies the initiating form by its title, not just its mutation kind: two product/group/option editors never spin together. All forms remain locked after saved or unknown results until the existing read-only link reloads server state.
3. Photos guard synchronously before fetching. The file input is disabled during requests without clearing its selection. Explicit no-write denials allow correction/retry; successful writes and CAS conflicts retain the existing refresh and file clearing, but block stale-version writes until refreshed props arrive. A full read-only navigation remains available if refresh does not deliver a new version.

## Uncertain photo writes

The existing photo helper collapses provider/transport failures into `unavailable`; it cannot prove that a write did not commit. The client conservatively locks that version, retains selection, stops the spinner, and offers a read-only navigation instead of suggesting an automatic retry. Malformed successful references are treated the same way. No server, parser, CAS header, raw upload bytes, or helper contract changes were made.

## Evidence and limits

- Deferred public-callback tests cover setup, all eleven catalog mutations, photo upload/removal, safe denial retries, same-tick duplicates, saved/unknown locks, and read-only links with no mutation callbacks.
- Scratch differential compares HEAD/current callback payloads, precision-preserving photo CAS versions, retained fields/options/entities, denial/unknown retention, and refresh counts. Intended differences are presentation and photo duplicate/outcome locking.
- Risk 4: photo duplicate-concurrency safety changed. Independent review should verify immediate ref locking, known-denial release, stale-version blocking, and refresh recovery.
- No new browser, global typecheck/lint, foundation/native, full-suite, photo-parser, or build checks were run in this unit. Parent owns integration and browser verification.

Raw stdout/stderr and exit results live under `.pi/async-action-feedback/owner/`. The initial RED harness timed out because it awaited an unguarded duplicate promise; one corrected RED checks request count before awaiting that callback. It then failed on the intended missing labels/spinners/locks and duplicate guard.
