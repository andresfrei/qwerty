import test from 'node:test';
import assert from 'node:assert/strict';
import {handleCatalogConfigurationRequest,createCatalogConfigurationGateway} from '../app/owner/catalog/catalog-configuration-gateway.ts';
import {fixture,request,business,item,origin,standard} from './owner-catalog-configuration-fixtures.mjs';
async function run(f,r) {const result=await handleCatalogConfigurationRequest(r,{trustedOrigin:origin,createGateway:async()=>createCatalogConfigurationGateway(f.client)});return {status:result.status,body:await result.json(),headers:result.headers};}
const id=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`;
const group=(groupId,itemId,mode,min,max)=>({id:groupId,business_id:business,item_id:itemId,name:'Synthetic group',selection_mode:mode,min_select:min,max_select:max,sort_order:0});
const option=(optionId,groupId)=>({id:optionId,business_id:business,group_id:groupId,name:'Synthetic option',price_delta_minor:100,is_available:false,sort_order:0});
test('syntactically valid UUID is not ownership; no invented UUID-version restriction or fallback',async()=>{
 const f=fixture();const result=await run(f,request('POST',undefined,`businessId=00000000-0000-0000-0000-000000000000&itemId=${item}`));
 assert.equal(result.status,404);assert.equal(f.state.identity,1);assert.equal(f.state.saves,0);
 assert.deepEqual(f.state.calls.map(c=>c.table),['businesses']);
});
test('methods, GET body headers, malformed UTF8, encoded body and actual stream overflow cannot touch identity',async()=>{
 const invalid=[new Request(`${origin}/owner/catalog/configurations?businessId=${business}&itemId=${item}`,{method:'PUT',headers:{host:'owner.fixture.invalid',origin}}),request('GET',undefined,undefined,{'content-encoding':'gzip'}),request('POST',undefined,undefined,{'content-encoding':'gzip'})];
 invalid.push(new Request(`${origin}/owner/catalog/configurations?businessId=${business}&itemId=${item}`,{method:'POST',headers:{host:'owner.fixture.invalid',origin,'content-type':'application/json'},body:new Uint8Array([255])}));
 let canceled=false;invalid.push(new Request(`${origin}/owner/catalog/configurations?businessId=${business}&itemId=${item}`,{method:'POST',headers:{host:'owner.fixture.invalid',origin,'content-type':'application/json'},body:new ReadableStream({pull(c){c.enqueue(new Uint8Array(270000));},cancel(){canceled=true;}}),duplex:'half'}));
 for(const r of invalid){const f=fixture();const result=await run(f,r);assert.equal(result.status,r.method==='PUT'?405:r===invalid.at(-1)?413:400);if(r.method==='PUT')assert.equal(result.headers.get('allow'),'GET, POST');assert.equal(f.state.identity,0);assert.deepEqual(f.state.calls,[]);}
 assert.equal(canceled,true);
});
test('truncated or unreadable scoped row counts never masquerade as complete configuration',async()=>{
 for(const count of [null,1001,1]){
  const f=fixture();f.state.counts.catalog_option_groups=count;
  const result=await run(f,request('GET'));assert.equal(result.status,503);assert.equal(f.state.saves,0);
 }
});
test('complete pizza matrix with disabled pair and exhausted options saves; incomplete matrix and incorrect group bounds never dispatch CAS',async()=>{
 const size=id(1),flavor=id(2),small=id(3),large=id(4),taste=id(5);
 const document={schemaVersion:1,kind:'pizza',sizeGroupId:size,flavorGroupId:flavor,matrix:[{sizeOptionId:large,flavorOptionId:taste,priceMinor:29,available:false},{sizeOptionId:small,flavorOptionId:taste,priceMinor:1200000,available:true}]};
 for(const kind of ['valid','missingPair','badBounds']){
  const f=fixture();f.state.rows.catalog_option_groups.push(group(size,item,'distinct',1,1),group(flavor,item,'distinct',1,2));
  f.state.rows.catalog_options.push(option(small,size),option(large,size),option(taste,flavor));
  const draft=structuredClone(document);if(kind==='missingPair')draft.matrix.pop();if(kind==='badBounds')f.state.rows.catalog_option_groups[0].max_select=2;
  const result=await run(f,request('POST',{expectedVersion:0,isActive:true,document:draft}));
  assert.equal(result.status,kind==='valid'?200:422);assert.equal(f.state.saves,kind==='valid'?1:0);
  if(kind==='valid'){assert.equal(result.body.profile.document.matrix.length,2);assert.equal(result.body.profile.document.matrix.find(r=>r.sizeOptionId===large).available,false);assert.equal(result.body.profile.document.matrix.find(r=>r.sizeOptionId===large).priceMinor,29);}
 }
});
test('combo loads only fixed same-store children, exact restrictions; exhausted fixed picks are structurally valid, nesting and foreign references fail',async()=>{
 const child=id(6),other=id(7),g=id(8),o=id(9),component=id(10);
 const document={schemaVersion:1,kind:'combo',components:[{componentId:component,itemId:child,quantity:2,order:0,fixedGroupPicks:[{groupId:g,picks:[{optionId:o,quantity:1}]}],allowedOptions:[{groupId:g,optionIds:[o]}]}]};
 for(const kind of ['valid','nested','self','foreign','forbiddenFixed']){
  const f=fixture();f.state.rows.catalog_items.push({...f.state.rows.catalog_items[0],id:child,is_available:false},{...f.state.rows.catalog_items[0],id:other});
  f.state.rows.catalog_option_groups.push(group(g,child,'distinct',1,1));f.state.rows.catalog_options.push(option(o,g));
  const draft=structuredClone(document);
  if(kind==='self')draft.components[0].itemId=item;
  if(kind==='foreign')f.state.rows.catalog_items[1].business_id=id(11);
  if(kind==='forbiddenFixed')draft.components[0].allowedOptions[0].optionIds=[];
  if(kind==='nested')f.state.rows.catalog_item_configurations.push({business_id:business,item_id:child,version:3,is_active:true,document:{schemaVersion:1,kind:'combo',components:[{componentId:id(12),itemId:other,quantity:1,order:0,fixedGroupPicks:[],allowedOptions:[]}]}});
  const result=await run(f,request('POST',{expectedVersion:0,isActive:true,document:draft}));assert.equal(result.status,kind==='valid'?200:422);assert.equal(f.state.saves,kind==='valid'?1:0);
  if(kind==='valid'){
   const recovered=await run(f,request('GET'));assert.equal(recovered.status,200);
   assert.deepEqual(recovered.body.catalog.items.map(i=>i.id).sort(),[item,child].sort());assert.equal(f.state.saves,1);
   assert.deepEqual(recovered.body.catalog.profiles.find(p=>p.item_id===item).document,draft);
  }
 }
});
