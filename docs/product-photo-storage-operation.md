# Trusted product photo storage operation

The operation was applied once to the **one existing Supabase database used through the MVP**, project `jxebudqzcmxgdsegrrqw`, as native history `20261015033155` / `trusted_product_photo_storage`. It provisions the bucket and RPCs; the HTTP endpoint and live upload/positive ownership-CAS workflow are not yet verified.

## Operation source

`supabase/operations/trusted_product_photo_storage.sql` is an operation source, not an invented migration filename. Native history `20261015033155` maps to the exact source from commit `5d509be3cf5c24a49979391b956ae3a5f532ad87`, SHA-256 `acfbeb9f10f7dae914ef68df3745a0e0fe70c2989f56ee5b9524d787b4e9ecce`. Do not replay this already-applied operation. The operation intentionally does not replay the existing `catalog_items` photo-column `ALTER`, alter the original photo migration, create or replace a function, drop an object, or change provider schema/history bookkeeping.

The source uses one PostgreSQL `DO` statement for the function DDL, function privilege changes, and new bucket insert. This prevents a committed intermediate public-execute state between those operation steps. It does **not** claim that provider schema/history bookkeeping and this SQL statement share one transaction.

## Frozen RPC contract

Both public functions are `SECURITY INVOKER` functions with `search_path = ''`:

```sql
get_owned_product_photo(
  p_actor_id uuid,
  p_item_id uuid
) RETURNS TABLE (business_id uuid, photo_version text)

commit_product_photo(
  p_actor_id uuid,
  p_item_id uuid,
  p_business_id uuid,
  p_expected_version text,
  p_next_version text,
  p_photo_path text
) RETURNS boolean
```

`get_owned_product_photo` uses an explicit join from `catalog_items` to `businesses` and returns a row only for the supplied actor's owned item. `commit_product_photo`:

- rejects null IDs and non-canonical or overlong version text in a cast-free guard;
- applies numeric upper-bound checks only after the canonical at-most-19-digit proof, casts the bounded values, rejects maximum expected version separately before successor arithmetic, and rejects a non-successor without writing;
- accepts only `NULL` or the exact supplied business/item UUID path ending in a lowercase UUID `.webp` filename;
- locks the matching business owner row with `FOR SHARE` before the catalog update;
- atomically filters the catalog item by item ID, locked business ID, and expected version, then writes the validated next version exactly once.

The server adapter must derive `p_actor_id` from a verified session. The service-role caller is trusted infrastructure and must verify that identity upstream; the RPC does not assume `auth.uid()` while running as `service_role`. A caller-supplied business ID cannot bypass the ownership lock.

The operation revokes function `EXECUTE` from `PUBLIC`, `anon`, and `authenticated`, then grants it only to `service_role`. It does not use `SECURITY DEFINER`.

## Bucket intent

The operation inserts a new public `product-photos` bucket with:

- a 409600-byte file-size limit;
- `image/webp` as the only allowed MIME type;
- no `storage.objects` mutation policies.

The bucket insert is intentionally a plain insert: an existing bucket causes the operation to fail rather than being overwritten. Provider-managed lifecycle fields are left `NULL`; the source does not mutate `storage.objects` rows. Public delivery and trusted server-side upload behavior still require the adapter and provider runtime to be verified separately.

There is no database collision guard or unique object-path constraint here. The adapter must generate a fresh UUID filename and upload normalized bytes with `upsert: false`. Storage upload and catalog attachment are separate operations; an attachment failure may leave an unreferenced normalized object. Replaced and detached objects are retained, so detach is not URL revocation or cleanup.

## Existing schema boundaries read for preparation

The existing schema sources establish the following relevant boundaries:

- `public.businesses` has RLS enabled. Authenticated clients can select its existing owner-visible columns, insert an owner/name pair, and update only `name`.
- `public.catalog_items` has RLS enabled. `anon` and `authenticated` have read access; authenticated clients can insert and update ordinary catalog fields but do not receive `photo_path` or `photo_version` insert/update privileges and cannot delete rows.
- The existing photo-column source makes `photo_version` a non-null `bigint` defaulting to zero with a nonnegative check. `photo_path` is nullable, constrained to the item/business path shape, and requires a positive version when present. The trusted operation narrows newly attached paths to lowercase UUID `.webp` paths without replaying that column change.
- Existing client-facing ownership checks remain unchanged. No direct client storage mutation policy is added by this unit.

## Verification boundary

The initial writer/independent review was source-only: no functional SQL RED/GREEN was claimed. The parent subsequently applied the exact one-DO source once through native MCP (`success: true`) after fresh target, collision, grant, lifecycle-default and reachable-trigger inspection. Post-apply observations:

- Exactly one native history entry `20261015033155`; public `product-photos`, 409600 bytes, only `image/webp`.
- Both RPCs are invoker functions owned by `postgres` with empty search paths. Effective `EXECUTE` is false for `anon`/`authenticated`, true for `service_role`; clients cannot inherit `service_role`.
- Deployed `prosrc` MD5 values match the dollar-quoted bodies extracted from committed source: read `0587ae71455092afb3a018057d8f884c`, commit `6fbd8c6637d775efb7daf6db0a29e993`.
- Photo-column definitions remain intact. Storage objects retain RLS with zero policies: no direct client mutation policy was installed.
- In one `BEGIN READ ONLY; SET LOCAL ROLE service_role; ... ROLLBACK` batch, empty-owner read and seven malformed/version/path rejection controls returned their expected results. These controls deliberately avoid fixtures and successful writes; they do not exercise a positive CAS or live HTTP Storage request.
- Security advisor reported only an INFO on the existing `public.business_memberships` RLS-without-policy state; see [advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy). No unrelated policy change was made.

These are parent-captured runtime/metadata observations, not independent live RPCs. Independent verifier `mv8zkwlc-c-7zqd` confirmed working/HEAD/`5d509be` source equality and source/hash/documented-capture consistency with read-only Python/Git checks. It made no live database call and did not independently verify the parent's runtime captures; no stronger provenance is inferred. Positive owner/non-owner/stale/concurrent CAS, public delivery and real uploads still need the wired backend and explicitly bounded functional checks. No Auth, business, catalog or Storage-object fixtures were created; no schema/history joint-atomicity, cleanup or whole historical-data preservation guarantee is inferred.
