import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { load, nodes, text, sdk, a, b, owner, business, storefront } from './owner-dashboard-fixtures.test.mjs';
const root = 'apps/web/app/owner/';
test('staged owner shell exists, with actual reusable view and data exports', () => {
  assert.ok(existsSync(root+'owner-shell.tsx'), 'Missing staged OwnerShell UI (explicit RED assertion)');
  assert.equal(typeof load(root+'owner-shell.tsx').OwnerShell, 'function');
  assert.equal(typeof load(root+'owner-dashboard-data.ts').loadOwnerDashboard, 'function');
});
test('all four menus, native owned switcher, current module links, separate create and native logout', () => {
  const { OwnerShell } = load(root+'owner-shell.tsx');
  const tree = OwnerShell({ ownedBusinesses:[{id:a,name:'Tienda A'},business], selectedBusiness:business, activeModule:'catalog', account:{id:owner}, pagination:{page:0,hasMore:true} });
  const all = nodes(tree), nav = all.find(n=>n.type==='nav'&&n.props['aria-label']==='Menú principal');
  assert.deepEqual(nodes(nav).filter(n=>n.type==='a').map(n=>text(n)), ['Inicio','Pedidos','Catálogo','Tienda']);
  assert.ok(all.some(n=>n.type==='details')); assert.ok(all.some(n=>n.type==='summary'&&text(n).includes('Tienda B')));
  assert.ok(all.some(n=>n.type==='a'&&n.props.href===`/owner/catalog?businessId=${a}`));
  assert.ok(all.some(n=>n.type==='a'&&n.props['aria-current']==='true'&&text(n).includes('✓')));
  assert.ok(all.some(n=>n.type==='a'&&n.props.href===`/owner/stores/new?businessId=${b}`&&text(n).includes('Crear tienda')));
  assert.ok(all.some(n=>n.type==='a'&&n.props.href===`/owner/catalog?businessId=${b}&storePage=1`));
  assert.ok(all.some(n=>n.type==='form'&&n.props.action==='/auth/logout'&&n.props.method==='post'));
});
test('shell preserves create selection, announces selected name and uses semantic pagination navigation', () => {
  const {OwnerShell}=load(root+'owner-shell.tsx');
  const props={ownedBusinesses:[business],selectedBusiness:business,activeModule:'store',account:{id:owner},pagination:{page:1,hasMore:true}};
  const all=nodes(OwnerShell(props));
  const trigger=all.find(n=>n.type==='summary');
  assert.match(trigger.props['aria-label']??text(trigger),/Tienda B/);
  const pagination=all.find(n=>n.type==='nav'&&n.props['aria-label']==='Páginas de tiendas');
  assert.ok(pagination,'Pagination links need a native navigation landmark');
  assert.deepEqual(nodes(pagination).filter(n=>n.type==='a').map(n=>n.props.href),[`/owner/store?businessId=${b}&storePage=0`,`/owner/store?businessId=${b}&storePage=2`]);
  const html=renderToStaticMarkup(React.createElement(OwnerShell,props));
  assert.match(html,/class="sr-only"> Seleccionada/);
  const empty=nodes(OwnerShell({...props,selectedBusiness:null,ownedBusinesses:[],pagination:{page:0,hasMore:false}}));
  assert.equal(empty.find(n=>n.type==='a'&&text(n).includes('Crear tienda')).props.href,'/owner/stores/new');
  const emptyTrigger=empty.find(n=>n.type==='summary');
  assert.match(emptyTrigger.props['aria-label']??text(emptyTrigger),/Tus tiendas/);
});
test('UI search parser rejects extras, duplicates, arrays and malformed pages; API parser only sees selection', () => {
  const { parseOwnerDashboardSearch: parse } = load(root+'owner-dashboard-data.ts');
  assert.deepEqual(parse({businessId:b,storePage:'2'}), {ok:true,businessId:b,page:2});
  for (const p of [{businessId:[b]}, {storePage:['1']}, {storePage:'01'}, {storePage:'1000001'}, {storePage:'-1'}, {q:'x'}, {businessId:'bad'}]) assert.equal(parse(p).ok,false);
  assert.equal(parse(new URLSearchParams(`businessId=${b}&businessId=${b}`)).ok,false);
});
test('selected lookup independent of switcher page and every business read carries owned predicate', async () => {
  const { loadOwnerDashboard } = load(root+'owner-dashboard-data.ts');
  const client = sdk(); const data = await loadOwnerDashboard(client,{businessId:b,storePage:'1'});
  assert.equal(data.kind,'selected'); assert.equal(data.business.id,b); assert.equal(data.account.id,owner);
  assert.ok(!data.businesses.some(row=>row.id===b));
  const qs = client.queries.filter(q=>q.table==='businesses');
  assert.ok(qs.every(q=>q.filters.some(([k,v])=>k==='owner_id'&&v===owner)));
  assert.ok(qs.some(q=>q.filters.some(([k,v])=>k==='id'&&v===b)));
  assert.ok(qs.some(q=>q.range?.[0]===100));
  assert.deepEqual(client.queries.find(q=>q.table==='business_storefronts').filters,[['business_id',b]]);
});
test('empty, explicit missing, provider failure and changing identity are distinct fail-closed states', async () => {
  const { loadOwnerDashboard: get } = load(root+'owner-dashboard-data.ts');
  assert.equal((await get(sdk({rows:[],selected:null}),{})).kind,'empty');
  assert.equal((await get(sdk({selected:null}),{businessId:b})).kind,'missing');
  assert.equal((await get(sdk({error:true}),{})).kind,'unavailable');
  assert.equal((await get(sdk({identities:[{id:owner,email:'a@test',role:'authenticated',email_confirmed_at:'yes'},{id:a,email:'b@test',role:'authenticated',email_confirmed_at:'yes'}]}),{})).kind,'unavailable');
  assert.equal((await get(sdk(),{businessId:'bad'})).kind,'invalid');
});
test('no session and unconfirmed retain login redirects; anonymous identity cannot read stores', async () => {
  const { loadOwnerDashboard: get } = load(root+'owner-dashboard-data.ts');
  assert.match((await get(sdk({user:null}),{})).href,/required/);
  assert.match((await get(sdk({user:{id:owner,email:'a@test'}}),{})).href,/unconfirmed/);
  const client=sdk({user:{id:owner,email:'a@test',email_confirmed_at:'yes',role:'authenticated',is_anonymous:true}});
  assert.equal((await get(client,{})).kind,'redirect'); assert.equal(client.queries.length,0);
});
test('actual server presentations contain real selected values and publication-only buyer link, no fictitious metrics', () => {
  const { OwnerHomeView, StoreDetails } = load(root+'owner-dashboard-views.tsx');
  const home=renderToStaticMarkup(React.createElement(OwnerHomeView,{business,storefront}));
  assert.match(home,/Tienda B/); assert.match(home,/Sin publicar/); assert.doesNotMatch(home,/Ventas|Ingresos|Próximamente|\$|0 pedidos/);
  const hidden=renderToStaticMarkup(React.createElement(StoreDetails,{business,storefront}));
  assert.doesNotMatch(hidden,/href="\/store\//); assert.match(hidden,/tienda-b/);
  const published=renderToStaticMarkup(React.createElement(StoreDetails,{business,storefront:{...storefront,is_published:true}}));
  assert.match(published,/href="\/store\/tienda-b"/);
});
test('server renderer mounts empty creation separately and keys selected publication roots', () => {
  const { OwnerDashboardView } = load(root+'owner-dashboard-views.tsx', {'next/navigation':{redirect:href=>{throw Error(href);}}});
  const context={account:{id:owner},businesses:[business],pagination:{page:0,hasMore:false}};
  const empty=nodes(OwnerDashboardView({data:{kind:'empty',...context}}));
  const create=empty.find(n=>n.type?.name==='CreateStore'); assert.equal(create.props.firstStore,true); assert.equal(create.props.accountId,owner);
  const selected=nodes(OwnerDashboardView({data:{kind:'selected',...context,business,storefront},module:'store'}));
  const publication=selected.find(n=>n.type?.name==='StorePublication'); assert.equal(publication.props.businessId,b); assert.ok(publication.key.endsWith(b));
  assert.throws(()=>OwnerDashboardView({data:{kind:'redirect',href:'/auth/login?access=required'}}),/required/);
});
test('provider auth errors and contradictory later identities fail closed without empty presentation', async () => {
  const {loadOwnerDashboard:get}=load(root+'owner-dashboard-data.ts');
  const client=sdk(); client.auth.getUser=async()=>({data:{user:null},error:{message:'provider down'}});
  assert.equal((await get(client,{})).kind,'unavailable'); assert.equal(client.queries.length,0);
  const user={id:owner,email:'a@test',role:'authenticated',email_confirmed_at:'yes'};
  assert.equal((await get(sdk({identities:[user,user,{...user,id:a}]}),{})).kind,'unavailable');
});
test('owner layout contains only children and same-origin referrer metadata', () => {
  const m=load(root+'layout.tsx'); assert.equal(m.metadata.referrer,'same-origin');
  assert.equal(m.default({children:'sentinel'}),'sentinel');
});
