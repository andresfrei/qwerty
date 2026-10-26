# Catalog taxonomy list layout
Extend the approved Products listing pattern to Categories and Varieties/options, preserving existing read and save contracts.
Base: bf637079c6eab86e3a2388fce8793ecb6db8f8db; preserve prior uncommitted nested sidebar and unrelated work.

## Specs
- **S1:** "avanzar en esa direccion"
- **S2:** "pero quizas el boton de nuevo a la derecha y en lugar del noton nuevo, uno de filtro que abra un modal con las opciones de filtro para esa lista"
- **S3:** "la lista deberia ocupar todo el estacio de alto disponible, revisar y adecuar"

## Tasks
- **C1 | S1-S3 | parent | done | 3af58b0e8cebac5db504d1bed656fac3b7d9158e:** protect current working/index baseline; fix scope, existing query/parent/read-only contracts and authorized proof budget.
- **C2 | S1-S3 | parent | done | d24f617888ccfc8d0460b0551cd44de69116c233:** reusable client-local taxonomy table and Categories list/search/right-side New; preserve New/detail/Groups/settings.
- **C3 | S1-S3 | parent | done | 9914c46317b45142b857672c4f5a9357061a74ed:** Options table and RHF filter modal, product→group invalidation and unchanged read-only frame; no write-form migration.
- **C4 | S1-S3 | parent + independent verify | done | 9914c46317b45142b857672c4f5a9357061a74ed:** public RED/GREEN/regressions/differentials, actual-library desktop/mobile synthetic verification and required shared-contract review.
- **C5 | S1-S3 | parent | done | 9914c46317b45142b857672c4f5a9357061a74ed:** docs, protected/index checks and bounded local work-unit commits; no publication.

## Log
- **L1 — Implementation request, verbatim:**
```text
avanzar en esa direccion
```
- **L2 — Accepted preceding proposal, plain-text excerpt:**
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

- **L8 — C1 complete:** trackingcommit3af58b0e8cebac5db504d1bed656fac3b7d9158e; fresh326protectedhashes/sixpriorMenuWIP/indexempty/basebf637079. Browsergrantnew1unused/no datawrites/oldcontrolsModuleunmodified. C2inprogress(publicCategorytable/widthREDfirst), no implementedUIclaimyet.

- **L9 — C2 source progress, not accepted:** publicCategorytableRED1(oldcards)→GREEN1in9Category/listtests includingclassicpayloads/read locks/settings/Newdetail. NewclientlocalCategorytable/sharedlayout/qguardedsearch/rightNew; categorylistonlywide, no forms/editorsinlist. Legacycategorycardbranchremoved; Newdetail/Groups/settings brancheskept. job38tsc/lintpending, independentSourceRisk3pending; browsernewgrant1unused/C3notstarted. Oneattemptednonmatchingno-opeditorselectorfailedwithoutmutation; subsequentexacteditapplied, no appfailureclaimed.

- **L10 — C2 source verified/committed:** d24f617888ccfc8d0460b0551cd44de69116c233(7paths/120lines); CategoryRED1→GREEN1in9public/legacycases,wholewebtsc0/Biome5files0. Independentmvoniunm-2r-suxfC2S1-S3SOURCEPASS/1testonce/no blockers. NativeRisk3ASSESSunassessableRDDoffnotapproval. 326protected/sixpriorMenuWIPintact/indexempty/no.pi. C2SOURCEdone; no dynamic25/browser/responsive/realaccountclaim;C4pending. C3inprogressOptionsRulesREDnext/newChromegrant1unused.

- **L11 — C3 source progress:** Options/tablemodalRED2(missingtable/component), existingreadonlyPASS→newpublicactualRHFSSR4/4GREEN. Scopedrealparents/minimalItemlabels(no inventedDTO), draftproduct→group/qinvalidation/liveepochfence/OpenCancelEscape/Cleardraft/guardedApplypage0 implemented; retainsOptionslistFrame/read-onlypreselection. NewOptionsrowspriceDeltashowntruthfullyasunidadmayor/nocurrencyinvented. job39wholewebtsc0/Biome5files0withoneinformationaluselessfragmentinnewOptiondetailwrapper; job40regressionsrunning. C3notdone/Browsergrant1unused/C4interactionnotclaimed.

- **L12 — C3 source checks observed:** job40scoped64/64PASSincludingCategory/Options/Newdetail/settings/Groups/Products/N6/contracts; job39tsc0/Biomeexit0withoneinformationaluselessfragment. RemovedonlyunneededOptiondetailfragment(renderedDOMunchanged), thenchanged-sourcefocal4/4+Biome5filescleanobserved. C3SOURCEdone/commitpendingC4independent; actualmodalparentdraft/asyncscope/keyboard/hydrationstillunverified. C4inprogress, newbrowsergrant1unused. No oldcontrols/recordforms/backend/guards modified.

