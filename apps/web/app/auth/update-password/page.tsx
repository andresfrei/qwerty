import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  parseRecoverySigningKey,
  RECOVERY_PROOF_COOKIE_NAME,
  verifyRecoveryProof,
} from "@/app/lib/supabase/recovery-proof";
import { createClient } from "@/app/lib/supabase/server";

export const dynamic = "force-dynamic";

type UpdatePasswordPageProps = {
  searchParams?: Promise<{ status?: string | string[] }>;
};

const statusMessages = {
  invalid: "Las contraseñas deben coincidir y tener entre 8 y 256 caracteres.",
  unavailable: "No pudimos actualizar la contraseña ahora. Volvé a intentar desde un enlace de recuperación nuevo.",
} as const;

type UpdatePasswordStatus = keyof typeof statusMessages;

type RecoveryUserResult = {
  data: { user: { id: string; email_confirmed_at?: string | null } | null };
  error: unknown | null;
};

type RecoveryClaimsResult = {
  data: { claims: unknown } | null;
  error: unknown | null;
};

function hasValidRecoveryProof(
  userResult: RecoveryUserResult,
  claimsResult: RecoveryClaimsResult,
  proof: string | undefined,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  const user = userResult.data.user;
  const claims = claimsResult.data?.claims;
  if (
    userResult.error
    || claimsResult.error
    || !user?.email_confirmed_at
    || typeof claims !== "object"
    || claims === null
  ) return false;

  const verifiedClaims = claims as Record<string, unknown>;
  const sessionId = verifiedClaims.session_id;
  const expiration = verifiedClaims.exp;
  if (
    verifiedClaims.sub !== user.id
    || typeof sessionId !== "string"
    || sessionId.length === 0
    || typeof expiration !== "number"
    || !Number.isSafeInteger(expiration)
    || expiration <= nowSeconds
  ) return false;

  const signingKey = process.env.QWERTY_RECOVERY_SIGNING_KEY;
  return parseRecoverySigningKey(signingKey) !== null
    && verifyRecoveryProof(proof, user.id, sessionId, signingKey, nowSeconds);
}

function getStatus(value: unknown): UpdatePasswordStatus | null {
  if (typeof value !== "string") return null;
  return Object.hasOwn(statusMessages, value) ? value as UpdatePasswordStatus : null;
}

export default async function UpdatePasswordPage({ searchParams }: UpdatePasswordPageProps) {
  const params = await searchParams;
  const status = getStatus(params?.status);
  const supabase = await createClient();

  if (!supabase) {
    return <UpdatePasswordUnavailable message={statusMessages.unavailable} />;
  }

  const proof = (await cookies()).get(RECOVERY_PROOF_COOKIE_NAME)?.value;
  let userResult: Awaited<ReturnType<typeof supabase.auth.getUser>>;
  let claimsResult: Awaited<ReturnType<typeof supabase.auth.getClaims>>;
  try {
    [userResult, claimsResult] = await Promise.all([
      supabase.auth.getUser(),
      supabase.auth.getClaims(),
    ]);
  } catch {
    redirect("/auth/forgot-password?status=link-required");
  }

  if (!hasValidRecoveryProof(userResult, claimsResult, proof)) {
    redirect("/auth/forgot-password?status=link-required");
  }

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
        <h1 className="mt-3 text-3xl font-[750] tracking-[-0.06em]">Elegí una nueva contraseña</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          Tu enlace de recuperación reciente fue verificado. Al guardar tendrás que entrar de nuevo. Las demás sesiones dejarán de renovarse, pero un acceso ya emitido puede seguir válido hasta una hora.
        </p>

        {status && (
          <p className="mt-5 rounded-lg bg-[var(--transfer-bg)] px-4 py-3 text-sm leading-5 text-[var(--transfer-text)]" role="alert" aria-live="polite">
            {statusMessages[status]}
          </p>
        )}

        <form className="mt-7 grid gap-5" action="/auth/update-password/submit" method="post">
          <div className="grid gap-2">
            <label className="text-sm font-extrabold" htmlFor="update-password-password">Nueva contraseña</label>
            <input
              className="min-h-12 rounded-lg border border-[var(--line)] bg-[var(--cream)] px-3 text-base outline-none focus:border-[var(--olive)] focus:ring-2 focus:ring-[var(--soft-lime)]"
              id="update-password-password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={256}
              required
            />
            <span className="text-xs leading-5 text-[var(--muted)]">Usá entre 8 y 256 caracteres.</span>
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-extrabold" htmlFor="update-password-confirmation">Confirmá tu nueva contraseña</label>
            <input
              className="min-h-12 rounded-lg border border-[var(--line)] bg-[var(--cream)] px-3 text-base outline-none focus:border-[var(--olive)] focus:ring-2 focus:ring-[var(--soft-lime)]"
              id="update-password-confirmation"
              name="password_confirmation"
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={256}
              required
            />
          </div>
          <button
            className="min-h-12 rounded-lg bg-[var(--forest)] px-4 py-3 text-sm font-extrabold text-white transition-colors hover:bg-[var(--olive)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--olive)]"
            type="submit"
          >
            Guardar contraseña
          </button>
        </form>
        <p className="mt-7 text-center text-sm text-[var(--muted)]">
          ¿Necesitás empezar de nuevo?{" "}
          <Link className="font-extrabold text-[var(--olive)] underline decoration-[var(--lime)] decoration-2 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--olive)]" href="/auth/forgot-password">
            Pedí otro enlace
          </Link>
        </p>
      </section>
    </main>
  );
}

function UpdatePasswordUnavailable({ message }: { message: string }) {
  return (
    <main className="grid min-h-screen place-items-center px-5 py-10 sm:px-8">
      <section className="w-full max-w-md rounded-2xl border border-[var(--line)] bg-white p-6 shadow-[0_1.5rem_3rem_rgb(40_47_37_/_8%)] sm:p-8" role="alert">
        <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--olive)]">Recuperar acceso</p>
        <h1 className="mt-3 text-3xl font-[750] tracking-[-0.06em]">No podemos verificar la recuperación</h1>
        <p className="mt-5 rounded-lg bg-[var(--transfer-bg)] px-4 py-3 text-sm leading-5 text-[var(--transfer-text)]" aria-live="polite">
          {message}
        </p>
      </section>
    </main>
  );
}
