# First-store onboarding — server boundary

This work unit implements the private onboarding HTTP/SDK boundary and its tests. The actual owner setup/catalog UI follows in the dependent unit. Existing signup and current confirmed-owner/RLS rules remain prerequisites; no real email or store was created by the agent.

## Contract

POST `/owner/onboarding` accepts only `{action:"create_business",name}` or `{action:"create_draft",displayName,slug}`. Names and a lowercase address up to63characters are bounded before client creation. Origin/Host/forwarded headers, method/path/query and streamed JSON (2KiB maximum) are checked first; client owner/business/publication authority is rejected.

The current server `getUser` must establish an authenticated, nonanonymous confirmed owner. Caller-session/public-key SDK queries and existing current-confirmed/nondeleted-owner RLS supply authority; never service credentials. First owned business is ordered by `created_at,id`.

Business and unpublished-draft insertion are recoverable separate steps, not an atomic pair or cross-session uniqueness guarantee. Resume existing owned records without deletion or silent overwrite; a private slug collision reveals only that the address is unavailable. Unknown outcomes must not trigger automatic mutation retries.

Refresh cookies stay staged until fresh eligible identity succeeds. Rejected/null/unconfirmed/anonymous/wrong-role identities commit no batch. A verified owner's later business-read503 may retain valid refresh; identity eligibility is not the response status. Responses are private/no-store and fixed safe errors never expose provider bodies.

## Source evidence

Meaningful501-stub and cookie-leak REDs were observed before GREEN. HTTP/installed-SDK boundary tests use synthetic users and intercepted fetch. Parent21focused tests, existing39regressions, source review and limited independent eight-scenario cookie recheck passed; type/lint and103protected hashes passed. These are SOURCE/mock results, not actual signup/email/hosted persistence or native approval. Fullsuite/photo/build remain deferred; original browser failure and separate S6mock success are retained in feature evidence.
