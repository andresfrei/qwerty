# Native authentication form feedback

Enhance the existing native Auth/logout forms without replacing browser submission, reading credentials, or changing server security guards. JavaScript is optional for the original form behavior.

## Native Auth enhancement boundary

`apps/web/app/components/async-action.ts` exports:

- `NativeFormFeedback(): null`: active client hook-only mount, imported directly by `apps/web/app/layout.tsx`.
- `enhanceNativeAuthForms(doc: Document): () => void`: initializes decoration/listeners and returns cleanup.

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

Without JavaScript, root markup is unchanged and forms remain native. No route loader, global overlay, toast, framework, network manager, retry or trust change is introduced. Direct `form.submit()` bypasses submit events and is not enhanced; use normal browser submission or `requestSubmit()`.


## Verification and limits

The one authorized foundation bundle passed9/9: four presentation tests, four native cases and their parent. Browser-owned named payload, validation, immediate duplicate suppression, no-JS, cleanup, detached-form reinsertion, stable dimensions, reduced motion and synthetic pageshow restoration were reached. Independent review matched all six validated candidate hashes and inspected this boundary without rerunning the consumed bundle.

The explicit browser-test command uses the already-installed global playwright-cli Chromium engine. It is not a project dependency installation or permission to change TLS trust. Replay fulfills/aborts every request on a fictional origin; it proves neither real TLS/Auth/redirects nor actual BFCache. Historical failures and the single corrected run remain under .pi/async-action-feedback/foundation/. Protected untracked Auth is not adopted, and no clean-checkout runtime is claimed.

Risk: item2 (native successful-control serialization). Bounded independent source review passed; native assessment remains unassessable/RDDoff, not native approval. Real visual QA stays manual by the user's accepted delivery scope.
