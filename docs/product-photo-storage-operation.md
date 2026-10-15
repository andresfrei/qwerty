# Trusted product photo storage operation

This document describes the source-preparation unit for trusted product photo delivery. It targets the **one existing Supabase database used through the MVP**. It has not been applied, and it does not claim deployed Auth, CAS, RLS, or Storage behavior.

## Operation source

`supabase/operations/trusted_product_photo_storage.sql` is an operation source, not an invented migration. The eventual native deployment/version mapping is selected later. The operation intentionally does not replay the existing `catalog_items` photo-column `ALTER`, alter the original photo migration, create or replace a function, drop an object, or change provider schema/history bookkeeping.

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

No functional database runner, SQL/psql execution, Docker, fixture, or remote apply was authorized for this source-only unit. There is therefore no meaningful runnable SQL RED/GREEN result and no positive functional proof for ownership, collision handling, triggers, CAS, RLS, or Storage behavior. Those checks remain deployment and integration work. Structural readback and `git diff --check` are the applicable source checks.
