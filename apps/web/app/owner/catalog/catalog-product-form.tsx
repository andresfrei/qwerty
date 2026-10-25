"use client";
import { useRef, useState } from "react";
import { Available, Field } from "./catalog-editor-client";
import { moneyText } from "./catalog-editor";
import { CatalogChoicePicker } from "./catalog-choice-picker";
import type { CatalogChoice } from "./catalog-choices-gateway";
import type { CatalogItemSummary } from "./catalog-item-page-data";
import { CatalogScopedForm } from "./catalog-form-scope";

type Category = { id: string; name: string };
export type CatalogProductFormProps = {
  scopeKey: string; businessId: string; category: Category | null; item?: CatalogItemSummary;
};
const input = "mt-1 min-h-11 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm";
export function CatalogProductForm({ scopeKey: callerScopeKey, businessId, category, item }: CatalogProductFormProps) {
  const scopeKey = JSON.stringify([callerScopeKey, businessId, item?.id ?? "new"]);
  const seed = category ? { id: category.id, label: category.name } : null;
  const current = useRef(scopeKey); current.current = scopeKey;
  const [selection, setSelection] = useState<{ scopeKey: string; choice: CatalogChoice | null }>({ scopeKey, choice: seed });
  const selected = selection.scopeKey === scopeKey ? selection.choice : seed;
  return <>
    <CatalogChoicePicker scope={{ scopeKey, selectedBusinessId: businessId, kind: "categories" }}
      seed={seed} label="Categoría" onSelect={choice => {
        if (current.current === scopeKey) setSelection({ scopeKey, choice });
      }} />
    {!item && <p className="text-sm">Elegí una categoría antes de completar el producto. Cambiarla inicia un borrador nuevo y descarta los campos anteriores.</p>}
    {selected && <CatalogScopedForm key={item?.id ?? selected.id}
      identity={item ? { action: "update_product", target: { kind: "record", id: item.id } }
        : { action: "create_product", target: { kind: "parent", id: selected.id } }}
      title={item ? "Editar producto" : "Nuevo producto"}
      pendingLabel={item ? "Guardando producto…" : "Creando producto…"} save={item ? "Guardar" : "Crear producto"}>
      {item && <input type="hidden" name="itemId" value={item.id} />}
      <input type="hidden" name="categoryId" value={selected.id} />
      <p className="text-sm">Categoría seleccionada: {selected.label}</p>
      <Field name="name" label="Nombre del producto" value={item?.name} />
      <label className="text-sm">Descripción<textarea className={input} name="description" defaultValue={item?.description ?? ""} maxLength={2000} /></label>
      <Field name="priceMinor" label="Precio base (unidad mayor, ej. 12,50)" value={moneyText(item?.price_minor ?? 0)} money />
      <Field name="currency" label="Moneda ISO (ej. ARS, USD)" value={item?.currency ?? "ARS"} />
      <Available value={item?.is_available} />
      <Field name="sortOrder" label="Orden" value={item?.sort_order ?? 0} numeric />
    </CatalogScopedForm>}
  </>;
}
