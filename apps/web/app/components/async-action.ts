'use client';

import { useEffect } from "react";

export function NativeFormFeedback() {
  useEffect(() => enhanceNativeAuthForms(document), []);
  return null;
}

const pendingLabels: Readonly<Record<string, string>> = {
  "/auth/login/submit": "Ingresando…",
  "/auth/signup/submit": "Creando cuenta…",
  "/auth/forgot-password/submit": "Enviando enlace…",
  "/auth/update-password/submit": "Actualizando contraseña…",
  "/auth/logout": "Cerrando sesión…",
};

type Control = HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement | HTMLFieldSetElement;
type Decoration = { button: HTMLButtonElement; nodes: Node[]; content: HTMLElement; label: HTMLElement; idle: string; className: string | null; busy: string | null; preRendered: boolean };
type Feedback = { decorations: Decoration[]; status: HTMLElement; ownsStatus: boolean; pending: boolean; controls: Map<Control, boolean> };

function operation(form: HTMLFormElement, submitter?: HTMLElement | null) {
  const action = submitter?.getAttribute("formaction") ?? form.getAttribute("action") ?? "";
  const method = submitter?.getAttribute("formmethod") ?? form.method;
  const url = new URL(action, form.ownerDocument.baseURI);
  return method.toLowerCase() === "post" && url.origin === form.ownerDocument.location.origin && !url.search && !url.hash ? pendingLabels[url.pathname] : undefined;
}

/** Native navigation only. Never reads field values or constructs a request. */
export function enhanceNativeAuthForms(doc: Document): () => void {
  const forms = new Map<HTMLFormElement, Feedback>();
  const win = doc.defaultView;
  if (!win) return () => {};
  function span(className: string, text = "") {
    const node = doc.createElement("span");
    node.className = className;
    node.textContent = text;
    return node;
  }
  function restoreAttribute(node: Element, name: string, value: string | null) {
    if (value === null) node.removeAttribute(name); else node.setAttribute(name, value);
  }
  function restore(feedback: Feedback) {
    if (!feedback.pending) return;
    for (const [control, disabled] of feedback.controls) control.disabled = disabled;
    feedback.controls.clear();
    feedback.pending = false;
    feedback.status.textContent = "";
    for (const decoration of feedback.decorations) {
      decoration.label.replaceChildren(...decoration.nodes);
      decoration.content.querySelector(".async-action-spinner")?.remove();
      restoreAttribute(decoration.button, "aria-busy", decoration.busy);
    }
  }
  function serialize(event: Event) {
    const feedback = forms.get(event.target as HTMLFormElement);
    if (!feedback?.pending) return;
    // formdata fires AFTER the browser constructs its native entry list.
    // Do not inspect event.formData, including passwords/hidden inputs.
    for (const control of feedback.controls.keys()) control.disabled = true;
  }
  function release(form: HTMLFormElement, feedback: Feedback) {
    restore(feedback);
    form.removeEventListener("formdata", serialize);
    if (feedback.ownsStatus) feedback.status.remove();
    for (const { button, nodes, className, preRendered } of feedback.decorations) {
      if (!preRendered) {
        button.replaceChildren(...nodes);
        restoreAttribute(button, "class", className);
      }
    }
    forms.delete(form);
  }
  function scan() {
    // The root mount survives Next client navigation; detached forms must not.
    for (const [form, feedback] of forms) {
      if (!form.isConnected || form.ownerDocument !== doc) release(form, feedback);
    }
    for (const form of Array.from(doc.forms)) {
      const pendingLabel = operation(form);
      if (!pendingLabel || forms.has(form)) continue;
      const decorations: Decoration[] = [];
      for (const control of Array.from(form.elements)) {
        if (control.tagName !== "BUTTON") continue;
        const button = control as HTMLButtonElement;
        if (button.type !== "submit" || operation(form, button) !== pendingLabel) continue;
        const preRendered = button.hasAttribute("data-native-auth-feedback");
        let content: HTMLElement;
        let label: HTMLElement;
        if (preRendered) {
          const existingContent = button.querySelector<HTMLElement>(".async-action-content");
          const existingLabel = existingContent?.querySelector<HTMLElement>(".async-action-label");
          if (!existingContent || !existingLabel) continue;
          content = existingContent;
          label = existingLabel;
        } else {
          content = span("async-action-content");
          label = span("async-action-label");
        }
        const idle = (preRendered ? label : button).textContent ?? "";
        const nodes = Array.from((preRendered ? label : button).childNodes);
        const className = button.getAttribute("class");
        if (!preRendered) {
          for (const text of [idle, pendingLabel]) {
            const reserve = span("async-action-reserve", text);
            reserve.setAttribute("aria-hidden", "true");
            content.append(reserve);
          }
          label.append(...nodes);
          content.append(label);
          button.classList.add("async-action");
          button.append(content);
        }
        decorations.push({ button, nodes, content, label, idle, className, busy: button.getAttribute("aria-busy"), preRendered });
      }
      if (!decorations.length) continue;
      const existingStatus = form.querySelector<HTMLElement>("[data-native-auth-feedback-status]");
      const status = existingStatus ?? span("async-action-status");
      if (!existingStatus) {
        status.setAttribute("role", "status");
        status.setAttribute("aria-live", "polite");
        status.setAttribute("aria-atomic", "true");
        form.append(status);
      }
      forms.set(form, { decorations, status, ownsStatus: !existingStatus, pending: false, controls: new Map() });
      form.addEventListener("formdata", serialize);
    }
  }
  function submit(event: SubmitEvent) {
    const form = event.target as HTMLFormElement;
    const feedback = forms.get(form);
    const pendingLabel = operation(form, event.submitter);
    if (!feedback || !pendingLabel || event.defaultPrevented) return;
    if (feedback.pending) { event.preventDefault(); return; }
    // A native submit event follows browser validation. The first POST is never cancelled.
    feedback.pending = true;
    for (const control of Array.from(form.elements)) {
      if ("disabled" in control) feedback.controls.set(control as Control, (control as Control).disabled);
    }
    const decoration = feedback.decorations.find(({ button }) => button === event.submitter) ?? feedback.decorations[0];
    decoration.label.textContent = pendingLabel;
    decoration.button.setAttribute("aria-busy", "true");
    const spinner = span("async-action-spinner");
    spinner.setAttribute("aria-hidden", "true");
    decoration.content.append(spinner);
    feedback.status.textContent = pendingLabel;
  }
  function pageshow() { for (const feedback of forms.values()) restore(feedback); scan(); }
  scan();
  const observer = new MutationObserver(scan);
  observer.observe(doc.body, { childList: true, subtree: true });
  doc.addEventListener("submit", submit);
  win.addEventListener("pageshow", pageshow);
  return () => {
    observer.disconnect();
    doc.removeEventListener("submit", submit);
    win.removeEventListener("pageshow", pageshow);
    for (const [form, feedback] of forms) release(form, feedback);
  };
}
