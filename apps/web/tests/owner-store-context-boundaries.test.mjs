import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from './owner-first-store-fixtures.mjs';
const first='11111111-1111-4111-8111-111111111111';
const second='22222222-2222-4222-8222-222222222222';
const foreign='33333333-3333-4333-8333-333333333333';
const owner='44444444-4444-4444-8444-444444444444';
const origin='https://qwerty.test';
const user={id:owner,email:'owner@example.test',email_confirmed_at:'2026-01-01',role:'authenticated',is_anonymous:false};
const cache=new Map();
const mocks={'server-only':{},'./product-photo-normalizer':{PhotoNormalizationError:class extends Error{},normalizeProductPhoto:()=>{throw Error('unexpected normalizer');}}};
const {handleOnboarding}=load('apps/web/app/owner/onboarding/owner-onboarding.ts',mocks,cache);
const {createOnboardingGateway}=load('apps/web/app/owner/onboarding/owner-onboarding-gateway.ts',mocks,cache);
const {handleProductPhotoRequest}=load('apps/web/app/lib/product-photo-http.ts',mocks,cache);
const {createPhotoRuntime}=load('apps/web/app/lib/product-photo-runtime.ts',mocks,cache);
const context=load('apps/web/app/owner/owner-context-gateway.ts',mocks,cache);
const navigation=load('apps/web/app/owner/owner-context.ts',mocks,cache);
function sdk(current=user, additional=[]) {
  const log=[],writes=[];
  const rows=[{id:first,name:'Uno',owner_id:owner},{id:second,name:'Dos',owner_id:owner},{id:foreign,name:'Ajena',owner_id:foreign},...additional];
  return {log,writes,client:{auth:{async getUser(){log.push('getUser');return {data:{user:current},error:null};}},from(table){
    let filters=[],value=null,start=0,end=Infinity;
    const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},order(){return q;},limit(){end=0;return q;},range(a,b){start=a;end=b;return q;},
      insert(v){writes.push([table,v]);value=v;return q;},
      single(){return Promise.resolve({data:value,error:null});},maybeSingle(){return Promise.resolve({data:null,error:null});},
      then(resolve){log.push([table,...filters]);return Promise.resolve({data:rows.filter(row=>filters.every(([k,v])=>row[k]===v)).slice(start,end+1),error:null}).then(resolve);}};return q;
  }}};
}
const req=(path,action)=>new Request(origin+path,{method:'POST',headers:{host:'qwerty.test',origin,'content-type':'application/json'},body:JSON.stringify(action)});
function secure(response, expected, refreshed = false) {
  assert.equal(response.status,expected);
  assert.equal(response.headers.get('cache-control'),'private, no-store');
  assert.equal(response.headers.get('pragma'),'no-cache');
  assert.equal(response.headers.get('expires'),'0');
  assert.equal(response.headers.get('referrer-policy'),'no-referrer');
  if (refreshed) assert.match(response.headers.get('set-cookie'),/refreshed=yes/);
  else assert.equal(response.headers.get('set-cookie'),null);
}

