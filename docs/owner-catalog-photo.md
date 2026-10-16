# Owner catalog photo replacement and detach

This slice (PU2.4c) wires photo replacement and detach into the owner catalog editor. It reuses the
trusted photo pieces instead of reimplementing them:

- `apps/web/app/lib/product-photo-service.ts` — the versioned compare-and-swap change service.
- `apps/web/app/lib/product-photo-http.ts` — the trusted HTTP handler.
- `apps/web/app/owner/catalog/items/[itemId]/photo/route.ts` — the existing `PUT`/`DELETE` route.

The public rendering of photos is a separate slice (PU2.5) and is not part of this unit.

## Owner flow

Each product row in `/owner/catalog` shows its honest photo state from
`photo_path`/`photo_version`: `Con foto (versión N)` or `Sin foto (versión N)`. A missing photo
stays a missing photo — there is no placeholder food image.

- **Reemplazar foto** sends `PUT /owner/catalog/items/<itemId>/photo` with the raw image bytes and
  the current `X-Photo-Version`.
- **Quitar foto** sends `DELETE` with the same header and no body.

The editor is a small client component (`photo-editor-client.tsx`); the pure plan/outcome helpers
live in `photo-editor.ts` so they are testable without a browser or a database.

## Compare-and-swap, never a silent overwrite

The server-rendered version is the source of truth, so every request carries it. The endpoint and
the trusted service re-check ownership and the expected version before any write. A lost race
returns `409 conflict`; the editor shows *"Otra pestaña o dispositivo cambió la foto. Actualizamos
el estado: volvé a intentar."* and refreshes the page instead of overwriting a newer photo.

## Outcomes the owner sees

| Endpoint | Editor outcome | Message |
| --- | --- | --- |
| `200` with path | `replaced` | `Foto actualizada (versión N).` |
| `200` without path | `detached` | `Foto quitada. El producto vuelve a mostrarse sin imagen.` |
| `401` | `unauthorized` | `Tu sesión no está activa. Iniciá sesión de nuevo.` |
| `404` | `not_found` | `No encontramos ese producto en tu negocio.` |
| `409` | `conflict` | the stale-version message above |
| `413` | `input_too_large` | `La imagen supera el máximo permitido.` |
| `422` | `invalid_image` | `El archivo no es una imagen válida. Probá con PNG, JPEG o WebP.` |
| `400` | `invalid_input` | `No pudimos interpretar el cambio de foto. Volvé a intentar.` |
| other | `unavailable` | `No pudimos guardar la foto. Intentá de nuevo más tarde.` |

Every rejection writes nothing: no normalization, no upload and no commit.

## Verification boundary

- Focused tests: `node --test apps/web/tests/owner-catalog-photo.test.ts` (10 cases) drive the
  editor plan and outcome helpers through the real HTTP handler with injected ports: missing
  session, unknown/foreign item, invalid image, oversized image, stale version, Storage failure and
  a successful replace and detach.
- The existing route contract and its tests are unchanged.
- A bounded local end-to-end proof lives at
  `supabase/tests/storage/product-photo-replacement.test.mjs`. It needs the trusted RPCs
  `get_owned_product_photo` and `commit_product_photo`, which are **not migrations**: applying
  `supabase/operations/trusted_product_photo_storage.sql` to the local stack provisions them, and a
  later `supabase db reset` removes that contract again. Its local presence is deliberately
  transient. No migration was added or changed.
- The operations file is applied locally with its function/privilege statements only
  (`sed -n '1,149p;167,168p' supabase/operations/trusted_product_photo_storage.sql | psql`), because
  its plain `storage.buckets` insert must fail rather than overwrite the local bucket that migration
  `20260929042104` already created.
- The RPCs are `SECURITY INVOKER`, so the calling role needs table privileges. Local `service_role`
  lacks them, so the proof also applies a **local-only** completion
  (`GRANT SELECT, UPDATE ON public.catalog_items TO service_role;` and
  `GRANT SELECT, UPDATE ON public.businesses TO service_role;`). The operations file does not grant
  these; whether the hosted project needs the same grant is unverified and the hosted project was
  not contacted. `supabase db reset` removes the functions, the grants and the local proof state.
- Hosted behaviour, public rendering and any cleanup of retained objects remain outside this unit.
