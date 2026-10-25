# Native authentication form feedback

Enhance the existing native Auth/logout forms without replacing browser submission, reading credentials, or changing server security guards. JavaScript is optional for the original form behavior.

## Native Auth enhancement boundary

`apps/web/app/components/async-action.ts` exports:

- `NativeFormFeedback(): null`: active client hook-only mount, imported directly by `apps/web/app/layout.tsx`.
- `enhanceNativeAuthForms(doc: Document): () => void`: adopts declarative native feedback or decorates legacy plain HTML, installs listeners and returns cleanup.

### Hydration-safe OwnerShell logout

`components/native-auth-button.tsx` renders the OwnerShell logout's idle label,
hidden width reserves and empty polite status in SSR. The client expects exactly
that markup. `data-native-auth-feedback` identifies the button and
`data-native-auth-feedback-status` the form status. Discovery adopts those nodes
without idle text, class, child or status writes. Idle pageshow/StrictMode cleanup
also leaves declarative nodes intact; after a native pending operation it restores
the original idle nodes/attributes but never removes server-owned markup.

The previous root scan imperatively inserted the reserves/status before a streamed
OwnerShell descendant hydrated, producing `Cerrar sesiónCerrando sesión…Cerrar sesión`
and a recoverable hydration failure. No timer or hydration-warning suppression is
used. Auth pages/endpoints remain untouched: their legacy plain-HTML enhancement
path is preserved, not a claim of Next hydration acceptance for every Auth page.

The browser replay transpiles this actual implementation. The old writer-created `native-form-feedback.ts` and `.tsx` shims were reversibly archived under `.pi/async-action-feedback/foundation/retired-entrypoints/`; no duplicate entry files remain in application source.

Only same-origin, query/fragment-free native POST forms with these exact actions are decorated:

| Action | Pending label |
| --- | --- |
| `/auth/login/submit` | `Ingresando…` |
| `/auth/signup/submit` | `Creando cuenta…` |
| `/auth/forgot-password/submit` | `Enviando enlace…` |
| `/auth/update-password/submit` | `Actualizando contraseña…` |
| `/auth/logout` | `Cerrando sesión…` |

Only native submit **buttons** are decorated. External form-associated buttons are included through `form.elements`. Submitter method/action overrides must remain within the boundary. Existing buttons, names, values, methods, actions, hidden inputs, browser encoding, validation, redirects and server guards are not rewritten. Custom JSON/checkout forms and foreign-origin forms are not adopted. Prevented submit events are ignored. React route insertion is observed so newly mounted native forms can be decorated. The same observer releases detached forms: prior disabled state and original button nodes/classes are restored, the formdata listener/status are removed, and the Map entry is deleted. Reinsertion receives fresh enhancement rather than retaining an old pending lock.

### Submission lifecycle

1. Browser validation runs normally. Invalid input does not emit the native submit event and therefore does not lock.
2. The first unprevented submit event synchronously locks the form and displays operation feedback. It is **not** cancelled; no `fetch`, `FormData` construction, field-value reads, credential logging or request reconstruction occurs.
3. Same-tick subsequent submit events are cancelled by the immediate lock.
4. Only the browser's `formdata` event disables interfering native controls. At this point the browser has already constructed its successful entry list, including the named submitter and hidden fields. The event's data is never inspected.
5. Navigation/server results remain browser/domain-owned. An unknown outcome does not automatically unlock. `pageshow` (including back/forward restoration) restores prior disabled/aria-busy state and idle decoration. Cleanup additionally restores original button nodes/classes and removes owned listeners/status.

Without JavaScript, declarative feedback stays idle and all forms remain native. No route loader, global overlay, toast, framework, network manager, retry or trust change is introduced. Direct `form.submit()` bypasses submit events and is not enhanced; use normal browser submission or `requestSubmit()`.


## Verification and limits

### OwnerShell hydration repair

The reported logout class/text mismatch was reproduced with the real shell,
React development StrictMode, root feedback and `hydrateRoot`, then passed after
SSR ownership was added. Idle DOM is identical before hydration; pending native
logout, one POST/duplicate cancellation, stable dimensions and pageshow/cleanup
retain the original SSR markup. Unrelated routing adapters are fixture doubles,
not a real Next RSC/streaming/authenticated page.

The final browser launch passed7/7, including a nonshipping previous/current
differential of all five native actions: identical named payloads, request counts,
cancellation, DOM, pending, restoration and cleanup. The four legacy native cases
are unchanged. Focused source83/83, TypeScript and three-file Biome checks passed;
independent verification passed5/5 and S1/S2 without blocking findings. These sets
overlap and must not be summed as unique tests.

All three explicitly authorized browser launches are retained: the first failed
on a fixture UTF-8 omission, the second reproduced the exact application mismatch,
and the third passed. The initial focused command timed out at30s and its new SSR
assertion incorrectly required attribute order; the explicitly reauthorized90s
run passed83/83 in26s after correcting the assertion. No automatic retries.

No live account/Auth/RLS/Next RSC or clean-checkout acceptance, full suite/build,
new dependencies, server/proxy restart or publication is claimed. Evidence and
user authorizations are in [native-feedback-hydration.md](../odd/tasks/native-feedback-hydration.md);
`.pi/native-feedback-hydration/` artifacts are local only and do not ship.

### Earlier foundation proof

The one authorized foundation bundle passed9/9: four presentation tests, four native cases and their parent. Browser-owned named payload, validation, immediate duplicate suppression, no-JS, cleanup, detached-form reinsertion, stable dimensions, reduced motion and synthetic pageshow restoration were reached. Independent review matched all six validated candidate hashes and inspected this boundary without rerunning the consumed bundle.

The explicit browser-test command uses the already-installed global playwright-cli Chromium engine. It is not a project dependency installation or permission to change TLS trust. Replay fulfills/aborts every request on a fictional origin; it proves neither real TLS/Auth/redirects nor actual BFCache. Historical failures and the single corrected run remain under .pi/async-action-feedback/foundation/. Protected untracked Auth is not adopted, and no clean-checkout runtime is claimed.

Foundation risk: item2 (native successful-control serialization). Hydration repair
risk: item3 (shared native-feedback consumers). Independent source/contract review
passed; native assessment remains unassessable/RDDoff, not native approval. Real
account/Next integration QA remains separate.
