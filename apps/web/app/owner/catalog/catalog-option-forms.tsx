"use client";
import { useRef, useState } from "react";
import { Available, Field } from "./catalog-editor-client";
import { moneyText } from "./catalog-editor";
import { useCatalogOptionParents, type CatalogOptionParentsProps } from "./catalog-taxonomy-controls";
import { CatalogScopedForm } from "./catalog-form-scope";
import { CatalogChoicePicker } from "./catalog-choice-picker";
import type { Choice } from "./catalog-choice-state";
import type { GroupSummary, ItemParent, OptionSummary } from "./catalog-page-data";
import { CatalogInspectionLink } from "./catalog-form-navigation";
import { catalogHref, type CatalogQuery } from "./catalog-navigation";

export type CatalogOptionFormProps = CatalogOptionParentsProps & { option?: OptionSummary; query?: CatalogQuery };
export function CatalogOptionForm(props: CatalogOptionFormProps) {
  const scope = { ...props, scopeKey: JSON.stringify([props.scopeKey, props.option?.id ?? "new"]) };
  const { key, value, chooseItem, chooseGroup } = useCatalogOptionParents(scope);
  const selected = props.option && props.group ? { id: props.group.id, label: props.group.name } : value.group;
  return <>
    {!props.option && <>
      {value.item && <p className="text-sm">Producto seleccionado: {value.item.label}</p>}
      <CatalogChoicePicker scope={{ scopeKey: JSON.stringify([key, value.item?.id]), selectedBusinessId: props.businessId, kind: "items" }}
        seed={value.item && "itemKind" in value.item ? value.item : null} label="Producto" onSelect={chooseItem} />
      {value.item && <CatalogChoicePicker scope={{ scopeKey: key, selectedBusinessId: props.businessId, kind: "groups", itemId: value.item.id }}
        seed={value.group} label="Grupo" onSelect={chooseGroup} />}
      <p className="text-sm">Elegí un producto y su grupo. Cambiar de padre inicia un borrador nuevo y descarta los campos anteriores.</p>
    </>}
    {selected && <>
      <CatalogInspectionLink href={catalogHref("options", { ...props.query, businessId: props.businessId, itemId: value.item?.id, groupId: selected.id })} businessId={props.businessId}>Consultar opciones</CatalogInspectionLink>
      <CatalogScopedForm key={props.option?.id ?? selected.id}
        identity={props.option ? { action: "update_option", target: { kind: "record", id: props.option.id } }
          : { action: "create_option", target: { kind: "parent", id: selected.id } }}
        title={props.option ? "Editar opción" : "Nueva opción"} pendingLabel={props.option ? "Guardando opción…" : "Creando opción…"} save={props.option ? "Guardar" : "Crear opción"}>
        <input type="hidden" name={props.option ? "optionId" : "groupId"} value={props.option?.id ?? selected.id} />
        <p className="text-sm">Grupo: {selected.label}</p>
        <Field name="name" label="Nombre de la opción" value={props.option?.name} />
        <Field name="priceDeltaMinor" label="Adicional (unidad mayor)" value={moneyText(props.option?.price_delta_minor ?? 0)} money />
        <Available value={props.option?.is_available} />
        <Field name="sortOrder" label="Orden" value={props.option?.sort_order ?? 0} numeric />
      </CatalogScopedForm>
    </>}
  </>;
}

export type CatalogGroupFormProps = {
  scopeKey: string; businessId: string; item: ItemParent | null; group?: GroupSummary; query?: CatalogQuery;
};
export function CatalogGroupForm({ scopeKey: callerKey, businessId, item, group, query }: CatalogGroupFormProps) {
  const scopeKey = JSON.stringify([callerKey, businessId, group?.id ?? "new", item?.id]);
  const seed = item ? { id: item.id, label: item.name } : null;
  const current = useRef(scopeKey); current.current = scopeKey;
  const [draft, setDraft] = useState<{ scopeKey: string; item: Choice | null }>({ scopeKey, item: seed });
  const selected = draft.scopeKey === scopeKey ? draft.item : seed;
  return <>
    {!group && <>
      {/* Checked ItemParent has no kind/availability: never fabricate an Items DTO seed. */}
      <CatalogChoicePicker scope={{ scopeKey, selectedBusinessId: businessId, kind: "items" }}
        label={selected ? "Cambiar producto" : "Producto"} onSelect={choice => { if (current.current === scopeKey) setDraft({ scopeKey, item: choice }); }} />
      <p className="text-sm">Elegí un producto antes de completar el grupo. Cambiarlo inicia un borrador nuevo y descarta los campos anteriores.</p>
    </>}
    {selected && <>
      <CatalogInspectionLink href={catalogHref("groups", { ...query, businessId, itemId: selected.id })} businessId={businessId}>Consultar grupos</CatalogInspectionLink>
      <CatalogScopedForm key={group?.id ?? selected.id}
        identity={group ? { action: "update_option_group", target: { kind: "record", id: group.id } }
          : { action: "create_option_group", target: { kind: "parent", id: selected.id } }}
        title={group ? "Editar grupo" : "Nuevo grupo"} pendingLabel={group ? "Guardando grupo…" : "Creando grupo…"} save={group ? "Guardar" : "Crear grupo"}>
        <input type="hidden" name={group ? "groupId" : "itemId"} value={group?.id ?? selected.id} />
        <p className="text-sm">Producto: {selected.label}</p>
        <Field name="name" label="Nombre del grupo" value={group?.name} />
        <label className="text-sm">Modo de selección<select className="mt-1 min-h-11 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm"
          name="selectionMode" defaultValue={group?.selection_mode ?? "distinct"}>
          <option value="distinct">Opciones distintas (tamaños / gustos / mitades)</option>
          <option value="quantity">Unidades (ej. docena de empanadas)</option>
        </select></label>
        <Field name="minSelect" label="Mínimo" value={group?.min_select ?? 1} numeric />
        <Field name="maxSelect" label="Máximo" value={group?.max_select ?? 1} numeric />
        <Field name="sortOrder" label="Orden" value={group?.sort_order ?? 0} numeric />
      </CatalogScopedForm>
    </>}
  </>;
}
