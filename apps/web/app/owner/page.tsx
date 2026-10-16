import Link from "next/link";
import { redirect } from "next/navigation";
import { accessRedirect } from "@/app/auth/access-validation";
import { createClient } from "@/app/lib/supabase/server";
type Business = {
  id: string;
  name: string;
};

export const dynamic = "force-dynamic";

export default async function OwnerPage() {
  const supabase = await createClient();
  if (!supabase) redirect(accessRedirect("/auth/login", "unavailable"));

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(accessRedirect("/auth/login", "required"));
  if (!user.email_confirmed_at) redirect(accessRedirect("/auth/login", "unconfirmed"));

  const { data, error } = await supabase
    .from("businesses")
    .select("id,name")
    .order("name");
  const businesses = (data ?? []) as Business[];
  return (
    <main className="min-h-screen px-5 py-6 sm:px-8 sm:py-8">
      <header className="mx-auto flex max-w-3xl items-center justify-between gap-4">
        <Link
          className="text-[1.55rem] font-[750] tracking-[-0.08em] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--olive)]"
          href="/"
        >
          qwerty
        </Link>
        <form action="/auth/logout" method="post">
          <button
            className="min-h-11 rounded-lg border border-[var(--olive)] px-4 py-2 text-sm font-extrabold text-[var(--olive)] transition-colors hover:bg-[var(--soft-lime)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--olive)]"
            type="submit"
          >
            Cerrar sesión
          </button>
        </form>
      </header>

      <section className="mx-auto mt-14 max-w-3xl" aria-labelledby="owner-title">
        <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--olive)]">Espacio de dueño</p>
        <h1 id="owner-title" className="mt-3 text-4xl font-[750] tracking-[-0.07em]">Tus negocios</h1>
        <p className="mt-4 max-w-xl text-sm leading-6 text-[var(--muted)]">
          Esta vista muestra únicamente los negocios asociados a tu cuenta confirmada.
        </p>
        <Link
          className="mt-4 inline-block text-sm font-extrabold text-[var(--olive)] underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--olive)]"
          href="/owner/catalog"
        >
          Editar catálogo
        </Link>
        <div className="mt-8 rounded-2xl border border-[var(--line)] bg-white p-5 shadow-[0_1.5rem_3rem_rgb(40_47_37_/_8%)] sm:p-6">
          <h2 className="text-lg font-[750] tracking-[-0.04em]">Negocios asociados</h2>
          {error ? (
            <p className="mt-4 rounded-lg bg-[var(--transfer-bg)] px-4 py-3 text-sm leading-5 text-[var(--transfer-text)]" role="alert">
              No pudimos cargar tus negocios. Intentá de nuevo más tarde.
            </p>
          ) : businesses.length === 0 ? (
            <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
              Todavía no hay negocios asociados a esta cuenta.
            </p>
          ) : (
            <ul className="mt-4 grid gap-3" aria-label="Negocios asociados">
              {businesses.map((business) => (
                <li className="rounded-lg border border-[var(--line)] bg-[var(--cream)] px-4 py-3" key={business.id}>
                  <strong className="block text-sm">{business.name}</strong>
                  <span className="mt-1 block break-all font-mono text-xs text-[var(--muted)]">{business.id}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
