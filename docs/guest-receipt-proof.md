# Receipt proof source and evidence

## Credential-free build evidence

`guest-receipt-build-evidence.mjs` receives a child and captures exact stdout/stderr, exit code/signal, timing, stream closure and termination reason. Compilation receives no credentials. Successful screened evidence is saved exclusively under a fresh `.pi/receipt-staging/remote-workspace-UUID` (directory0700/files0600); runtime provider/session output stays suppressed.

Known secret values, encodings, split chunks and credential-shaped output fail closed: logs are withheld rather than printed. This detection is not a guarantee against every obfuscation. Combined output is capped at4MiB; build timeout240s with bounded shutdown. Failure, timeout, output/secret screening or persistence failure prevents fixture work. Later cleanup does not replace the first child exit/signal.

Synthetic tests retain exact `public check stdout\n`, `public check stderr\n`, exit7/signalnull and zero fixture calls. They also cover secret withholding, output/deadline failure and persistence refusal. These are not real provider or failed-production-build claims.

## Safe diagnostics and equivalent snapshots

`guest-receipt-diagnostics.mjs` retains only fixed stages, history bounded64, numeric HTTP status, request counts and fixed error kinds. No request URL/headers/cookies, key, provider body, arbitrary message or stack is retained. The first failure remains locked through cleanup and outer catches. Metadata is in memory until the private operator saves it or its final catch/watchdog runs; not per-step durable or process-crashproof.

The basic proof owns an exclusive serial fixture namespace. Its fully checked AFTER snapshot may be the next BEFORE only without intervening trusted writes. Every negative operation still gets a fresh full AFTER comparison over metadata, identities, counters, sizes and original-byte hashes. Trusted positive candidate writes invalidate the reference; failures cannot seed reuse. Owner/public-object controls and all limits remain unchanged. This is not a concurrent caching API.

S15's diagnostic and S16's equivalent optimization were separately authorized single runs. Their local markers remain consumed. Do not remove markers or infer retry permission from these documents, a passing source test or a selector flag.
