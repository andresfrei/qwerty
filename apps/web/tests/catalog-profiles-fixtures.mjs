// Lazy core import keeps the contract unit independent of the pricing consumer.
export const loadProfileDomain = () => import('../app/lib/catalog-profiles.ts');

export const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const pick = (n, quantity = 1) => ({optionId: id(n), quantity});
export const groupPick = (n, picks) => ({groupId: id(n), picks});
export const leaf = (groups, profileVersion = 1) => ({kind: profileVersion ? 'leaf' : 'legacy', profileVersion, groups});
export function fixture() {
  const businessId = id(99);
  const item = (n, name, price_minor) => ({id: id(n), business_id: businessId, name, price_minor, currency: 'ARS', is_available: true});
  const group = (n, item, mode, min, max) => ({id: id(n), business_id: businessId, item_id: id(item), name: `Grupo ${n}`, selection_mode: mode, min_select: min, max_select: max, sort_order: n});
  const option = (n, g, name, delta = 0) => ({id: id(n), business_id: businessId, group_id: id(g), name, price_delta_minor: delta, is_available: true, sort_order: n});
  const profile = (n, document) => ({business_id: businessId, item_id: id(n), version: 1, is_active: true, document: {schemaVersion: 1, ...document}});
  const catalog = {businessId, surchargeMinor: 1000,
    items: [item(1, 'Pizza', 999), item(2, 'Docena', 12000), item(3, 'Combo', 30000), item(4, 'Extras', 2000)],
    groups: [group(10, 1, 'distinct', 1, 1), group(11, 1, 'distinct', 1, 2), group(12, 2, 'quantity', 12, 12), group(13, 4, 'distinct', 0, 3)],
    options: [option(20, 10, 'Grande', 9000), option(21, 10, 'Chica'), option(22, 11, 'Muzzarella', 500), option(23, 11, 'Napolitana', 800), option(24, 11, 'Especial'), option(25, 12, 'Carne'), option(26, 12, 'Especial', 9999), option(27, 13, 'Huevo', 100), option(28, 13, 'Queso', 200)],
    profiles: [profile(1, {kind: 'pizza', sizeGroupId: id(10), flavorGroupId: id(11), matrix: [20, 21].flatMap(size => [22, 23, 24].map(flavor => ({sizeOptionId: id(size), flavorOptionId: id(flavor), priceMinor: flavor === 23 ? 12000 : 10000, available: !(size === 21 && flavor === 23)})))}), profile(2, {kind: 'dozen', varietyGroupId: id(12)}), profile(3, {kind: 'combo', components: [
      {componentId: id(50), itemId: id(2), quantity: 1, order: 0, fixedGroupPicks: [], allowedOptions: []},
      {componentId: id(51), itemId: id(1), quantity: 2, order: 1, fixedGroupPicks: [groupPick(11, [pick(22)])], allowedOptions: [{groupId: id(10), optionIds: [id(20), id(21)]}]}
    ]}), profile(4, {kind: 'standard'})]};
  const pizza = leaf([groupPick(10, [pick(20)]), groupPick(11, [pick(22), pick(23)])]);
  const dozen = leaf([groupPick(12, [pick(25, 6), pick(26, 6)])]);
  const combo = {kind: 'combo', profileVersion: 1, components: [
    {componentId: id(50), instanceIndex: 0, selection: structuredClone(dozen)},
    ...[0, 1].map(instanceIndex => ({componentId: id(51), instanceIndex, selection: leaf([groupPick(10, [pick(instanceIndex ? 21 : 20)]), groupPick(11, [pick(22)])])}))
  ]};
  return {catalog, pizza, dozen, combo, extras: leaf([groupPick(13, [pick(27), pick(28)])])};
}
export function unavailableFixedComboFixture(kind) {
  const f = fixture();
  if (kind === 'size') {
    f.catalog.profiles[2].document.components[1].fixedGroupPicks.push(groupPick(10, [pick(20)]));
    f.combo.components.filter(c => c.componentId === id(51)).forEach(c => {
      c.selection.groups.find(g => g.groupId === id(10)).picks = [pick(20)];
    });
  }
  if (kind === 'child') f.catalog.items[0].is_available = false;
  else f.catalog.options.find(o => o.id === id(kind === 'size' ? 20 : 22)).is_available = false;
  return f;
}

export const request = (catalog, item, selection) => ({catalog, itemId: id(item), selection});
export function frozen(value) {
  if (value && typeof value === 'object') { Object.freeze(value); for (const child of Object.values(value)) frozen(child); }
  return value;
}
