# Catalog configuration domain — T1 handoff

**Status:** Pure domain only. Covers S1–S6 and S8 in
[`odd/tasks/catalog-configurations.md`](../odd/tasks/catalog-configurations.md).
No SQL storage, backend activation, owner editor, cart/order integration, remote
mutation, authentication or UI acceptance is implemented here. T2–T5 must consume
these contracts; T6 independently verifies integration and tenant enforcement.

## Public API

`apps/web/app/lib/catalog-profiles.ts` exports:

- `parseProfileDocument(unknown): ProfileResult<ProfileDocument>` — shape,
  normalization and resource bounds, independent of catalog references.
- `validateProfileConfiguration(unknown): ProfileResult<ProfileCatalog>` — full
  coherent projected catalog, active documents and relationships.
- `validateProfileSelection(unknown): ProfileResult<ResolvedProfileSelection>` —
  current versions, availability, cardinality, matrix and component constraints.
- `canonicalProfileSelectionKey(unknown): {ok:true,key:string} | ProfileFailure`.
- Types: `ProfileDocument`, `ProfileRecord`, `ProfileCatalog`, `ProfileItem`,
  `ProfileRequest`, `ProfileSelection`, `LeafSelection`, `Component`, `MatrixRow`,
  `ProfileErrorCode`, `ProfileError`, `ProfileFailure`, `ProfileResult<T>` and
  `ResolvedProfileSelection`.

`apps/web/app/lib/catalog-profile-pricing.ts` exports:

- `priceProfileSelection(unknown): PriceResult | ProfileFailure` — success is
  `{ok:true,unitPriceMinor:number,surchargeMinor:number}`.
- `describeProfileSelection(unknown): ProfileDescription | ProfileFailure` —
  success is `{ok:true,text,groups,components}` (snapshot shapes below).
- `ProfileDescription`, `ProfileGroupSnapshot`, `ProfileComponentSnapshot` types.

Every request is exactly `{catalog: ProfileCatalog, itemId: UUID, selection}`.
Document/configuration/selection validation success uses `{ok:true,value}`.
All failures use `{ok:false,errors:[...]}`; no partial accepted selection or price.
Inputs are never mutated; validated results and snapshots are fresh data.

`resolveProfileRequest`, `legacyProfileRequest`, `activeProfile`,
`orderedProfileOptions` and `profileFailure` are exported implementation helpers.
They are not alternative parsers. In particular, `resolveProfileRequest` preserves
legacy permissive description behavior; use `validateProfileSelection` for
acceptance, not the resolver alone. All public request boundaries validate runtime
shape, not just TypeScript annotations.

## Exact catalog projection (not SQL columns)

Adapters must project this shape explicitly; unknown keys fail closed. Existing
storefront/order catalogs have additional fields that must not be spread here.
`UUID` means a hyphenated 8-4-4-4-12 hexadecimal string, normalized to lowercase.
It is an identifier, **not authorization** or proof of database existence.

```ts
type Catalog = {
  businessId: UUID;
  surchargeMinor: number;
  items: {
    id: UUID; business_id: UUID; name: string; price_minor: number;
    currency: string; is_available: boolean;
  }[];
  groups: {
    id: UUID; business_id: UUID; item_id: UUID; name: string;
    selection_mode: "distinct" | "quantity";
    min_select: number; max_select: number; sort_order: number;
  }[];
  options: {
    id: UUID; business_id: UUID; group_id: UUID; name: string;
    price_delta_minor: number; is_available: boolean; sort_order: number;
  }[];
  profiles: {
    business_id: UUID; item_id: UUID; version: number;
    is_active: boolean; document: unknown;
  }[];
};
```

Names must be nonblank; currency is three uppercase ASCII letters. Monetary
amounts, counts, bounds, ordering and versions are safe integers. Prices and store
surcharge are nonnegative; option deltas may be signed safe integers to retain
legacy arithmetic. Group minimum must not exceed maximum. IDs are unique within
each row array; at most one profile exists per item (including inactive records).
Every row must belong to the root business. Groups reference existing items;
options reference existing groups; profiles reference existing items.

The planned optional mutable record is scoped by business + item. `version >= 1`
is its CAS revision, **not** the document's `schemaVersion:1`. Writers must advance
record version on changes, including activation changes. There are no audit-head
revisions, shared templates, immutable config history or automatic backfills.
Missing/inactive profiles take the legacy path (`profileVersion:0`). Inactive
documents are bounded JSON but need not be valid profile documents. Every active
document must validate; invalid active data never silently becomes legacy.

## Exact document JSON shapes

