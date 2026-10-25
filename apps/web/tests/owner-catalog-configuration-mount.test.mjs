import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,load,nodes,text,business as businessProp,category,item as classicItem,storefront} from './owner-first-store-fixtures.mjs';
import {fixture,business,owner} from './owner-catalog-configuration-fixtures.mjs';
const props={accountId:owner,business:businessProp,categories:[category],items:[classicItem],groups:[],options:[],storefront,surchargeMinor:0};
test('existing product edit surface mounts one independently scoped editor outside every classic form',()=>{
 const h=harness('catalog/catalog-editor-client.tsx',props);const tree=h.render();
 const advanced=nodes(tree).filter(n=>n.type?.name==='CatalogProfileEditor');assert.equal(advanced.length,1);
 assert.match(text(tree),/vista de abajo muestra las reglas clásicas/i);
 assert.deepEqual(advanced[0].props.scope,{accountId:owner,businessId:business,itemId:classicItem.id});assert.deepEqual(advanced[0].props.products,props.items);
 for(const form of nodes(tree).filter(n=>n.type==='form'))assert.equal(nodes(form).filter(n=>n.type?.name==='CatalogProfileEditor').length,0);
 assert.equal(nodes(tree).filter(n=>n.type==='form').length,8,'classic forms unchanged for this fixture');
 const legacy=harness('catalog/catalog-editor-client.tsx',{...props,accountId:undefined});assert.equal(nodes(legacy.render()).filter(n=>n.type?.name==='CatalogProfileEditor').length,0,'no guessed account');
});
test('server-confirmed selected page passes account/business context without any additional privileged or configuration read',async()=>{
 const f=fixture();f.state.rows.catalog_categories=[];let context='selected';const observed=[];
 const Page=load('apps/web/app/owner/catalog/page.tsx',{
  '../owner-dashboard-data':{loadOwnerDashboard:async()=>context==='selected'?{kind:'selected',account:{id:owner,email:'owner@example.invalid'},business:{id:business,name:'Synthetic business'},businesses:[],storefront,pagination:{}}:{kind:'unauthorized'}},
  '../owner-dashboard-views':{OwnerDashboardView:()=>null},'../owner-shell':{OwnerShell:()=>null},
  '@/app/lib/supabase/server':{createClient:async()=>f.client},
  './catalog-editor-client':{default:function CatalogEditor(props){observed.push(props);return null;}},
  './photo-editor-client':{PhotoEditor:()=>null},
 }).default;
 const tree=await Page({searchParams:Promise.resolve({businessId:business})});const editor=nodes(tree).find(n=>n.type?.name==='CatalogEditor');
 assert.ok(editor);assert.equal(editor.props.accountId,owner);assert.equal(editor.props.business.id,business);assert.equal(editor.key.replace(/^\.\$/, '').replaceAll('=2', ':'),`${owner}:${business}`);
 assert.deepEqual(f.state.calls.map(c=>c.table).sort(),['business_catalog_settings','catalog_categories','catalog_items','catalog_option_groups','catalog_options'].sort());assert.equal(f.state.saves,0);
 context='unauthorized';f.state.calls=[];const denied=await Page({searchParams:Promise.resolve({businessId:business})});assert.equal(nodes(denied).some(n=>n.type?.name==='CatalogEditor'),false);assert.deepEqual(f.state.calls,[]);
});
