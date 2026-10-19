# Private receipt storage boundaries

## Verified-owner prerequisite

`20260929054538_mvp_owner_verified_email.sql` checks the current Auth row and confirmed email before owner administration. Anonymous Auth shares the authenticated SQL role; that role, user-editable metadata or a forged email claim must not grant ownership.

The exact source was applied remotely as `20261018020731` before guest use. `supabase/tests/database/mvp_owner_catalog.remote.sql` is the byte-identical, explicitly authorized S14 proof source: 33 targeted owner/catalog assertions passed with unconditional rollback and no retained SQL fixtures. It is not the obsolete browser-photo suite or full historical options suite.

These `.remote.sql` scripts are manual remote verification sources, not local Supabase/CLI migration commands. Execution requires a new scoped authorization and exact project binding. Fixed disposable probe identifiers are collision-prechecked; they are not production IDs or credentials. Do not replay migrations or use verification to add grants.
