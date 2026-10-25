import { fixture, id } from './catalog-profiles-fixtures.mjs';
export { id, pick, groupPick, leaf, frozen } from './catalog-profiles-fixtures.mjs';
export function configuredFixture(kind = 'pizza', quantity = 1) {
  const f = fixture();
  f.catalog.surchargeMinor = 100_000;
  f.catalog.items.find(i => i.id === id(2)).price_minor = 1_200_000;
  f.catalog.items.find(i => i.id === id(3)).price_minor = 3_000_000;
  for (const row of f.catalog.profiles[0].document.matrix) row.priceMinor = row.flavorOptionId === id(23) ? 1_200_000 : 1_000_000;
  const itemId = id({ pizza: 1, dozen: 2, combo: 3, extras: 4 }[kind]);
  const wire = { version: 2, requestId: id(70), receiptId: id(71), contact: { name: ' Ana ', email: ' ana@example.test ', telephone: ' 123456789 ' }, expected: { currency: 'ARS', totalMinor: ({ pizza: 1_200_000, dozen: 1_200_000, combo: 3_000_000, extras: 2300 }[kind]) * quantity }, lines: [{ itemId, quantity, selection: f[kind] }] };
  return { ...f, wire, snapshot: { version: 2, schemaVersion: 1, slug: 'pizza', ...f.catalog, fingerprint: 'a'.repeat(64) } };
}
