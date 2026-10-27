import Link from "next/link";

type ForgotPasswordPageProps = {
  searchParams?: Promise<{ status?: string | string[] }>;
};

const statusMessages = {
  "check-email": "Si esta dirección tiene una cuenta y se pudo enviar el correo, revisá Mailpit local. Si no llega, intentá de nuevo.",
  "link-required": "Para cambiar la contraseña necesitás abrir un enlace de recuperación reciente. Pedí un enlace nuevo y abrilo desde el email.",
  invalid: "Ingresá una dirección de email válida para continuar.",
  unavailable: "La recuperación local no está disponible ahora. Revisá la configuración de Supabase.",
} as const;

type RecoveryStatus = keyof typeof statusMessages;

function getStatus(value: unknown): RecoveryStatus | null {
  if (typeof value !== "string") return null;
  return Object.hasOwn(statusMessages, value) ? value as RecoveryStatus : null;
}

export default async function ForgotPasswordPage({ searchParams }: ForgotPasswordPageProps) {
  const params = await searchParams;
  const status = getStatus(params?.status);
  const message = status ? statusMessages[status] : undefined;
  const isError = status === "link-required" || status === "invalid" || status === "unavailable";

  return (
    <main className="grid min-h-screen place-items-center px-5 py-10 sm:px-8">
      <section className="w-full max-w-md rounded-2xl border border-[var(--line)] bg-white p-6 shadow-[0_1.5rem_3rem_rgb(40_47_37_/_8%)] sm:p-8">
        <Link
          className="text-[1.4rem] font-[750] tracking-[-0.08em] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--olive)]"
          href="/"
        >
          qwerty
        </Link>
        <p className="mt-8 text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--olive)]">Recuperar acceso</p>
        <h1 className="mt-3 text-3xl font-[750] tracking-[-0.06em]">¿Olvidaste tu contraseña?</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          Escribí el email de tu cuenta y te contamos qué hacer después.
        </p>

        {message && (
          <p
            className={`mt-5 rounded-lg px-4 py-3 text-sm leading-5 ${isError ? "bg-[var(--transfer-bg)] text-[var(--transfer-text)]" : "bg-[var(--soft-lime)] text-[var(--olive)]"}`}
            role={isError ? "alert" : "status"}
            aria-live="polite"
          >
            {message}
          </p>
        )}
        <form className="mt-7 grid gap-5" action="/auth/forgot-password/submit" method="post">
          <div className="grid gap-2">
            <label className="text-sm font-extrabold" htmlFor="forgot-password-email">Email</label>
            <input
              className="min-h-12 rounded-lg border border-[var(--line)] bg-[var(--cream)] px-3 text-base outline-none focus:border-[var(--olive)] focus:ring-2 focus:ring-[var(--soft-lime)]"
              id="forgot-password-email"
              name="email"
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              required
            />
          </div>
          <button
            className="min-h-12 rounded-lg bg-[var(--forest)] px-4 py-3 text-sm font-extrabold text-white transition-colors hover:bg-[var(--olive)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--olive)]"
            type="submit"
          >
            Continuar
          </button>
        </form>
        <p className="mt-7 text-center text-sm text-[var(--muted)]">
          ¿Recordaste tu contraseña?{" "}
          <Link className="font-extrabold text-[var(--olive)] underline decoration-[var(--lime)] decoration-2 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--olive)]" href="/auth/login">
            Entrá
          </Link>
        </p>
      </section>
    </main>
  );
}
