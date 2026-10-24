import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {load} from './owner-first-store-fixtures.mjs';
const require=createRequire(import.meta.url);
const {NextRequest}=require('next/server');
const site='https://owner.fixture.invalid',provider='https://synthetic.supabase.co';
const owner='44444444-4444-4444-8444-444444444444',foreign='55555555-5555-4555-8555-555555555555';
const ids=[1,2,3,4].map(n=>`${n}abcdef0-0000-4000-8000-000000000000`);
const eligible={id:owner,email:'owner@fixture.invalid',email_confirmed_at:'2026-01-01',role:'authenticated',is_anonymous:false};
const token=(scenario,exp)=>`eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({sub:owner,exp})).toString('base64url')}.synthetic-${scenario}`;
function cookie(scenario){return 'sb-synthetic-auth-token=base64-'+Buffer.from(JSON.stringify({access_token:token(scenario,1),refresh_token:scenario,expires_at:1,token_type:'bearer',user:eligible})).toString('base64url');}
const input=(businessId=ids[2],name='Nueva',slug='nueva')=>({businessId,name,slug});
function req({method='POST',query='',payload=input(),body,headers={},scenario='ok',path='/owner/stores/create'}={}){
 const options={method,headers:{host:'owner.fixture.invalid',...(method==='POST'?{origin:site,'content-type':'application/json'}:{}),cookie:cookie(scenario),...headers}};
 if(method!=='GET'&&method!=='HEAD')options.body=body??JSON.stringify(payload);
 if(options.body instanceof ReadableStream)options.duplex='half';
 return new NextRequest(site+path+query,options);
}
const canonical=b=>({id:b.id,name:b.name});
const publicStore=s=>({slug:s.slug,display_name:s.display_name,is_published:s.is_published});
const ready=(b,s)=>({state:'ready',businessId:b.id,business:canonical(b),storefront:publicStore(s)});
const unknown=id=>({state:'outcome_unknown',businessId:id});
const partial=(b,reason)=>({state:'partial',businessId:b.id,business:canonical(b),reason});
async function response(res,status,body,{refresh=true,scenario='ok'}={}){
 assert.equal(res.status,status);assert.deepEqual(await res.json(),body);
 for(const[k,v]of Object.entries({'cache-control':'private, no-store',pragma:'no-cache',expires:'0','referrer-policy':'no-referrer','x-content-type-options':'nosniff'}))assert.equal(res.headers.get(k),v,k);
 assert.equal(res.headers.get('content-type'),'application/json');
 assert.equal(res.headers.has('set-cookie'),refresh);
 if(refresh){const value=decodeURIComponent(res.headers.get('set-cookie').split('=')[1].split(';')[0]);assert.match(Buffer.from(value.slice(7),'base64url').toString(),new RegExp(scenario+'-next'));}
 assert.doesNotMatch(JSON.stringify(body),/foreign-secret|42501|23505|constraint-private/);
}
async function fixture(run,{businesses=[],storefronts=[],fault='',identity=eligible}={}){
 const env={QWERTY_SITE_URL:site,NEXT_PUBLIC_SUPABASE_URL:provider,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic'};
 const previous=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));
 const original=globalThis.fetch,events=[],writes=[],errors=[];
 // This is a synthetic REST service with explicit mock PK/unique constraints, not DB certification.
 const bRows=businesses.map(b=>({...b})),sRows=storefronts.map(s=>({...s}));
 let businessAttempts=0,storefrontAttempts=0,clients=0;
 const ssr=require('@supabase/ssr');
 const module=load('apps/web/app/owner/stores/create/route.ts',{'@supabase/ssr':{...ssr,createServerClient(...args){clients++;return ssr.createServerClient(...args);}}});
 const invoke=r=>module[r.method](r);
 Object.assign(process.env,env);
 const transport=async(raw,init)=>{
  const url=new URL(raw instanceof Request?raw.url:String(raw)),method=init?.method??'GET',headers=new Headers(init?.headers);
  assert.equal(url.origin,provider,'all SDK traffic stays in mock transport');
  const scenario=url.pathname==='/auth/v1/token'?JSON.parse(init.body).refresh_token:(headers.get('authorization')??'').split('.synthetic-')[1];
  assert.ok(scenario);events.push({method,path:url.pathname,query:url.search,scenario});
  if(url.pathname==='/auth/v1/token')return Response.json({access_token:token(scenario,Math.floor(Date.now()/1000)+3600),refresh_token:scenario+'-next',expires_in:3600,token_type:'bearer',user:eligible});
  if(url.pathname==='/auth/v1/user')return scenario==='rejected'?Response.json({message:'bad identity'},{status:401}):Response.json(scenario==='anonymous'?{...eligible,is_anonymous:true}:identity);
  assert.equal(headers.get('apikey'),'sb_publishable_synthetic');
  const body=init?.body?JSON.parse(init.body):null;
  const dbError=(code,status=409)=>Response.json({code,message:'constraint-private foreign-secret'},{status});
  if(url.pathname==='/rest/v1/businesses'){
   if(method==='GET'){
    assert.equal(url.searchParams.get('owner_id'),'eq.'+owner);
    assert.ok(url.searchParams.get('id'),'exact UUID lookup required, never first store');
    if(fault==='read')return dbError('42501',403);
    return Response.json(bRows.filter(b=>b.owner_id===owner&&'eq.'+b.id===url.searchParams.get('id')).map(canonical));
   }
   assert.equal(method,'POST');businessAttempts++;writes.push({table:'businesses',body});
   assert.deepEqual(Object.keys(body).sort(),['id','name','owner_id']);assert.equal(body.owner_id,owner);
   if(fault==='business-before')throw new TypeError('synthetic transport failure');
   // Constraint enforcement lives only in this mock transport. Race assertions use public reads.
   if(bRows.some(b=>b.id===body.id))return dbError('23505');
   bRows.push({...body});
   if(fault==='business-after')throw new TypeError('response lost after insert');
   if(fault==='business-invalid-response')return new Response('not-json',{status:201});
   return Response.json(canonical(body),{status:201});
  }
  assert.equal(url.pathname,'/rest/v1/business_storefronts');
  if(method==='GET'){
   assert.ok(url.searchParams.get('business_id'));
   if(fault==='storefront-read')return dbError('42501',403);
   const s=sRows.find(s=>'eq.'+s.business_id===url.searchParams.get('business_id'));
   return Response.json(s?publicStore(s):null);
  }
  assert.equal(method,'POST');storefrontAttempts++;writes.push({table:'business_storefronts',body});
  assert.deepEqual(Object.keys(body).sort(),['business_id','display_name','is_published','slug']);assert.equal(body.is_published,false);
  if(fault==='storefront-before')throw new TypeError('synthetic transport failure');
  if(fault==='draft-denied')return dbError('42501',403);
  if(sRows.some(s=>s.business_id===body.business_id||s.slug===body.slug))return dbError('23505');
  sRows.push({...body});
  if(fault==='storefront-after')throw new TypeError('response lost after draft');
  return Response.json(publicStore(body),{status:201});
 };
 globalThis.fetch=async(...args)=>{try{return await transport(...args);}catch(e){if(e instanceof assert.AssertionError)errors.push(e.message);throw e;}};
 const recover=id=>invoke(req({method:'GET',query:'?businessId='+id}));
 try{await run({invoke,recover,events,writes,counts:()=>({businessAttempts,storefrontAttempts,clients})});assert.deepEqual(errors,[],'transport contract assertions must not be swallowed');}
 finally{globalThis.fetch=original;for(const[k,v]of Object.entries(previous)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
}
const existing=ids.slice(0,2).map((id,i)=>({id,owner_id:owner,name:'Old '+i}));
const fresh={id:ids[2],name:'Nueva'},draft={business_id:ids[2],slug:'nueva',display_name:'Nueva',is_published:false};
test('creates a third store with supplied UUID, trims name, recovery reads canonical rows',()=>fixture(async({invoke,recover,writes})=>{
 await response(await invoke(req({payload:input(ids[2],' Nueva ')})),201,ready(fresh,draft));
 assert.deepEqual(writes.map(w=>w.table),['businesses','business_storefronts']);
 await response(await recover(ids[2]),200,ready(fresh,draft));
 for(const b of existing)await response(await recover(b.id),409,partial(b,'storefront_missing'));
 assert.equal(writes.length,2);
},{businesses:existing}));
test('same UUID resumes canonical published data without name/slug/publication overwrite',()=>fixture(async({invoke,recover,writes})=>{
 const s={...draft,slug:'original',display_name:'Canonical',is_published:true};
 await response(await invoke(req({payload:input(ids[2],'Ignored','ignored')})),200,ready(fresh,s));
 await response(await recover(ids[2]),200,ready(fresh,s));assert.deepEqual(writes,[]);
},{businesses:[{...fresh,owner_id:owner}],storefronts:[{...draft,slug:'original',display_name:'Canonical',is_published:true}]}));
test('two UUIDs with the same business name are independent, same UUID sequential replay is canonical',()=>fixture(async({invoke,recover,writes})=>{
 await response(await invoke(req()),201,ready(fresh,draft));
 const b={id:ids[3],name:'Nueva'},s={...draft,business_id:ids[3],slug:'otra'};
 await response(await invoke(req({payload:input(ids[3],'Nueva','otra')})),201,ready(b,s));
 await response(await invoke(req({payload:input(ids[2],'Ignored','ignored')})),200,ready(fresh,draft));
 await response(await recover(ids[3]),200,ready(b,s));assert.equal(writes.length,4);
}));
test('concurrent same UUID converges via mock PK and owned reread, not actual DB certification',()=>fixture(async({invoke,recover,counts,writes})=>{
 const results=await Promise.all([invoke(req()),invoke(req())]);
 for(const r of results){assert.ok([200,201].includes(r.status));await response(r,r.status,ready(fresh,draft));}
 await response(await recover(ids[2]),200,ready(fresh,draft));
 assert.equal(counts().businessAttempts,2);assert.ok(counts().storefrontAttempts<=2);
 assert.ok(writes.every(w=>w.body.id===ids[2]||w.body.business_id===ids[2]));
}));
test('slug conflict retains business and permits only same-ID slug correction; GET is read-only',()=>fixture(async({invoke,recover,writes})=>{
 await response(await invoke(req()),409,partial(fresh,'slug_unavailable'));
 await response(await recover(ids[2]),409,partial(fresh,'storefront_missing'));
 assert.equal(writes.length,2);
 const corrected={...draft,slug:'corregida'};
 await response(await invoke(req({payload:input(ids[2],'Do not rename','corregida')})),201,ready(fresh,corrected));
 await response(await recover(ids[2]),200,ready(fresh,corrected));
 assert.equal(writes.filter(w=>w.table==='businesses').length,1);
},{storefronts:[{...draft,business_id:ids[0],display_name:'foreign-secret'}]}));
test('known draft denial retains business with correction state and sanitized error',()=>fixture(async({invoke,recover,writes})=>{
 await response(await invoke(req()),409,partial(fresh,'draft_rejected'));
 await response(await recover(ids[2]),409,partial(fresh,'storefront_missing'));assert.equal(writes.length,2);
},{fault:'draft-denied'}));
for(const [fault,state]of [['business-before','unknown'],['business-after','partial'],['business-invalid-response','partial'],['storefront-before','partial'],['storefront-after','ready']]){
 test(fault+': unknown write outcome freezes mutation; only read-only recovery observes rows',()=>fixture(async({invoke,recover,writes})=>{
  await response(await invoke(req()),503,unknown(ids[2]));const before=writes.length;
  const r=await recover(ids[2]);await response(r,state==='ready'?200:state==='partial'?409:503,state==='ready'?ready(fresh,draft):state==='partial'?partial(fresh,'storefront_missing'):unknown(ids[2]));
  assert.equal(writes.length,before);assert.equal(writes.filter(w=>w.table==='businesses').length,1);
 },{fault}));
}
for(const fault of ['read','storefront-read'])test(fault+': late read failures keep verified-owner refresh without writes',()=>fixture(async({invoke,recover,writes})=>{
 await response(await invoke(req()),503,unknown(ids[2]));await response(await recover(ids[2]),503,unknown(ids[2]));assert.deepEqual(writes,[]);
},{businesses:[{...fresh,owner_id:owner}],fault}));
test('missing or foreign recovery is ambiguous, foreign UUID collision never leaks or writes storefront',()=>fixture(async({invoke,recover,writes})=>{
 await response(await recover(ids[2]),503,unknown(ids[2]));await response(await recover(ids[3]),503,unknown(ids[3]));assert.deepEqual(writes,[]);
 await response(await invoke(req()),503,unknown(ids[2]));
 assert.equal(writes.length,1);assert.equal(writes[0].table,'businesses');
 await response(await recover(ids[2]),503,unknown(ids[2]));assert.equal(writes.length,1);
},{businesses:[{id:ids[2],owner_id:foreign,name:'foreign-secret'}],storefronts:[{...draft,display_name:'foreign-secret',is_published:true}]}));
for(const [label,identity]of [['unconfirmed',{...eligible,email_confirmed_at:null}],['anonymous',{...eligible,is_anonymous:true}],['missing email',{...eligible,email:null}],['wrong role',{...eligible,role:'anon'}],['null',null]])test(label+': fresh identity rejection discards staged refresh and all owned access',()=>fixture(async({invoke,events,writes})=>{
 await response(await invoke(req()),identity===null?503:401,{error:identity===null?'unavailable':'unauthorized'},{refresh:false});
 assert.equal(events.filter(e=>e.path.startsWith('/rest/')).length,0);assert.deepEqual(writes,[]);
},{identity}));
test('SDK getUser rejection after refresh discards caller cookies',()=>fixture(async({invoke,events})=>{
 await response(await invoke(req({scenario:'rejected'})),401,{error:'unauthorized'},{refresh:false});assert.equal(events.filter(e=>e.path.startsWith('/rest/')).length,0);
}));
test('concurrent requests isolate valid late-503 refresh from rejected identity',()=>fixture(async({invoke,writes})=>{
 const [valid,rejected]=await Promise.all([invoke(req()),invoke(req({scenario:'anonymous'}))]);
 await response(valid,503,unknown(ids[2]));await response(rejected,401,{error:'unauthorized'},{refresh:false});assert.deepEqual(writes,[]);
},{fault:'read'}));
const invalid=[
 ['method',{method:'PUT'},405,'method_not_allowed'],['missing Origin',{headers:{origin:''}},403,'request_rejected'],
 ['foreign Origin',{headers:{origin:'https://foreign.invalid'}},403,'request_rejected'],['Host',{headers:{host:'foreign.invalid'}},403,'request_rejected'],
 ['forwarded Host',{headers:{'x-forwarded-host':'foreign.invalid'}},403,'request_rejected'],['forwarded Proto',{headers:{'x-forwarded-proto':'http'}},403,'request_rejected'],
 ['cross site',{headers:{'sec-fetch-site':'cross-site'}},403,'request_rejected'],['path',{path:'/owner/stores/wrong'},403,'request_rejected'],
 ['POST query',{query:'?businessId='+ids[2]},400,'invalid_request'],['GET missing query',{method:'GET'},400,'invalid_request'],
 ['GET duplicate',{method:'GET',query:'?businessId='+ids[2]+'&businessId='+ids[2]},400,'invalid_request'],
 ['GET extra query',{method:'GET',query:'?businessId='+ids[2]+'&ownerId='+owner},400,'invalid_request'],
 ['GET invalid UUID',{method:'GET',query:'?businessId=bad'},400,'invalid_request'],['GET foreign Origin',{method:'GET',query:'?businessId='+ids[2],headers:{origin:'https://foreign.invalid'}},403,'request_rejected'],
 ['content type',{headers:{'content-type':'text/plain'}},400,'invalid_request'],['invalid JSON',{body:'{'},400,'invalid_request'],
 ['array',{payload:[]},400,'invalid_request'],['null',{body:'null'},400,'invalid_request'],['ownerId extra',{payload:{...input(),ownerId:owner}},400,'invalid_request'],
 ['publication extra',{payload:{...input(),is_published:true}},400,'invalid_request'],['missing slug',{payload:{businessId:ids[2],name:'Nueva'}},400,'invalid_request'],
 ['UUID',{payload:input('not-a-uuid')},400,'invalid_request'],['empty name',{payload:input(ids[2],'  ')},400,'invalid_request'],
 ['long name',{payload:input(ids[2],'x'.repeat(121))},400,'invalid_request'],['name type',{payload:input(ids[2],123)},400,'invalid_request'],
 ['empty slug',{payload:input(ids[2],'Nueva','')},400,'invalid_request'],['uppercase slug',{payload:input(ids[2],'Nueva','UPPER')},400,'invalid_request'],
 ['slug punctuation',{payload:input(ids[2],'Nueva','bad--slug')},400,'invalid_request'],['long slug',{payload:input(ids[2],'Nueva','x'.repeat(64))},400,'invalid_request'],
 ['declared body limit',{headers:{'content-length':'2049'}},400,'invalid_request'],['invalid length',{headers:{'content-length':'bad'}},400,'invalid_request'],
 ['byte limit',{body:JSON.stringify({...input(),name:'é'.repeat(1100)})},400,'invalid_request'],
];
for(const[label,options,status,error]of invalid)test(label+': rejects before session client/network/writes',()=>fixture(async({invoke,events,writes,counts})=>{
 const r=await invoke(req(options));await response(r,status,{error},{refresh:false});if(status===405)assert.equal(r.headers.get('allow'),'GET, POST');assert.deepEqual(events,[]);assert.deepEqual(writes,[]);assert.equal(counts().clients,0);
}));
test('stream split UTF-8 and exactly 2048 bytes accepted; uppercase UUID normalized; max fields accepted',()=>fixture(async({invoke})=>{
 const payload=input(ids[2].toUpperCase(),'é'.repeat(120),'s'.repeat(63));const raw=Buffer.from(JSON.stringify(payload));const bytes=Buffer.concat([raw,Buffer.alloc(2048-raw.length,32)]);
 const body=new ReadableStream({start(c){for(const b of bytes)c.enqueue(new Uint8Array([b]));c.close();}});
 await response(await invoke(req({body})),201,ready({id:ids[2],name:payload.name},{slug:payload.slug,display_name:payload.name,is_published:false}));
}));
for(const mode of ['overflow','invalid-utf8','throws'])test('stream '+mode+': rejects before network',()=>fixture(async({invoke,events,counts})=>{
 const body=new ReadableStream({start(c){if(mode==='throws'){c.error(new Error('read failed'));return;}c.enqueue(mode==='overflow'?new Uint8Array(2049):new Uint8Array([0xff]));c.close();}});
 await response(await invoke(req({body})),400,{error:'invalid_request'},{refresh:false});assert.deepEqual(events,[]);assert.equal(counts().clients,0);
}));
