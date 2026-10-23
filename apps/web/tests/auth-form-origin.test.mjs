import assert from 'node:assert/strict';
import test from 'node:test';
import config from '../next.config.mjs';

const documents = ['/auth/login', '/auth/signup', '/auth/forgot-password', '/auth/update-password', '/owner'];
const privatePaths = [
  '/auth/login/submit', '/auth/signup/submit', '/auth/forgot-password/submit',
  '/auth/update-password/submit', '/auth/logout', '/auth/confirm', '/auth/error',
  '/owner/catalog', '/owner/orders', '/owner/catalog/nested', '/auth/unknown',
];
const cacheHeaders = {
  'Cache-Control': 'private, no-cache, no-store, must-revalidate, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
};
const matches = (source, path) => {
  if (!source.endsWith('/:path*')) return source === path;
  const root = source.slice(0, -'/:path*'.length);
  return path === root || path.startsWith(`${root}/`);
};
const resolve = (rules, path) => Object.assign({}, ...rules
  .filter(rule => matches(rule.source, path))
  .map(rule => Object.fromEntries(rule.headers.map(({ key, value }) => [key, value]))));

for (const document of documents) {
  test(`${document} overrides generic privacy only for its native-form document`, async () => {
    const rules = await config.headers();
    const genericIndices = ['/owner/:path*', '/auth/:path*'].map(source => rules.findIndex(rule => rule.source === source));
    assert.ok(genericIndices.every(index => index >= 0));
    const index = rules.findIndex(rule => rule.source === document);
    assert.ok(index > Math.max(...genericIndices), 'exact document override must follow both generic rules');
    assert.deepEqual(resolve(rules, document), { ...cacheHeaders, 'Referrer-Policy': 'same-origin' });
    assert.deepEqual(Object.fromEntries(rules[index].headers.map(({ key, value }) => [key, value])), {
      ...cacheHeaders, 'Referrer-Policy': 'same-origin',
    });
  });
}

test('generic private rules and non-document endpoints retain no-referrer and cache protection', async () => {
  const rules = await config.headers();
  assert.deepEqual(rules.map(rule => rule.source), ['/owner/:path*', '/auth/:path*', ...documents]);
  for (const source of ['/owner/:path*', '/auth/:path*']) {
    const rule = rules.find(rule => rule.source === source);
    assert.deepEqual(Object.fromEntries(rule.headers.map(({ key, value }) => [key, value])), {
      ...cacheHeaders, 'Referrer-Policy': 'no-referrer',
    });
  }
  for (const path of privatePaths) {
    assert.deepEqual(resolve(rules, path), { ...cacheHeaders, 'Referrer-Policy': 'no-referrer' }, path);
  }
  assert.deepEqual(resolve(rules, '/'), {});
});
