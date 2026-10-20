import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {load,id} from './owner-first-store-fixtures.mjs';
const require=createRequire(import.meta.url),{NextRequest}=require('next/server');
const site='https://owner.fixture.invalid',provider='https://synthetic.supabase.co';
const user={id,email:'owner@fixture.invalid',email_confirmed_at:'2026-01-01T00:00:00Z',role:'authenticated',is_anonymous:false};
function cookie(exp){
 const payload=Buffer.from(JSON.stringify({sub:id,exp})).toString('base64url');
 return 'sb-synthetic-auth-token=base64-'+Buffer.from(JSON.stringify({access_token:`eyJhbGciOiJIUzI1NiJ9.${payload}.synthetic`,refresh_token:'synthetic-refresh',token_type:'bearer',expires_at:exp,user})).toString('base64url');
}
test('public route uses installed SSR SDK with caller cookies, public key, staged refresh and RLS REST payload',async()=>{
 const {POST}=load('apps/web/app/owner/onboarding/route.ts');
 const env={QWERTY_SITE_URL:site,NEXT_PUBLIC_SUPABASE_URL:provider,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic'};
 const previous=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));const original=globalThis.fetch;Object.assign(process.env,env);
 const calls=[];
 globalThis.fetch=async(input,init)=>{
  const url=new URL(input instanceof Request?input.url:String(input)),method=init?.method??'GET';calls.push([method,url.pathname]);assert.equal(url.origin,provider);
  const headers=new Headers(init?.headers);assert.equal(headers.get('apikey'),'sb_publishable_synthetic');
  if(url.pathname==='/auth/v1/token')return Response.json({access_token:`eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({sub:id,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.synthetic`,refresh_token:'synthetic-next',expires_in:3600,token_type:'bearer',user});
  if(url.pathname==='/auth/v1/user')return Response.json(user);
  assert.equal(url.pathname,'/rest/v1/businesses');assert.match(headers.get('authorization'),/^Bearer /);
  if(method==='GET'){assert.equal(url.searchParams.get('owner_id'),'eq.'+id);assert.equal(url.searchParams.get('order'),'created_at.asc,id.asc');return Response.json([]);}
  assert.equal(method,'POST');assert.deepEqual(JSON.parse(init.body),{owner_id:id,name:'Real UI name'});return Response.json({id,name:'Real UI name'},{status:201});
 };
 try{
  const r=await POST(new NextRequest(site+'/owner/onboarding',{method:'POST',headers:{origin:site,host:'owner.fixture.invalid','content-type':'application/json',cookie:cookie(1)},body:JSON.stringify({action:'create_business',name:'Real UI name'})}));
  assert.equal(r.status,201);assert.equal((await r.json()).business.id,id);assert.equal(r.headers.get('cache-control'),'private, no-store');assert.match(r.headers.get('set-cookie'),/sb-synthetic-auth-token=/);
  assert.ok(calls.some(([m,p])=>m==='POST'&&p==='/auth/v1/token'));assert.ok(calls.some(([,p])=>p==='/auth/v1/user'));assert.equal(calls.filter(([m,p])=>m==='POST'&&p==='/rest/v1/businesses').length,1);
 }finally{globalThis.fetch=original;for(const[k,v]of Object.entries(previous)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});
