"use client";
import Link from "next/link";
import { createContext, useContext, useSyncExternalStore, type ComponentProps } from "react";
import { catalogInspectionHref } from "./catalog-form-lifecycle";
import type { CatalogFormSession } from "./catalog-form-session";

export const CatalogSessionContext = createContext<CatalogFormSession | null>(null);
CatalogSessionContext.displayName = "CatalogFormSession";
const installed = new WeakMap<Window, () => void>();
type NativeExit =
  | { kind: "logout"; event: SubmitEvent; form: HTMLFormElement }
  | { kind: "auth" | "saved"; event: MouseEvent; anchor: Element };

/** Kept for the document lifetime, including programmatic exits from Catalog. */
export function installCatalogFormNavigation(session: CatalogFormSession, host: Window): () => void {
  const previous = installed.get(host);
  if (previous) return previous;
  let exit: NativeExit | undefined;
  const self = (target: string | null) => !target || target.toLowerCase() === "_self";
  const logoutURL = (value: string) => {
    try {
      const current = new URL(host.location.href), destination = new URL(value, current);
      return destination.origin === current.origin && destination.pathname === "/auth/logout" &&
        !destination.search && !destination.hash;
    } catch { return false; }
  };
  function allowed(candidate: NativeExit): boolean {
    const { event } = candidate;
    if (!event.isTrusted || event.defaultPrevented) return false;
    if (candidate.kind === "logout") {
      const { form } = candidate;
      const submitter = candidate.event.submitter;
      return form.method.toLowerCase() === "post" && self(form.target) && logoutURL(form.action) &&
        !["formaction", "formmethod", "formtarget"].some(name => submitter?.hasAttribute(name));
    }
    const { anchor } = candidate, click = candidate.event;
    if (click.button !== 0 || click.ctrlKey || click.metaKey || click.shiftKey || click.altKey ||
      !self(anchor.getAttribute("target")) || anchor.hasAttribute("download")) return false;
    const href = anchor.getAttribute("href") ?? "";
    if (candidate.kind === "auth") return logoutURL(href);
    const businessId = anchor.getAttribute("data-catalog-confirmed-get");
    return !!businessId && session.canLeaveSaved({ inspectionHref: href, businessId });
  }
  const click = (event: MouseEvent) => {
    exit = undefined;
    const anchor = (event.target as Element | null)?.closest?.("a[href]");
    const href = anchor?.getAttribute("href");
    if (!anchor || !href) return;
    const candidate: NativeExit = { kind: "auth", event, anchor };
    if (allowed(candidate)) { exit = candidate; return; }
    if (anchor.hasAttribute("data-catalog-confirmed-get")) {
      const confirmed: NativeExit = { kind: "saved", event, anchor };
      if (allowed(confirmed)) exit = confirmed;
      else event.preventDefault();
      return;
    }
    const businessId = anchor.getAttribute("data-catalog-inspection");
    const inspection = businessId ? { inspectionHref: href, businessId } : undefined;
    if ((session.locked() || inspection) && (!event.isTrusted || event.button !== 0 ||
      event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || !self(anchor.getAttribute("target")))) {
      event.preventDefault(); return;
    }
    if (!session.navigate(inspection)) event.preventDefault();
  };
  const submit = (event: Event) => {
    exit = undefined;
    const form = event.target as HTMLFormElement;
    const candidate: NativeExit = { kind: "logout", event: event as SubmitEvent, form };
    if (allowed(candidate)) exit = candidate;
    // Other POSTs keep their existing behavior, but get no unload exemption.
    if (form.method?.toLowerCase() === "get" && session.locked()) event.preventDefault();
  };
  const leave = (event: BeforeUnloadEvent) => {
    const candidate = exit;
    exit = undefined;
    // Recheck the SAME native event after later listeners/default-action decisions.
    // Standard native navigation consumes this before its request can fail.
    if (candidate && allowed(candidate)) return;
    if (session.locked()) { event.preventDefault(); event.returnValue = ""; }
  };
  host.addEventListener("click", click, true);
  host.addEventListener("auxclick", click, true);
  host.addEventListener("submit", submit, true);
  host.addEventListener("beforeunload", leave);
  const cleanup = () => {
    exit = undefined;
    host.removeEventListener("click", click, true); host.removeEventListener("auxclick", click, true);
    host.removeEventListener("submit", submit, true); host.removeEventListener("beforeunload", leave);
    installed.delete(host);
  };
  installed.set(host, cleanup); return cleanup;
}

type LinkProps = Omit<ComponentProps<typeof Link>, "onNavigate"> & { inspectionBusinessId?: string };
export function CatalogLink({ inspectionBusinessId, ...props }: LinkProps) {
  const session = useContext(CatalogSessionContext);
  const href = typeof props.href === "string" ? props.href : "";
  return <Link {...props} data-catalog-inspection={inspectionBusinessId} onNavigate={event => {
    const inspection = inspectionBusinessId ? { inspectionHref: href, businessId: inspectionBusinessId } : undefined;
    if (session && !session.navigate(inspection)) event.preventDefault();
  }} />;
}
export function CatalogInspectionLink({ href, businessId, children = "Consultar catálogo", onClick }: { href: string; businessId: string; children?: React.ReactNode; onClick?: React.MouseEventHandler<HTMLAnchorElement> }) {
  const session = useContext(CatalogSessionContext);
  if (!session) throw new Error("catalog_form_scope_required");
  useSyncExternalStore(session.subscribe, session.version, session.version);
  if (!catalogInspectionHref(href, businessId)) throw new Error("invalid_catalog_inspection");
  if (session.canLeaveSaved({ inspectionHref: href, businessId })) {
    return <a href={href} data-catalog-confirmed-get={businessId} onClick={onClick} className="font-extrabold underline">Consultar catálogo</a>;
  }
  return <CatalogLink href={href} inspectionBusinessId={businessId} prefetch={false} onClick={onClick} className="font-extrabold underline">{children}</CatalogLink>;
}
