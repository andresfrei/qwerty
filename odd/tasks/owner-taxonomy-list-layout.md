# Catalog taxonomy list layout
Extend the approved Products listing pattern to Categories and Varieties/options, preserving existing read and save contracts.
Base: bf637079c6eab86e3a2388fce8793ecb6db8f8db; preserve prior uncommitted nested sidebar and unrelated work.

## Specs
- **S1:** "avanzar en esa direccion"
- **S2:** "pero quizas el boton de nuevo a la derecha y en lugar del noton nuevo, uno de filtro que abra un modal con las opciones de filtro para esa lista"
- **S3:** "la lista deberia ocupar todo el estacio de alto disponible, revisar y adecuar"

## Tasks
- **C1 | S1-S3 | parent | in_progress | commit pending:** protect current working/index baseline; fix scope, existing query/parent/read-only contracts and authorized proof budget.
- **C2 | S1-S3 | parent | pending | commit pending:** reusable client-local taxonomy table and Categories list/search/right-side New; preserve New/detail/Groups/settings.
- **C3 | S1-S3 | parent | pending | commit pending:** Options table and RHF filter modal, product→group invalidation and unchanged read-only frame; no write-form migration.
- **C4 | S1-S3 | parent + independent verify | pending | commit pending:** public RED/GREEN/regressions/differentials, actual-library desktop/mobile synthetic verification and required shared-contract review.
- **C5 | S1-S3 | parent | pending | commit pending:** docs, protected/index checks and bounded local work-unit commits; no publication.

## Log
- **L1 — Implementation request, verbatim:**
```text
avanzar en esa direccion
```
- **L2 — Accepted preceding proposal, verbatim:**
```text
Yo seguiría en este orden:

1. QA en una tienda de prueba: crear/editar productos, buscar, filtrar y volver desde la ficha conservando contexto.
2. Extender el layout a Categorías y Variedades/opciones, respetando su jerarquía. Ajustes sigue como pantalla única, no como tabla.
3. Cerrar Catálogo antes de avanzar con Pedidos.

Mi recomendación: validar primero el recorrido real de Productos y después aplicar el patrón a Categorías.
```
- **L3 — Execution scope:** real-account QA remains a separate human-owned blocked task, not replaced by synthetic evidence. Authorizes Categories and Options LIST presentation only; Groups/settings/New/detail retain behavior and reading width. No Pedidos/Caja/Tienda/new operations, CRUD engine, schema/model/API/auth/save/payload/pricing changes. Reuse installed Table9.3.1/RHF7.91.0 and ResourceListLayout/ResourceTable including available height. Server counts/order/pagination/query parser remain authoritative; no local global filtering/sorting/re-pagination or invented product counts/currency.
- **L4 — Resource-specific controls:** Categories supports q only, so no fictional extra Filters. Options supports itemId/groupId; modal owns draft and uses existing scoped paged choices, validated minimal parent labels without fabricated Items metadata. Parent changes invalidate group/search and stale callbacks; Apply resets page/keeps business/storePage, omits empty IDs. Existing Options-list CatalogFormFrame stays: locked arrivals must not mount editable filters; retained tree remains disabled. Existing guarded read links, unknown/saved/native exits unchanged. New/detail parent checks and eleven classic payloads/transport/rejection/unknown/CAS untouched.
- **L5 — Exploration:** gentle-ai-explore mvolwopl-2q-32oh mapped existing filter hooks, DTOs and public taxonomy fixture seams; parent spotchecked controls9-49. ItemParent has id/business_id/name only; no currency/profile/availability to invent. Existing Category search is guarded anchor-based, input unnamed/no native form. New UI keeps read navigation rather than broadening native GET exemptions. Preserve Options labels and real product/group ancestry.
- **L6 — Explicit browser consent:** userselected "Autorizar implementación y una sesión aislada" / `authorize_taxonomy_lists_one_isolated_browser`: ONE new isolated Chromium session for two lists/modal/desktop390/search/parent hierarchy/read locks/responsive, synthetic intercepted requests only. No realaccount/API/data/install/serverrestart/publication. New grant unused; previous feature/height grants remain exhausted. No unchanged retries or additional browser launch without fresh explicit consent.
- **L7 — Routing/protection:** one coherent rollout; C3 depends on C2 presentation foundations, no independent heavy writer units, parent inline. Shared taxonomy view/page changes name Risk3 and require independent read-only verification; source-only unit checks do not claim final browser acceptance. Existing six sidebar working paths/unrelated dirty/untracked work protected; no incidental adoption and no .pi staging. Existing MVP/proxy/container stay running. Work-unit commits on current feature branch, about400authoredlines with behavior/tests/docs; no push/PR/merge/release.
