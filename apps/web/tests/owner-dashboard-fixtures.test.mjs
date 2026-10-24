import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import ts from 'typescript';
import * as React from 'react';
const require = createRequire(import.meta.url);
export const a = '11111111-1111-4111-8111-111111111111';
export const b = '22222222-2222-4222-8222-222222222222';
export const owner = '33333333-3333-4333-8333-333333333333';
export const business = { id: b, name: 'Tienda B' };
export const storefront = { slug: 'tienda-b', display_name: 'Tienda B', is_published: false };
export function load(file, mocks = {}, cache = new Map()) {
  file = resolve(file);
  if (cache.has(file)) return cache.get(file);
  const js = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} }; cache.set(file, module.exports);
  new Function('require', 'module', 'exports', js)(name => {
    if (name in mocks) return mocks[name];
    if (name.startsWith('.') || name.startsWith('@/')) {
      let p = name.startsWith('@/') ? resolve('apps/web', name.slice(2)) : resolve(dirname(file), name);
      if (!/\.tsx?$/.test(p)) p += existsSync(p + '.ts') ? '.ts' : '.tsx';
      return load(p, mocks, cache);
    }
    return require(name);
  }, module, module.exports);
  return module.exports;
}
// Only actual hook-free presentations are expanded; never invoke arbitrary hook components.
const presentations = new Set(['AsyncActionButton', 'OwnerShell', 'StoreDetails', 'OwnerHomeView']);
export function nodes(t) {
  if (!t || typeof t !== 'object') return [];
  if (presentations.has(t.type?.name)) return nodes(t.type(t.props));
  return [t, ...React.Children.toArray(t.props?.children).flatMap(nodes)];
}
export const text = t => typeof t === 'string' ? t : !t || typeof t !== 'object' ? '' : React.Children.toArray(t.props?.children).map(text).join(' ');
export const tick = () => new Promise(r => setImmediate(r));
export function harness(file, props, mocks = {}, name = 'default') {
  const slots = [], effects = []; let cursor = 0;
  const hooks = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], v => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useEffect(fn, deps) { const i = cursor++; const prev = slots[i]; if (!prev || deps.some((v,j)=>v!==prev.deps[j])) { effects.push(()=>{prev?.cleanup?.(); slots[i] = { deps, cleanup: fn() };}); } },
  };
  const module = load('apps/web/app/owner/' + file, { ...mocks, react: hooks });
  const render = () => { cursor = 0; return module[name](props); };
  return { render, flush() { while (effects.length) effects.shift()(); }, unmount() { for (const s of slots) s?.cleanup?.(); }, find(id) { return nodes(render()).find(n=>n.props?.id===id); }, props };
}
export function storage() { const values = new Map(); return { values, getItem:k=>values.get(k)??null, setItem:(k,v)=>values.set(k,v), removeItem:k=>values.delete(k) }; }
export function sdk({ rows = [{ id:a, name:'Tienda A' }], selected = business, store = storefront, user = { id:owner, email:'owner@example.test', email_confirmed_at:'yes', role:'authenticated' }, error = false, identities } = {}) {
  const queries = []; let authCalls = 0;
  return { queries, auth: { async getUser() { const current = identities ? identities[authCalls++] : user; return { data:{ user:current }, error:null }; } }, from(table) {
    const q = { table, filters:[], range:null }; queries.push(q);
    const chain = { select(){return chain;}, eq(k,v){q.filters.push([k,v]);return chain;}, order(){return chain;}, limit(){q.limit=true;return chain;}, range(lo,hi){q.range=[lo,hi];return chain;}, maybeSingle(){q.single=true;return chain;}, then(resolve) {
      const data = table === 'business_storefronts' ? store : q.filters.some(([k])=>k==='id') ? (selected ? [selected] : []) : q.limit ? rows.slice(0,1) : rows;
      return Promise.resolve({data, error:error?{message:'fixture unavailable'}:null}).then(resolve);
    }}; return chain;
  }};
}
