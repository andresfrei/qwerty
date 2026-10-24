import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {load} from './owner-first-store-fixtures.mjs';
const require=createRequire(import.meta.url);
const {NextRequest}=require('next/server');
const first='11111111-1111-4111-8111-111111111111';
const second='22222222-2222-4222-8222-222222222222';
const foreign='33333333-3333-4333-8333-333333333333';
const owner='44444444-4444-4444-8444-444444444444';
const site='https://owner.fixture.invalid',provider='https://synthetic.supabase.co';
const user={id:owner,email:'owner@fixture.invalid',email_confirmed_at:'2026-01-01',role:'authenticated',is_anonymous:false};
function token(exp) {return `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({sub:owner,exp})).toString('base64url')}.synthetic`;}
function cookie() {return 'sb-synthetic-auth-token=base64-'+Buffer.from(JSON.stringify({access_token:token(1),refresh_token:'synthetic-refresh',token_type:'bearer',expires_at:1,user})).toString('base64url');}
test('selected onboarding and catalog public routes deny foreign selection without discarding verified owner refresh',async()=>{
  const {POST}=load('apps/web/app/owner/onboarding/route.ts');
  const {POST:catalogPost}=load('apps/web/app/owner/catalog/actions/route.ts',{'../../../lib/supabase/server':{createClient(){throw Error('selected route must not use immediate cookie writes');}}});
  const env={QWERTY_SITE_URL:site,NEXT_PUBLIC_SUPABASE_URL:provider,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic'};
  const previous=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));
  const original=globalThis.fetch;Object.assign(process.env,env);
  const calls=[],writes=[],catalogWrites=[];
  globalThis.fetch=async(input,init)=>{
    const url=new URL(input instanceof Request?input.url:String(input)),method=init?.method??'GET';
    calls.push([method,url.pathname,url.search]);assert.equal(url.origin,provider);
    const headers=new Headers(init?.headers);assert.equal(headers.get('apikey'),'sb_publishable_synthetic');
    if(url.pathname==='/auth/v1/token')return Response.json({access_token:token(Math.floor(Date.now()/1000)+3600),refresh_token:'synthetic-next',expires_in:3600,token_type:'bearer',user});
    if(url.pathname==='/auth/v1/user')return Response.json(user);
    assert.match(headers.get('authorization'),/^Bearer /);
    if(url.pathname==='/rest/v1/businesses'){
      assert.equal(method,'GET');assert.equal(url.searchParams.get('owner_id'),'eq.'+owner);
      assert.equal(url.searchParams.get('order'),'created_at.asc,id.asc');assert.equal(url.searchParams.get('limit'),'1');
      const id=url.searchParams.get('id');assert.ok(['eq.'+second,'eq.'+foreign].includes(id));
      return Response.json(id==='eq.'+second?[{id:second,name:'Dos'}]:[]);
    }
    if(url.pathname==='/rest/v1/catalog_categories') {
      assert.equal(method,'POST');const body=JSON.parse(init.body);catalogWrites.push(body);
      assert.deepEqual(body,{business_id:second,name:'Nueva',sort_order:0});return new Response(null,{status:201});
    }
    assert.equal(url.pathname,'/rest/v1/business_storefronts');
    if(method==='GET'){assert.equal(url.searchParams.get('business_id'),'eq.'+second);return new Response('null',{headers:{'content-type':'application/json'}});}
    assert.equal(method,'POST');const body=JSON.parse(init.body);writes.push(body);
    assert.deepEqual(body,{business_id:second,display_name:'Dos',slug:'dos',is_published:false});
    return Response.json({slug:'dos',display_name:'Dos',is_published:false},{status:201});
  };
  try {
    for(const [id,status]of [[second,201],[foreign,409]]) {
      const before=writes.length;
      const response=await POST(new NextRequest(site+'/owner/onboarding?businessId='+id,{method:'POST',headers:{origin:site,host:'owner.fixture.invalid','content-type':'application/json',cookie:cookie()},body:JSON.stringify({action:'create_draft',displayName:'Dos',slug:'dos'})}));
      assert.equal(response.status,status);assert.equal(response.headers.get('cache-control'),'private, no-store');
      assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.equal(response.headers.get('referrer-policy'),'no-referrer');
      if(id===second){assert.equal((await response.json()).business.id,second);assert.match(response.headers.get('set-cookie'),/sb-synthetic-auth-token=/);assert.equal(writes.length,before+1);}
      else {assert.deepEqual(await response.json(),{error:'business_missing'});assert.match(response.headers.get('set-cookie'),/sb-synthetic-auth-token=/);assert.equal(writes.length,before);}
    }
    assert.equal(writes.length,1);assert.equal(calls.filter(([,path])=>path==='/auth/v1/user').length,2);
    assert.equal(writes.some(row=>row.business_id===first),false);
    for(const [id,status]of [[second,200],[foreign,401]]) {
      const before=catalogWrites.length;
      const response=await catalogPost(new NextRequest(site+'/owner/catalog/actions?businessId='+id,{method:'POST',headers:{origin:site,host:'owner.fixture.invalid','content-type':'application/json',cookie:cookie()},body:JSON.stringify({action:'create_category',name:'Nueva',sortOrder:0})}));
      assert.equal(response.status,status);assert.equal(response.headers.get('cache-control'),'private, no-store');
      if(id===second){assert.deepEqual(await response.json(),{ok:true});assert.match(response.headers.get('set-cookie'),/sb-synthetic-auth-token=/);assert.equal(catalogWrites.length,before+1);}
      else {assert.deepEqual(await response.json(),{error:'unauthorized'});assert.match(response.headers.get('set-cookie'),/sb-synthetic-auth-token=/);assert.equal(catalogWrites.length,before);}
    }
    for(const query of ['?businessId=bad','?businessId='+first+'&businessId='+second,'?extra=1']) {
      const before=calls.length;
      const response=await catalogPost(new NextRequest(site+'/owner/catalog/actions'+query,{method:'POST',headers:{origin:site,host:'owner.fixture.invalid','content-type':'application/json',cookie:cookie()},body:JSON.stringify({action:'create_category',name:'Nueva',sortOrder:0})}));
      assert.equal(response.status,400);assert.deepEqual(await response.json(),{error:'invalid_request'});assert.equal(response.headers.get('set-cookie'),null);assert.equal(calls.length,before);
    }
  }finally {globalThis.fetch=original;for(const[k,v]of Object.entries(previous)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});
