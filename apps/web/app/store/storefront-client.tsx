'use client';

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { addConfiguredVariant, changeConfiguredQuantity, isConfiguredCartLine, persistConfiguredCart, type ConfiguredCart } from "@/app/lib/configured-cart";
import { loadScopedCart } from "@/app/lib/configured-checkout";
import type { ConfiguredStorefrontRead } from "@/app/lib/configured-storefront";
const PublicPicker = dynamic(() => import("./configured-selection-client").then(module => module.ConfiguredSelection));
import {
  addCartItem,
  cartTotalsByCurrency,
  createCart,
  formatMoney,
  normalizePersistedCart,
  persistCart,
  reconcileCart,
  setCartQuantity,
  type CartState,
  type CartItem,
} from "@/app/lib/storefront";
import type { StorefrontCategory } from "@/app/lib/storefront-reader";
import type { StorefrontPhoto } from "@/app/lib/storefront-photo";

const storageKey = (businessId: string) => `qwerty:cart:v1:${businessId}`;
const categoryAnchorId = (categoryId: string) => `category-${categoryId}`;

function readCart(businessId: string): CartState {
  try {
    return normalizePersistedCart(JSON.parse(localStorage.getItem(storageKey(businessId)) ?? "null"), businessId);
  } catch {
    return createCart(businessId);
  }
}

function ProductMediaFallback() {
  return (
    <div
      aria-label="Foto no disponible"
      className="flex size-16 shrink-0 flex-col items-center justify-center gap-1 rounded-lg bg-[var(--cream)] px-1.5 text-center text-[0.625rem] font-bold leading-3 text-[var(--muted)] sm:size-[4.5rem] sm:px-2"
      role="img"
    >
      <svg aria-hidden="true" className="size-4 shrink-0" fill="none" viewBox="0 0 24 24">
        <rect height="16" rx="2" stroke="currentColor" strokeWidth="1.7" width="18" x="3" y="4" />
        <circle cx="8.5" cy="9" fill="currentColor" r="1.5" />
        <path d="m5 17 4.5-4 3 2.5 2-2 4.5 3.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
      </svg>
      <span>Foto no disponible</span>
    </div>
  );
}

function ProductMedia({ name, photo }: { name: string; photo: StorefrontPhoto }) {
  if (photo.kind === "photo") {
    return (
      <img
        alt={`Foto de ${name}`}
        className="size-16 shrink-0 rounded-lg bg-[var(--cream)] object-cover sm:size-[4.5rem]"
        decoding="async"
        height={72}
        loading="lazy"
        src={photo.url}
        width={72}
      />
    );
  }
  return <ProductMediaFallback />;
}

