export default function AuthErrorPage() {
  return (
    <main className="grid min-h-screen place-items-center px-6 py-12">
      <section className="w-full max-w-md rounded-2xl border border-[var(--line)] bg-white p-7" role="alert">
        <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--olive)]">Autenticación</p>
        <h1 className="mt-3 text-2xl font-[750] tracking-[-0.06em]">No pudimos confirmar el enlace</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          El enlace puede haber vencido o ya haber sido utilizado. Volvé al inicio para continuar.
        </p>
        <a
          className="mt-6 inline-flex rounded-lg bg-[var(--forest)] px-4 py-3 text-sm font-extrabold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--olive)]"
          href="/"
        >
          Volver al inicio
        </a>
      </section>
    </main>
  );
}
