# Prepare the explicit store-ID permission

T2a is applied and verified on the authorized project `https://jxebudqzcmxgdsegrrqw.supabase.co`. `20261024140222_owner_store_creation_id.sql` contains exactly `GRANT INSERT (id) ON TABLE public.businesses TO authenticated;`. After independent source review and a limited validator correction, the parent applied that one statement and verified the actual metadata delta: only authenticated/id/INSERT changed false to true. Every other captured permission, policy, guard, default and RLS flag stayed unchanged.

The CLI originally generated version20261024134541. Only this new uncommitted companion was reversibly renamed to native receipt version20261024140222; SQL bytes/SHA256 are unchanged. No old migration files or remote history were repaired/replayed.

## Review path

1. Review the single-statement migration and structural test in `apps/web/tests/owner-store-id-grant.test.mjs`.
2. Review the strict metadata helper and synthetic fixtures under `.pi/owner-store-dashboard/grant/`.
3. Parent alone performs the authorized native apply after independent review, then obtains actual post-apply metadata with the same frozen read-only query and checks the exact delta. Stop on unexpected state; do not widen permission scope.

## Scope and limits

| Topic | Contract |
| --- | --- |
| Authorization | S4 and L12/L13 in `odd/tasks/owner-store-dashboard.md`; only authenticated INSERT on businesses.id |
| Existing creation | INSERT owner_id/name and default generated UUID remain unchanged |
| Existing update | UPDATE name only remains unchanged |
| Data and identity | No application records, accounts, Auth configuration or test accounts touched |
| RLS and guard | No policy, function, RLS flag or other permission changes |
| Risk | Risk2 permissions; column privilege permits supplying an explicit UUID, not bypassing ownership checks |
| Evidence limit | Structural SQL scope and queried metadata only; not PostgreSQL execution, application functional proof, runtime RLS proof or account isolation testing |
| Constraint metadata | A separate read-only query confirmed live businesses PK(id)/owner FK and storefront PK(business_id)/FK/unique slug/check; this is metadata, not application-row testing |

No rollback was executed. A future scoped rollback would be `REVOKE INSERT (id) ON TABLE public.businesses FROM authenticated;`, only after separate human approval and impact review. This is documentation, not additional execution authorization.

## Metadata helper API

`validate-metadata.mjs` is dependency-free Node ESM. It never executes SQL or commands from input. Exported helpers:

- `extractMetadata(packet)` accepts exactly one provider text-content item containing JSON `{result: string}`. It requires one line-exact UUID opening tag and one matching closing tag, then exactly one JSON row with only `metadata`. Boundary mentions in prose are not treated as framing. Unknown envelopes and malformed framing fail closed.
- `extractMetadata(object, { normalized: true })` explicitly accepts normalized metadata; default mode does not auto-detect it.
- `validateBefore(metadata)` asserts exact columns/defaults/nullability, privileges, policies and RLS flags. Guard body is compared with versioned SQL and semantic header/settings checks, not a brittle full `pg_get_functiondef` header string. Policy comparison normalizes whitespace, deparser aliases and parentheses, but rejects broad OR predicates. All unexpected keys fail.
- `validateAfter(before, after)` validates baseline and compares canonical JSON against a cloned baseline with only authenticated/id/insert changed false to true. Object-key ordering is normalized; arrays and every other value must match. Baseline is not mutated.
- `canonical(value)` sorts object keys recursively without changing array order.

CLI (run from repository root):

```sh
node .pi/owner-store-dashboard/grant/validate-metadata.mjs before .pi/owner-store-dashboard/grant/preflight-tool-result.json .pi/owner-store-dashboard/grant/before-metadata.json
node .pi/owner-store-dashboard/grant/validate-metadata.mjs after .pi/owner-store-dashboard/grant/before-metadata.json <parent-saved-actual-after-raw-json>
```

The before command exclusively creates the normalized output (will not overwrite an existing baseline). The after command writes nothing. Success emits a safe PASS summary; failure emits only a safe rejection summary and exits nonzero. The actual post-apply packet is now retained as `after-tool-result.json`; its validator command passed exit0. Synthetic fixtures remain separate from that actual metadata evidence.

## Observed local verification

- CLI 2.118.0 created the migration before SQL authoring; no other CLI action was run.
- Structural test: RED 0/1 on the actual empty CLI-created file; GREEN 1/1 after the approved statement.
- Synthetic metadata fixtures: 4/4 pass, covering baseline, allowed bit, baseline immutability, privilege/RLS/policy/function/default drift and malformed framing.
- Initial actual-before validation rejected a checker bug: expected backslashes around empty search_path quotes. One focused fix uses the decoded PostgreSQL setting `search_path=""`; fixtures and actual before validation then passed. Logs retain the initial failure and diagnostic; no unchanged timeout retry occurred.
- Final actual-before PASS covers four columns, three authenticated owner+verified-email policies, guard semantics, RLS enabled/not forced, anon denial and exact authenticated column/table privilege bits. It does not establish a post-apply result.
- Command exits/stdout/stderr and preservation/whitespace evidence are retained as `preparation-*`. Frozen `preflight-*` files are unchanged.

## Parent completion gate

- [x] Independently reviewed exact SQL/frozen metadata; one array-envelope P2 was reproduced RED, fixed, and independently rechecked1/1 (full helper5/5).
- [x] Parent applied only the authorized statement, native migration20261024140222, provider success:true.
- [x] Actual after metadata passed the exact one-bit delta validator; no other captured value changed.
- [x] Application/hosted owner-creation and runtime RLS acceptance remain separate; T2/T3/T4 are not delivered by this permission step.

Parent structural test passed1/1 after companion version alignment. Raw pre/post/provider/version evidence is under `.pi/owner-store-dashboard/grant/`. Native review remained unassessable/RDDoff; independent bounded review is not native approval.
