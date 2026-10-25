import test from 'node:test';
import assert from 'node:assert/strict';
import {NextRequest} from 'next/server.js';
import {load} from './owner-first-store-fixtures.mjs';
import {fixture,request,business,item,foreign,origin,standard} from './owner-catalog-configuration-fixtures.mjs';
function route(f) {
 return load('apps/web/app/owner/catalog/configurations/route.ts',{
  '@supabase/ssr':{createServerClient(url,key,options){assert.equal(url,'https://database.fixture.invalid');assert.equal(key,'fake-publishable');
   const getUser=f.client.auth.getUser;
   f.client.auth.getUser=async()=>{options.cookies.setAll([{name:'fixture-session',value:'refreshed',options:{httpOnly:true,sameSite:'lax',path:'/'}}]);return getUser();};return f.client;
  }},
  '../../../lib/supabase/config':{getSupabaseConfig:()=>({url:'https://database.fixture.invalid',anonKey:'fake-publishable'})},
  '../../lib/supabase/confirm.ts':{getTrustedSiteOrigin:()=>origin,isTrustedCallbackRequest:r=>new URL(r.url).origin===origin},
 });
}
test('public GET/POST route publishes eligible refresh on saved, conflict, unknown, forbidden selection and unavailable',async()=>{
 for(const scenario of ['saved','conflict','unknown','foreign','unavailable','get']){
  const f=fixture();let r=request();
  if(scenario==='conflict')f.state.rows.catalog_item_configurations.push({business_id:business,item_id:item,version:1,is_active:true,document:standard});
  if(scenario==='unknown')f.state.rpcResult=new Error('lost after commit');
  if(scenario==='foreign')r=request('POST',undefined,`businessId=${foreign}&itemId=${item}`);
  if(scenario==='unavailable')f.state.capability='unavailable';
  if(scenario==='get')r=request('GET');
  const mod=route(f);const result=await mod[r.method](new NextRequest(r));
  assert.equal(result.status,{saved:200,conflict:409,unknown:503,foreign:404,unavailable:503,get:200}[scenario]);
  assert.match(result.headers.get('set-cookie'),/fixture-session=refreshed/);assert.equal(f.state.identity,1);
  assert.equal(result.headers.get('cache-control'),'private, no-store');assert.equal(result.headers.get('access-control-allow-origin'),null);
  if(scenario==='get')assert.equal(f.state.saves,0);
 }
});
test('public route does not publish refresh or create identity for invalid ingress; rejected identity refresh is discarded',async()=>{
 for(const scenario of ['origin','body','selection','unconfirmed']){
  const f=fixture();let r=request();
  if(scenario==='origin')r=request('POST',undefined,undefined,{origin:'https://foreign.invalid'});
  if(scenario==='body')r=request('POST',{bad:true});
  if(scenario==='selection')r=request('GET',undefined,`itemId=${item}`);
  if(scenario==='unconfirmed')f.state.user.email_confirmed_at=null;
  const mod=route(f);const result=await mod[r.method](new NextRequest(r));
  assert.equal(result.status,scenario==='unconfirmed'?401:400);assert.equal(result.headers.get('set-cookie'),null);
  assert.equal(f.state.identity,scenario==='unconfirmed'?1:0);assert.equal(f.state.saves,0);
 }
});
