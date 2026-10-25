# Products list layout and filter dialog
Implement the approved reusable listing prototype in Products with TanStack Table and React Hook Form.
Base: eb5afdf84f55af87508da699227fd9d41339e861; preserve preexisting uncommitted nested sidebar and unrelated work.

## Specs
- **S1:** "que entiendes por listas? vamos a crear un layout para lsitados, yo pensaba algo como esto: /tmp/gpCGw4Vo/pi-clipboard-eaed1921-59d3-4fa0-8b43-9208678d0383.png .. evaluemos"
- **S2:** "pero quizas el boton de nuevo a la derecha y en lugar del noton nuevo, uno de filtro que abra un modal con las opciones de filtro para esa lista"
- **S3:** "si, probemos con eso... aca evaluemos si quizas convenga usar librerias como stantk tack form o como se llame junto con algun hook para forms y react"
- **S4:** "aplicar los cambios"

## Tasks
- **P1 | S3-S4 | parent | in_progress | commit pending:** protect working baseline, add only exact @tanstack/react-table9.3.1/react-hook-form7.91.0 with lockfile, verify actual exports/SSR; Risk5 own work unit.
- **P2 | S1,S3-S4 | parent | pending | commit pending:** reusable presentation layout and headless table with already server-paged rows, no generic CRUD or client re-filtering.
- **P3 | S2-S4 | parent | pending | commit pending:** compact search/filter/create toolbar, RHF modal draft/Apply/Cancel/Clear and applied filters, retaining scoped read navigation.
- **P4 | S1-S4 | parent | pending | commit pending:** integrate Products list only, wider useful content; keep New/detail/forms/price semantics and nested sidebar unchanged.
- **P5 | S1-S4 | parent + independent verify | pending | commit pending:** meaningful RED/GREEN, prior behavior/differentials, actual-library SSR/interaction and responsive proof, required Risk3/5 independent checks.
- **P6 | S1-S4 | parent | pending | commit pending:** document interface/limits/evidence, reviewable local slices and final task/memory/todo closure; no publication.

## Log
- **L1 — Original user request, verbatim:**
```text
que entiendes por listas? vamos a crear un layout para lsitados, yo pensaba algo como esto: /tmp/gpCGw4Vo/pi-clipboard-eaed1921-59d3-4fa0-8b43-9208678d0383.png .. evaluemos
```
- **L2 — User correction, verbatim:**
```text
pero quizas el boton de nuevo a la derecha y en lugar del noton nuevo, uno de filtro que abra un modal con las opciones de filtro para esa lista
```
- **L3 — User library evaluation, verbatim:**
```text
si, probemos con eso... aca evaluemos si quizas convenga usar librerias como stantk tack form o como se llame junto con algun hook para forms y react
```
- **L4 — Implementation authorization, verbatim:**
```text
aplicar los cambios
```
- **L5 — Accepted preceding proposal, verbatim:** "La propuesta sería probar ese combo sin tocar los guardados actuales. No instalé nada; falta aprobar las dos dependencias." The preceding recommendation was "Probar TanStack Table + React Hook Form, acotado al listado de Productos y su modal de filtros"; S4 now authorizes those scoped dependencies and implementation, not a migration of Auth/other forms.
- **L6 — Evidence/implementation boundaries:** currentReact19.3/Next16.3.6/pnpm11.20; registry-confirmedTable9.3.1/RHF7.91.0 peers includeReact19. Tableusesv9API, notv8tutorials. No TanStackForm/Query/Router/Start/Zod/UIframework/devtools dependencies. Server-authorizedpaginatedreads/counts/queryparserremainauthoritative; no unsupportedglobalSort/filter, newDB/API/model/writecontracts or realrecordfixtures. Keepreferencepricesnotfinalprices, read-onlylist→fiches, separateNew/details, existing scopedpagedcategorypicker, synchronouspending/unknown/savedWindowguard/CAS/nativeAuth/logout untouched. No automatic retries.
- **L7 — Routing/shape map:** explorer mvo3nids-2l-glst notes lockednativeGETsubmitveto and existingvalidatedCatalogProductReadLink/InspectionLink. Do not broaden trustednativeGET/logout exemptions merely for filters. Prefer existing guarded anchor navigation for filter Apply/locked reads; ordinary idle GET search may use browsernativeGET with omitted emptycategory/page and currentbusiness/storepage. No synthetic clicks/location.assign/unvalidatedrouter.push. RHF owns UI drafts, not save lifecycle. Default SSR/client markup must match; libraries receive only serializable row/pagination data, define columnfunctions in client subtree. Products LIST only may widen OwnerShell through optional default-preserving prop.
- **L8 — Baseline/slicing:** sixexistingnested-sidebarworkingpathsbelongtopriorcompletedauthorizedchangeandmustremainuncommitted/preserved,notadoptedincidentally. NewShellwidthhunksmaybestagedseparatelyagainstHEADwhileleavingpriorMenuhunksout; protectbaselinebytesandindexvariants. OtherAuth/config/landing/untrackedfilesneveradopted. Parentownstracking/index/commits. Onebehavior/dependenttasks→inline, no Writertrigger. Largebecause dependencyintegration/mixedindexscopes/verificationwaits/preservationrequirements needdurablehandoff, not filecount.
- **L9 — Pending execution consent:** pnpmstoretargetis /home/andresfrei/.local/share/pnpm/store/v11 outsideproject; needexacttargetpermissionbeforeinstallwrites. Puttemporarymetadata/cacheinsideprojectwherepossible; ignore dependency scripts. Priorbrowserbudgetsareexhaustedandtask-specific. Needfreshoneisolatedvisual/actualReact-librarysessionpermission; do not reuse prior grants. KeepMVPjob5/sharedproxy/container, no duplicate server, installs beyondtwoapprovedpackages, push/PR/merge/release.

- **L10 — Explicit execution consent:** userselected `authorize_products_layout_pnpm_store_v11_one_isolated_browser` / "Autorizar caché y una sesión aislada de verificación". Exactauthorizedexternalstoretarget=/home/andresfrei/.local/share/pnpm/store/v11; installonlyTable9.3.1/RHF7.91.0,ignoredependency-scripts. ONEnewisolatedChromiumsessiontotal forrealReact/newlibraries/modal/desktop-mobile, no realaccount/API/DB, no extra retries/server/proxyrestart/publication. P1unblocked. Keeptemporarymetadata/cacheunderprojectwhenpossible.
