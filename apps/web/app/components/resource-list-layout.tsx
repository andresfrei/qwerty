import type { ReactNode } from "react";

export type ResourceListLayoutProps = {
  titleId: string;
  title: string;
  context?: ReactNode;
  toolbar: ReactNode;
  footer: ReactNode;
  children: ReactNode;
};

/** Composition only: each resource retains its own data, links and operations. */
export function ResourceListLayout({ titleId, title, context, toolbar, footer, children }: ResourceListLayoutProps) {
  return <section aria-labelledby={titleId} className="flex min-w-0 flex-1 flex-col gap-6">
    <header className="shrink-0">
      {context && <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--olive)]">{context}</p>}
      <h1 id={titleId} className="mt-2 text-3xl font-[750] tracking-[-0.05em] sm:text-4xl">{title}</h1>
    </header>
    <div className="flex min-w-0 flex-1 flex-col rounded-2xl border border-[var(--line)] bg-white">
      <div className="shrink-0 border-b border-[var(--line)] p-4 sm:p-5">{toolbar}</div>
      <div className="min-w-0 flex-1">{children}</div>
      <footer className="shrink-0 border-t border-[var(--line)] px-4 py-4 sm:px-5">{footer}</footer>
    </div>
  </section>;
}
