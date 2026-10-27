import Link from "next/link";
import { getAccessStatus, type AccessStatusKey } from "@/app/auth/access-validation";
type SignupPageProps = {
  searchParams?: Promise<{ status?: string | string[] }>;
};
const statusMessages: Partial<Record<AccessStatusKey, string>> = {
  invalid: "No pudimos crear la cuenta con esos datos. Revisá el email y la contraseña e intentá de nuevo.",
  unavailable: "El registro local no está disponible ahora. Revisá la configuración de Supabase.",
  "check-email": "Revisá el canal de confirmación configurado. Si no aparece un mensaje, intentá de nuevo.",
};
export default async function SignupPage({ searchParams }: SignupPageProps) {
  const params = await searchParams;
  const status = getAccessStatus(params?.status);
  const message = status ? statusMessages[status] : undefined;
  const isError = status === "invalid" || status === "unavailable";
  return (
    <main className="grid min-h-screen place-items-center px-5 py-10 sm:px-8">
      <section className="w-full max-w-md rounded-2xl border border-[var(--line)] bg-white p-6 shadow-[0_1.5rem_3rem_rgb(40_47_37_/_8%)] sm:p-8">
        <Link
          className="text-[1.4rem] font-[750] tracking-[-0.08em] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--olive)]"
          href="/"
        >
          qwerty
        </Link>
        <p className="mt-8 text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--olive)]">Acceso de dueño</p>
        <h1 className="mt-3 text-3xl font-[750] tracking-[-0.06em]">Creá tu acceso</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          Registrate con un email real. Primero vas a tener que confirmarlo para entrar.
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
        <form className="mt-7 grid gap-5" action="/auth/signup/submit" method="post">
          <div className="grid gap-2">
            <label className="text-sm font-extrabold" htmlFor="signup-email">Email</label>
            <input
              className="min-h-12 rounded-lg border border-[var(--line)] bg-[var(--cream)] px-3 text-base outline-none focus:border-[var(--olive)] focus:ring-2 focus:ring-[var(--soft-lime)]"
              id="signup-email"
              name="email"
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              required
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-extrabold" htmlFor="signup-password">Contraseña</label>
            <input
              className="min-h-12 rounded-lg border border-[var(--line)] bg-[var(--cream)] px-3 text-base outline-none focus:border-[var(--olive)] focus:ring-2 focus:ring-[var(--soft-lime)]"
              id="signup-password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
            <span className="text-xs leading-5 text-[var(--muted)]">Usá al menos 8 caracteres.</span>
          </div>
          <button
            className="min-h-12 rounded-lg bg-[var(--forest)] px-4 py-3 text-sm font-extrabold text-white transition-colors hover:bg-[var(--olive)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--olive)]"
            type="submit"
          >
            Crear acceso
          </button>
        </form>
        <p className="mt-7 text-center text-sm text-[var(--muted)]">
          ¿Ya tenés una cuenta?{" "}
          <Link className="font-extrabold text-[var(--olive)] underline decoration-[var(--lime)] decoration-2 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--olive)]" href="/auth/login">
            Entrá
          </Link>
        </p>
      </section>
    </main>
  );
}
