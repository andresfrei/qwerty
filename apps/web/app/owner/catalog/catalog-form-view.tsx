"use client";
import type { FormEventHandler, ReactNode } from "react";
import { AsyncActionButton } from "@/app/components/async-action-button";
import type { CatalogFormSnapshot } from "./catalog-form-lifecycle";

export type CatalogClassicFormProps = {
  identityKey: string;
  title: string;
  action: string;
  state: CatalogFormSnapshot["state"];
  pending: boolean;
  pendingLabel: string;
  onSubmit: FormEventHandler<HTMLFormElement>;
  children: ReactNode;
  save?: string;
};

/** Fields only as children, never another form. Identity changes reset uncontrolled inputs. */
export function CatalogClassicForm({ identityKey, title, action, state, pending,
  pendingLabel, onSubmit, children, save = "Guardar" }: CatalogClassicFormProps) {
  return <form key={identityKey} method="post" action="/owner/catalog/actions" onSubmit={onSubmit}
    aria-label={title} className="grid gap-3 rounded-xl border border-[var(--line)] bg-[var(--cream)] p-4">
    <input type="hidden" name="action" value={action} />
    <h3 className="font-extrabold">{title}</h3>
    <fieldset disabled={state !== "idle"} className="grid min-w-0 gap-3 sm:grid-cols-2">
      {children}
      <AsyncActionButton className="min-h-11 rounded-lg bg-[var(--lime)] px-4 py-2 text-sm font-extrabold disabled:opacity-50"
        type="submit" pending={pending} locked={state !== "idle"} pendingLabel={pendingLabel}>{save}</AsyncActionButton>
    </fieldset>
  </form>;
}
