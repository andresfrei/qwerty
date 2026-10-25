"use client";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ownerHref, type OwnerBusiness } from "../owner-context";
import { AsyncActionButton } from "@/app/components/async-action-button";
import type { Option, OptionGroup } from "../../lib/catalog-selection";
import { catalogFormPayload, moneyText, sendOwnerMutation } from "./catalog-editor";
import { CatalogProfileEditor } from "./catalog-profile-editor-client";

type Category = { id: string; name: string; sort_order: number };
type Item = { id: string; category_id: string; name: string; description: string | null; price_minor: number; currency: string; is_available: boolean; sort_order: number };
type Storefront = { slug: string; display_name: string; is_published: boolean };
type Props = { accountId?: string; business?: OwnerBusiness; categories: Category[]; items: Item[]; groups: OptionGroup[]; options: Option[]; storefront: Storefront | null; surchargeMinor: number };
const input = "mt-1 min-h-11 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm";
const button = "min-h-11 rounded-lg bg-[var(--lime)] px-4 py-2 text-sm font-extrabold disabled:opacity-50";
function Field({ name, label, value = "", numeric = false, money = false }: { name: string; label: string; value?: string | number; numeric?: boolean; money?: boolean }) {
  return <label className="min-w-0 text-sm">{label}<input className={input} name={name} defaultValue={value} type={numeric ? "number" : "text"} min={numeric ? 0 : undefined} step={numeric ? 1 : undefined} inputMode={money ? "decimal" : undefined} required maxLength={numeric ? undefined : 500} /></label>;
}
function Available({ value = true }: { value?: boolean }) {
  return <label className="text-sm">Disponibilidad<select className={input} name="isAvailable" defaultValue={String(value)}><option value="true">Disponible</option><option value="false">No disponible</option></select></label>;
}
const pendingLabels: Record<string, string> = {
  create_category: "Creando categoría…", rename_category: "Guardando categoría…", reorder_category: "Guardando orden…",
  create_product: "Creando producto…", update_product: "Guardando producto…",
  create_option_group: "Creando grupo…", update_option_group: "Guardando grupo…",
  create_option: "Creando opción…", update_option: "Guardando opción…",
  set_two_flavor_surcharge: "Guardando recargo…",
};
const hidden = (name: string, value: string) => <input type="hidden" name={name} value={value} />;

