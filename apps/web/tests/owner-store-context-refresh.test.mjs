import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {load} from './owner-first-store-fixtures.mjs';
const require=createRequire(import.meta.url);
const {NextRequest}=require('next/server');
const owner='44444444-4444-4444-8444-444444444444';
const business='22222222-2222-4222-8222-222222222222';
const item='11111111-1111-4111-8111-111111111111';
const site='https://owner.fixture.invalid',provider='https://synthetic.supabase.co';
const eligible={id:owner,email:'owner@fixture.invalid',email_confirmed_at:'2026-01-01',role:'authenticated',is_anonymous:false};
const token=(scenario,exp)=>`eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({sub:owner,exp})).toString('base64url')}.synthetic-${scenario}`;
function cookie(scenario) {
  return 'sb-synthetic-auth-token=base64-'+Buffer.from(JSON.stringify({access_token:token(scenario,1),refresh_token:scenario,token_type:'bearer',expires_at:1,user:eligible})).toString('base64url');
}
function request(boundary,scenario,{selected=true,query,version='7',badOrigin=false}={}) {
  const path=boundary==='photo'?`/owner/catalog/items/${item}/photo`:boundary==='catalog'?'/owner/catalog/actions':'/owner/onboarding';
  const search=query??(selected?'?businessId='+business:'');
  const payload=boundary==='catalog'?{action:'set_published',isPublished:true}:{action:'create_draft',displayName:'Dos',slug:'dos'};
  return new NextRequest(site+path+search,{
    method:boundary==='photo'?'DELETE':'POST',
    headers:{origin:badOrigin?'https://foreign.invalid':site,host:'owner.fixture.invalid','content-type':'application/json','x-photo-version':version,cookie:cookie(scenario)},
    ...(boundary==='photo'?{}:{body:JSON.stringify(payload)}),
  });
}
async function harness(run) {
  const env={QWERTY_SITE_URL:site,NEXT_PUBLIC_SUPABASE_URL:provider,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic'};
  const previous=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]]));
  const original=globalThis.fetch;
  const events=[],writes=[],fixtureErrors=[];
  const cache=new Map();
  const mocks={'server-only':{},'../../../lib/supabase/server':{createClient(){throw Error('legacy catalog adapter not used by selected tests');}},'./product-photo-normalizer':{PhotoNormalizationError:class extends Error{},normalizeProductPhoto(){throw Error('no image work allowed');}}};
  const onboarding=load('apps/web/app/owner/onboarding/route.ts',mocks,cache).POST;
  const catalog=load('apps/web/app/owner/catalog/actions/route.ts',mocks,cache).POST;
  const {handleProductPhotoRequest}=load('apps/web/app/lib/product-photo-http.ts',mocks,cache);
  const {createPhotoRuntime}=load('apps/web/app/lib/product-photo-runtime.ts',mocks,cache);
  const invoke=(boundary,req)=>boundary==='photo'?handleProductPhotoRequest(req,item,{
    trustedOrigin:site,
    createRuntime:r=>createPhotoRuntime(r,{
      getConfig:()=>({url:provider,anonKey:'sb_publishable_synthetic'}),getPrivateKey:()=> 'sb_secret_synthetic',
      createPrivateClient:(url,key,options)=>{
        // The private SDK uses its own Authorization, not the caller's token.
        // Correlate only the synthetic transport fixture; real RPC actor checks remain asserted below.
        const scenario=JSON.parse(Buffer.from(r.headers.get('cookie').split('base64-')[1],'base64url').toString()).refresh_token;
        return require('@supabase/supabase-js').createClient(url,key,{...options,global:{headers:{'x-fixture-scenario':scenario}}});
      },
    }),
  }):({onboarding,catalog}[boundary])(req);
  Object.assign(process.env,env);
  globalThis.fetch=async(input,init)=>{
    const url=new URL(input instanceof Request?input.url:String(input));
    const method=init?.method??'GET',headers=new Headers(init?.headers);
    assert.equal(url.origin,provider);
    const scenario=url.pathname==='/auth/v1/token'?JSON.parse(init.body).refresh_token:headers.get('x-fixture-scenario')??(headers.get('authorization')??'').split('.synthetic-')[1];
    assert.ok(scenario,'each HTTP request carries its own synthetic session reference');
    events.push([scenario,method,url.pathname]);
    if(url.pathname==='/auth/v1/token')return Response.json({access_token:token(scenario,Math.floor(Date.now()/1000)+3600),refresh_token:scenario+'-next',expires_in:3600,token_type:'bearer',user:eligible});
    if(url.pathname==='/auth/v1/user') {
      if(scenario==='rejected')return Response.json({message:'rejected identity'},{status:401});
      if(scenario==='null')return Response.json({user:null});
      const user=scenario==='unconfirmed'?{...eligible,email_confirmed_at:null}:scenario==='anonymous'?{...eligible,is_anonymous:true}:scenario==='wrongrole'?{...eligible,role:'anon'}:eligible;
      return Response.json(user);
    }
    if(url.pathname==='/rest/v1/businesses') {
      assert.equal(method,'GET');assert.equal(headers.get('apikey'),'sb_publishable_synthetic');
      assert.equal(url.searchParams.get('owner_id'),'eq.'+owner);
      if(url.searchParams.has('id'))assert.equal(url.searchParams.get('id'),'eq.'+business);
      if(scenario==='readerror')return Response.json({code:'42501',message:'synthetic denied read'},{status:403});
      return Response.json(scenario==='foreign'?[]:[{id:business,name:'Dos'}]);
    }
    if(url.pathname==='/rest/v1/business_storefronts') {
      assert.equal(method,'GET');assert.equal(url.searchParams.get('business_id'),'eq.'+business);
      return new Response('null',{headers:{'content-type':'application/json'}});
    }
    if(url.pathname==='/rest/v1/rpc/get_owned_product_photo') {
      assert.equal(method,'POST');assert.deepEqual(JSON.parse(init.body),{p_actor_id:owner,p_item_id:item});
      if(scenario==='readerror')return Response.json({message:'synthetic owned item read failure'},{status:503});
      return Response.json(scenario==='foreign'?[]:[{business_id:business,photo_version:'7'}]);
    }
    writes.push([scenario,method,url.pathname]);
    throw Error('unexpected record mutation');
  };
  const transport=globalThis.fetch;
  globalThis.fetch=async(...args)=>{try{return await transport(...args);}catch(error){fixtureErrors.push(String(error));throw error;}};
  try {await run({invoke,events,writes});assert.deepEqual(fixtureErrors,[],'mock transport assertions must not become sanitized 503 responses');}
  finally {globalThis.fetch=original;for(const[key,value]of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
}
async function assertResponse(response,status,error,refresh) {
  assert.equal(response.status,status);
  assert.deepEqual(await response.json(),{error});
  assert.equal(response.headers.get('cache-control'),'private, no-store');
  assert.equal(response.headers.get('pragma'),'no-cache');assert.equal(response.headers.get('expires'),'0');
  assert.equal(response.headers.get('referrer-policy'),'no-referrer');
  assert.equal(response.headers.has('set-cookie'),refresh);
  if(refresh)assert.match(response.headers.get('set-cookie'),/sb-synthetic-auth-token=/);
}
for(const boundary of ['onboarding','catalog','photo']) {
  test(boundary+': installed SDK refresh survives selected late owned read 503',async()=>harness(async({invoke,events,writes})=>{
    // Photo/onboarding default requests already retain eligible refresh after a late read error.
    if(boundary!=='catalog')await assertResponse(await invoke(boundary,request(boundary,'readerror',{selected:false})),503,'unavailable',true);
    await assertResponse(await invoke(boundary,request(boundary,'readerror')),503,'unavailable',true);
    assert.ok(events.some(([, ,path])=>path==='/auth/v1/token'));
    assert.ok(events.some(([, ,path])=>path==='/auth/v1/user'));
    assert.deepEqual(writes,[]);
  }));
}
test('verified selected business denials and photo action 409 retain only the caller refresh without mutation',async()=>harness(async({invoke,events,writes})=>{
  for(const [boundary,status,error]of [['onboarding',409,'business_missing'],['catalog',401,'unauthorized'],['photo',404,'not_found']]) {
    await assertResponse(await invoke(boundary,request(boundary,'foreign')),status,error,true);
  }
  for(const selected of [false,true]) {
    await assertResponse(await invoke('photo',request('photo','conflict',{selected,version:'6'})),409,'conflict',true);
    await assertResponse(await invoke('photo',request('photo','invalidversion',{selected,version:'bad'})),400,'invalid_input',true);
  }
  assert.equal(events.filter(([, ,path])=>path==='/rest/v1/rpc/commit_product_photo').length,0);
  assert.deepEqual(writes,[]);
}));
test('rejected identities discard SDK-staged refresh before any business access; invalid ingress/query makes no HTTP calls',async()=>harness(async({invoke,events,writes})=>{
  for(const boundary of ['onboarding','catalog','photo']) {
    // Photo retains its pre-existing actor validator; role/email gating belongs to the owner-context gateways.
    for(const scenario of ['rejected','null','unconfirmed','anonymous',...(boundary==='photo'?[]:['wrongrole'])]) {
      const before=events.length;
      const response=await invoke(boundary,request(boundary,scenario));
      assert.equal(response.headers.has('set-cookie'),false,boundary+': '+scenario);
      assert.ok(response.status===401||response.status===503);
      assert.deepEqual(await response.json(),{error:response.status===401?'unauthorized':'unavailable'});
      const calls=events.slice(before);
      assert.ok(calls.some(([, ,path])=>path==='/auth/v1/token'));
      assert.ok(calls.some(([, ,path])=>path==='/auth/v1/user'));
      assert.equal(calls.filter(([, ,path])=>path.startsWith('/rest/')).length,0);
    }
    for(const options of [{query:'?businessId=bad'},{query:'?businessId='+business+'&businessId='+business},{query:'?other=1'},{badOrigin:true}]) {
      const before=events.length;
      const response=await invoke(boundary,request(boundary,'readerror',options));
      const originError=Boolean(options.badOrigin),status=boundary==='onboarding'||(boundary==='photo'&&originError)?403:400;
      await assertResponse(response,status,originError?'request_rejected':boundary==='onboarding'?'request_rejected':boundary==='photo'?'invalid_input':'invalid_request',false);
      assert.equal(events.length,before,boundary+' rejected before SDK/network');
    }
  }
  assert.deepEqual(writes,[]);
}));
test('concurrent selected requests isolate eligible late-error refresh from rejected identity',async()=>harness(async({invoke,events,writes})=>{
  const results=await Promise.all(['onboarding','catalog','photo'].flatMap(boundary=>['readerror','anonymous'].map(async scenario=>({boundary,scenario,response:await invoke(boundary,request(boundary,scenario))}))));
  for(const {scenario,response}of results) {
    await assertResponse(response,scenario==='readerror'?503:401,scenario==='readerror'?'unavailable':'unauthorized',scenario==='readerror');
    if(scenario==='readerror') {
      const serialized=response.headers.get('set-cookie');
      const encoded=decodeURIComponent(serialized.split('=')[1].split(';')[0]);
      assert.match(Buffer.from(encoded.slice('base64-'.length),'base64url').toString(),/readerror-next/);
    }
  }
  assert.equal(events.filter(([scenario,,path])=>scenario==='anonymous'&&path.startsWith('/rest/')).length,0);
  assert.deepEqual(writes,[]);
}));
