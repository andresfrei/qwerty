import test from 'node:test';
import assert from 'node:assert/strict';
import {handleOnboarding,OnboardingError} from '../app/owner/onboarding/owner-onboarding.ts';
import {createOnboardingGateway} from '../app/owner/onboarding/owner-onboarding-gateway.ts';
const origin='https://owner.fixture.invalid';
const request=(body,headers={},url=origin+'/owner/onboarding',method='POST')=>new Request(url,{method,headers:{origin,host:'owner.fixture.invalid','content-type':'application/json',...headers},...(method==='POST'?{body:typeof body==='string'?body:JSON.stringify(body)}:{})});
const valid={action:'create_business',name:'Mi negocio'};
function sdk({user={id:'owner',email:'owner@fixture.invalid',role:'authenticated',email_confirmed_at:'confirmed'},businesses=[],draft=null,denied=false,lost=false,conflict=false}={}){
 const calls=[],writes=[];
 const client={auth:{async getUser(){calls.push('getUser');return {data:{user},error:null};}},from(table){
  const q={table,filters:[],payload:null};calls.push(q);
  const chain={select(v){q.select=v;return chain;},eq(k,v){q.filters.push([k,v]);return chain;},order(k,v){(q.order??=[]).push([k,v]);return chain;},limit(v){q.limit=v;return chain;},maybeSingle(){q.single=true;return chain;},single(){q.single=true;return chain;},insert(v){q.payload=v;return chain;},then(resolve,reject){return Promise.resolve().then(()=>{
   if(q.payload){if(denied)return {data:null,error:{code:'42501'}};if(conflict&&table==='business_storefronts')return {data:null,error:{code:'23505',message:'PRIVATE secret owner'}};
    writes.push([table,q.payload]);if(lost)throw new Error('lost after commit');return {data:table==='businesses'?{id:'own',name:q.payload.name}:{slug:q.payload.slug,display_name:q.payload.display_name,is_published:false},error:null};}
   return {data:table==='businesses'?(denied?[]:businesses):(denied?null:draft),error:null};
  }).then(resolve,reject);}};return chain;
 }};
 return {client,calls,writes,deps:{trustedOrigin:origin,createGateway:async()=>createOnboardingGateway(client)}};
}
test('invalid HTTP, body, authority and ingress never construct a client or write',async()=>{
 let clients=0;const deps={trustedOrigin:origin,createGateway:async()=>{clients++;throw new Error('must not run');}};
 const invalid=[request(valid,{},undefined,'GET'),request(valid,{origin:'https://evil.invalid'}),request(valid,{host:'evil.invalid'}),request(valid,{'x-forwarded-host':'evil.invalid'}),request(valid,{'x-forwarded-proto':'http'}),request(valid,{'sec-fetch-site':'cross-site'}),request(valid,{'content-type':'text/plain'}),request(valid,{},origin+'/owner/onboarding?businessId=other'),request('{'),request(' '.repeat(2049)),request([]),request({...valid,ownerId:'other'}),request({...valid,businessId:'other'}),request({...valid,isPublished:true}),request({...valid,name:' '}),request({...valid,name:'x'.repeat(121)}),request({action:'create_draft',displayName:'X',slug:'a'.repeat(64)}),request({action:'create_draft',displayName:'X',slug:'Private/Slug'})];
 for(const req of invalid){const r=await handleOnboarding(req,deps);assert.ok(r.status>=400);assert.equal(r.headers.get('cache-control'),'private, no-store');assert.doesNotMatch(await r.text(),/PRIVATE/);}
 assert.equal(clients,0);
});
test('unauthenticated, anonymous, unconfirmed and wrong role have zero queries and writes',async()=>{
 for(const user of [null,{id:'x',email:'x@fixture.invalid',role:'authenticated',email_confirmed_at:null},{id:'x',email:'x@fixture.invalid',role:'authenticated',email_confirmed_at:'yes',is_anonymous:true},{id:'x',email:'x@fixture.invalid',role:'service_role',email_confirmed_at:'yes'}]){
  const f=sdk({user});const r=await handleOnboarding(request(valid),f.deps);assert.equal(r.status,401);assert.deepEqual(f.calls,['getUser']);assert.deepEqual(f.writes,[]);
 }
});
test('bound SDK uses verified identity, first-business ordering, own draft filters and unpublished insert',async()=>{
 const f=sdk({businesses:[{id:'own',name:'Existing'}]});const r=await handleOnboarding(request({action:'create_draft',displayName:'Visible',slug:'visible'}),f.deps);assert.equal(r.status,201);
 assert.deepEqual(f.writes,[['business_storefronts',{business_id:'own',display_name:'Visible',slug:'visible',is_published:false}]]);
 assert.deepEqual(f.calls[1].filters,[['owner_id','owner']]);assert.deepEqual(f.calls[1].order,[['created_at',{ascending:true}],['id',{ascending:true}]]);assert.equal(f.calls[1].limit,1);assert.deepEqual(f.calls[2].filters,[['business_id','own']]);
 const created=sdk();assert.equal((await handleOnboarding(request(valid),created.deps)).status,201);assert.deepEqual(created.writes,[['businesses',{owner_id:'owner',name:'Mi negocio'}]]);
});
test('existing first business/draft resume without overwriting; missing business never creates a draft',async()=>{
 const f=sdk({businesses:[{id:'own',name:'Original'}],draft:{slug:'original',display_name:'Original',is_published:true}});
 assert.equal((await handleOnboarding(request(valid),f.deps)).status,200);
 const r=await handleOnboarding(request({action:'create_draft',displayName:'Replacement',slug:'replacement'}),f.deps);assert.equal(r.status,200);assert.equal((await r.json()).storefront.slug,'original');assert.deepEqual(f.writes,[]);
 const empty=sdk();assert.equal((await handleOnboarding(request({action:'create_draft',displayName:'X',slug:'x'}),empty.deps)).status,409);assert.deepEqual(empty.writes,[]);
});
test('stale confirmed identity still cannot write through current RLS; conflict is private; lost insert is unknown',async()=>{
 const denied=sdk({denied:true});assert.equal((await handleOnboarding(request(valid),denied.deps)).status,503);assert.deepEqual(denied.writes,[]);
 const stale=sdk({denied:true});assert.equal((await handleOnboarding(request({action:'create_draft',displayName:'X',slug:'x'}),stale.deps)).status,409);assert.deepEqual(stale.writes,[]);
 const conflict=sdk({businesses:[{id:'own',name:'X'}],conflict:true});const r=await handleOnboarding(request({action:'create_draft',displayName:'X',slug:'x'}),conflict.deps);assert.deepEqual(await r.json(),{error:'slug_unavailable'});assert.deepEqual(conflict.writes,[]);
 const lost=sdk({lost:true});const unknown=await handleOnboarding(request(valid),lost.deps);assert.deepEqual(await unknown.json(),{error:'unknown'});assert.equal(lost.writes.length,1);
});
test('gateway cannot be used to spoof a bound owner or business',async()=>{
 const f=sdk(),g=createOnboardingGateway(f.client);await assert.rejects(g.createBusiness('other','X'),OnboardingError);await g.confirmedUser();await assert.rejects(g.firstBusiness('other'),OnboardingError);await g.firstBusiness('owner');await assert.rejects(g.createDraft('other','X','x'),OnboardingError);assert.deepEqual(f.writes,[]);
});
