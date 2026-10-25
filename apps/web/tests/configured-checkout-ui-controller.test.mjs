import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fixture,business,pizza,dozen,variety,carne,id,pizzaChoice} from './configured-public-fixtures.mjs';
import {storage} from './checkout-fixtures.mjs';
import {addConfiguredVariant,configuredCartStorageKey,configuredCartIntent} from '../app/lib/configured-cart.ts';
import {priceProfileSelection,describeProfileSelection} from '../app/lib/catalog-profile-pricing.ts';
import {validateProfileSelection} from '../app/lib/catalog-profiles.ts';
import {normalizePickupIntent, quotePickupOrder} from '../app/lib/order-quote.ts';
import {presentPickupOrder} from '../app/lib/pickup-order-service.ts';
const require=createRequire(import.meta.url),api=()=>require('../app/lib/configured-checkout.ts');
function accepted(intent,catalog){const line=intent.lines[0],request={catalog,itemId:line.itemId,selection:line.selection},resolved=validateProfileSelection(request).value,price=priceProfileSelection(request),description=describeProfileSelection(request);
 return{version:2,id:id(72),requestId:intent.requestId,receiptId:intent.receiptId,currency:intent.expected.currency,totalMinor:intent.expected.totalMinor,fulfillmentState:'pendiente_de_pago',paymentState:'pendiente',createdAt:'2026-01-01T00:00:00Z',contact:intent.contact,lines:[{itemId:line.itemId,quantity:line.quantity,selection:resolved.selection,name:resolved.item.name,currency:resolved.item.currency,profileVersion:resolved.selection.profileVersion,profileKind:'pizza',unitPriceMinor:price.unitPriceMinor,lineTotalMinor:price.unitPriceMinor*line.quantity,surchargeMinor:price.surchargeMinor,selectionText:description.text,groups:description.groups,components:description.components}]};}
