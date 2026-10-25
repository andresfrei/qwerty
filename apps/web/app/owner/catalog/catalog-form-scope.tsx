"use client";
import { createContext, Suspense, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { CatalogClassicForm } from "./catalog-form-view";
import { CatalogSessionContext, installCatalogFormNavigation } from "./catalog-form-navigation";
import { catalogFormSessionFor, createCatalogFormSession, type CatalogFormIntent,
  type CatalogFormPage, type CatalogFormSession, type CatalogMountedForm } from "./catalog-form-session";

const PageContext = createContext<CatalogFormPage | null>(null);
PageContext.displayName = "CatalogFormPage";
function useSession(): CatalogFormSession {
  const session = useContext(CatalogSessionContext);
  if (!session) throw new Error("catalog_form_scope_required");
  // A numeric revision avoids depending on the gate snapshot's object identity.
  useSyncExternalStore(session.subscribe, session.version, session.version);
  return session;
}
export function CatalogFormProvider({ children }: { children: ReactNode }) {
  const [session] = useState(() => typeof window === "undefined" ? createCatalogFormSession() : catalogFormSessionFor(window));
  useEffect(() => {
    // Idempotent across effect replay. RAM state/leave warnings outlive layout exits.
    installCatalogFormNavigation(session, window);
  }, [session]);
  return <CatalogSessionContext.Provider value={session}>
    <Suspense fallback={<p>Consultando catálogo (solo lectura)…</p>}><CatalogRouteBoundary>{children}</CatalogRouteBoundary></Suspense>
  </CatalogSessionContext.Provider>;
}
export function CatalogRouteBoundary({ children }: { children: ReactNode }) {
  const session = useSession(), pathname = usePathname();
  // The frozen legacy root has no frame. Never let history/programmatic arrival bypass it.
  if (session.locked() && (!pathname || pathname.replace(/\/$/, "") === "/owner/catalog")) {
    return <p role="status">Consultá las secciones de catálogo en modo solo lectura. No repitas el envío.</p>;
  }
  return children;
}

export type CatalogFormFrameProps = { page: CatalogFormPage; readOnly: ReactNode; editable: ReactNode };
/** All classic/photo/profile editors belong ONLY in editable, never readOnly. */
export function CatalogFormFrame({ page, readOnly, editable }: CatalogFormFrameProps) {
  const session = useSession();
  const { accountId, businessId, readKey } = page;
  const mode = session.mode(page), snapshot = session.snapshot();
  return <PageContext.Provider value={page}>
    {snapshot.message && <p role="status" className="text-sm font-bold">{snapshot.message}</p>}
    {mode === "read-only" ? readOnly : <fieldset key={JSON.stringify([accountId, businessId, readKey])}
      disabled={snapshot.state !== "idle"} className="grid min-w-0 gap-4">{editable}</fieldset>}
  </PageContext.Provider>;
}

export type CatalogScopedFormProps = {
  identity: CatalogFormIntent; title: string; pendingLabel: string; children: ReactNode; save?: string;
};
export function CatalogScopedForm({ identity, title, pendingLabel, children, save }: CatalogScopedFormProps) {
  const session = useSession(), page = useContext(PageContext);
  if (!page) throw new Error("catalog_form_frame_required");
  const { accountId, businessId, readKey } = page;
  const { action, target: { kind, id } } = identity;
  const identityKey = JSON.stringify([accountId, businessId, readKey, action, kind, id]);
  const [mounted, setMounted] = useState<{ identityKey: string; handle: CatalogMountedForm } | null>(null);
  useEffect(() => {
    const handle = session.mount({ accountId, businessId, readKey }, { action, target: { kind, id } });
    setMounted({ identityKey, handle });
    return () => handle.retire();
  }, [session, accountId, businessId, readKey, action, kind, id, identityKey]);
  const handle = mounted?.identityKey === identityKey ? mounted.handle : null;
  const snapshot = session.snapshot();
  return <CatalogClassicForm identityKey={handle?.key ?? identityKey} title={title} action={action}
    state={handle ? snapshot.state : "pending"} pending={!!handle && snapshot.pendingKey === handle.key}
    pendingLabel={pendingLabel} save={save} onSubmit={async event => {
      event.preventDefault();
      if (handle) await handle.submit(new FormData(event.currentTarget));
    }}>{children}</CatalogClassicForm>;
}
