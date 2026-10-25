import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { load } from './owner-first-store-fixtures.mjs';
import { fixture, businessId, recordId, foreignId, category, itemId, groupId, group } from './owner-resource-navigation-fixtures.mjs';
export { businessId, recordId, foreignId, category, itemId, groupId, group };

/** Isolated page fixture; the frozen SDK fixture never receives mutation methods. */
export function taxonomy(options = {}) {
  const sdk = fixture({ ...options, change(result, call) {
    // The shared SDK fixture does not project selects; emulate this exact strict DTO locally.
    if (call.table === 'business_storefronts' && result.data) {
      const { slug, display_name, is_published } = result.data;
      result = { ...result, data: { slug, display_name, is_published } };
    }
    return options.change ? options.change(result, call) : result;
  } }), frames = [], forms = [];
  let clients = 0;
  const link = ({ href, children }) => React.createElement('a', { href }, children);
  const mocks = {
    'server-only': {},
    '@/app/lib/supabase/server': { createClient: async () => { clients++; return sdk.client; } },
    '../owner-shell': { OwnerShell: ({ children }) => children },
    '../owner-dashboard-views': { OwnerDashboardView: ({ data }) => React.createElement('p', null, data.kind) },
    './catalog-form-navigation': { CatalogLink: link, CatalogInspectionLink: link, CatalogSessionContext: React.createContext(null) },
    './catalog-form-scope': {
      CatalogFormFrame: props => { frames.push(props); return options.readOnly ? props.readOnly : props.editable; },
      CatalogScopedForm: props => { forms.push(props); return React.createElement('form', { 'aria-label': props.title }, props.children); },
    },
  };
  return { sdk, frames, forms, markup: renderToStaticMarkup, get clients() { return clients; },
    page(mode) {
      const groupMode = mode.startsWith('groups-') ? mode.slice(7) : null;
      const optionMode = mode.startsWith('options-') ? mode.slice(8) : null;
      const path = optionMode ? `options/${optionMode === 'detail' ? '[optionId]/' : optionMode === 'new' ? 'new/' : ''}`
        : groupMode ? `groups/${groupMode === 'detail' ? '[groupId]/' : groupMode === 'new' ? 'new/' : ''}`
        : mode === 'settings' ? 'settings/' : `categories/${mode === 'detail' ? '[categoryId]/' : mode === 'new' ? 'new/' : ''}`;
      return load(`apps/web/app/owner/catalog/${path}page.tsx`, mocks).default;
    },
    async render(mode, search = { businessId }, id = recordId) {
      return renderToStaticMarkup(await this.page(mode)({ searchParams: Promise.resolve(search), params: Promise.resolve({ categoryId: id, groupId: id, optionId: id }) }));
    },
  };
}
export function descendants(tree) {
  if (Array.isArray(tree)) return tree.flatMap(descendants);
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...React.Children.toArray(tree.props?.children).flatMap(descendants)];
}
export function fields(form) {
  const result = new Map([['action', form.identity.action]]);
  function collect(tree) {
    for (const node of descendants(tree)) {
      if (typeof node.type === 'function') collect(node.type(node.props));
      else if (node.props.name) result.set(node.props.name, String(node.props.value ?? node.props.defaultValue ?? ''));
    }
  }
  collect(form.children); return result;
}
export const storefront = { business_id: businessId, slug: 'tienda', display_name: 'Vidriera', is_published: true };
