# Native logout feedback hydration repair
Repair the reported OwnerShell hydration mismatch without replacing native submission.
Base: a9bbdd5d3afc8fd799beac17781845496fe91bee; branch: feat/owner-resource-navigation.

## Specs
- **S1:** User reports: "Hydration failed because the server rendered text didn't match the client. As a result this tree will be regenerated on the client." Exact mismatch: "+ Cerrar sesión" versus "- Cerrar sesiónCerrando sesión…Cerrar sesión"; "at OwnerShell (app/owner/owner-shell.tsx:56:66)", "Next.js version: 16.3.6 (Turbopack)".
- **S2:** Browser authorization initially "Autorizar corrección y dos pruebas aisladas", superseded by "Autorizar un lanzamiento adicional: tres en total" / `authorize_native_hydration_one_additional_launch_total_three`. Focused retry authorization: "Autorizar diagnóstico y una corrida focalizada de 90s" / `authorize_native_hydration_ssr_diagnosis_one_focused_90s_rerun`. Original boundary: "Sin cuenta, credenciales, API ni base de datos; sin reiniciar el MVP/proxy, instalar dependencias ni hacer reintentos adicionales."

## Tasks
- **H1 | S1-S2 | parent | done | commit pending:** reproduce actual React SSR/hydration after global enhancer in browser run1, with existing native regressions.
- **H2 | S1-S2 | parent | done | commit pending:** align OwnerShell native feedback SSR markup and enhancer adoption; retain existing native contracts.
- **H3 | S1-S2 | parent + independent verify | in_progress | commit pending:** browser run2 GREEN, scoped source checks and previous/current differential, independent Risk3 review.
- **H4 | S1-S2 | parent | pending | commit pending:** document evidence/limits and close reviewable local work unit; no publishing.

## Log
- **L1 — Original user report, verbatim:**
```text
## Error Type
Recoverable Error

## Error Message
Hydration failed because the server rendered text didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:

- A server/client branch `if (typeof window !== 'undefined')`.
- Variable input such as `Date.now()` or `Math.random()` which changes each time it's called.
- Date formatting in a user's locale which doesn't match the server.
- External changing data without sending a snapshot of it along with the HTML.
- Invalid HTML tag nesting.

It can also happen if the client has a browser extension installed which messes with the HTML before React loaded.

https://react.dev/link/hydration-mismatch

  ...
    <ScrollAndMaybeFocusHandler cacheNode={{rsc:{...}, ...}}>
      <InnerScrollHandlerNew focusAndScrollRef={{scrollRef:null, ...}} cacheNode={{rsc:{...}, ...}}>
        <ErrorBoundary errorComponent={undefined} errorStyles={undefined} errorScripts={undefined}>
          <LoadingBoundary name="items/" loading={null}>
            <HTTPAccessFallbackBoundary notFound={undefined} forbidden={undefined} unauthorized={undefined}>
              <RedirectBoundary>
                <RedirectErrorBoundary router={{...}}>
                  <InnerLayoutRouter url="/owner/cat..." tree={[...]} params={{}} cacheNode={{rsc:{...}, ...}} ...>
                    <SegmentViewNode type="page" pagePath="owner/cata...">
                      <SegmentTrieNode>
                      <ProductsPage>
                        <OwnerShell>
                          <div className="min-h-scre...">
                            <aside className="min-w-0 bo...">
                              <a>
                              <details>
                              <nav>
                              <form action="/auth/logout" method="post" className="mt-6">
                                <button
+                                 className="block min-h-11 rounded-lg px-3 py-3 text-sm font-extrabold hover:bg-[var(..."
-                                 className="block min-h-11 rounded-lg px-3 py-3 text-sm font-extrabold hover:bg-[var(..."
                                  type="submit"
                                >
+                                 Cerrar sesión
-                                 Cerrar sesiónCerrando sesión…Cerrar sesión
                            ...
                    ...
                  ...
        ...



    at button (<anonymous>:null:null)
    at OwnerShell (app/owner/owner-shell.tsx:56:66)
    at CatalogProductPage (app/owner/catalog/catalog-product-page.tsx:28:10)

## Code Frame
  54 |         <a key={module} className={`${link} ${module === activeModule ? "bg-[var(--lime)]" : ""}`} href={ownerHref(module, selectedBusiness?.id)} aria-current={module === activeModule ? "page" : undefined}>{label}</a>
  55 |       )}</nav>
> 56 |       <form action="/auth/logout" method="post" className="mt-6"><button className={`${link} w-full border border-[var(--line)] text-left`} type="submit">Cerrar sesión</button></form>
     |                                                                  ^
  57 |     </aside>
  58 |     <main className="min-w-0 px-5 py-8 sm:px-8 lg:p-12"><div className="mx-auto max-w-4xl">
  59 |       {catalog && <CatalogSectionNav section={catalog.view.resource === "groups" ? "items" : catalog.view.resource} query={catalog.query} />}

Next.js version: 16.3.6 (Turbopack)
```
- **L2 — Authorization:** user selected `authorize_native_hydration_fix_two_isolated_browser_runs`. Exactly two isolated Chromium launches total (RED then GREEN/native regressions); no automatic retries. Sandbox on, all fictional requests intercepted, no saved session, short project-local temporary directory. Existing MVP job5/proxy/container retained.
- **L3 — Source map/route:** explorer mvnun9ge-2i-cfx6 found root enhancer decorates idle DOM before every descendant hydrates. Parent spot check confirmed exact text/class signature. Single behavior → inline writer. Shared native feedback reaches five existing auth operations → Risk3 independent verification mandatory. No timers, suppression, fetch logout or removal of width reservation.
- **L4 — Preservation:** Auth pages/endpoints/config/landing remain untouched. Only shared components/async-action.ts is a necessary named exception to old navigation protection baseline; fresh repair baseline protects all other preexisting files/dirty state. New native SSR button adopted by OwnerShell only; legacy plain-HTML auth enhancement must remain unchanged. Classic/Catalog guards, action/method, named payloads, pending/double submit/formdata, no-JS, cleanup/pageshow and dimensions retain behavior. No API/schema/dependency/env or publishing changes.