- **L13 — C4 prep failure before browser:** job41helpercouldnotresolveNextalias@/app/components/async-action-buttonimportedbyactualFrame/ClassicFormmodule. Addedbounded@/→apps/webresolutioninprivatebundler; no applicationchange/no browserlaunch/no grantconsumption. Changedpreparerwillrunonce; retaininitialfailure. C4stillinprogress/UIunverified/C5pending.

- **L14 — Pre-browser evidence and plan reviewed:** changedpreparerjob42PASS150modules, actualReact/RHF/Table/Frame/ownerparser/guards, SSR25rowsperCategories/Options; onlyNextLink/usePathnameadapters synthetic. Privateread-onlydifferential22/22exactunchangedSSRCategoriesNewdetail/GroupslistNewdetail/OptionsNewdetail/parentchoosers/settingsinclchangedq, identicalunchangedform/fieldadapters, exit0. Source64+neutralfragmentrefactorfocal4/tsc0/lint0valid; notdynamicUIproof. NativeASSESSRisk3unassessableRDDoffrequiresindependentafterintegration; no nativeapproval. C4remainsinprogress/C5pending. ExecuteoneauthorizedChromesessionnow withgranttokenL6, no retrywithoutnewconsent; no UIpassclaimedbeforecompletion.

- **L15 — Browser proof observed, review pending:** job43ONEauthorizedChromesessionexit0/closed98PASSCategories/Options1440/390. ActualReact/RHF/Table/Frame/guardssourceSSR→StrictModehydrateRootzero recoveries/prehydratefeedbackno idleDOMmutation. Both25serverrows/order/counts/New/right/height/no documentoverflow; Categoryqcanonicalguardedpage0/no extraFilters/no writes/unknowninspection; Optionsminimalcheckedlabels(no fabricatedItemsDTO),pageditemselection,product/group/qinvalidation,oldparent/businessresponsesdiscarded,ClearCancelEscapeApply/focus/snapshots/appliedbadge,retaineddisabledtree→readonlyarrivalwidgetsnotmounted,unknownSPA/savednativeGET/no retries. Errors/unmatched/nativeDialogs0; sixcapturesread. Syntheticservices/frameworkNextLink/usePathnamestubs, notliveNextAuth/RLS/account/cleancheckout acceptance. Grant1/1consumed/no moreChrome. C4remainsinprogressforindependentRisk3; C5pending. Existing64source/4refactor/22diffsnotuniquecombinedtotals.

- **L16 — C4 complete within bounded scope:** independentmvooxkll-2s-2jlaS1-S3PASS/no blockers, focal4/4onceexit0(10.78s), read98UI/22diff/64source/4refactor/cleanlint/RED evidence+6captures. Legacycontrolsno diff, retainedFrame/scopedparents/Newdetail/settings/Groupsunchanged; no auth/write/API/parserchanges. NativeASSESSunassessableRDDoffnotapproval. C4DONE/C5inprogressdocs/preservation/remainingworkunitcommits. ManualrealaccountQAseparatelyhumanblocked; no additionalbrowser/sourcefunctionalrerunsneeded. CurrentC3behaviornotyetcommitted.

- **L17 — C5 local closure:** C3/C4/C5behavior/tests/finalguideheldby9914c46317b45142b857672c4f5a9357061a74ed(8paths/238authoredlines); C2=d24f617888ccfc8d0460b0551cd44de69116c233(7paths/120lines), initialtracking3af58b0e8cebac5db504d1bed656fac3b7d9158e. All source workunits<400lines, conventionalcommits/currentfeaturebranch. FinalownedsourcepathsallmatchHEAD;326protectedhashes/sixpriorMenuWIPbyte-identical/indexempty/no.pi/unrelatedstaging. PublicProductslistingguidecrosslinksresource-specifictaxonomyguide. Source64+4refactor/tsc0/lintclean,22exactSSRdiffs,ONEChrome98PASS/fourresourceviewportcases/6captures/error0,requiredC2+C3independentPASSobserved—not summed. RetainedresolvedprepNextaliasfailure, informationalfragmentcleanup and deliberateREDs; no remainingfailedrequiredchecks. NativeASSESSunassessableRDDoffnotapproval; realNextRSC/AuthRLS/account/concurrency/cleancheckout/fullbuild outsideproof/manualQAseparatehumanblocked. No install/DB/server-proxyrestart/push/PR/merge/release. C1-C5DONEwithinacceptedlistingrollout; tracking-onlycommitclosesrecord, P5evidenceguideinC3commit.
