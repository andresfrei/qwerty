# Receipt proof source and evidence

## Credential-free build evidence

`guest-receipt-build-evidence.mjs` receives a child and captures exact stdout/stderr, exit code/signal, timing, stream closure and termination reason. Compilation receives no credentials. Successful screened evidence is saved exclusively under a fresh `.pi/receipt-staging/remote-workspace-UUID` (directory0700/files0600); runtime provider/session output stays suppressed.

Known secret values, encodings, split chunks and credential-shaped output fail closed: logs are withheld rather than printed. This detection is not a guarantee against every obfuscation. Combined output is capped at4MiB; build timeout240s with bounded shutdown. Failure, timeout, output/secret screening or persistence failure prevents fixture work. Later cleanup does not replace the first child exit/signal.

Synthetic tests retain exact `public check stdout\n`, `public check stderr\n`, exit7/signalnull and zero fixture calls. They also cover secret withholding, output/deadline failure and persistence refusal. These are not real provider or failed-production-build claims.
