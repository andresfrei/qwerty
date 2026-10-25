import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { load } from './owner-first-store-fixtures.mjs';
import { fixture, businessId, itemId, recordId, product } from './owner-resource-navigation-fixtures.mjs';
export { businessId, itemId, recordId };
export function products(options = {}) {
  const sdk = fixture({ tables: { catalog_items: [product] }, ...options });
  const frames = [], editors = [], failures = [], shells = []; let clients = 0;
  const passthrough = props => { shells.push(props); return props.children; };
  const link = ({ href, children }) => React.createElement('a', { href }, children);
  const mocks = {
    'server-only': {},
    '@/app/lib/supabase/server': { createClient: async () => { clients++; return sdk.client; } },
    '../owner-shell': { OwnerShell: passthrough },
    '../owner-dashboard-views': { OwnerDashboardView: ({ data }) => { failures.push(data); return React.createElement('p', null, data.kind); } },
    './catalog-form-navigation': { CatalogLink: link, CatalogInspectionLink: link, CatalogSessionContext: React.createContext(null) },
    './catalog-form-scope': {
      CatalogFormFrame: props => { frames.push(props); return options.readOnly ? props.readOnly : props.editable; },
      CatalogScopedForm: props => { editors.push(props); return React.createElement('form', { 'aria-label': props.title }, props.children); },
    },
    './photo-editor-client': { PhotoEditor: props => { editors.push({ photo: props }); return React.createElement('p', null, 'photo-editor'); } },
    './catalog-profile-editor-client': { CatalogProfileEditor: props => { editors.push({ profile: props }); return React.createElement('p', null, 'profile-editor'); } },
  };
  function page(mode) { return load(`apps/web/app/owner/catalog/items/${mode === 'detail' ? '[itemId]/' : mode === 'new' ? 'new/' : ''}page.tsx`, mocks).default; }
  return { sdk, frames, editors, failures, shells, page, markup: renderToStaticMarkup,
    get clients() { return clients; },
    search: { businessId, storePage: '2', page: '0', q: 'Pizza', categoryId: recordId },
  };
}
export function productFormFields(form) {
  const fields = new Map([['action', form.identity.action]]);
  function collect(tree) {
    for (const node of descendants(tree)) {
      if (typeof node.type === 'function') collect(node.type(node.props));
      else if (node.props.name) fields.set(node.props.name, String(node.props.value ?? node.props.defaultValue ?? ''));
    }
  }
  collect(form.children); return fields;
}
export function descendants(tree) {
  if (Array.isArray(tree)) return tree.flatMap(descendants);
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...React.Children.toArray(tree.props?.children).flatMap(descendants)];
}