All object keys below are required; no additional keys are accepted. References
are existing option IDs: no duplicated flavor dictionary or separate unit SKU.

```ts
// Ordinary opt-in extras: no multi-distinct pizza fee.
{schemaVersion: 1, kind: "standard"}

{schemaVersion: 1, kind: "pizza", sizeGroupId: UUID, flavorGroupId: UUID,
 matrix: [{sizeOptionId: UUID, flavorOptionId: UUID,
           priceMinor: number, available: boolean}]}

{schemaVersion: 1, kind: "dozen", varietyGroupId: UUID}

{schemaVersion: 1, kind: "combo", components: [{
  componentId: UUID, itemId: UUID, quantity: number, order: number,
  fixedGroupPicks: [{groupId: UUID, picks: [{optionId: UUID, quantity: number}]}],
  allowedOptions: [{groupId: UUID, optionIds: UUID[]}]
}]}
```

### Pizza / dozen / standard

A pizza must currently have exactly its two referenced groups. SIZE is distinct
with min=max=1; FLAVOR is distinct with min=1/max=2. Purpose comes exclusively from
typed document references, never editable group names. The matrix is complete:
one unique row per size × flavor, including disabled combinations. Both referenced
group membership and option availability apply, as well as matrix availability.

One flavor costs its full matrix price for the selected size. Two different
flavors cost `floor((a+b)/2) + storeSurchargeMinor`, in integer minor units. The sum
and floor use BigInt intermediates. Two identical half entries become one flavor
and incur no fee. More than two submitted half entries are rejected before
normalization. Matrix pricing never adds base item price or option deltas.

A dozen must have exactly its referenced quantity group, min=max=12. Any available
allowed mix, including twelve of one variety, costs only the parent item price;
stored deltas are ignored. No other quantity group is inferred to be a dozen.
These group-count/cardinality checks happen in catalog validation, not deferred
SQL assumptions. Standard profiles retain their existing group cardinality and
use base + quantity × delta, with no pizza fee. New standard descriptions join
extras with ` + ` rather than inventing pizza halves.

### Fixed-product combo

A combo parent has no own option groups and at least one component. Component IDs
and orders are unique; quantity is positive. Different components may reference
the same fixed child item. Child items must exist in this business, use the parent
currency and be available at selection time. Each child may be a configured leaf
or legacy item, never another active combo; self-reference is forbidden. There is
no recursive engine. Inactive combo documents do not turn legacy items into combos.

Restrictions refer only to groups/options belonging to the fixed child.
`fixedGroupPicks` fixes the **complete selection of a group**, not a hidden default:
the customer sends it explicitly. `allowedOptions` restricts picks in that group
to an allowlist; an absent entry adds no restriction beyond the child configuration.
An empty allowlist permits no picks. If both apply, fixed picks must be allowed.
Structurally, fixed groups must satisfy membership, counts and restrictions;
the structural validator uses a fresh availability-neutral option projection.
Transient item/option availability never invalidates the catalog structure.
Whole-child purchase validation uses the actual snapshot availability and pizza
size/flavor compatibility: an exhausted fixed choice makes only dependent
selections unbuyable, not unrelated items. SQL must permit normal agotado updates
without rejecting existing fixed references. Catalog validation is not a
satisfiability solver for every possible combination of optional restrictions.

For one dozen + two fixed muzzarellas, reference the dozen with quantity 1 and the
pizza with quantity 2. Fix the pizza flavor group to muzzarella; optionally fix
its size group, or expose an allowed size list. No customer child item ID is
accepted, so the customer cannot substitute another product. Each child instance
is independently configured and validated, including legacy cardinality and
availability. The combo charges only its parent price: child base/deltas/pizza
fees (even hypothetical child amount overflow) are never added.

## Exact selection JSON

```ts
type Groups = {groupId: UUID, picks: {optionId: UUID, quantity: number}[]}[];
// standard/pizza/dozen all use the SAME existing option-ID representation
{kind: "leaf", profileVersion: number, groups: Groups}
{kind: "legacy", profileVersion: 0, groups: Groups}
{kind: "combo", profileVersion: number, components: [{
  componentId: UUID, instanceIndex: number,
  selection: {kind: "leaf" | "legacy", profileVersion: number, groups: Groups}
}]}
```

Versions must equal current active record versions, or zero for legacy. Legacy
selection on an active profile is rejected (`profile_required`), even if its
option picks would otherwise work. Combo instances use zero-based indices below
that component's quantity, with every instance present exactly once. Missing,
duplicate, additional, wrong-index, nested or substituted instances fail.
Selections have unique group IDs and positive safe pick quantities. New profiles
reject duplicate option IDs except the explicit identical-pizza-halves rule;
distinct picks have quantity 1. Quantity sums use BigInt before bounds comparison.

