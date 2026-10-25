import test from 'node:test';
import assert from 'node:assert/strict';
import {handleCatalogConfigurationRequest,createCatalogConfigurationGateway} from '../app/owner/catalog/catalog-configuration-gateway.ts';
import {fixture,request,business,item,owner,foreign,standard,origin} from './owner-catalog-configuration-fixtures.mjs';
async function run(f,r=request()) {
 let verified=0;
 const response=await handleCatalogConfigurationRequest(r,{trustedOrigin:origin,createGateway:async()=>createCatalogConfigurationGateway(f.client,()=>verified++)});
 assert.equal(response.headers.get('cache-control'),'private, no-store');
 assert.equal(response.headers.get('access-control-allow-origin'),null);
 return {status:response.status,body:await response.json(),verified};
}
test('session owner CAS creates canonical profile once; stale CAS cannot overwrite',async()=>{
 const f=fixture();const first=await run(f);
 assert.deepEqual(first,{status:200,body:{code:'saved',profile:{business_id:business,item_id:item,version:1,is_active:true,document:standard}},verified:1});
 assert.deepEqual(f.state.calls.find(c=>c.rpc==='save_catalog_item_configuration').args,{p_business:business,p_item:item,p_expected_version:0,p_is_active:true,p_document:standard});
 const stored=structuredClone(f.state.rows.catalog_item_configurations);
 assert.deepEqual(await run(f),{status:409,body:{error:'configuration_version_conflict'},verified:1});
 assert.deepEqual(f.state.rows.catalog_item_configurations,stored);assert.equal(f.state.saves,2);
 const changed=await run(f,request('POST',{expectedVersion:1,isActive:false,document:null}));
 assert.equal(changed.body.profile.version,2);assert.equal(changed.body.profile.document,null);
});
test('GET is direct scoped read-only recovery, preserving inactive unknown documents and version',async()=>{
 const f=fixture();f.state.rows.catalog_item_configurations.push({business_id:business,item_id:item,version:7,is_active:false,document:{future:'preserve'}});
 f.state.rows.catalog_items.push({...f.state.rows.catalog_items[0],id:foreign,business_id:foreign});
 const result=await run(f,request('GET'));
 assert.equal(result.status,200);assert.equal(result.body.capability,'ready');
 assert.equal(result.body.catalog.profiles[0].version,7);assert.deepEqual(result.body.catalog.profiles[0].document,{future:'preserve'});
 assert.deepEqual(result.body.catalog.items.map(i=>i.id),[item]);assert.equal(f.state.saves,0);
});
test('missing, foreign and unconfirmed scope never falls back or writes',async()=>{
 for(const kind of ['unconfirmed','anonymous','foreign','missingItem','foreignItem']){
  const f=fixture();let r=request();
  if(kind==='unconfirmed')f.state.user.email_confirmed_at=null;
  if(kind==='anonymous')f.state.user.is_anonymous=true;
  if(kind==='foreign')r=request('POST',undefined,`businessId=${foreign}&itemId=${item}`);
  if(kind==='missingItem')r=request('GET',undefined,`businessId=${business}&itemId=${foreign}`);
  if(kind==='foreignItem')f.state.rows.catalog_items[0].business_id=foreign;
  const result=await run(f,r);assert.equal(result.status,['unconfirmed','anonymous'].includes(kind)?401:404,kind);
  assert.equal(result.verified,['unconfirmed','anonymous'].includes(kind)?0:1);assert.equal(f.state.saves,0);
 }
});
test('strict invalid ingress/document/resource rejection precedes all identity calls',async()=>{
 const cases=[
  request('POST',undefined,`itemId=${item}`),request('POST',undefined,`businessId=${business}&itemId=${item}&extra=1`),
  request('POST',undefined,`businessId=${business}&businessId=${business}&itemId=${item}`),request('POST',undefined,`businessId=bad&itemId=${item}`),
  request('POST',undefined,undefined,{origin:'https://foreign.invalid'}),request('POST',undefined,undefined,{'content-type':'text/plain'}),
  request('POST',{expectedVersion:0,isActive:true,document:standard,actor:owner}),request('POST',{expectedVersion:-1,isActive:true,document:standard}),
  request('POST',{expectedVersion:Number.MAX_SAFE_INTEGER,isActive:true,document:standard}),request('POST',{expectedVersion:0,isActive:true,document:{...standard,extra:1}}),
  request('POST',{expectedVersion:0,isActive:false,document:'x'.repeat(262145)}),
 ];
 for(const r of cases){const f=fixture();const result=await run(f,r);assert.ok([400,413].includes(result.status));assert.equal(f.state.identity,0);assert.equal(result.verified,0);assert.equal(f.state.saves,0);}
});
test('capability absence remains truthful; capability failure never means empty legacy',async()=>{
 for(const capability of ['legacy_only','unavailable'])for(const method of ['GET','POST']){
  const f=fixture();f.state.capability=capability;const result=await run(f,request(method));
  assert.equal(result.status,capability==='legacy_only'&&method==='GET'?200:503);
  assert.deepEqual(result.body,capability==='legacy_only'&&method==='GET'?{capability:'legacy_only'}:{error:capability});assert.equal(f.state.saves,0);
 }
});
test('unreadable and malformed active rows fail closed; never fake absence',async()=>{
 for(const kind of ['readFailure','badProfile','activeDocument']){
  const f=fixture();
  if(kind==='readFailure')f.state.failure='catalog_item_configurations';
  else f.state.rows.catalog_item_configurations.push({business_id:business,item_id:item,version:kind==='badProfile'?0:1,is_active:true,document:{future:'not standard'}});
  assert.equal((await run(f,request('GET'))).status,503);assert.equal(f.state.saves,0);
 }
});
test('typed SQL rollbacks are known rejection; malformed/transport after RPC remain unknown',async()=>{
 for(const code of ['23514','23503','23505','42501','25001','40P01','40001']){
  const f=fixture();f.state.rpcResult={data:null,error:{code,message:'private diagnostic'}};
  const result=await run(f);assert.equal(result.status,code==='42501'?403:code==='23505'?409:422);
  assert.ok(!JSON.stringify(result.body).includes('private'));assert.equal(result.verified,1);assert.equal(f.state.saves,1);assert.equal(f.state.rows.catalog_item_configurations.length,0);
 }
 for(const rpcResult of [new Error('lost'),{data:null,error:{code:'503'}},{data:{code:'saved',profile:{}},error:null},{data:{code:'saved',profile:{business_id:business,item_id:item,version:2,is_active:true,document:standard}},error:null},{data:{code:'configuration_version_conflict',extra:true},error:null}]){
  const f=fixture();f.state.rpcResult=rpcResult;const result=await run(f);
  assert.deepEqual(result,{status:503,body:{error:'outcome_unknown'},verified:1});assert.equal(f.state.saves,1);
 }
});
test('lost or malformed response after simulated COMMIT remains unknown; subsequent GET observes version without another write',async()=>{
 for(const afterCommit of ['throw','malformed']){
  const f=fixture();f.state.afterCommit=afterCommit;
  assert.deepEqual(await run(f),{status:503,body:{error:'outcome_unknown'},verified:1});
  assert.equal(f.state.saves,1);assert.equal(f.state.rows.catalog_item_configurations[0].version,1);
  const recovered=await run(f,request('GET'));assert.equal(recovered.status,200);
  assert.deepEqual(recovered.body.catalog.profiles,f.state.rows.catalog_item_configurations);assert.equal(f.state.saves,1);
 }
});
test('structurally invalid references reject before CAS; agotado is not structural failure',async()=>{
 const f=fixture();const invalid={schemaVersion:1,kind:'dozen',varietyGroupId:foreign};
 assert.equal((await run(f,request('POST',{expectedVersion:0,isActive:true,document:invalid}))).status,422);assert.equal(f.state.saves,0);
 f.state.rows.catalog_items[0].is_available=false;assert.equal((await run(f)).status,200);
});
