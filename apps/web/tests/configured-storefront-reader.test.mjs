import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,missingCapability,business,pizza,dozen,combo,muzza,napo,small,large,flavor,variety,carne,component,id,key,base,pizzaChoice} from './configured-public-fixtures.mjs';
import {validateProfileSelection} from '../app/lib/catalog-profiles.ts';
import {priceProfileSelection} from '../app/lib/catalog-profile-pricing.ts';
const request=(entry,itemId,selection)=>({catalog:entry.catalog,itemId,selection});
test('public ready projection retains exhausted metadata, exact prices and dependent-only rejection',async()=>{
 const f=fixture();f.rows.catalog_options.find(o=>o.id===muzza).is_available=false;
 const result=await f.read();assert.equal(result.status,'ok');assert.equal(result.capability,'ready');
 const p=result.configurations[pizza],d=result.configurations[dozen],c=result.configurations[combo];
 assert.equal(p.status,'ready');assert.equal(c.status,'ready');assert.equal(d.status,'ready');
 assert.equal(p.catalog.options.find(o=>o.id===muzza).is_available,false);
 assert.equal(validateProfileSelection(request(p,pizza,pizzaChoice())).ok,false);
 assert.deepEqual(priceProfileSelection(request(p,pizza,pizzaChoice(large,napo))),{ok:true,unitPriceMinor:1200000,surchargeMinor:0});
 assert.equal(validateProfileSelection(request(p,pizza,pizzaChoice(small,napo))).ok,false);
 const choices={kind:'combo',profileVersion:1,components:[0,1].map(instanceIndex=>({componentId:component,instanceIndex,selection:pizzaChoice()}))};
 assert.equal(validateProfileSelection(request(c,combo,choices)).ok,false);
 const dozenChoice={kind:'leaf',profileVersion:1,groups:[{groupId:variety,picks:[{optionId:carne,quantity:12}]}]};
 assert.deepEqual(priceProfileSelection(request(d,dozen,dozenChoice)),{ok:true,unitPriceMinor:1200000,surchargeMinor:0});
 assert.deepEqual(Object.keys(result.configurations).sort(),[pizza,dozen,combo].sort());
 assert.equal('fingerprint' in p.catalog,false);assert.equal('slug' in p.catalog,false);
});
test('anon fixed-origin REST and exact-count scoped projections never consult owner/service APIs',async()=>{
 const f=fixture();assert.equal((await f.read()).status,'ok');
 for(const {url,init} of f.calls){assert.equal(url.origin,base);assert.equal(init.credentials,'omit');assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');
 const headers=new Headers(init.headers);assert.equal(headers.get('apikey'),key);assert.equal(headers.get('authorization'),`Bearer ${key}`);assert.equal(headers.has('cookie'),false);
 assert.doesNotMatch(url.pathname,/owner|pickup_order_catalog|save_/);
 if(!url.pathname.includes('/rpc/'))assert.equal(init.method??'GET','GET');
 }
 const advanced=f.calls.filter(c=>c.url.pathname.endsWith('/catalog_options'));
 assert.ok(advanced.length);for(const {url} of advanced){assert.equal(url.searchParams.has('is_available'),false);assert.equal(url.searchParams.get('business_id'),`eq.${business}`);}
 for(const {url,init} of f.calls.filter(c=>c.url.pathname.endsWith('/catalog_item_configurations'))){assert.equal(url.searchParams.get('is_active'),'eq.true');assert.equal(new Headers(init.headers).get('prefer'),'count=exact');assert.equal(url.searchParams.get('select'),'business_id,item_id,version,is_active,document');}
});
test('only typed missing capability is legacy, all malformed/transport/permission failures stay unavailable',async()=>{
 const legacy=fixture();legacy.capability=missingCapability();const result=await legacy.read();assert.equal(result.status,'ok');assert.equal(result.capability,'legacy_only');assert.deepEqual(result.configurations,{});assert.equal(legacy.calls.length,4);
 for(const cap of [[],{},[{version:2,schemaVersion:1,extra:true}],[{version:2,schemaVersion:2}],Response.json({code:'42501'},{status:403}),Response.json({code:'PGRST202',message:'wrong function'},{status:404})]){
 const f=fixture();f.capability=cap;assert.deepEqual(await f.read(),{status:'unavailable'});assert.equal(f.calls.length,4);
 }
 const f=fixture();f.override=url=>{if(url.pathname.includes('/rpc/'))throw Error('transport');};assert.deepEqual(await f.read(),{status:'unavailable'});
});
test('RLS-hidden child retains public root profile and disables only dependent combo, without private details',async()=>{
 const f=fixture();const hidden=id(99);f.rows.catalog_item_configurations.find(p=>p.item_id===combo).document.components[0].itemId=hidden;
 const result=await f.read();assert.equal(result.capability,'ready');assert.deepEqual(result.configurations[combo],{status:'unavailable'});assert.equal(result.configurations[dozen].status,'ready');assert.equal(result.configurations[pizza].status,'ready');
 assert.equal(JSON.stringify(result).includes(hidden),false);assert.doesNotMatch(JSON.stringify(result),/private|draft|fingerprint/);
});
test('a supplemental item response cannot expose an unavailable child despite a forged successful public read',async()=>{
 const f=fixture(),hidden=id(99);const definition=f.rows.catalog_item_configurations.find(p=>p.item_id===combo).document.components[0];definition.itemId=hidden;definition.fixedGroupPicks=[];
 f.override=url=>{if(url.pathname.endsWith('/catalog_items')&&url.searchParams.has('id'))return Response.json([{id:hidden,business_id:business,name:'Hidden child',price_minor:100,currency:'ARS',is_available:false}],{headers:{'content-range':'0-0/1'}});};
 const result=await f.read();assert.deepEqual(result.configurations[combo],{status:'unavailable'});assert.equal(JSON.stringify(result).includes('Hidden child'),false);assert.equal(result.configurations[dozen].status,'ready');
});
test('invalid active document never becomes unprofiled while unrelated items remain usable',async()=>{
 const f=fixture();f.rows.catalog_item_configurations.find(p=>p.item_id===pizza).document={schemaVersion:1,kind:'pizza',privateDraft:'DO NOT LEAK'};
 const result=await f.read();assert.deepEqual(result.configurations[pizza],{status:'unavailable'});assert.deepEqual(result.configurations[combo],{status:'unavailable'});assert.equal(result.configurations[dozen].status,'ready');assert.equal(JSON.stringify(result).includes('DO NOT LEAK'),false);
});
test('a forged successful storefront response cannot change the selected slug',async()=>{
 const f=fixture();f.override=url=>{if(url.pathname.endsWith('/business_storefronts'))return Response.json([{...f.rows.business_storefronts[0],slug:'otra'}]);};
 assert.deepEqual(await f.read(),{status:'unavailable'});
});
test('empty new records do not impose T1 global caps on a large legacy business',async()=>{
 const f=fixture();f.rows.catalog_item_configurations=[];f.rows.catalog_items=Array.from({length:1001},(_,i)=>({...f.rows.catalog_items[0],id:id(1000+i)}));
 const result=await f.read();assert.equal(result.status,'ok');assert.equal(result.categories[0].items.length,1001);assert.equal(Object.keys(result.configurations).length,1001);assert.ok(Object.values(result.configurations).every(c=>c.status==='legacy'));
 assert.equal(f.calls.filter(c=>c.url.pathname.endsWith('/catalog_item_configurations')).length,11);assert.equal(f.calls.filter(c=>c.url.pathname.endsWith('/catalog_option_groups')).length,0);
});
test('stream overflow cancels before JSON decode; exact transport budget remains accepted',async()=>{
 for(const overflow of [false,true]){
 const f=fixture();let cancels=0,reads=0;
 f.override=url=>{if(!url.pathname.includes('/rpc/'))return;
 const body=JSON.stringify([{version:2,schemaVersion:1}]);
 if(!overflow)return new Response(body+' '.repeat(1048576-body.length));
 return new Response(new ReadableStream({pull(controller){reads++;controller.enqueue(new Uint8Array(600000).fill(32));},cancel(){cancels++;}}));};
 const result=await f.read();assert.equal(result.status,overflow?'unavailable':'ok');assert.equal(cancels,overflow?1:0);if(overflow)assert.ok(reads<=3);
 }
});
test('truncation, oversized transport, foreign rows and excessive document depth fail closed',async()=>{
 for(const mode of ['truncated','bytes','foreign','depth']){
 const f=fixture();f.override=url=>{if(!url.pathname.endsWith('/catalog_item_configurations'))return;
 if(mode==='truncated')return Response.json([],{headers:{'content-range':'*/1'}});
 if(mode==='bytes')return new Response(' '.repeat(1048577),{headers:{'content-range':'*/0'}});
 const profiles=structuredClone(f.rows.catalog_item_configurations);
 if(mode==='foreign')profiles[0].business_id=id(99);
 if(mode==='depth'){let nested=null;for(let i=0;i<30;i++)nested={nested};profiles[0].document=nested;}
 return Response.json(profiles,{headers:{'content-range':'0-2/3'}});
 };
 assert.deepEqual(await f.read(),{status:'unavailable'},mode);
 }
});
