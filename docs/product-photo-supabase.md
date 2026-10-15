# Trusted product-photo Supabase adapter

`apps/web/app/lib/product-photo-supabase.ts` is the Unit B persistence adapter for the existing trusted photo-change service. It is source preparation only: it does not create a Supabase client, read credentials, add an HTTP route, apply SQL, or claim that Auth, CAS/RLS, or Storage policies are deployed.

## Boundary

`createSupabasePhotoPorts` receives three explicit dependencies:

- `client`: the small RPC and Storage surface required by deterministic tests or a server-owned Supabase client; its RPC method accepts the installed SDK's `PromiseLike` PostgREST builder;
- `authenticatedUserId`: a verified session callback;
- `normalize`: the canonical `PhotoPorts.normalize` callback.

The adapter never accepts a browser actor, credential, or service key. For every owner and commit operation it obtains the actor from the callback, ignoring the actor value passed through the service port. A missing or malformed callback identity cannot manufacture an identity or call an RPC.

## Frozen RPC contract

The adapter calls only these exact public names and argument keys:

- `get_owned_product_photo(p_actor_id, p_item_id)` — an array containing zero or one `{ business_id, photo_version }` row;
- `commit_product_photo(p_actor_id, p_item_id, p_business_id, p_expected_version, p_next_version, p_photo_path)` — a strict boolean.

Empty owner results become `null`. UUIDs, canonical signed-`bigint` text, cardinality, row shape, and the commit boolean are validated before they can be used. Versions remain strings and are never converted through JavaScript `Number`. `false` from the commit RPC is returned to the service so it surfaces its normal conflict result.

## Storage behavior

Replacement bytes are uploaded only to the `product-photos` bucket with the fresh service-generated path, normalized `Uint8Array`, `contentType: "image/webp"`, and `upsert: false`. The adapter does not retry, delete, overwrite, publish, or clean up objects. Detach performs no Storage call.

Resolved provider errors and thrown provider exceptions become stable `PhotoSupabaseError` values without retaining or exposing raw provider messages, keys, or details. Upload success is accepted only when `error === null`, `data` is a non-null non-array object, and `data.path` is the requested path string. Missing, null, malformed, or mismatched success data fails closed before commit. A failed upload cannot invoke commit; an upload may remain unreferenced because Storage and metadata are not one transaction.

## Verification boundary

`apps/web/tests/product-photo-supabase.test.mjs` uses deterministic structural client mocks, a runtime thenable, and a no-write TypeScript compiler-API virtual source that checks assignability from the installed `SupabaseClient`. The compiler regression compares complete diagnostic identities for only the two known baseline diagnostics (TS2503 at `app/lib/product-photo-normalizer.ts:203` and TS5097 at `tests/product-photo-normalizer.test.ts:7`); a separately injected same-code virtual diagnostic must remain visible. The suite also combines the adapter with the existing service and canonical normalizer for a replacement path. These tests prove source-level wiring and failure behavior only; no active database, Storage fixture, SQL operation, deployment, or live authorization check is performed by this unit.
