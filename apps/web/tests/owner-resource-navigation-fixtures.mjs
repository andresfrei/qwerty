import { load } from './owner-first-store-fixtures.mjs';
export const businessId = '11111111-1111-4111-8111-111111111111';
export const itemId = '22222222-2222-4222-8222-222222222222';
export const groupId = '33333333-3333-4333-8333-333333333333';
export const recordId = '44444444-4444-4444-8444-444444444444';
export const foreignId = '55555555-5555-4555-8555-555555555555';
export const ownerId = '66666666-6666-4666-8666-666666666666';
export const category = { id: recordId, business_id: businessId, name: 'Carta', sort_order: 0 };
export const item = { id: itemId, business_id: businessId, name: 'Producto' };
export const group = { id: groupId, business_id: businessId, item_id: itemId, name: 'Gustos', selection_mode: 'distinct', min_select: 1, max_select: 2, sort_order: 0 };
export const option = { id: recordId, business_id: businessId, group_id: groupId, name: 'Uno', price_delta_minor: 0, is_available: true, sort_order: 0 };
export const api = () => load('apps/web/app/owner/catalog/catalog-page-data.ts', { 'server-only': {} });

/** SDK-shaped, read-only adapter: observes public queries, never stores mutations. */
export function fixture({ tables = {}, change = r => r, user = {}, businesses } = {}) {
  const calls = [];
  let authCalls = 0;
  const source = {
    businesses: businesses ?? [{ id: businessId, name: 'Tienda', owner_id: ownerId }],
    business_storefronts: [], catalog_categories: [category], catalog_items: [item],
    catalog_option_groups: [group], catalog_options: [option], business_catalog_settings: [], ...tables,
  };
  const client = {
    auth: { async getUser() { authCalls++; return { data: { user: { id: ownerId, email: 'owner@example.test', role: 'authenticated', email_confirmed_at: '2026-01-01', ...user } }, error: null }; } },
    from(table) {
      const call = { table, eq: [], order: [] }; calls.push(call);
      const query = {
        select(fields, options) { call.fields = fields; call.count = options?.count; return query; },
        eq(key, value) { call.eq.push([key, value]); return query; },
        ilike(key, value) { call.search = [key, value]; return query; },
        order(key, options) { call.order.push([key, options]); return query; },
        range(from, to) { call.range = [from, to]; return query; },
        limit(n) { call.limit = n; return query; },
        maybeSingle() { call.single = true; return query; },
        then(resolve, reject) {
          try {
            let data = source[table].filter(row => call.eq.every(([key, value]) => row[key] === value));
            const count = data.length;
            for (const [key] of [...call.order].reverse()) data = [...data].sort((a, b) => a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0);
            if (call.range) data = data.slice(call.range[0], call.range[1] + 1);
            if (call.limit) data = data.slice(0, call.limit);
            resolve(change({ data: call.single ? data[0] ?? null : data, count, error: null }, call));
          } catch (error) { reject(error); }
        },
      };
      return query;
    },
  };
  return { client, calls, source, get authCalls() { return authCalls; }, catalogCalls: () => calls.filter(c => c.table.startsWith('catalog_') || c.table === 'business_catalog_settings') };
}
