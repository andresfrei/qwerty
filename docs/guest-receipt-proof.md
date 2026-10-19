# Receipt proof source and evidence

## Credential-free build evidence

`guest-receipt-build-evidence.mjs` receives a child and captures exact stdout/stderr, exit code/signal, timing, stream closure and termination reason. Compilation receives no credentials. Successful screened evidence is saved exclusively under a fresh `.pi/receipt-staging/remote-workspace-UUID` (directory0700/files0600); runtime provider/session output stays suppressed.

Known secret values, encodings, split chunks and credential-shaped output fail closed: logs are withheld rather than printed. This detection is not a guarantee against every obfuscation. Combined output is capped at4MiB; build timeout240s with bounded shutdown. Failure, timeout, output/secret screening or persistence failure prevents fixture work. Later cleanup does not replace the first child exit/signal.

Synthetic tests retain exact `public check stdout\n`, `public check stderr\n`, exit7/signalnull and zero fixture calls. They also cover secret withholding, output/deadline failure and persistence refusal. These are not real provider or failed-production-build claims.

## Safe diagnostics and equivalent snapshots

`guest-receipt-diagnostics.mjs` retains only fixed stages, history bounded64, numeric HTTP status, request counts and fixed error kinds. No request URL/headers/cookies, key, provider body, arbitrary message or stack is retained. The first failure remains locked through cleanup and outer catches. Metadata is in memory until the private operator saves it or its final catch/watchdog runs; not per-step durable or process-crashproof.

The basic proof owns an exclusive serial fixture namespace. Its fully checked AFTER snapshot may be the next BEFORE only without intervening trusted writes. Every negative operation still gets a fresh full AFTER comparison over metadata, identities, counters, sizes and original-byte hashes. Trusted positive candidate writes invalidate the reference; failures cannot seed reuse. Owner/public-object controls and all limits remain unchanged. This is not a concurrent caching API.

S15's diagnostic and S16's equivalent optimization were separately authorized single runs. Their local markers remain consumed. Do not remove markers or infer retry permission from these documents, a passing source test or a selector flag.

## Remote checkpoint and limitations

S16 job24 on2026-10-19 completed the actual isolated Next build and real PNG/PDF POST→GET, owner-self positive, wrong-business/foreign-owner/direct-access denials and byte/state checks against `https://jxebudqzcmxgdsegrrqw.supabase.co`. Build exit0/32746ms; final acceptedtrue/sourceUnchangedtrue/ownedProcessesClosedtrue, no reported cleanup errors. This is not an independent no-residue audit, UI/order/email acceptance, hosted deployment or clean committed full-app build.

Separate real rollback SQL evidence: receipt29/29 and targeted owner/catalog33/33. Historical source367/independent48 passed before public-module relocation; delivery focused49 and full source suite368/368 (job25exit0) validate the new import/root layout locally without another cloud run. Independent mvficls5-u-r8pl observed49/49 once and returned SOURCE PASS/no P1/P2, including byte/AST/import/SQL comparisons. No new typecheck/lint/build is claimed for the MJS-only delivery changes; native approval remains unknown. Old alias/provider/diagnostic failures and consumed grants remain in `odd/tasks/mvp-guest-checkout.md` and local evidence, never relabeled success.

The public driver/build/runtime-guard sources now live under `supabase/tests/storage/`; tests do not depend on ephemeral `.pi` modules. Private runtime configuration loaders, bootstrap, credentials, responses, logs, results, markers and copied workspaces are not versioned. Previously tested production code and exact Next configuration are retained unchanged, including required existing cookie/origin helpers; unrelated Auth routes/proxy/photo/config changes are not part of this delivery.

## Operator interface — no standing live authorization

Default/`--plan` performs no network/write/scratch creation. It requires exact selectors; wrong origin/path/query/userinfo, local fallback or unknown mode refuses before clients or effects.

```sh
RECEIPT_REMOTE_URL=https://jxebudqzcmxgdsegrrqw.supabase.co \
RECEIPT_REMOTE_PROJECT=jxebudqzcmxgdsegrrqw \
node supabase/tests/storage/guest-receipt-driver.mjs --plan
```

A **fresh owner authorization** is required before `--run`. Operational prerequisites: the existing `.pi/receipt-staging` scratch parent must be owned, nonsymlink and privately provisioned; the driver exclusively creates its UUID workspace but does not create missing parents (safe ENOENT before transport). It manifests the whole actual application, including the existing `apps/web/proxy.ts` and unrelated baseline Auth dependencies. A partial receipt-only committed checkout is not a complete app/proof-build checkout; do not adopt unrelated work or claim clean-checkout acceptance to conceal that boundary.

The process—not CLI arguments, logs, committed files or browser bundles—must receive:

| Variable | Requirement |
| --- | --- |
| `RECEIPT_REMOTE_URL`, `RECEIPT_REMOTE_PROJECT` | Exact selectors above |
| `RECEIPT_S12_REVIEWED` | `yes` only after independent source/SQL review |
| `RECEIPT_OWNER_GUARD_VERIFIED` | `yes` only after actual applied owner protection is verified |
| `RECEIPT_REMOTE_ANON_KEY`, `RECEIPT_REMOTE_SERVICE_KEY` | Matching target keys through an authorized protected channel |
| `RECEIPT_OWNER_A_PASSWORD`, `RECEIPT_OWNER_B_PASSWORD` | Fresh fixture passwords, memory only |

The pure active-configuration adapter reuses the application's official-pair/fallback selection and produces canonical proof fields. An unused legacy alias cannot override a valid official pair; explicit contradictory proof targets still refuse. Runtime-only private-file access requires its own precise consent; no public source loader reads `.env`.

The driver copies actual source/config into a fresh owned workspace, excludes `.env*`, `.git`, `.next` and dependency directories, refuses symlinks, reuses installed dependency links and pins source hashes. Build uses no credentials; runtime uses server-only fallback fields. The backend remains exact HTTPS; frontend binds loopback. Importing the runtime guard alone has no effects; its explicit preload bounds remote fetch for the owned Next process.

Bounds remain build240s, single readiness request8s after2s, each proof60s, cleanup30s independently, requests8s and driver420s. TERM/KILL targets only recorded owned process groups. No automatic network/readiness retry, local Supabase, schema replay, SMTP/Site URL/manual-linking change or publishing.

The owner proof pre-registers exact fresh business+knownactor namespaces before production POST. Lost responses discover only that tuple/prefix; unknown anonymous creation fails with a named gap instead of scanning Auth users. Quiesce the owned frontend before cleanup; globally sign out known sessions, independently discover/remove only recorded resources, then storefront/business/Auth fixtures. Discovery/deletion failures remain visible; no foreign cleanup or retention policy is implied.

## Deterministic checks

Run from repository root; these use invented keys, fake transports/children and guarded source reads—not a live backend:

```sh
node --experimental-strip-types --test apps/web/tests/receipt-remote-proof.test.mjs apps/web/tests/receipt-proof-*.test.mjs apps/web/tests/receipt-staging-proof.test.mjs apps/web/tests/receipt-active-config.test.mjs
```

The guarded driver-root probe blocks directory writes and network before any build/fixture effect, while verifying that the public driver resolves the actual repository source root. Test relocation preserves the original test bodies and behavior groups. Retained working-source comparisons are not Git-HEAD differential proof when those earlier sources were untracked.