export default function StorefrontClient({ businessId, categories, slug }: { businessId: string; categories: StorefrontCategory[]; slug: string }) {
  const items = useMemo(() => categories.flatMap(({ items: categoryItems }) => categoryItems), [categories]);
  const [cart, setCart] = useState(() => createCart(businessId));
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setCart(reconcileCart(readCart(businessId), items));
    setHydrated(true);
  }, [businessId, items]);

  useEffect(() => {
    if (hydrated) persistCart((key, value) => localStorage.setItem(key, value), storageKey(businessId), cart);
  }, [businessId, cart, hydrated]);

  const totals = cartTotalsByCurrency(cart);
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section aria-labelledby="catalog-title">
        <div className="mb-7 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--olive)]">Carta</p>
            <h2 id="catalog-title" className="mt-2 text-2xl font-[750] tracking-[-0.06em]">Elegí tus productos</h2>
          </div>
          <span className="text-right text-sm text-[var(--muted)]">{items.length} disponibles</span>
        </div>
        {categories.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--line)] p-6 text-[var(--muted)]">No hay productos disponibles ahora.</p>
        ) : (
          <>
            <nav aria-label="Categorías de la carta" className="sticky top-0 z-10 -mx-1 mb-8 overflow-x-auto border-y border-[var(--line)] bg-[var(--cream)] py-2">
              <ul className="flex max-w-full gap-2 px-1 pb-1">
                {categories.map(({ category }) => {
                  const anchorId = categoryAnchorId(category.id);
                  return (
                    <li className="shrink-0" key={category.id}>
                      <a
                        className="inline-flex min-h-13 items-center rounded-full border border-[var(--line)] bg-white px-6 py-3 text-base font-extrabold text-[var(--olive)] transition-colors hover:border-[var(--olive)] hover:bg-[var(--soft-lime)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--olive)]"
                        href={`#${anchorId}`}
                      >
                        {category.name}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </nav>
            <div className="space-y-8">
              {categories.map(({ category, items: categoryItems }) => {
                const anchorId = categoryAnchorId(category.id);
                const headingId = `${anchorId}-title`;
                return (
                  <section aria-labelledby={headingId} className="scroll-mt-24" id={anchorId} key={category.id}>
                    <div className="mb-3 flex items-baseline justify-between gap-4 border-b border-[var(--line)] pb-2">
                      <h3 className="text-lg font-extrabold tracking-[-0.05em]" id={headingId}>{category.name}</h3>
                      <span className="text-xs font-bold text-[var(--muted)]">{categoryItems.length}</span>
                    </div>
                    <div className="grid gap-3 lg:grid-cols-2">
                      {categoryItems.map((item) => (
                        <article className="flex min-w-0 items-center gap-3 rounded-xl border border-[var(--line)] bg-white p-2.5 sm:p-3" key={item.id}>
                          <ProductMedia name={item.name} photo={item.photo} />
                          <div className="min-w-0 flex-1">
                            <h4 className="text-sm font-extrabold tracking-[-0.03em]">{item.name}</h4>
                            {item.description && <p className="mt-1 line-clamp-2 text-xs leading-4 text-[var(--muted)]">{item.description}</p>}
                            <div className="mt-2 flex items-center justify-between gap-2">
                              <strong className="text-sm">{formatMoney(item.price_minor, item.currency)}</strong>
                              <button
                                className="shrink-0 rounded-lg bg-[var(--forest)] px-2.5 py-1.5 text-xs font-extrabold text-white transition-opacity hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--olive)]"
                                aria-label={`Sumar ${item.name}`}
                                onClick={() => setCart((current) => addCartItem(current, item))}
                                type="button"
                              >
                                Sumar
                              </button>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          </>
        )}
      </section>

      <aside className="h-fit rounded-xl border border-[var(--line)] bg-white p-5 lg:sticky lg:top-6" aria-labelledby="cart-title">
        <div className="flex items-center justify-between gap-3">
          <h2 id="cart-title" className="text-lg font-extrabold tracking-[-0.04em]">Tu pedido</h2>
          <span className="rounded-full bg-[var(--soft-lime)] px-2 py-1 text-xs font-extrabold text-[var(--olive)]">{cart.items.length}</span>
        </div>
        {cart.items.length === 0 ? (
          <p className="mt-5 text-sm leading-6 text-[var(--muted)]">Todavía no agregaste productos.</p>
        ) : (
          <div className="mt-5 space-y-4">
            {cart.items.map((item) => (
              <div className="border-b border-[var(--line)] pb-4" key={item.key}>
                <div className="flex justify-between gap-3 text-sm">
                  <span className="font-bold">{item.name}</span>
                  <span>{formatMoney(item.unitPriceMinor * item.quantity, item.currency)}</span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <button aria-label={`Quitar una unidad de ${item.name}`} className="size-7 rounded border border-[var(--line)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--olive)]" onClick={() => setCart((current) => setCartQuantity(current, item.key, item.quantity - 1))} type="button">−</button>
                  <span className="min-w-5 text-center text-sm">{item.quantity}</span>
                  <button aria-label={`Agregar una unidad de ${item.name}`} className="size-7 rounded border border-[var(--line)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--olive)]" onClick={() => setCart((current) => setCartQuantity(current, item.key, item.quantity + 1))} type="button">+</button>
                  <button aria-label={`Quitar ${item.name} del carrito`} className="ml-auto rounded px-1 text-xs font-bold text-[var(--olive)] underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--olive)]" onClick={() => setCart((current) => setCartQuantity(current, item.key, 0))} type="button">Quitar</button>
                </div>
              </div>
            ))}
            <div className="flex justify-between gap-3 text-sm font-extrabold"><span>Importe orientativo</span><span className="text-right">{Object.entries(totals).map(([currency, total]) => <span className="ml-2 inline-block" key={currency}>{formatMoney(total, currency)}</span>)}</span></div>
          </div>
        )}
        {cart.items.length > 0 && (
          <a className="mt-5 flex min-h-12 items-center justify-center rounded-lg bg-[var(--lime)] px-4 py-3 text-sm font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--olive)]" href={`/store/${slug}/checkout`}>Continuar compra</a>
        )}
        <p className="mt-5 rounded-lg bg-[var(--transfer-bg)] p-3 text-xs leading-5 text-[var(--transfer-text)]">Los precios y la disponibilidad son orientativos por ahora; se comprobarán cuando los pedidos estén disponibles.</p>
        <p className="mt-3 text-xs font-bold leading-5 text-[var(--muted)]">Todavía no se pueden enviar pedidos.</p>
      </aside>
    </div>
  );
}

export function ConfiguredStorefrontClient({ catalog }: { catalog: Extract<ConfiguredStorefrontRead, { status: "ok" }> }) {
  const businessId = catalog.storefront.business_id, slug = catalog.storefront.slug;
  const scope = `${businessId}:${slug}`;
  const [cart, setCart] = useState<ConfiguredCart>({ businessId, slug, items: [] });
  const latest = useRef(cart);
  const activeScope = useRef(scope);
  const [loaded, setLoaded] = useState(false);
  const [scoped, setScoped] = useState(false);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [pickerGeneration, setPickerGeneration] = useState(0);
  const pickerToken = useRef(0);
  useEffect(() => {
    activeScope.current = scope;
    try {
      const saved = loadScopedCart(localStorage, businessId, slug);
      latest.current = saved.cart; setCart(saved.cart); setScoped(saved.scoped);
    } catch { setError(true); }
    setLoaded(true);
    return () => { activeScope.current = ""; pickerToken.current++; };
  }, [businessId, slug, scope]);
  function commit(next: ConfiguredCart) {
    if (!loaded || error || activeScope.current !== scope) return false;
    if (!persistConfiguredCart((key, value) => localStorage.setItem(key, value), next)) { setError(true); return false; }
    latest.current = next; setCart(next); setScoped(true); return true;
  }
  function quantity(key: string, difference: number | null) {
    const current = latest.current.items.find(line => line.key === key);
    if (!current) return;
    const changed = changeConfiguredQuantity(latest.current, key, difference === null ? 0 : current.quantity + difference);
    if (changed.ok) commit(changed.cart);
  }
  const hasProfiles = Object.values(catalog.configurations).some(value => value.status !== "legacy");
  if (!loaded) return <p>Cargando carrito…</p>;
  if (!error && !scoped && !hasProfiles) return <StorefrontClient businessId={businessId} categories={catalog.categories} slug={slug} />;
  const projection = selected ? catalog.configurations[selected] : null;
  const token = pickerToken.current;
  const totals = cart.items.reduce<Record<string, number>>((result, line) => {
    result[line.currency] = (result[line.currency] ?? 0) + line.unitPriceMinor * line.quantity;
    return result;
  }, {});
  return <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
    <section aria-label="Carta configurable" className="min-w-0 space-y-6">
      <h2 className="text-2xl font-extrabold">Elegí tus productos</h2>
      {catalog.categories.map(({ category, items }) => <section key={category.id} className="min-w-0"><h3 className="mb-3 text-xl font-bold">{category.name}</h3>
        <div className="grid gap-3 sm:grid-cols-2">{items.map(item => {
          const profile = catalog.configurations[item.id];
          const legacy = profile?.status === "legacy" || catalog.capability === "legacy_only";
          return <article key={item.id} className="min-w-0 rounded-xl border border-[var(--line)] bg-white p-4">
            <div className="flex min-w-0 gap-3"><ProductMedia name={item.name} photo={item.photo} /><div className="min-w-0"><h4 className="break-words font-bold">{item.name}</h4><p className="break-words text-sm">{item.description}</p></div></div>
            <p className="mt-3 text-sm font-bold">{legacy ? formatMoney(item.price_minor, item.currency) : profile?.status === "ready" ? "Elegí las variantes para ver el importe." : "Configuración no disponible por ahora."}</p>
            {legacy ? <button type="button" disabled={error} className="mt-3 min-h-11 rounded-lg bg-[var(--lime)] px-4 py-2 font-bold disabled:opacity-50" onClick={() => {
              const old = latest.current;
              const classic = addCartItem({ businessId, items: old.items.filter((line): line is CartItem => !isConfiguredCartLine(line)) }, item);
              const added = classic.items.find(line => line.key === item.id);
              if (added) commit({ ...old, items: old.items.some(line => line.key === item.id) ? old.items.map(line => line.key === item.id ? added : line) : [...old.items, added] });
            }}>Sumar {item.name}</button> : profile?.status === "ready" && <button id={`configure-${item.id}`} type="button" disabled={error} className="mt-3 min-h-11 rounded-lg border border-[var(--line)] px-4 py-2 font-bold disabled:opacity-50" onClick={() => { pickerToken.current++; setPickerGeneration(value => value + 1); setSelected(item.id); }}>Configurar {item.name}</button>}
          </article>;
        })}</div>
      </section>)}
      {selected && projection?.status === "ready" && <PublicPicker key={`${scope}:${selected}:${pickerGeneration}`} scope={`${scope}:${selected}`} catalog={projection.catalog} itemId={selected} disabled={error} onAccept={selection => {
        if (activeScope.current !== scope || token !== pickerToken.current) return false;
        const result = addConfiguredVariant(latest.current, { catalog: projection.catalog, itemId: selected, selection });
        if (!result.ok || !commit(result.cart)) return false;
        pickerToken.current++; setSelected(null); return true;
      }} />}
    </section>
    <aside className="min-w-0 rounded-xl border border-[var(--line)] bg-white p-5" aria-label="Tu pedido">
      <h2 className="text-xl font-bold">Tu pedido</h2>
      {error && <p role="alert">No pudimos restaurar o guardar el carrito. No reemplazamos los datos guardados.</p>}
      {cart.items.map(line => <section key={line.key} className="mt-4 min-w-0 border-b border-[var(--line)] pb-4"><p className="break-words font-bold">{line.quantity} × {line.name}</p><p className="break-words text-sm">{line.selectionText}</p><p>{formatMoney(line.unitPriceMinor * line.quantity, line.currency)} · Importe guardado, sujeto a revisión</p>
        <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={error} className="min-h-11 rounded border px-3" aria-label={`Quitar una unidad de ${line.name}`} onClick={() => quantity(line.key, -1)}>−</button><button type="button" disabled={error} className="min-h-11 rounded border px-3" aria-label={`Agregar una unidad de ${line.name}`} onClick={() => quantity(line.key, 1)}>+</button><button type="button" disabled={error} className="min-h-11 rounded border px-3" onClick={() => quantity(line.key, null)}>Quitar producto</button></div>
      </section>)}
      {Object.entries(totals).map(([currency, total]) => <p key={currency} className="mt-4 font-bold">Importe guardado: {formatMoney(total, currency)}</p>)}
      {!!cart.items.length && <a className="mt-5 block min-h-11 rounded-lg bg-[var(--lime)] px-4 py-3 text-center font-bold" href={`/store/${slug}/checkout`}>Continuar compra</a>}
    </aside>
  </div>;
}