test('context resolves each store independently of switcher, filters owner and verifies fresh identity',async()=>{
  const s=sdk();
  const list=await context.listOwnerBusinesses(s.client);
  assert.deepEqual(list.businesses.map(b=>b.id),[first,second]);
  for(const id of [first,second])assert.equal((await context.resolveOwnerContext(s.client,id)).business.id,id);
  assert.equal((await context.resolveOwnerContext(s.client,foreign)).business,null);
  assert.equal((await context.resolveOwnerContext(s.client)).business.id,first);
  assert.equal(s.log.filter(x=>x==='getUser').length,5);
  for(const current of [null,{...user,is_anonymous:true},{...user,email_confirmed_at:null},{...user,role:'anon'}]) {
    const denied=sdk(current);assert.equal(await context.resolveOwnerContext(denied.client,second),null);
    assert.deepEqual(denied.log,['getUser']);assert.deepEqual(denied.writes,[]);
  }
  const invalid=sdk();await assert.rejects(context.resolveOwnerContext(invalid.client,'bad'));
  assert.deepEqual(invalid.log,[]);
});
test('a truncated owned switcher page does not authorize or hide a separately selected store',async()=>{
  const rows=Array.from({length:101},(_,i)=>({id:`${String(i+10000000)}-1111-4111-8111-111111111111`,name:'Tienda '+i,owner_id:owner}));
  const s=sdk(user,rows),page=await context.listOwnerBusinesses(s.client);
  assert.equal(page.businesses.length,100);assert.equal(page.hasMore,true);
  const last=rows.at(-1);assert.equal(page.businesses.some(row=>row.id===last.id),false);
  assert.equal((await context.resolveOwnerContext(s.client,last.id)).business.id,last.id);
  assert.equal((await context.resolveOwnerContext(s.client,foreign)).business,null);
});
test('pure parser and navigation preserve per-tab IDs without accepting extra or ambiguous input',()=>{
  assert.deepEqual(navigation.parseBusinessSelection(new URLSearchParams()),{ok:true});
  for(const query of ['businessId=','businessId=bad','businessId='+first+'&businessId='+second,'other=1'])assert.deepEqual(navigation.parseBusinessSelection(new URLSearchParams(query)),{ok:false});
  assert.equal(navigation.ownerHref('catalog',second),'/owner/catalog?businessId='+second);
  assert.equal(navigation.ownerHref('home'),'/owner');
  assert.equal(navigation.ownerHref('store',second),'/owner/store?businessId='+second);
  assert.throws(()=>navigation.ownerHref('orders','https://evil.invalid'));
});
test('selected onboarding draft writes only store two and rejects foreign/missing selection without creating businesses',async()=>{
  for(const [id,status] of [[second,201],[foreign,409],['55555555-5555-4555-8555-555555555555',409]]) {
    const s=sdk();
    const response=await handleOnboarding(req('/owner/onboarding?businessId='+id,{action:'create_draft',displayName:'Dos',slug:'dos'}),{trustedOrigin:origin,createGateway:async()=>createOnboardingGateway(s.client)});
    secure(response,status);
    if(status===201){assert.equal((await response.json()).business.id,second);assert.deepEqual(s.writes,[['business_storefronts',{business_id:second,display_name:'Dos',slug:'dos',is_published:false}]]);}
    else {assert.deepEqual(await response.json(),{error:'business_missing'});assert.deepEqual(s.writes,[]);}
  }
});
test('legacy onboarding create_business still resumes first; selection cannot turn it into another-store creation',async()=>{
  const s=sdk();
  const dependencies={trustedOrigin:origin,createGateway:async()=>createOnboardingGateway(s.client)};
  const legacy=await handleOnboarding(req('/owner/onboarding',{action:'create_business',name:'Ignored'}),dependencies);
  assert.equal(legacy.status,200);assert.equal((await legacy.json()).business.id,first);assert.deepEqual(s.writes,[]);
  const before=s.log.length;
  const selected=await handleOnboarding(req('/owner/onboarding?businessId='+second,{action:'create_business',name:'Ignored'}),dependencies);
  secure(selected,400);assert.deepEqual(await selected.json(),{error:'invalid_request'});assert.equal(s.log.length,before);
  for(const query of ['?businessId=bad','?businessId='+first+'&businessId='+second,'?extra=1']) {
    const response=await handleOnboarding(req('/owner/onboarding'+query,{action:'create_draft',displayName:'Dos',slug:'dos'}),dependencies);
    secure(response,403);assert.deepEqual(await response.json(),{error:'request_rejected'});assert.equal(s.log.length,before);
  }
});
function photoHarness(request, itemBusiness=first, current=user) {
  const calls={auth:0,rpc:[],normalize:0,upload:0};
  const runtime=createPhotoRuntime(request,{
    getConfig:()=>({url:'https://provider.invalid',anonKey:'sb_publishable_synthetic'}),getPrivateKey:()=> 'sb_secret_synthetic',
    createPublicClient:(_url,_key,cookies)=>({auth:{async getUser(){calls.auth++;cookies.setAll([{name:'refreshed',value:'yes',options:{path:'/'}}],{});return {data:{user:current},error:null};}}}),
    createPrivateClient:()=>({async rpc(name,args){calls.rpc.push([name,args]);return {data:name==='get_owned_product_photo'?(itemBusiness?[{business_id:itemBusiness,photo_version:'7'}]:[]):true,error:null};},storage:{from(){return {async upload(path){calls.upload++;return {data:{path},error:null};}};}}}),
    normalize:async()=>{calls.normalize++;return {bytes:new Uint8Array([1]),contentType:'image/webp'};},
  });
  return {runtime,calls};
}
const photoRequest=(query='',method='DELETE')=>new Request(origin+'/owner/catalog/items/'+first+'/photo'+query,{method,headers:{origin,host:'qwerty.test','x-photo-version':'7'},...(method==='PUT'?{body:new Uint8Array([1,2,3])}:{})});
test('photo context must match owned item, even if both stores have same owner, before normalization/upload/CAS',async()=>{
  for(const method of ['PUT','DELETE']) {
    const request=photoRequest('?businessId='+second,method),h=photoHarness(request);
    const response=await handleProductPhotoRequest(request,first,{trustedOrigin:origin,createRuntime:()=>h.runtime});
    secure(response,404,true);assert.deepEqual(await response.json(),{error:'not_found'});
    assert.equal(h.calls.auth,1);assert.deepEqual(h.calls.rpc.map(([n])=>n),['get_owned_product_photo']);
    assert.equal(h.calls.normalize,0);assert.equal(h.calls.upload,0);
  }
});
test('matched and legacy photo requests keep item-owner authorization and refresh eligibility',async()=>{
  for(const query of ['', '?businessId='+second]) {
    const request=photoRequest(query),h=photoHarness(request,second);
    const response=await handleProductPhotoRequest(request,first,{trustedOrigin:origin,createRuntime:()=>h.runtime});
    assert.equal(response.status,200);assert.deepEqual(await response.json(),{photoPath:null,photoVersion:'8'});
    assert.match(response.headers.get('set-cookie'),/refreshed=yes/);
    assert.equal(h.calls.rpc[1][1].p_business_id,second);
  }
  const request=photoRequest('?businessId='+foreign),h=photoHarness(request,null);
  const response=await handleProductPhotoRequest(request,first,{trustedOrigin:origin,createRuntime:()=>h.runtime});
  secure(response,404,true);assert.deepEqual(await response.json(),{error:'not_found'});assert.equal(h.calls.rpc.length,1);
});
test('concurrent selected photo requests keep their business constraint and cookies request-local',async()=>{
  const outcomes=await Promise.all([first,second].map(async businessId=>{
    const request=photoRequest('?businessId='+businessId),h=photoHarness(request,businessId);
    const response=await handleProductPhotoRequest(request,first,{trustedOrigin:origin,createRuntime:()=>h.runtime});
    assert.equal(response.status,200);assert.match(response.headers.get('set-cookie'),/refreshed=yes/);
    return h.calls.rpc[1][1].p_business_id;
  }));
  assert.deepEqual(outcomes,[first,second]);
});
test('invalid photo selection rejects before runtime/network; anonymous identity cannot refresh or inspect items',async()=>{
  for(const query of ['?businessId=bad','?businessId='+first+'&businessId='+second,'?extra=1']) {
    let clients=0;
    const response=await handleProductPhotoRequest(photoRequest(query),first,{trustedOrigin:origin,createRuntime:()=>{clients++;throw Error('not called');}});
    secure(response,400);assert.deepEqual(await response.json(),{error:'invalid_input'});assert.equal(clients,0);
  }
  const request=photoRequest('?businessId='+second),h=photoHarness(request,second,{...user,is_anonymous:true});
  const response=await handleProductPhotoRequest(request,first,{trustedOrigin:origin,createRuntime:()=>h.runtime});
  secure(response,401);assert.deepEqual(await response.json(),{error:'unauthorized'});assert.equal(h.calls.rpc.length,0);
});