async function setup(extra={}){
 const f=fixture(),publicCatalog=await f.read();const cart=addConfiguredVariant({businessId:business,slug:'tienda',items:[]},{catalog:publicCatalog.configurations[pizza].catalog,itemId:pizza,selection:pizzaChoice()}).cart;
 const s=extra.storage??storage([[configuredCartStorageKey(business,'tienda'),JSON.stringify({version:3,...cart})]]),calls=[];let uuids=0;
 const fetcher=async(url,init)=>{calls.push([url,init]);if(extra.fetcher)return extra.fetcher(url,init);if(url==='/api/checkout/session')return Response.json({ready:true});if(url.includes('/receipts?'))return Response.json({receiptId:id(71)},{status:201});throw Error('lost');};
 const page={slug:'tienda',publicCatalog,legacyCatalog:null};const c=api().createConfiguredCheckoutController(page,{storage:()=>s,fetcher,uuid:()=>{uuids++;return id(70);}});await c.restore();
 return{c,s,calls,page,cart,get uuids(){return uuids;}};
}
test('a malformed current cart cannot gate a valid frozen attempt GET',async()=>{
 const f=await setup();await prepared(f);await f.c.confirm();f.s.values.set(configuredCartStorageKey(business,'tienda'),'{bad');const calls=[];
 const c=api().createConfiguredCheckoutController({slug:'tienda',publicCatalog:{status:'unavailable'},legacyCatalog:null},{storage:()=>f.s,fetcher:async(url,init)=>{calls.push([url,init]);return Response.json({error:'missing'},{status:404});}});await c.restore();assert.equal(calls.length,1);assert.equal(calls[0][1].method,'GET');assert.equal(c.snapshot().phase,'unknown');assert.equal(f.s.getItem(configuredCartStorageKey(business,'tienda')),'{bad');
});
test('duplicate canonical variants reject before session/receipt staging even with distinct corrupted stored keys',async()=>{
 const f=await setup(),cart={...f.cart,items:[...f.cart.items,{...f.cart.items[0],key:'forged-second-key'}]};f.s.values.set(configuredCartStorageKey(business,'tienda'),JSON.stringify({version:3,...cart}));let calls=0;
 const c=api().createConfiguredCheckoutController(f.page,{storage:()=>f.s,uuid:()=>assert.fail('no allocation on rejection'),fetcher:async()=>{calls++;return Response.json({ready:true});}});await c.restore();c.editContact({name:'Ana',email:'ana@example.invalid',telephone:'123'});assert.equal(await c.prepare(),false);assert.equal(calls,0);assert.equal(f.s.writes.length,0);
});
test('mixed currencies reject before session or receipt staging',async()=>{
 const f=await setup(),publicCatalog=f.page.publicCatalog;const d=publicCatalog.configurations[dozen].catalog;d.items[0].currency='USD';publicCatalog.categories[0].items.find(i=>i.id===dozen).currency='USD';
 const mixed=addConfiguredVariant(f.cart,{catalog:d,itemId:dozen,selection:{kind:'leaf',profileVersion:1,groups:[{groupId:variety,picks:[{optionId:carne,quantity:12}]}]}}).cart;f.s.values.set(configuredCartStorageKey(business,'tienda'),JSON.stringify({version:3,...mixed}));const calls=[];
 const c=api().createConfiguredCheckoutController(f.page,{storage:()=>f.s,fetcher:async(...args)=>{calls.push(args);return Response.json({ready:true});}});await c.restore();c.editContact({name:'Ana',email:'ana@example.invalid',telephone:'123'});assert.equal(await c.prepare(),false);assert.equal(calls.length,0);assert.equal(f.s.writes.length,0);
});
test('connected mixed carts wrap legacy zero; all-classic advanced input still sends exact v1 body',async()=>{
 for(const mixed of [false,true]){
 const f=await setup();const item={...f.page.publicCatalog.categories[0].items[0],id:id(25),name:'Clásico',price_minor:100};f.page.publicCatalog.categories[0].items.push(item);f.page.publicCatalog.configurations[item.id]={status:'legacy'};f.page.legacyCatalog={...f.page.publicCatalog,groups:[],options:[],surchargeMinor:0};
 const legacy={id:item.id,key:item.id,name:item.name,unitPriceMinor:100,currency:'ARS',quantity:2,selection:[],selectionText:''};const cart={...f.cart,items:[legacy,...(mixed?f.cart.items:[])]};f.s.values.set(configuredCartStorageKey(business,'tienda'),JSON.stringify({version:3,...cart}));const calls=[];
 const c=api().createConfiguredCheckoutController(f.page,{storage:()=>f.s,uuid:()=>id(70),fetcher:async(url,init)=>{calls.push([url,init]);return url==='/api/checkout/session'?Response.json({ready:true}):url.includes('/receipts?')?Response.json({receiptId:id(71)},{status:201}):Response.json({error:'Order unavailable',code:'quote_changed'},{status:409});}});await c.restore();await prepared({c});await c.confirm();const wire=JSON.parse(calls[2][1].body);assert.equal(calls.length,3);
 if(mixed){assert.equal(wire.version,2);assert.deepEqual(wire.lines.find(l=>l.itemId===item.id).selection,{kind:'legacy',profileVersion:0,groups:[]});assert.equal(wire.expected.totalMinor,1000200);}
 else assert.deepEqual(wire,{requestId:id(70),receiptId:id(71),contact:{name:'Ana',email:'ana@example.invalid',telephone:'123'},expected:{currency:'ARS',totalMinor:200},lines:[{itemId:item.id,quantity:2,selection:[]}]});
 }
});
test('foreign scoped cart or frozen-attempt keys fail closed without writes or network',async()=>{
 for(const corrupt of ['cart','attempt','page']){
 const f=await setup();if(corrupt==='attempt'){await prepared(f);await f.c.confirm();const v=JSON.parse(f.s.getItem('qwerty:pickup:v2:tienda'));v.slug='foreign';f.s.values.set('qwerty:pickup:v2:tienda',JSON.stringify(v));}else if(corrupt==='page')f.page.slug='foreign';else f.s.values.set(configuredCartStorageKey(business,'tienda'),JSON.stringify({version:3,...f.cart,slug:'foreign'}));
 const before=JSON.stringify([...f.s.values]),writes=f.s.writes.length,calls=[];const c=api().createConfiguredCheckoutController(f.page,{storage:()=>f.s,fetcher:async(...args)=>{calls.push(args);throw Error('not allowed');}});await c.restore();await c.confirm();assert.equal(c.snapshot().phase,'storage_error');assert.equal(calls.length,0);assert.equal(f.s.writes.length,writes);assert.equal(JSON.stringify([...f.s.values]),before);
 }
});
test('confirmation of a migrated v1 snapshot cannot overwrite an intervening v3 cart edit',async()=>{
 const f=await setup(),item={...f.page.publicCatalog.categories[0].items[0],id:id(25),price_minor:100,name:'Clásico'};f.page.publicCatalog.categories[0].items.push(item);f.page.publicCatalog.configurations[item.id]={status:'legacy'};f.page.legacyCatalog={...f.page.publicCatalog,groups:[],options:[],surchargeMinor:0};
 const line={id:item.id,key:item.id,name:item.name,unitPriceMinor:100,currency:'ARS',quantity:1,selection:[],selectionText:''};f.s.values.delete(configuredCartStorageKey(business,'tienda'));f.s.values.set('qwerty:cart:v1:'+business,JSON.stringify({version:2,businessId:business,items:[line]}));let finish,wire;
 const c=api().createConfiguredCheckoutController(f.page,{storage:()=>f.s,uuid:()=>id(70),fetcher:async(url,init)=>{if(url==='/api/checkout/session')return Response.json({ready:true});if(url.includes('/receipts?'))return Response.json({receiptId:id(71)},{status:201});wire=JSON.parse(init.body);return new Promise(resolve=>{finish=resolve;});}});await c.restore();await prepared({c});const pending=c.confirm();const changed=JSON.stringify({version:3,businessId:business,slug:'tienda',items:[{...line,quantity:7}]});f.s.values.set(configuredCartStorageKey(business,'tienda'),changed);
 finish(Response.json({order:{id:id(72),requestId:wire.requestId,receiptId:wire.receiptId,currency:'ARS',totalMinor:100,fulfillmentState:'pendiente_de_pago',paymentState:'pendiente',createdAt:'2026-01-01T00:00:00Z',contact:wire.contact,lines:[{itemId:item.id,name:item.name,quantity:1,unitPriceMinor:100,lineTotalMinor:100,selectionText:''}]}},{status:201}));await pending;assert.equal(c.snapshot().phase,'confirmed');assert.equal(f.s.getItem(configuredCartStorageKey(business,'tienda')),changed);
});
test('GET winner freezes saved state; late POST rejection and saved stale callbacks cannot regress it',async()=>{
 let wire,finish,f;const calls=[];f=await setup({fetcher:async(url,init)=>{
 if(url==='/api/checkout/session')return Response.json({ready:true});if(url.includes('/receipts?'))return Response.json({receiptId:id(71)},{status:201});calls.push([url,init]);
 if(init.method==='POST'){wire=JSON.parse(init.body);return new Promise(resolve=>{finish=resolve;});}
 return Response.json({order:accepted(wire,f.page.publicCatalog.configurations[pizza].catalog)});
 }});await prepared(f);const pending=f.c.confirm();await f.c.recover();assert.equal(f.c.snapshot().phase,'confirmed');const n=calls.length;finish(Response.json({error:'Order unavailable',code:'quote_changed'},{status:409}));await pending;await f.c.recover();await f.c.confirm();assert.equal(calls.length,n);assert.equal(f.c.snapshot().phase,'confirmed');assert.equal(JSON.parse(f.s.getItem('qwerty:pickup:v2:tienda')).status,'confirmed');
});
test('duplicate-half original intent survives accepted deduplication and full restoration',async()=>{
 const f=await setup();const cart=structuredClone(f.cart),picks=cart.items[0].selection.groups[1].picks;picks.push({...picks[0]});
 const saved=JSON.stringify({version:3,...cart});f.s.values.set(configuredCartStorageKey(business,'tienda'),saved);let wire;
 const c=api().createConfiguredCheckoutController(f.page,{storage:()=>f.s,uuid:()=>id(70),fetcher:async(url,init)=>{
 if(url==='/api/checkout/session')return Response.json({ready:true});if(url.includes('/receipts?'))return Response.json({receiptId:id(71)},{status:201});wire=JSON.parse(init.body);return Response.json({order:accepted(wire,f.page.publicCatalog.configurations[pizza].catalog)},{status:201});
 }});await c.restore();await prepared({c});await c.confirm();assert.equal(c.snapshot().phase,'confirmed');assert.equal(wire.lines[0].selection.groups.find(g=>g.picks.length===2).picks.length,2);assert.deepEqual(JSON.parse(f.s.getItem('qwerty:pickup:v2:tienda')).intent,wire);assert.equal(c.snapshot().order.lines[0].selection.groups.some(g=>g.picks.length===2),false);
 const restored=api().createConfiguredCheckoutController({slug:'tienda',publicCatalog:{status:'unavailable'},legacyCatalog:null},{storage:()=>f.s,uuid:()=>assert.fail('no fresh id'),fetcher:async(_url,init)=>{assert.equal(init.method,'GET');return Response.json({order:accepted(wire,f.page.publicCatalog.configurations[pizza].catalog)});}});await restored.restore();assert.equal(restored.snapshot().phase,'confirmed');assert.deepEqual(restored.snapshot().attempt.intent,wire);
});
// Synthetic HTTP uses the real server normalization, quotation and stored-order
// presenter. Do not hand-order responses: that hid canonical v1 binding failures.
function canonicalV1Fixture(withGroups = false) {
 const contact = {name:'  Ana  ',email:' ana@example.invalid ',telephone:' 123 '};
 const groupIds = [id(32), id(31)];
 const groups = withGroups ? groupIds.map(groupId => ({id:groupId,business_id:business,item_id:id(3),name:`Group ${groupId}`,selection_mode:'distinct',min_select:1,max_select:2,sort_order:0})) : [];
 const options = groups.flatMap((group,index) => [2,1].map(offset => ({id:id(40+index*2+offset),business_id:business,group_id:group.id,name:`Option ${index}-${offset}`,price_delta_minor:0,is_available:true,sort_order:0})));
 const selection = groups.map(group => ({groupId:group.id,picks:options.filter(option=>option.group_id===group.id).map(option=>({optionId:option.id,quantity:1}))}));
 const items = [3,2].map((number,index) => ({id:id(number),business_id:business,category_id:id(90),name:`Legacy ${number}`,description:null,price_minor:100+index*100,currency:'ARS',is_available:true,sort_order:0,photo:{kind:'fallback'}}));
 const cart = {businessId:business,slug:'tienda',items:items.map((item,index)=>({id:item.id,key:item.id,name:item.name,unitPriceMinor:item.price_minor,currency:item.currency,quantity:index+1,selection:index===0?selection:[],selectionText:''}))};
 const cartKey = configuredCartStorageKey(business,'tienda');
 const originalCart = JSON.stringify({version:3,...cart});
 const s = storage([[cartKey,originalCart]]);
 const published = {status:'ok',storefront:{business_id:business,slug:'tienda',display_name:'Synthetic',is_published:true},categories:[{category:{id:id(90),business_id:business,name:'Menu',sort_order:0},items}],capability:'legacy_only',configurations:{}};
 const page = {slug:'tienda',publicCatalog:published,legacyCatalog:{...published,groups,options,surchargeMinor:0}};
 const serverCatalog = {version:1,fingerprint:'a'.repeat(64),businessId:business,slug:'tienda',surchargeMinor:0,items,groups,options};
 const counters = {orderWrites:0,uploads:0,uuids:0,quotes:0,sessions:0};
 const calls = [];
 let stored = null, losePost = false;
 const fetcher = async (url,init) => {
  const observed = {url,method:init.method,credentials:init.credentials,cache:init.cache,redirect:init.redirect,headers:[...new Headers(init.headers)],body:typeof init.body==='string'?init.body:null};
  calls.push(observed);
  if (url==='/api/checkout/session') { counters.sessions++;observed.status=200;return Response.json({ready:true}); }
  if (url==='/api/checkout/receipts?slug=tienda') { counters.uploads++;observed.status=201;return Response.json({receiptId:id(71)},{status:201}); }
  assert.ok(url.startsWith('/api/checkout/orders?slug=tienda'));
  if (init.method==='POST') {
   const normalized = normalizePickupIntent(JSON.parse(init.body),'tienda');
   assert.equal(normalized.ok,true);
   counters.quotes++;
   const priced = quotePickupOrder(normalized.intent,serverCatalog);
   assert.equal(priced.ok,true);
   assert.equal(stored,null,'one actual order write only');
   stored = {id:id(72),actor_id:id(80),business_id:business,request_id:normalized.intent.requestId,receipt_id:normalized.intent.receiptId,intent:normalized.intent,quote:priced.quote,total_minor:priced.quote.totalMinor,currency:priced.quote.currency,fulfillment_state:'pendiente_de_pago',payment_state:'pendiente',created_at:'2026-01-01T00:00:00Z'};
   counters.orderWrites++;observed.status=201;
   if (losePost) throw Error('accepted order response lost');
  } else {
   assert.equal(init.method,'GET');
   assert.equal(url,`/api/checkout/orders?slug=tienda&requestId=${id(70)}`);
   assert.ok(stored);observed.status=200;
  }
  return Response.json({order:presentPickupOrder(stored)},{status:observed.status});
 };
 const uuid = () => { counters.uuids++; return id(70); };
 const create = (data=page) => api().createConfiguredCheckoutController(data,{storage:()=>s,fetcher,uuid});
 const rawIntent = () => ({requestId:id(70),receiptId:id(71),contact:structuredClone(contact),expected:{currency:'ARS',totalMinor:500},lines:cart.items.map(line=>({itemId:line.id,quantity:line.quantity,selection:structuredClone(line.selection)}))});
 const expectedOrder = () => presentPickupOrder(stored);
 return {s,cartKey,originalCart,page,cart,contact,calls,counters,create,rawIntent,expectedOrder,get stored(){return stored;},set losePost(value){losePost=value;}};
}
for (const withGroups of [false,true]) test(`B1 canonical v1 new multi-line ${withGroups?'contact/groups/picks':'reverse-ID'} intent confirms with one real-server write`,async()=>{
 const f = canonicalV1Fixture(withGroups), c = f.create();
 await c.restore();
 assert.equal(f.s.writes.length,0);
 c.editContact(f.contact);
 assert.equal(await c.prepare(),true);
 c.setFile(new File(['synthetic'],'proof.pdf'));
 assert.equal(await c.upload(),true);
 await c.confirm();
 const normalized = normalizePickupIntent(f.rawIntent(),'tienda');
 assert.equal(normalized.ok,true);
 const {version,slug,...expectedWire} = normalized.intent;
 const post = f.calls.find(call=>call.url.startsWith('/api/checkout/orders'));
 const wire = JSON.parse(post.body);
 const snapshot = c.snapshot();
 // Observe the real post-acceptance state, not merely the sent body/test names.
 assert.equal(snapshot.phase,'confirmed');
 assert.deepEqual(snapshot.order,f.expectedOrder());
 assert.deepEqual(wire,expectedWire);
 assert.deepEqual(wire.lines.map(line=>line.itemId),[id(2),id(3)]);
 assert.equal('version' in wire,false);
 assert.deepEqual(snapshot.attempt.intent,expectedWire);
 assert.deepEqual(f.s.writes.map(([key])=>key),['qwerty:pickup:v2:tienda','qwerty:pickup:v2:tienda',f.cartKey]);
 for (const [,value] of f.s.writes.filter(([key])=>key==='qwerty:pickup:v2:tienda')) assert.deepEqual(JSON.parse(value).intent,expectedWire);
 assert.deepEqual(JSON.parse(f.s.getItem(f.cartKey)),{version:3,businessId:business,slug:'tienda',items:[]});
 assert.deepEqual(f.counters,{orderWrites:1,uploads:1,uuids:1,quotes:1,sessions:1});
 assert.equal(f.calls.length,3);
 assert.deepEqual({method:post.method,credentials:post.credentials,cache:post.cache,redirect:post.redirect,headers:post.headers,status:post.status},{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',headers:[['content-type','application/json']],status:201});
 await c.confirm();await c.recover();assert.equal(f.calls.length,3,'no automatic or saved retry');
});
test('B1 old raw v1 frozen payload recovers canonically without catalog, mutation or another write/upload/UUID',async()=>{
 for (const newerCart of [false,true]) {
  const f = canonicalV1Fixture(true), c = f.create();f.losePost=true;
  await c.restore();c.editContact(f.contact);assert.equal(await c.prepare(),true);
  c.setFile(new File(['synthetic'],'proof.pdf'));assert.equal(await c.upload(),true);
  await c.confirm();assert.equal(c.snapshot().phase,'unknown');
  const frozen = JSON.parse(f.s.getItem('qwerty:pickup:v2:tienda'));
  // Simulate an already-frozen old writer. Same canonical server intent, but raw
  // contact whitespace and descending line/group/pick order must remain frozen.
  frozen.intent=f.rawIntent();
  assert.deepEqual(normalizePickupIntent(frozen.intent,'tienda').intent,f.stored.intent);
  const frozenIntentBytes=JSON.stringify(frozen.intent);
  if (newerCart) {
   const oldKey=`qwerty:cart:v1:${business}`,oldValue=JSON.stringify({version:2,businessId:business,items:f.cart.items});
   f.s.values.set(oldKey,oldValue);frozen.cartSnapshot={key:oldKey,value:oldValue};
   f.s.values.set(f.cartKey,JSON.stringify({version:3,...f.cart,items:f.cart.items.map(line=>({...line,quantity:7}))}));
  }
  f.s.values.set('qwerty:pickup:v2:tienda',JSON.stringify(frozen));
  const cartBefore=f.s.getItem(f.cartKey),writesBefore=f.s.writes.length,callsBefore=f.calls.length;
  const unavailablePage={slug:'tienda',publicCatalog:{status:'unavailable'},get legacyCatalog(){assert.fail('no current catalog lookup during recovery');}};
  const restored=f.create(unavailablePage);await restored.restore();
  assert.equal(restored.snapshot().phase,'confirmed');
  assert.deepEqual(restored.snapshot().order,f.expectedOrder());
  assert.equal(JSON.stringify(restored.snapshot().attempt.intent),frozenIntentBytes);
  const recoveryWrites=f.s.writes.slice(writesBefore);
  assert.equal(recoveryWrites.length,newerCart?1:2,'confirmed status plus only matching cart cleanup');
  assert.equal(recoveryWrites[0][0],'qwerty:pickup:v2:tienda');
  assert.equal(JSON.stringify(JSON.parse(recoveryWrites[0][1]).intent),frozenIntentBytes);
  assert.equal(JSON.stringify(JSON.parse(f.s.getItem('qwerty:pickup:v2:tienda')).intent),frozenIntentBytes);
  if (newerCart) {
   assert.equal(f.s.getItem(f.cartKey),cartBefore);
   assert.equal(f.s.getItem(frozen.cartSnapshot.key),frozen.cartSnapshot.value);
  } else assert.deepEqual(JSON.parse(f.s.getItem(f.cartKey)),{version:3,businessId:business,slug:'tienda',items:[]});
  assert.deepEqual(f.counters,{orderWrites:1,uploads:1,uuids:1,quotes:1,sessions:1});
  assert.deepEqual(f.calls.slice(callsBefore),[{url:`/api/checkout/orders?slug=tienda&requestId=${id(70)}`,method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error',headers:[],body:null,status:200}]);
  await restored.confirm();await restored.recover();assert.equal(f.calls.length,callsBefore+1);
 }
});
async function prepared(f){f.c.editContact({name:'Ana',email:'ana@example.invalid',telephone:'123'});assert.equal(await f.c.prepare(),true);f.c.setFile(new File(['synthetic'],'proof.pdf'));assert.equal(await f.c.upload(),true);}
test('controller freezes full canonical v2 before one POST, unknown is read-only across lost-response reload',async()=>{
 const f=await setup();await prepared(f);const click=f.c.confirm;const one=click();await click();await one;assert.equal(f.c.snapshot().phase,'unknown');assert.equal(f.uuids,1);
 const wire=JSON.parse(f.calls.find(([,i])=>i.method==='POST'&&i.body?.startsWith?.('{"version":2'))[1].body);const raw=f.s.getItem('qwerty:pickup:v2:tienda');assert.deepEqual(JSON.parse(raw).intent,wire);
 const before=JSON.stringify([...f.s.values]);f.c.editContact({name:'Wrong',email:'wrong@example.invalid',telephone:'9'});await f.c.prepare();await f.c.confirm();assert.equal(JSON.stringify([...f.s.values]),before);
 const calls=[],writeCount=f.s.writes.length;const restored=api().createConfiguredCheckoutController({slug:'tienda',publicCatalog:{status:'unavailable'},legacyCatalog:null},{storage:()=>f.s,uuid:()=>assert.fail('no new id'),fetcher:async(url,init)=>{calls.push([url,init]);return Response.json({error:'Order unavailable'},{status:404});}});await restored.restore();assert.equal(restored.snapshot().phase,'unknown');assert.equal(f.s.writes.length,writeCount);assert.deepEqual(restored.snapshot().attempt.intent,wire);await restored.confirm();assert.equal(calls.length,1);assert.equal(calls[0][1].method,'GET');assert.equal(calls[0][0],`/api/checkout/orders?slug=tienda&requestId=${wire.requestId}`);assert.deepEqual(JSON.parse(f.s.getItem('qwerty:pickup:v2:tienda')).intent,wire);
});
test('a concurrently stored unknown attempt cannot be overwritten by a stale ready tab',async()=>{
 const f=await setup();await prepared(f);const intent=configuredCartIntent(f.cart,{requestId:id(73),receiptId:id(71),contact:{name:'Other tab',email:'other@example.invalid',telephone:'123'}}).intent;
 const saved={version:2,businessId:business,slug:'tienda',status:'unknown',intent,cartSnapshot:{key:configuredCartStorageKey(business,'tienda'),value:f.s.getItem(configuredCartStorageKey(business,'tienda'))}};
 assert.equal(require('../app/lib/pickup-attempt.ts').saveConfiguredAttempt(f.s,saved),true);const raw=f.s.getItem('qwerty:pickup:v2:tienda'),calls=f.calls.length;await f.c.confirm();assert.equal(f.calls.length,calls);assert.equal(f.c.snapshot().phase,'storage_error');assert.equal(f.s.getItem('qwerty:pickup:v2:tienda'),raw);
});
test('storage refusal before POST sends no order and does not consume receipt or allocate another automatic ID',async()=>{
 const f=await setup();await prepared(f);const set=f.s.setItem;f.s.setItem=(k,v)=>{if(k.includes('pickup:v2'))throw Error('quota');set(k,v);};const n=f.calls.length;await f.c.confirm();assert.equal(f.calls.length,n);assert.equal(f.c.snapshot().phase,'storage_error');assert.equal(f.c.snapshot().receiptId,id(71));assert.equal(f.s.values.has('qwerty:pickup:v2:tienda'),false);
});
test('known correction retains cart/receipt/request, requires explicit review, never auto-resubmits',async()=>{
 const f=await setup({fetcher:async(url)=>url==='/api/checkout/session'?Response.json({ready:true}):url.includes('/receipts?')?Response.json({receiptId:id(71)},{status:201}):Response.json({error:'Order unavailable',code:'quote_changed'},{status:409})});await prepared(f);const before=f.s.getItem(configuredCartStorageKey(business,'tienda'));await f.c.confirm();assert.equal(f.c.snapshot().phase,'correction');assert.equal(f.s.getItem(configuredCartStorageKey(business,'tienda')),before);const n=f.calls.length;await f.c.confirm();assert.equal(f.calls.length,n);assert.equal(f.c.review(),true);await f.c.confirm();assert.equal(f.calls.length,n+1);const posts=f.calls.filter(([u])=>u.startsWith('/api/checkout/orders'));assert.equal(posts.length,2);assert.equal(JSON.parse(posts[0][1].body).requestId,JSON.parse(posts[1][1].body).requestId);assert.equal(f.uuids,1);assert.equal(f.c.snapshot().receiptId,id(71));
});
test('catalog failure/stale version keeps exact cart bytes; rejection has zero persistence/session/receipt calls',async()=>{
 const f=await setup();const before=f.s.getItem(configuredCartStorageKey(business,'tienda'));f.page.publicCatalog.configurations[pizza]={status:'unavailable'};assert.equal(await f.c.prepare(),false);assert.equal(f.c.replace(f.cart.items[0].key,pizzaChoice()),false);assert.equal(f.s.getItem(configuredCartStorageKey(business,'tienda')),before);assert.equal(f.calls.length,0);assert.equal(f.s.writes.length,0);
});
test('dispose rejects late callbacks and unknown legacy reference recovers without current publication',async()=>{
 let finish;const f=await setup({fetcher:async(url)=>url==='/api/checkout/session'?Response.json({ready:true}):url.includes('/receipts?')?Response.json({receiptId:id(71)},{status:201}):new Promise(r=>{finish=r;})});await prepared(f);const pending=f.c.confirm();f.c.dispose();finish(Response.json({error:'Order unavailable',code:'quote_changed'},{status:409}));await pending;assert.equal(JSON.parse(f.s.getItem('qwerty:pickup:v2:tienda')).status,'pending');
 const s=storage([['qwerty:pickup:v1:tienda',JSON.stringify({businessId:business,slug:'tienda',requestId:id(70),receiptId:id(71)})]]),calls=[];const c=api().createConfiguredCheckoutController({slug:'tienda',publicCatalog:{status:'not_found'},legacyCatalog:null},{storage:()=>s,uuid:()=>assert.fail('no new key'),fetcher:async(url,init)=>{calls.push([url,init]);return Response.json({error:'missing'},{status:404});}});await c.restore();assert.equal(c.snapshot().phase,'unknown');assert.equal(calls.length,1);assert.equal(calls[0][1].method,'GET');assert.equal(s.writes.length,0);
});
