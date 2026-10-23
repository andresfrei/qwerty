'use client';

import type { ButtonHTMLAttributes } from "react";

export type AsyncActionButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  children: string;
  pendingLabel: string;
  pending: boolean;
  locked?: boolean;
};

/** Presentation only: the caller owns the synchronous guard and every outcome. */
export function AsyncActionButton({ children, pendingLabel, pending, locked = false, disabled = false, className = "", type = "button", ...props }: AsyncActionButtonProps) {
  return <>
    <button {...props} type={type} className={`async-action ${className}`} disabled={disabled || locked || pending} aria-busy={pending}>
      <span className="async-action-content">
        <span aria-hidden="true" className="async-action-reserve">{children}</span>
        <span aria-hidden="true" className="async-action-reserve">{pendingLabel}</span>
        <span className="async-action-label">{pending ? pendingLabel : children}</span>
        {pending && <span aria-hidden="true" className="async-action-spinner" />}
      </span>
    </button>
    <span className="async-action-status" role="status" aria-live="polite" aria-atomic="true">{pending ? pendingLabel : ""}</span>
  </>;
}
