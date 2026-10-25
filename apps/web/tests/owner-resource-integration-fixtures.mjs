import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { load } from './owner-first-store-fixtures.mjs';
import { fixture, businessId, foreignId, ownerId, product } from './owner-resource-navigation-fixtures.mjs';
export { businessId, foreignId, ownerId };
export const root = 'apps/web/app/owner/';
export function integration(options = {}) {
  const sdk = fixture({ tables: { catalog_items: [product] }, ...options });
  const failures = [], shells = [];
  // Synthetic SDK/page state only; no provider, cookie or real record access.
  const link = ({ href, children, businessId: _businessId, ...props }) => React.createElement('a', { href, ...props }, children);
  const mocks = {
    'server-only': {},
    'next/navigation': { redirect(href) { throw Object.assign(Error('redirect'), { href, status: 307 }); } },
    'next/link': { default: link },
    './photo-editor-client': { PhotoEditor: () => React.createElement('p', null, 'legacy photo') },
    './catalog-editor-client': { default: () => React.createElement('form', null, 'legacy editor') },
    '@/app/lib/supabase/server': { createClient: async () => options.clientNull ? null : sdk.client },
    '../owner-dashboard-views': { OwnerDashboardView: ({ data }) => { failures.push(data); return React.createElement('p', null, data.kind); } },
    './catalog-form-navigation': { CatalogLink: link, CatalogInspectionLink: link, CatalogSessionContext: React.createContext(null) },
    './catalog-form-scope': { CatalogFormFrame: ({ readOnly }) => readOnly },
  };
  const { OwnerShell } = load(root + 'owner-shell.tsx', mocks);
  return { sdk, failures, shells, OwnerShell,
    html: props => renderToStaticMarkup(React.createElement(OwnerShell, props)),
    async entry(search = {}) {
      return renderToStaticMarkup(await load(root + 'catalog/page.tsx', mocks).default({ searchParams: Promise.resolve(search) }));
    },
    async page(resource, search = {}, view = {}) {
      const module = resource === 'items' ? 'catalog-product-page' : 'catalog-taxonomy-page';
      const exported = resource === 'items' ? 'CatalogProductPage' : 'CatalogTaxonomyPage';
      const adapter = load(root + `catalog/${module}.tsx`, { ...mocks, '../owner-shell': {
        OwnerShell: props => { shells.push(props); return React.createElement(OwnerShell, props); },
      } })[exported];
      return renderToStaticMarkup(await adapter({ search, view: { resource, ...view } }));
    },
  };
}
export const shellProps = {
  ownedBusinesses: [{ id: businessId, name: 'Tienda' }, { id: foreignId, name: 'Otra tienda' }],
  selectedBusiness: { id: businessId, name: 'Tienda' }, activeModule: 'catalog',
  account: { id: ownerId }, pagination: { page: 1, hasMore: true },
};
