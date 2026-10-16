"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
  const [busy, setBusy] = useState(false);

  async function submit(operation: PhotoEditOperation) {
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

    setBusy(true);
    try {
      const response = await fetch(plan.url, {
        method: plan.method,
        headers: plan.headers,
        ...(plan.body !== undefined ? { body: plan.body } : {}),
      });
      const outcome = await photoEditOutcome(response);
      setMessage(photoEditMessage(outcome));
      if (outcome.kind === "replaced" || outcome.kind === "detached" || outcome.kind === "conflict") {
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
      }
    } catch {
      setMessage(photoEditMessage({ kind: "unavailable" }));
    } finally {
      setBusy(false);
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
        />
        <button className={control} disabled={busy} onClick={() => submit("replace")} type="button">
          Reemplazar foto
        </button>
        {photoPath ? (
          <button className={control} disabled={busy} onClick={() => submit("detach")} type="button">
            Quitar foto
          </button>
        ) : null}
      </div>
      {message ? (
        <p className="mt-2 text-xs leading-5 text-[var(--muted)]" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