Canonical new-profile groups and picks sort by normalized ID. Matrix rows sort by
size then flavor ID; components sort by configured order then component ID;
instances sort by index. Canonical identity includes schemaVersion, business,
parent item, root profileVersion, component/instance identity and every child
profileVersion and normalized pick. Reordering input does not change it; swapping
independent instance choices does. It is an identity string, not a cryptographic
fingerprint. A root legacy identity request deliberately fails: existing cart key
semantics remain owned by the existing cart implementation.

For coherent, valid legacy wire input, the wrapper calls the actual unchanged
`priceSelection` / `describeSelection`; it preserves prices, errors, ordering,
text and the old multi-distinct fee. Description remains permissive when the old
validator rejects picks. `validateProfileSelection` still returns those errors.
Strict outer JSON/UUID/duplicate-group/resource guards apply before helper calls,
as they already do in the existing order intent boundary. Root legacy arithmetic
is not rewritten; existing order quote amount guards remain necessary.

## Descriptions / fresh kitchen snapshot

Descriptions use catalog sort_order then ID for deterministic display. Pizza:
`Grande · Mitad Muzzarella / mitad Napolitana`; dozen:
`6 Carne + 6 Especial`; combo: `Docena: … · Pizza: … · Pizza: …`.
Never infer purpose from a group name.

```ts
type GroupSnapshot = {groupId: UUID, name: string,
  picks: {optionId: UUID, name: string, quantity: number}[]};
type ComponentSnapshot = {componentId: UUID, instanceIndex: number,
  itemId: UUID, name: string, profileVersion: number,
  text: string, groups: GroupSnapshot[]};
{ok: true, text: string, groups: GroupSnapshot[], components: ComponentSnapshot[]}
```

Child snapshots contain names and choices, not double-billed child prices. The
caller must persist accepted snapshots immutably in future orders; this pure API
has no persistence or database side effects. It does not authenticate membership,
make current rows atomic or prove SQL direct-write safety.

## Errors, bounds and next integration gates

Domain errors are `{code,path}` where path is a boundary label or relevant UUID:
`invalid_document`, `invalid_catalog`, `invalid_reference`, `invalid_selection`,
`profile_version`, `profile_required`, `unavailable`, `forbidden_option`,
`amount_out_of_range`. Group validation reuses existing `SelectionError` objects
(`unknown_group`, `unknown_option`, `unavailable_option`, `invalid_quantity`,
`repeated_option`, `too_few`, `too_many`, `missing_selection`, `negative_price`).
Errors are not localized customer messages. Structural validation fails first;
active documents are checked in item-ID order; leaf group errors follow normalized
selection order, then missing groups in catalog order. Legacy helper errors retain
legacy ordering. Consumers must branch on codes, not depend on the first UUID when
several catalog relationships are broken.

Named technical ceilings exported by `catalog-profiles.ts`:

| Constant | Value | Applies to |
| --- | ---: | --- |
| PROFILE_MAX_JSON_BYTES | 262144 | UTF-8 JSON document / whole selection |
| PROFILE_MAX_CATALOG_BYTES | 2097152 | Projected catalog including profiles |
| PROFILE_MAX_ROWS | 1000 | Each catalog row array |
| PROFILE_MAX_MATRIX_ROWS | 4096 | Matrix rows (byte cap may bind earlier) |
| PROFILE_MAX_COMPONENTS | 32 | Combo component definitions |
| PROFILE_MAX_INSTANCES | 100 | Sum of combo quantities / submitted instances |
| PROFILE_MAX_GROUPS | 100 | Groups in a selection / restriction array |
| PROFILE_MAX_PICKS | 1000 | Total picks per leaf / IDs per allowlist |
| PROFILE_MAX_DEPTH | 12 | JSON nesting depth, root at zero |

All ceilings are inclusive and bound work/payload, not commercial offerings.
Cycles, non-JSON values, unsafe integers, duplicate references, excessive depth
and oversized UTF-8 payloads are rejected. Do not expose a UI commercial maximum
from these numbers without a separate product decision.

T2 must enforce business+item+group references, bounded documents, CAS versioning,
coordinated catalog mutation and direct-write guards in SQL. T3 must block legacy
quote downgrade for active profiles and fence snapshot freshness atomically;
merely importing this module does not protect the existing v1 endpoint. T4/T5 must
send full fixed choices and each independent instance, treat invalid active data
as unavailable, preserve old carts/orders and use existing business/async locks.
No activation or historical migration change is part of this unit.
