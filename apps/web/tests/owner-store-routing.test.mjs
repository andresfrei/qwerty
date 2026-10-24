import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {load,nodes,text,a,b,owner,business,storefront} from './owner-dashboard-fixtures.test.mjs';
const root='apps/web/app/owner/';
const foreign='99999999-9999-4999-8999-999999999999';
function client({errorTable,empty=false,store=storefront,user={id:owner,email:'owner@test.invalid',email_confirmed_at:'yes',role:'authenticated'}}={}){
 const queries=[];const businesses=empty?[]:[{id:a,name:'Tienda A'},business];
 const category={id:b,name:'Carta B',sort_order:0},item={id:b,category_id:b,name:'Producto B',description:'Solo B',price_minor:123,currency:'ARS',is_available:true,sort_order:0,photo_path:null,photo_version:'9007199254740993'};
 return{queries,auth:{async getUser(){return{data:{user},error:null};}},from(table){const q={table,filters:[]};queries.push(q);const chain={select(){return chain;},eq(k,v){q.filters.push([k,v]);return chain;},in(k,v){q.filters.push([k,v]);return chain;},order(){return chain;},limit(){q.limit=true;return chain;},range(){return chain;},maybeSingle(){q.single=true;return chain;},then(resolve){let data;if(table==='businesses'){data=businesses.filter(row=>q.filters.every(([k,v])=>k!=='id'||row.id===v));if(q.limit)data=data.slice(0,1);}else if(table==='business_storefronts')data=store;else if(table==='catalog_categories')data=[category];else if(table==='catalog_items')data=[item];else if(table==='catalog_option_groups')data=[{id:b,item_id:b,name:'Grupo B',selection_mode:'distinct',min_select:1,max_select:1,sort_order:0}];else if(table==='catalog_options')data=[{id:b,group_id:b,name:'Opción B',price_delta_minor:0,is_available:true,sort_order:0}];else data={two_flavor_surcharge_minor:0};return Promise.resolve({data,error:table===errorTable?{message:'PRIVATE PROVIDER DETAIL'}:null}).then(resolve);}};return chain;}};
}
function page(file,c){return load(root+file,{'@/app/lib/supabase/server':{createClient:async()=>c},'next/navigation':{redirect:href=>{throw Error(href);}},'next/link':{default:props=>React.createElement('a',props)}});}
for(const file of ['page.tsx','store/page.tsx','stores/new/page.tsx','catalog/page.tsx','orders/page.tsx']){
 test(`${file} selects B with fresh owned data and account/business remount keys`,async()=>{
  const c=client(),m=page(file,c);assert.equal(m.dynamic,'force-dynamic');const tree=await m.default({searchParams:Promise.resolve({businessId:b})});
  const all=nodes(tree);const shell=all.find(n=>n.type?.name==='OwnerShell')??tree;
  // Expand the real pure server view before inspecting shell/client roots.
  const rendered=tree.type?.name==='OwnerDashboardView'?tree.type(tree.props):tree;
  assert.match(String(rendered.key??shell.key),new RegExp(owner));assert.match(String(rendered.key??shell.key),new RegExp(b));
  const expanded=nodes(rendered);assert.ok(c.queries.filter(q=>q.table==='businesses').every(q=>q.filters.some(([k,v])=>k==='owner_id'&&v===owner)));
  assert.ok(c.queries.some(q=>q.table==='businesses'&&q.filters.some(([k,v])=>k==='id'&&v===b)));
  assert.ok(expanded.some(n=>n.type==='summary'&&text(n).includes('Tienda B')));
  if(file==='catalog/page.tsx'){
   assert.ok(expanded.some(n=>n.type==='h1'&&text(n)==='Tienda B'));assert.ok(expanded.some(n=>text(n).includes('Producto B')));
   for(const table of ['catalog_categories','catalog_items','catalog_option_groups','catalog_options','business_catalog_settings'])assert.ok(c.queries.filter(q=>q.table===table).every(q=>q.filters.some(([k,v])=>k==='business_id'&&v===b)));
   const editor=expanded.find(n=>n.type?.name==='CatalogEditor');assert.equal(editor.props.business.id,b);assert.match(editor.key,new RegExp(b));
   const photo=expanded.find(n=>n.type?.name==='PhotoEditor');assert.equal(photo.props.businessId,b);assert.match(photo.key,new RegExp(b));
  }
  if(file==='orders/page.tsx'){const queue=expanded.find(n=>n.type?.name==='OrderQueueClient');assert.equal(queue.props.businessId,b);assert.match(queue.key,new RegExp(owner));assert.notEqual(m.metadata.referrer,'no-referrer');}
 });
 for(const selection of ['bad',foreign])test(`${file} invalid/foreign fails closed, no catalog or queue`,async()=>{
  const c=client(),m=page(file,c),tree=await m.default({searchParams:Promise.resolve({businessId:selection})});
  const actual=tree.type?.name==='OwnerDashboardView'?tree.type(tree.props):tree;
  assert.match(text(actual),selection==='bad'?/no es válida/:/No encontramos/);assert.ok(!nodes(actual).some(n=>['CatalogEditor','OrderQueueClient','FirstStore','CreateStore'].includes(n.type?.name)));
  assert.ok(!c.queries.some(q=>q.table.startsWith('catalog_')));
 });
}
for(const file of ['page.tsx','store/page.tsx','stores/new/page.tsx','catalog/page.tsx','orders/page.tsx']){
 test(`${file} omitted selection chooses authorized A, empty account uses new creation`,async()=>{
  const m=page(file,client()),tree=await m.default({searchParams:Promise.resolve({})});const view=tree.type?.name==='OwnerDashboardView'?tree.type(tree.props):tree;
  assert.ok(nodes(view).some(n=>n.type==='summary'&&text(n).includes('Tienda A')));
  const empty=await page(file,client({empty:true})).default({searchParams:Promise.resolve({})});const expanded=empty.type(empty.props);const create=nodes(expanded).find(n=>n.type?.name==='CreateStore');assert.equal(create.props.firstStore,true);assert.equal(create.props.accountId,owner);assert.ok(!nodes(expanded).some(n=>n.type?.name==='FirstStore'));
 });
 test(`${file} no-session/unconfirmed redirects and provider failure is not empty`,async()=>{
  for(const[user,reason]of [[null,'required'],[{id:owner,email:'owner@test.invalid'},'unconfirmed']]){
   const tree=await page(file,client({user})).default({searchParams:Promise.resolve({businessId:b})});assert.throws(()=>tree.type(tree.props),new RegExp(reason));
  }
  const tree=await page(file,client({errorTable:'businesses'})).default({searchParams:Promise.resolve({businessId:b})});const actual=tree.type(tree.props);assert.match(text(actual),/No pudimos/);assert.ok(!nodes(actual).some(n=>n.type?.name==='CreateStore'));assert.doesNotMatch(text(actual),/PRIVATE PROVIDER DETAIL/);
 });
}
test('actual SSR dropdown contains creation in details footer with selected context and four modules',()=>{
 const {OwnerShell}=load(root+'owner-shell.tsx');const html=renderToStaticMarkup(React.createElement(OwnerShell,{ownedBusinesses:[business],selectedBusiness:business,activeModule:'orders',account:{id:owner},pagination:{page:1,hasMore:true}}));
 const details=html.slice(html.indexOf('<details'),html.indexOf('</details>'));
 assert.match(details,new RegExp(`href="/owner/stores/new\\?businessId=${b}"`));assert.match(details,/Crear tienda/);assert.match(html,/aria-label="Páginas de tiendas"/);assert.match(html,/aria-label="Seleccionar tienda: Tienda B"/);
});
test('catalog provider failure is private unavailable, never partial editor/empty',async()=>{
 const c=client({errorTable:'catalog_items'}),m=page('catalog/page.tsx',c);const tree=await m.default({searchParams:Promise.resolve({businessId:b})});
 assert.match(text(tree),/No pudimos/);assert.doesNotMatch(text(tree),/PRIVATE PROVIDER DETAIL/);assert.ok(!nodes(tree).some(n=>n.type?.name==='CatalogEditor'));
});
test('missing draft mounts same selected business only in store view',async()=>{
 const c=client({store:null}),tree=await page('store/page.tsx',c).default({searchParams:Promise.resolve({businessId:b})});const view=tree.type(tree.props);
 const draft=nodes(view).find(n=>n.type?.name==='FirstStore');assert.equal(draft.props.business.id,b);assert.match(draft.key,new RegExp(owner));assert.match(draft.key,new RegExp(b));
});
