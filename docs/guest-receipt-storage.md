# Private receipt storage boundaries

## Verified-owner prerequisite

`20260929054538_mvp_owner_verified_email.sql` checks the current Auth row and confirmed email before owner administration. Anonymous Auth shares the authenticated SQL role; that role, user-editable metadata or a forged email claim must not grant ownership.

The exact source was applied remotely as `20261018020731` before guest use. `supabase/tests/database/mvp_owner_catalog.remote.sql` is the byte-identical, explicitly authorized S14 proof source: 33 targeted owner/catalog assertions passed with unconditional rollback and no retained SQL fixtures. It is not the obsolete browser-photo suite or full historical options suite.

These `.remote.sql` scripts are manual remote verification sources, not local Supabase/CLI migration commands. Execution requires a new scoped authorization and exact project binding. Fixed disposable probe identifiers are collision-prechecked; they are not production IDs or credentials. Do not replay migrations or use verification to add grants.

## Private staging

`20261001090000_mvp_guest_receipts.sql` was applied remotely as `20261018020759`. It creates a private 10 MiB receipt bucket and forced-RLS metadata, with no browser metadata grants/policies and restrictive Storage fences. The service role has only the required new-table SELECT/INSERT/DELETE privileges; there is no attachment transition or browser cleanup endpoint.

`createReceiptStaging` and its Supabase repository bind each staged original to the server-verified actor, published business and random receipt UUID. The object path is exactly `business/actor/receipt`. MIME, size and SHA-256 come from the receipt-specific validator; uploads never overwrite. Reads require the original actor/business/receipt/staged tuple and verify stored bytes against metadata.

`mvp_guest_receipts.remote.sql` preserves the exact S14 receipt29 proof source. Its denial UPDATE is bounded to a collision-prechecked absent receipt and guarded against existing UPDATE privileges; an exception subtransaction unconditionally rolls back probes. The earlier unbounded authored probe is not the delivered test or execution instruction.

Real SQL29 and targeted owner/catalog33 passed separately from source tests and the later real Auth/Storage/HTTP proof. SQL rollback evidence does not establish HTTP behavior; cleanup without reported errors is not an independent no-residue audit.

Storage and Postgres are not one transaction. Upload/metadata failure returns no receipt ID and creates no order; a private orphan can remain. No automatic orphan retention/deletion policy is implied. Typed contact, known receipt IDs and business ownership never grant original-receipt access.

See [HTTP contract and validation](guest-checkout-receipts.md). No new SQL, provider change, local backend, reset, photo replay or deployment is authorized by committing these sources.
