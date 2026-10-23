"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AsyncActionButton } from "@/app/components/async-action-button";
// @ts-expect-error Native Node tests require an explicit TypeScript extension.
import { describePhotoState, photoEditMessage, photoEditOutcome, planPhotoEdit, type PhotoEditOperation } from "./photo-editor.ts";

type PhotoEditorProps = {
  itemId: string;
  itemName: string;
  photoPath: string | null;
  photoVersion: string;
};

const control =
  "min-h-9 rounded-lg border border-[var(--olive)] px-3 py-1.5 text-xs font-extrabold text-[var(--olive)] disabled:opacity-50";

/**
 * Owner-only photo replace/detach. The server-rendered version is the source of
 * truth, so every request carries it and a compare-and-swap conflict refreshes
 * the page instead of silently overwriting a newer photo.
 */
export function PhotoEditor({ itemId, itemName, photoPath, photoVersion }: PhotoEditorProps) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<PhotoEditOperation | null>(null);
  const [lockedVersion, setLockedVersion] = useState<string | null>(null);
  const [unknown, setUnknown] = useState(false);
  const lock = useRef<{ pending: boolean; version: string | null }>({ pending: false, version: null });
  const locked = lockedVersion === photoVersion;

  async function submit(operation: PhotoEditOperation) {
    if (lock.current.pending || lock.current.version === photoVersion) return;
    const image = operation === "replace" ? fileRef.current?.files?.[0] : undefined;
    if (operation === "replace" && !image) {
      setMessage("Elegí un archivo de imagen primero.");
      return;
    }
    const plan = planPhotoEdit({
      itemId,
      expectedVersion: photoVersion,
      operation,
      ...(image ? { image } : {}),
    });
    if (!plan.ok) {
      setMessage(photoEditMessage({ kind: "invalid_input" }));
      return;
    }

    // A ref closes the same-tick gap before React renders disabled controls.
    lock.current = { pending: true, version: photoVersion };
    setPending(operation); setMessage(null); setUnknown(false);
    const uncertain = () => {
      setLockedVersion(photoVersion); setUnknown(true);
      setMessage("No sabemos si se guardó la foto. No repitas el envío: actualizá para consultar el estado.");
    };
    try {
      const response = await fetch(plan.url, {
        method: plan.method,
        headers: plan.headers,
        ...(plan.body !== undefined ? { body: plan.body } : {}),
      });
      const outcome = await photoEditOutcome(response);
      const invalidReference = (outcome.kind === "replaced" || outcome.kind === "detached") &&
        (typeof outcome.photoVersion !== "string" || !/^(0|[1-9][0-9]{0,18})$/.test(outcome.photoVersion) ||
          (outcome.kind === "replaced" ? typeof outcome.photoPath !== "string" : outcome.photoPath !== null));
      if (response.status >= 500 || outcome.kind === "unavailable" || invalidReference) {
        // The helper cannot prove a no-write result for provider failures.
        uncertain();
      } else {
        setMessage(photoEditMessage(outcome));
        if (outcome.kind === "replaced" || outcome.kind === "detached" || outcome.kind === "conflict") {
          setLockedVersion(photoVersion);
          if (fileRef.current) fileRef.current.value = "";
          router.refresh();
        } else {
          // Explicit validation/auth/not-found denials are safe to correct and retry.
          lock.current.version = null;
        }
      }
    } catch {
      uncertain();
    } finally {
      lock.current.pending = false;
      setPending(null);
    }
  }

  return (
    <div className="mt-3 border-t border-[var(--line)] pt-3">
      <p className="text-xs text-[var(--muted)]">{describePhotoState({ photoPath, photoVersion })}</p>
      {photoPath ? (
        <p className="mt-1 break-all font-mono text-[0.65rem] text-[var(--muted)]">{photoPath}</p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          accept="image/png,image/jpeg,image/webp"
          aria-label={`Foto de ${itemName}`}
          className="max-w-full text-xs"
          ref={fileRef}
          type="file"
          disabled={pending !== null || locked}
        />
        <AsyncActionButton className={control} pending={pending === "replace"} locked={pending !== null || locked} pendingLabel="Adjuntando foto…" onClick={() => submit("replace")} type="button">
          Reemplazar foto
        </AsyncActionButton>
        {photoPath ? (
          <AsyncActionButton className={control} pending={pending === "detach"} locked={pending !== null || locked} pendingLabel="Quitando foto…" onClick={() => submit("detach")} type="button">
            Quitar foto
          </AsyncActionButton>
        ) : null}
      </div>
      {locked && <a className="mt-2 inline-block text-xs underline" href="/owner/catalog">{unknown ? "Actualizar estado" : "Actualizar catálogo"} (solo lectura)</a>}
      {message ? (
        <p className="mt-2 text-xs leading-5 text-[var(--muted)]" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
