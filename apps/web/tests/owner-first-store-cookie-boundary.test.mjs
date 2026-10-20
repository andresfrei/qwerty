import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {load,id} from './owner-first-store-fixtures.mjs';
const require=createRequire(import.meta.url),{NextRequest}=require('next/server');
const site='https://owner.fixture.invalid',provider='https://synthetic.supabase.co';
const user={id,email:'owner@fixture.invalid',email_confirmed_at:'2026-01-01T00:00:00Z',role:'authenticated',is_anonymous:false};
const token=exp=>`eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({sub:id,exp})).toString('base64url')}.synthetic`;
const cookie='sb-synthetic-auth-token=base64-'+Buffer.from(JSON.stringify({access_token:token(1),refresh_token:'synthetic-old',token_type:'bearer',expires_at:1,user})).toString('base64url');
test('public installed SDK route commits refreshed cookies only after fresh eligible owner identity, including later read failure',async()=>{
 const {POST}=load('apps/web/app/owner/onboarding/route.ts');
 const env={QWERTY_SITE_URL:site,NEXT_PUBLIC_SUPABASE_URL:provider,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic'};
 const previous=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]])),original=globalThis.fetch;Object.assign(process.env,env);
 let scenario,calls;
 globalThis.fetch=async(input,init)=>{
  const url=new URL(input instanceof Request?input.url:String(input)),method=init?.method??'GET';assert.equal(url.origin,provider);calls.push([method,url.pathname]);
  if(url.pathname==='/auth/v1/token')return Response.json({access_token:token(Math.floor(Date.now()/1000)+3600),refresh_token:'synthetic-refreshed',expires_in:3600,token_type:'bearer',user});
  if(url.pathname==='/auth/v1/user'){
   if(scenario==='rejected')return Response.json({message:'Rejected identity'},{status:401});
   if(scenario==='null')return Response.json({user:null});
   if(scenario==='unconfirmed')return Response.json({...user,email_confirmed_at:null});
   if(scenario==='anonymous')return Response.json({...user,is_anonymous:true});
   if(scenario==='wrong-role')return Response.json({...user,role:'anon'});
   return Response.json(user);
  }
  assert.equal(scenario,'verified-read-error');assert.equal(method,'GET');assert.equal(url.pathname,'/rest/v1/businesses');
  return Response.json({code:'42501',message:'synthetic read failure'},{status:403});
 };
 try{
  // Same loaded route across requests proves the gate cannot leak request-global state.
  for(scenario of ['verified-read-error','rejected','null','unconfirmed','anonymous','wrong-role']){
   calls=[];const request=new NextRequest(site+'/owner/onboarding',{method:'POST',headers:{origin:site,host:'owner.fixture.invalid','content-type':'application/json',cookie},body:JSON.stringify({action:'create_business',name:'Synthetic business'})});
   const response=await POST(request),verified=scenario==='verified-read-error';
   assert.equal(response.status,verified?503:401,scenario);assert.equal(response.headers.has('set-cookie'),verified,scenario+' cookie eligibility');
   assert.equal(request.headers.get('cookie'),cookie,'prior browser cookie must remain untouched');
   assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(response.headers.get('pragma'),'no-cache');assert.equal(response.headers.get('expires'),'0');
   assert.ok(calls.some(([,path])=>path==='/auth/v1/token'));assert.ok(calls.some(([,path])=>path==='/auth/v1/user'));
   assert.equal(calls.filter(([method,path])=>path.startsWith('/rest/')&&method!=='GET').length,0);
   assert.equal(calls.filter(([,path])=>path.startsWith('/rest/')).length,verified?1:0);
   if(verified)assert.match(response.headers.get('set-cookie'),/sb-synthetic-auth-token=/);
  }
  for(const invalid of ['origin','authority']){
   scenario=invalid;calls=[];const response=await POST(new NextRequest(site+'/owner/onboarding',{method:'POST',headers:{origin:invalid==='origin'?'https://evil.invalid':site,host:'owner.fixture.invalid','content-type':'application/json',cookie},body:JSON.stringify({action:'create_business',name:'X',...(invalid==='authority'?{ownerId:'other'}:{})})}));
   assert.ok(response.status>=400);assert.equal(response.headers.has('set-cookie'),false);assert.deepEqual(calls,[]);
  }
 }finally{globalThis.fetch=original;for(const[k,v]of Object.entries(previous)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});