- **L5 — Browser run1 did not isolate reported regression:** job13 exit1,4legacy native childcasesPASS, newOwnerShell hydrationcaseFAILplusparentFAIL(4pass/2fail). First mismatch was fixture charset: client `No hay tiendas en esta página.` vs parsed SSR `No hay tiendas en esta pÃ¡gina.`; this masks reported logout mismatch and is NOT accepted as meaningful application RED. stderr empty; ownbrowser closed. Fixture only now declares UTF-8 in HTTPContentType and head/meta. Runtime OwnerShell/enhancer still unchanged. No automatic retry;1of2authorizedlaunches consumed. H1blocked awaiting explicit oneadditional launch(total3) so correctedfixtureRED thenruntimefixGREEN canbothrun. Existing appAuthpages/guards/config/server/proxy untouched. Existing native test/docs additions are accompanying named exceptions to oldprotectionbaseline; runtime exception remains sharedasync-action.ts only.

- **L6 — Fresh explicit authorization:** user selected `authorize_native_hydration_one_additional_launch_total_three` / "Autorizar un lanzamiento adicional: tres en total". Totalbudgetnow3, run1retainedinvalid. Remainingrun2=correctedfixtureRED/runtimeunchanged, run3=afterfixGREEN/nativecompatibility. Sameisolation/prohibiteddata/env/server/dependency/publishing actions; nofurtherretries authorized.

- **L7 — Meaningful RED observed:** job14/browserrun2 exit1, stdout exactreportedOwnerShellbuttonclass/textdiff `Cerrar sesión` vs`Cerrar sesiónCerrando sesión…Cerrar sesión`; UTF8 nowcorrect. FourexistingnativecasesPASS, newhydrationchild+parentFAIL(4/2), no skipped/cancelled. ActualReactDevStrictMode feedbackroot mounted beforeactualShellhydrateRoot. No runtimechangebeforeRED. H1DONE,H2inprogress. RemainingbudgetoneGREENbrowserlaunch3. ChosenfixadditiveSSRnativebuttoninOwnerShell+non-mutatingadoptionofthatmarkup; legacyplainHTMLAuthbuttonsunchanged; no timers/suppression/lazywidthregression.

- **L8 — Draft implementation and incomplete writer proof:** NativeAuthButtonSSR+OwnerShelluse+sharedenhanceradoption/ownershipimplemented; Authpages/endpoints/Catalogguardsunchanged. WholewebtscPASSexit0(29.1s), targetedBiome3filesPASSexit0/no warnings. Parallelfocused83-casecommanddidNOTcompletewithin30s(toolpromise rejected, nofinishedexit/totals); stdoutalsohasnewSSRcontractassertionFAILrequiringdiagnosis, notacceptedPASS. No automaticretry/backgroundmigration; remainingbrowserlaunch3NOTused. NativeASSESSRisk3escalated/RDDoff/unassessable, planrequiresindependentreviewafterwriterproof. H2BLOCKEDonexplicitfreshpermissiontodiagnosefailedSSRassertionandrerunfocusedsetupto90swithoutcompetingchecks; H3/H4stillunfinished. No repaircommits orpublishing. Needonehuman decision, noextra verificationbeforepermission.

- **L9 — Fresh scoped focused-run authorization:** user selected `authorize_native_hydration_ssr_diagnosis_one_focused_90s_rerun` / "Autorizar diagnóstico y una corrida focalizada de 90s". DiagnoseSSRassertion, then exactlyonenew83casecommandupto90swithoutcompetingchecks, thenremainingbrowserlaunch3andrequiredindependentreview. No automaticretries, no newChromiumbudget. Earlier30stimeout/SSRfailretained. H2unblocked.

- **L10 — SSR assertion diagnosis:** inspectedactualpublicSSRformopeningtag`<form class="mt-6" action="/auth/logout" method="post">`; testincorrectlyrequiredactionfirst. Correctedassertionchecksaction/methodindependently, no appchange. Button/reserves/statusmarkupmatchedthedeclaredSSRshape. Onefresh83casecommandnowauthorizedupto90swithoutparallelchecks; no testPASSclaimedbeforeoutcome.

- **L11 — Writer source checks observed:** job15freshauthorizedfocusedrun83/83PASSexit0(26.07s), no skipped/cancelled/fail. IncludesactualShellSSRcontract+presentation4+prior78tests. Earlier30stimeout+badattributeordertestretained. tsc0/Biome3files0alreadyobserved; no runtimeeditsafterthosechecks. H2DONE,H3inprogress: onefinalChromiumlaunch3GREENwillincludeexistingnativecases,newactualReactDevStrictModeShellhydrationandnonshippingprevious/currentfiveactiondifferentialwithinSAMEbrowser; no additionalbrowserorserver. IndependentRisk3reviewstillpending. No clean-checkout/realaccount/NextRSC/Auth/RLSproofclaim.
