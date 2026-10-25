import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from './owner-first-store-fixtures.mjs';
import {component,nodes,storage} from './checkout-fixtures.mjs';
import {fixture,business,pizza,pizzaChoice} from './configured-public-fixtures.mjs';
import {configuredCartStorageKey} from '../app/lib/configured-cart.ts';
test('store page mounts public configuration DTO, never an owner/private loader',async()=>{
 const f=fixture(),result=await f.read(),calls=[];
 const Page=load('apps/web/app/store/[slug]/page.tsx',{'@/app/lib/configured-storefront-reader':{readConfiguredStorefront:async slug=>{calls.push(slug);return result;}},'../storefront-client':{default:()=>null,ConfiguredStorefrontClient:function ConfiguredStorefrontClient(){return null;}}}).default;
 const tree=await Page({params:Promise.resolve({slug:'tienda'})});const mounted=nodes(tree).find(n=>n.type?.name==='ConfiguredStorefrontClient');assert.ok(mounted);assert.deepEqual(mounted.props.catalog,result);assert.deepEqual(calls,['tienda']);
});
test('actual mounted storefront picker callback writes only after accepted choices, with synchronous variant merging',async()=>{
 const f=fixture(),catalog=await f.read(),s=storage(),old=globalThis.localStorage;globalThis.localStorage=s;
 try{const h=component('apps/web/app/store/storefront-client.tsx',{catalog},'ConfiguredStorefrontClient');h.render();h.render();assert.equal(s.writes.length,0);
 h.find(`configure-${pizza}`).props.onClick();let picker=nodes(h.render()).find(n=>n.type?.name==='DeferredPicker');assert.ok(picker);assert.equal(picker.props.scope,`${business}:tienda:${pizza}`);
 const reject=picker.props.onAccept;assert.equal(reject({kind:'leaf',profileVersion:90,groups:[]}),false);assert.equal(s.writes.length,0);
 assert.equal(reject(pizzaChoice()),true);h.find(`configure-${pizza}`).props.onClick();picker=nodes(h.render()).find(n=>n.type?.name==='DeferredPicker');assert.equal(picker.props.onAccept(pizzaChoice()),true);
 const saved=JSON.parse(s.getItem(configuredCartStorageKey(business,'tienda')));assert.equal(saved.items.length,1);assert.equal(saved.items[0].quantity,2);assert.equal(s.getItem('qwerty:cart:v1:'+business),null);assert.equal(s.writes.length,2);
 }finally{globalThis.localStorage=old;}
});
test('valid-slug checkout mounts recovery-capable client despite unavailable or unpublished current catalog',async()=>{
 for(const result of [{status:'unavailable'},{status:'not_found'}]){
 const Page=load('apps/web/app/store/[slug]/checkout/page.tsx',{'@/app/lib/configured-storefront-reader':{readConfiguredStorefront:async()=>result},'@/app/lib/checkout-catalog-reader':{readCheckoutCatalog:async()=>assert.fail('no legacy lookup after unavailable')},'./checkout-client':{default:()=>null,ConfiguredCheckoutClient:function ConfiguredCheckoutClient(){return null;}}}).default;
 const tree=await Page({params:Promise.resolve({slug:'tienda'})});const mounted=nodes(tree).find(n=>n.type?.name==='ConfiguredCheckoutClient');assert.ok(mounted);assert.equal(mounted.props.page.slug,'tienda');assert.deepEqual(mounted.props.page.publicCatalog,result);
 }
});
