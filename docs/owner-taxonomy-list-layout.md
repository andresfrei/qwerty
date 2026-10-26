# Catalog taxonomy listing pattern

## Current scope

Categories adopts the shared Products list layout/table, including available
desktop height. New category is right aligned; q search remains an unnamed UI
draft with a validated guarded read link, not a native write/read form. Categories
has no additional server filters, so no fictional filter modal is shown.

The server passes serializable rows, certified counts/order/page and validated
record URLs. Columns/render functions remain in the client subtree. No client
sorting, global filtering, re-pagination, product counts or new API is introduced.

New/detail pages, Groups, Settings and existing save/unknown/native guards retain
their behavior and reading width. Existing uncommitted nested sidebar is preserved.

Options now uses the same table/available-height presentation. It displays the
verified product/group, availability, order and price delta in major units; no
currency or product metadata absent from the reader DTO is invented.

Its filter modal uses RHF UI drafts and existing scoped paged selectors. Changing
product clears group/search; changing group clears search. Clear is draft-only;
Cancel/Escape restore the open snapshot; Apply keeps the guarded read destination
and resets page. Checked minimal product labels never become fabricated Items DTOs.
The existing Options-list frame still chooses read-only before mounting controls,
and retains the disabled original tree while pending/unknown. No record-save form
or lifecycle is migrated. Category search remains guarded q-only.

## Verification and limits

Source checks pass: 64 scoped cases, TypeScript, five-file lint and four focused
checks after removing an unnecessary JSX fragment. Twenty-two exact public SSR
comparisons retain Categories New/detail, Groups, Options New/detail/choosers and
Settings, including changed q input; unchanged form/field leaves use identical
adapters on both sides.

One isolated Chromium run passes 98 checks across both resources at 1440/390,
using actual React/RHF/Table/Frame SSR→StrictMode hydration. It covers paged
selectors, parent/query invalidation, stale responses, draft actions/focus,
read-only preselection, retained disabled controls, unknown SPA inspection and
saved native GET. No unexpected errors or requests. The preparer initially failed
to resolve a Next alias; its private resolver was corrected before browser launch.
Independent S1–S3 integration review passes with no blockers (four focused cases
also pass). Native ASSESS remains unassessable with RDD off, not native approval.

These are synthetic intercepted services and framework routing adapters, not live
Next RSC/prefetch, Auth/RLS, account/concurrency/clean-checkout or write acceptance.
No full build/unrelated suite/install/DB/server restart/publication was performed.
Manual QA using a real account remains human-owned and unverified.

Spec and execution consent: [owner-taxonomy-list-layout.md](../odd/tasks/owner-taxonomy-list-layout.md).
