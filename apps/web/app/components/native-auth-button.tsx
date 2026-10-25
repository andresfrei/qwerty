import type { ButtonHTMLAttributes } from "react";

type NativeAuthButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "type" | "aria-busy"> & {
  children: string;
  pendingLabel: string;
};

/** Render native feedback up front: root discovery must not rewrite hydration input. */
export function NativeAuthButton({ children, pendingLabel, className = "", ...props }: NativeAuthButtonProps) {
  return <>
    <button {...props} type="submit" className={`async-action ${className}`} data-native-auth-feedback="" aria-busy={false}>
      <span className="async-action-content">
        <span aria-hidden="true" className="async-action-reserve">{children}</span>
        <span aria-hidden="true" className="async-action-reserve">{pendingLabel}</span>
        <span className="async-action-label">{children}</span>
      </span>
    </button>
    <span data-native-auth-feedback-status="" className="async-action-status" role="status" aria-live="polite" aria-atomic="true" />
  </>;
}
