import Link from "next/link";
import { redirect } from "next/navigation";
import { accessRedirect } from "@/app/auth/access-validation";
import { formatMoney } from "@/app/lib/storefront";
import type { Option, OptionGroup } from "@/app/lib/catalog-selection";
import { createClient } from "@/app/lib/supabase/server";
import { describeGroupBehavior } from "./catalog-preview";
import { PhotoEditor } from "./photo-editor-client";
import CatalogEditor from "./catalog-editor-client";

type Business = { id: string; name: string };
type Storefront = { slug: string; display_name: string; is_published: boolean };
type Category = { id: string; name: string; sort_order: number };
type Item = {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  price_minor: number;
  currency: string;
  is_available: boolean;
  sort_order: number;
  photo_path: string | null;
  photo_version: number | string;
};

export const dynamic = "force-dynamic";

const card = "rounded-2xl border border-[var(--line)] bg-white p-5 shadow-[0_1.5rem_3rem_rgb(40_47_37_/_8%)] sm:p-6";
const on = "rounded-full bg-[var(--soft-lime)] px-2.5 py-1 text-xs font-extrabold text-[var(--olive)]";
const off = "rounded-full bg-[var(--line)] px-2.5 py-1 text-xs font-extrabold text-[var(--muted)]";

export default async function OwnerCatalogPage() {
  const supabase = await createClient();
  if (!supabase) redirect(accessRedirect("/auth/login", "unavailable"));

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(accessRedirect("/auth/login", "required"));
  if (!user.email_confirmed_at) redirect(accessRedirect("/auth/login", "unconfirmed"));

  const { data: businessRows, error: businessError } = await supabase
    .from("businesses")
    .select("id,name")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(1);
  const business = ((businessRows ?? []) as Business[])[0];

  let storefront: Storefront | null = null;
  let categories: Category[] = [];
  let items: Item[] = [];
  let optionGroups: OptionGroup[] = [];
  let options: Option[] = [];
  let surchargeMinor = 0;
  let loadError = Boolean(businessError);
  if (business && !loadError) {
    const [storefrontResult, categoryResult, itemResult, groupResult, optionResult, settingsResult] = await Promise.all([
      supabase.from("business_storefronts").select("slug,display_name,is_published")
        .eq("business_id", business.id).maybeSingle(),
      supabase.from("catalog_categories").select("id,name,sort_order")
        .eq("business_id", business.id).order("sort_order").order("id"),
      supabase.from("catalog_items")
        .select("id,category_id,name,description,price_minor,currency,is_available,sort_order,photo_path,photo_version")
        .eq("business_id", business.id).order("sort_order").order("id"),
      supabase.from("catalog_option_groups")
        .select("id,item_id,name,selection_mode,min_select,max_select,sort_order")
        .eq("business_id", business.id).order("sort_order").order("id"),
      supabase.from("catalog_options")
        .select("id,group_id,name,price_delta_minor,is_available,sort_order")
        .eq("business_id", business.id).order("sort_order").order("id"),
      supabase.from("business_catalog_settings").select("two_flavor_surcharge_minor")
        .eq("business_id", business.id).maybeSingle(),
    ]);
    if (storefrontResult.error || categoryResult.error || itemResult.error
      || groupResult.error || optionResult.error || settingsResult.error) {
      loadError = true;
    } else {
      storefront = (storefrontResult.data as Storefront | null) ?? null;
      categories = (categoryResult.data ?? []) as Category[];
      items = (itemResult.data ?? []) as Item[];
      optionGroups = (groupResult.data ?? []) as OptionGroup[];
      options = (optionResult.data ?? []) as Option[];
      surchargeMinor = (settingsResult.data as { two_flavor_surcharge_minor: number } | null)?.two_flavor_surcharge_minor ?? 0;
    }
  }

  return (
    <main className="min-h-screen px-5 py-6 sm:px-8 sm:py-8">
      <header className="mx-auto flex max-w-3xl items-center justify-between gap-4">
        <Link className="text-[1.55rem] font-[750] tracking-[-0.08em]" href="/owner">qwerty</Link>
        <form action="/auth/logout" method="post">
          <button
            className="min-h-11 rounded-lg border border-[var(--olive)] px-4 py-2 text-sm font-extrabold text-[var(--olive)]"
            type="submit"
          >
            Cerrar sesión
          </button>
        </form>
      </header>

      <section className="mx-auto mt-14 max-w-3xl" aria-labelledby="catalog-title">
        <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--olive)]">Catálogo</p>
        <h1 id="catalog-title" className="mt-3 text-4xl font-[750] tracking-[-0.07em]">
          {business ? business.name : "Tu catálogo"}
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-6 text-[var(--muted)]">
          Categorías y productos de tu negocio, con precio, moneda, disponibilidad y orden. Los
          cambios se envían a <code className="font-mono text-xs">/owner/catalog/actions</code> con
          tu sesión confirmada; ningún identificador de negocio viaja en la petición.
        </p>
        <Link className="mt-4 inline-block text-sm font-extrabold text-[var(--olive)] underline" href="/owner">
          Volver a tus negocios
        </Link>

        {loadError ? (
          <p className="mt-8 rounded-lg bg-[var(--transfer-bg)] px-4 py-3 text-sm text-[var(--transfer-text)]" role="alert">
            No pudimos cargar tu catálogo. Intentá de nuevo más tarde.
          </p>
        ) : !business ? (
          <p className="mt-8 text-sm leading-6 text-[var(--muted)]">Todavía no hay un negocio asociado a esta cuenta.</p>
        ) : (
          <div className="mt-8 grid gap-6">
            <Link className="text-sm font-extrabold text-[var(--olive)] underline" href={`/owner/orders?businessId=${business.id}`} prefetch={false}>Consultar pedidos</Link>
            <CatalogEditor categories={categories} items={items} groups={optionGroups} options={options} storefront={storefront} surchargeMinor={surchargeMinor} />
            <div className={card}>
              <h2 className="text-lg font-[750] tracking-[-0.04em]">Vidriera</h2>
              {storefront ? (
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <strong className="text-sm">{storefront.display_name}</strong>
                  <span className="break-all font-mono text-xs text-[var(--muted)]">{storefront.slug}</span>
                  <span className={storefront.is_published ? on : off}>
                    {storefront.is_published ? "Publicada" : "Sin publicar"}
                  </span>
                </div>
              ) : (
                <p className="mt-4 text-sm text-[var(--muted)]">Este negocio todavía no tiene una vidriera.</p>
              )}
              <p className="mt-3 text-xs text-[var(--muted)]">
                Recargo por dos gustos: {formatMoney(surchargeMinor, items[0]?.currency ?? "ARS")}.
              </p>
            </div>

            {categories.length === 0 ? (
              <p className="text-sm leading-6 text-[var(--muted)]">Todavía no hay categorías en este catálogo.</p>
            ) : (
              categories.map((category) => {
                const categoryItems = items.filter((item) => item.category_id === category.id);
                return (
                  <section className={card} key={category.id} aria-label={category.name}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h2 className="text-lg font-[750] tracking-[-0.04em]">{category.name}</h2>
                      <span className="font-mono text-xs text-[var(--olive)]">Orden {category.sort_order}</span>
                    </div>
                    {categoryItems.length === 0 ? (
                      <p className="mt-4 text-sm text-[var(--muted)]">Sin productos todavía.</p>
                    ) : (
                      <ul className="mt-4 grid gap-3">
                        {categoryItems.map((item) => (
                          <li className="rounded-lg border border-[var(--line)] bg-[var(--cream)] px-4 py-3" key={item.id}>
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                              <strong className="text-sm">{item.name}</strong>
                              <span className="font-mono text-sm">{formatMoney(item.price_minor, item.currency)}</span>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[var(--muted)]">
                              <span className="font-mono">{item.currency} · {item.price_minor}</span>
                              <span className={item.is_available ? on : off}>
                                {item.is_available ? "Disponible" : "No disponible"}
                              </span>
                              <span className="font-mono">Orden {item.sort_order}</span>
                            </div>
                            {item.description ? (
                              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{item.description}</p>
                            ) : null}
                            <PhotoEditor
                              itemId={item.id}
                              itemName={item.name}
                              photoPath={item.photo_path}
                              photoVersion={String(item.photo_version)}
                            />
                            {optionGroups.filter((group) => group.item_id === item.id).length > 0 ? (
                              <ul className="mt-3 grid gap-2 border-t border-[var(--line)] pt-3">
                                {optionGroups.filter((group) => group.item_id === item.id).map((group) => {
                                  const behavior = describeGroupBehavior(item, group, options, surchargeMinor);
                                  const mode = group.selection_mode === "distinct" ? "opciones distintas" : "unidades";
                                  return (
                                    <li key={group.id}>
                                      <div className="flex flex-wrap items-center gap-2">
                                        <strong className="text-sm">{group.name}</strong>
                                        <span className="font-mono text-xs text-[var(--olive)]">
                                          {mode} {group.min_select}-{group.max_select}
                                        </span>
                                      </div>
                                      <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                                        {!behavior.ok
                                          ? "Todavía no se puede armar con las opciones disponibles."
                                          : behavior.description
                                            ? `Cliente: ${behavior.description} · ${formatMoney(behavior.unitPriceMinor ?? item.price_minor, item.currency)}`
                                            : "Sin selección obligatoria."}
                                      </p>
                                    </li>
                                  );
                                })}
                              </ul>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                );
              })
            )}
          </div>
        )}
      </section>
    </main>
  );
}
