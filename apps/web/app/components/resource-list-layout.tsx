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
  return <section aria-labelledby={titleId} className="grid min-w-0 gap-6">
    <header>
      {context && <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--olive)]">{context}</p>}
      <h1 id={titleId} className="mt-2 text-3xl font-[750] tracking-[-0.05em] sm:text-4xl">{title}</h1>
    </header>
    <div className="min-w-0 rounded-2xl border border-[var(--line)] bg-white">
      <div className="border-b border-[var(--line)] p-4 sm:p-5">{toolbar}</div>
      {children}
      <footer className="border-t border-[var(--line)] px-4 py-4 sm:px-5">{footer}</footer>
    </div>
  </section>;
}