export default function CatalogEditor({ accountId, business, categories, items, groups, options, storefront, surchargeMinor }: Props) {
  const generation = useRef<symbol | null>(null);
  useEffect(() => {
    generation.current = Symbol(business?.id);
    return () => { generation.current = null; };
  }, [business?.id]);
  const lock = useRef(false);
  const [state, setState] = useState<"idle" | "pending" | "saved" | "unknown">("idle");
  const [message, setMessage] = useState("");
  const [pendingForm, setPendingForm] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>, title: string) {
    event.preventDefault();
    if (lock.current || state !== "idle") return;
    const payload = catalogFormPayload(new FormData(event.currentTarget));
    if (!payload) { setMessage("Revisá los datos: precios con hasta dos decimales, moneda ISO de tres letras y límites válidos."); return; }
    lock.current = true; setState("pending"); setPendingForm(title); setMessage("");
    const token = generation.current;
    const result = await sendOwnerMutation("/owner/catalog/actions", payload, undefined, business?.id);
    if (generation.current !== token) return;
    if (result.kind === "saved") { setState("saved"); setMessage("Cambio guardado. Actualizá el catálogo para continuar."); }
    else if (result.kind === "unknown") { setState("unknown"); setMessage("No sabemos si se guardó. No repitas el envío: actualizá para consultar el estado."); }
    else { setState("idle"); setMessage(result.message); }
    lock.current = false;
  }
  // One shared lock covers every form, including same-tick double clicks and unknown outcomes.
  function form(title: string, action: string, fields: ReactNode, save = "Guardar") {
    return <form method="post" action="/owner/catalog/actions" onSubmit={event => submit(event, title)} aria-label={title} className="grid gap-3 rounded-xl border border-[var(--line)] bg-[var(--cream)] p-4">
      {hidden("action", action)}<h3 className="font-extrabold">{title}</h3>
      <fieldset disabled={state !== "idle"} className="grid min-w-0 gap-3 sm:grid-cols-2">{fields}<AsyncActionButton className={button} type="submit" pending={state === "pending" && pendingForm === title} locked={state !== "idle"} pendingLabel={action === "set_published" ? (storefront?.is_published ? "Dejando de publicar…" : "Publicando tienda…") : pendingLabels[action]}>{save}</AsyncActionButton></fieldset>
    </form>;
  }
  function productFields(item?: Item) {
    return <>
      {item && hidden("itemId", item.id)}
      <Field name="name" label="Nombre del producto" value={item?.name} />
      <label className="text-sm">Descripción<textarea className={input} name="description" defaultValue={item?.description ?? ""} maxLength={2000} /></label>
      <label className="text-sm">Categoría<select className={input} name="categoryId" defaultValue={item?.category_id ?? categories[0]?.id} required>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <Field name="priceMinor" label="Precio (unidad mayor, ej. 12,50)" value={moneyText(item?.price_minor ?? 0)} money />
      <Field name="currency" label="Moneda ISO (ej. ARS, USD)" value={item?.currency ?? "ARS"} />
      <Available value={item?.is_available} /><Field name="sortOrder" label="Orden" value={item?.sort_order ?? 0} numeric />
    </>;
  }
  function groupFields(group?: OptionGroup) {
    return <>
      <Field name="name" label="Nombre del grupo" value={group?.name} />
      <label className="text-sm">Modo de selección<select className={input} name="selectionMode" defaultValue={group?.selection_mode ?? "distinct"}><option value="distinct">Opciones distintas (tamaños / gustos / mitades)</option><option value="quantity">Unidades (ej. docena de empanadas)</option></select></label>
      <Field name="minSelect" label="Mínimo" value={group?.min_select ?? 1} numeric /><Field name="maxSelect" label="Máximo" value={group?.max_select ?? 1} numeric />
      <Field name="sortOrder" label="Orden" value={group?.sort_order ?? 0} numeric />
    </>;
  }
  function optionFields(option?: Option) {
    return <><Field name="name" label="Nombre de la opción" value={option?.name} /><Field name="priceDeltaMinor" label="Adicional (unidad mayor)" value={moneyText(option?.price_delta_minor ?? 0)} money /><Available value={option?.is_available} /><Field name="sortOrder" label="Orden" value={option?.sort_order ?? 0} numeric /></>;
  }
  return <section className="grid gap-4 rounded-2xl border border-[var(--line)] bg-white p-5" aria-labelledby="editor-title">
    <h2 id="editor-title" className="text-xl font-extrabold">Editar catálogo</h2>
    <noscript>Para guardar cambios necesitás JavaScript. Podés seguir consultando el catálogo de abajo.</noscript>
    <p className="text-sm leading-6">Los cambios se guardan de a uno. Menor orden aparece primero. La vista de abajo muestra las reglas clásicas; para un perfil activo, consultá su configuración avanzada.</p>
    {message && <p role="status" className="text-sm font-bold">{message}</p>}
    {(state === "unknown" || state === "saved") && <a className="font-extrabold underline" href={ownerHref("catalog", business?.id)}>Actualizar catálogo (solo lectura)</a>}
    {storefront ? <>
      <p className="text-sm">{storefront.is_published ? "Publicada" : "Sin publicar"}: {storefront.display_name}</p>
      {items.length === 0 && <p className="text-sm">Tu catálogo está vacío. Podés publicarlo igual, pero todavía no tendrá productos para pedir.</p>}
      {form("Publicación", "set_published", hidden("isPublished", String(!storefront.is_published)), storefront.is_published ? "Dejar de publicar" : "Publicar tienda")}
      {storefront.is_published && <a id="buyer-link" className="break-all font-extrabold underline" href={`/store/${storefront.slug}`}>Ver tienda para hacer pedidos: /store/{storefront.slug}</a>}
    </> : <a href={ownerHref("store", business?.id)} className="underline">Configurar tienda sin publicar</a>}
    {form("Nueva categoría", "create_category", <><Field name="name" label="Nombre de la categoría" /><Field name="sortOrder" label="Orden" value={0} numeric /></>, "Crear categoría")}
    <details><summary className="min-h-11 cursor-pointer py-2 font-extrabold">Editar categorías ({categories.length})</summary><div className="grid gap-3">
      {categories.map(c => <div key={c.id} className="grid gap-3">
        {form(`Nombre: ${c.name}`, "rename_category", <>{hidden("categoryId", c.id)}<Field name="name" label="Nombre de la categoría" value={c.name} /></>)}
        {form(`Orden: ${c.name}`, "reorder_category", <>{hidden("categoryId", c.id)}<Field name="sortOrder" label="Orden" value={c.sort_order} numeric /></>)}
      </div>)}
    </div></details>
    {categories.length > 0 ? form("Nuevo producto", "create_product", productFields(), "Crear producto") : <p className="text-sm">Creá una categoría para agregar productos.</p>}
    <details><summary className="min-h-11 cursor-pointer py-2 font-extrabold">Productos y opciones ({items.length})</summary><div className="grid gap-4">
      {items.map(item => <section key={item.id} className="grid gap-3 border-t border-[var(--line)] pt-3">
        {form(`Editar: ${item.name}`, "update_product", productFields(item))}
        {accountId && business && <CatalogProfileEditor key={`${accountId}:${business.id}:${item.id}`} scope={{ accountId, businessId: business.id, itemId: item.id }} products={items} />}
        <p className="text-sm">Para una docena: modo unidades, mínimo 12 y máximo 12. Para mitades: opciones distintas, máximo 2. Los precios y el recargo usan las reglas actuales del catálogo.</p>
        {form(`Nuevo grupo: ${item.name}`, "create_option_group", <>{hidden("itemId", item.id)}{groupFields()}</>, "Crear grupo")}
        {groups.filter(g => g.item_id === item.id).map(g => <div key={g.id} className="grid gap-3">
          {form(`Editar grupo: ${g.name}`, "update_option_group", <>{hidden("groupId", g.id)}{groupFields(g)}</>)}
          {form(`Nueva opción: ${g.name}`, "create_option", <>{hidden("groupId", g.id)}{optionFields()}</>, "Crear opción")}
          {options.filter(o => o.group_id === g.id).map(o => <div key={o.id}>{form(`Editar opción: ${o.name}`, "update_option", <>{hidden("optionId", o.id)}{optionFields(o)}</>)}</div>)}
        </div>)}
      </section>)}
    </div></details>
    {form("Recargo fijo por dos gustos", "set_two_flavor_surcharge", <Field name="twoFlavorSurchargeMinor" label="Recargo (unidad mayor de la moneda del producto)" value={moneyText(surchargeMinor)} money />)}
  </section>;
}
