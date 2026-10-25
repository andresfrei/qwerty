import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,business,pizza,dozen,combo,component,id,pizzaChoice,muzza,napo,large,small,flavor,variety,carne} from './configured-public-fixtures.mjs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const api=()=>require('../app/lib/configured-cart.ts');
const empty=()=>({businessId:business,slug:'tienda',items:[]});
const contact={name:'Ana',email:'ana@example.invalid',telephone:'123'};
const checkout={requestId:id(50),receiptId:id(51),contact};
async function context(itemId=pizza,selection=pizzaChoice()){
 const result=await fixture().read();return {catalog:result.configurations[itemId].catalog,itemId,selection};
}
test('configured variants use T1 canonical identity and retain distinct size/flavor choices',async()=>{
 const {addConfiguredVariant}=api();const request=await context();const original=empty();
 const one=addConfiguredVariant(original,request);assert.equal(one.ok,true);assert.deepEqual(original,empty());
 const reordered={...request,selection:{...request.selection,groups:[...request.selection.groups].reverse()}};
 const two=addConfiguredVariant(one.cart,reordered);assert.equal(two.ok,true);assert.equal(two.cart.items.length,1);assert.equal(two.cart.items[0].quantity,2);
 const other=addConfiguredVariant(two.cart,{...request,selection:pizzaChoice(small)});assert.equal(other.ok,true);assert.equal(other.cart.items.length,2);
 assert.equal(other.cart.items[0].unitPriceMinor,1000000);assert.equal(other.cart.items[1].unitPriceMinor,1000000);
});
test('commercial pizza average/floor/one-fee and identical halves normalize only through T1',async()=>{
 const {addConfiguredVariant}=api();const request=await context();
 request.catalog.profiles[0].document.matrix.find(r=>r.sizeOptionId===large&&r.flavorOptionId===napo).priceMinor=1200001;
 const both={...request,selection:{...request.selection,groups:request.selection.groups.map(g=>g.groupId===flavor?{...g,picks:[{optionId:muzza,quantity:1},{optionId:napo,quantity:1}]}:g)}};
 const added=addConfiguredVariant(empty(),both);assert.equal(added.ok,true);assert.equal(added.cart.items[0].unitPriceMinor,1200000);
 const same={...both,selection:{...both.selection,groups:both.selection.groups.map(g=>g.groupId===flavor?{...g,picks:[{optionId:muzza,quantity:1},{optionId:muzza,quantity:1}]}:g)}};
 const normalized=addConfiguredVariant(empty(),same);assert.equal(normalized.ok,true);assert.equal(normalized.cart.items[0].unitPriceMinor,1000000);
 const merged=addConfiguredVariant(normalized.cart,request);assert.equal(merged.cart.items.length,1);assert.equal(merged.cart.items[0].quantity,2);
});
test('rejected choice, scope, quantity and stale profile never mutate a cart or dispatch persistence',async()=>{
 const {addConfiguredVariant,changeConfiguredQuantity,persistConfiguredCart}=api();const request=await context();
 const initial=addConfiguredVariant(empty(),request).cart;const before=JSON.stringify(initial);let writes=0;
 for(const candidate of [{...request,selection:pizzaChoice(small,napo)},{...request,selection:{...request.selection,profileVersion:2}},{...request,catalog:{...request.catalog,businessId:id(99)}}]){
  const result=addConfiguredVariant(initial,candidate);assert.equal(result.ok,false);assert.strictEqual(result.cart,initial);
 }
 for(const qty of [-1,1.5,100,NaN]){const result=changeConfiguredQuantity(initial,initial.items[0].key,qty);assert.equal(result.ok,false);assert.strictEqual(result.cart,initial);}
 assert.equal(JSON.stringify(initial),before);assert.equal(writes,0);
 assert.equal(persistConfiguredCart(()=>{writes++;},initial),true);assert.equal(writes,1);
});
test('combo bills own parent once and keeps every independent component instance in identity',async()=>{
 const {addConfiguredVariant}=api();const selection={kind:'combo',profileVersion:1,components:[0,1].map(instanceIndex=>({componentId:component,instanceIndex,selection:pizzaChoice(instanceIndex===0?small:large)}))};
 const request=await context(combo,selection);const added=addConfiguredVariant(empty(),request,2);assert.equal(added.ok,true);assert.equal(added.cart.items[0].quantity,2);assert.equal(added.cart.items[0].unitPriceMinor,3000000);
 const swapped={...request,selection:{...selection,components:selection.components.map(c=>({...c,selection:pizzaChoice(c.instanceIndex===0?large:small)}))}};
 const second=addConfiguredVariant(added.cart,swapped);assert.equal(second.cart.items.length,2);
 assert.deepEqual(second.cart.items.map(l=>l.selection.components.map(c=>c.selection.profileVersion)),[[1,1],[1,1]]);
});
test('dozen requires exactly twelve and ignores variety deltas',async()=>{
 const {addConfiguredVariant}=api();const request=await context(dozen,{kind:'leaf',profileVersion:1,groups:[{groupId:variety,picks:[{optionId:carne,quantity:12}]}]});request.catalog.options[0].price_delta_minor=900;
 const accepted=addConfiguredVariant(empty(),request);assert.equal(accepted.ok,true);assert.equal(accepted.cart.items[0].unitPriceMinor,1200000);
 const bad={...request,selection:{...request.selection,groups:[{groupId:variety,picks:[{optionId:carne,quantity:11}]}]}};assert.equal(addConfiguredVariant(accepted.cart,bad).ok,false);
});
test('all old persisted formats retain quantities and option IDs without retagging or writes',()=>{
 const {readConfiguredCart,persistConfiguredCart,configuredCartStorageKey}=api();const old={businessId:business,items:[{id:pizza,name:'Anterior',unitPriceMinor:123,currency:'ARS',quantity:3}]};
 for(const version of [undefined,1,2]){const value={...old,...(version===undefined?{}:{version})};if(version===2)value.items=[{...old.items[0],key:'old-key',selection:[{groupId:flavor,picks:[{optionId:muzza,quantity:1}]}],selectionText:'Muzzarella'}];
 const before=JSON.stringify(value);const read=readConfiguredCart(value,business,'tienda');assert.equal(read.ok,true);assert.equal(read.cart.items[0].quantity,3);assert.equal(Array.isArray(read.cart.items[0].selection),true);assert.equal('configured' in read.cart.items[0],false);assert.equal(JSON.stringify(value),before);
 const writes=[];assert.equal(persistConfiguredCart((...args)=>writes.push(args),read.cart),true);assert.equal(writes.length,1);assert.equal(writes[0][0],configuredCartStorageKey(business,'tienda'));assert.equal(JSON.parse(writes[0][1]).version,3);
 }
 assert.notEqual(configuredCartStorageKey(business,'tienda'),configuredCartStorageKey(business,'otra'));
});
test('v3 restores full stale intent without catalog consultation; foreign scope and malformed configuration reject',async()=>{
 const {addConfiguredVariant,readConfiguredCart}=api();const added=addConfiguredVariant(empty(),await context()).cart;
 const saved={version:3,...added};saved.items[0].selection.profileVersion=90;
 const restored=readConfiguredCart(saved,business,'tienda');assert.equal(restored.ok,true);assert.equal(restored.cart.items[0].selection.profileVersion,90);
 for(const [b,s] of [[id(99),'tienda'],[business,'otra']])assert.equal(readConfiguredCart(saved,b,s).ok,false);
 const corrupt=structuredClone(saved);corrupt.items[0].selection={kind:'combo',profileVersion:1,components:[{bad:true}]};assert.equal(readConfiguredCart(corrupt,business,'tienda').ok,false);
});
test('mixed wire dispatches once with explicit version and ignores caller actor/scope authority',async()=>{
 const {addConfiguredVariant,configuredCartIntent}=api();const {requestOrder}=await import('../app/lib/pickup-order-client.ts');
 const cart=addConfiguredVariant(empty(),await context()).cart;
 const built=configuredCartIntent(cart,{...checkout,businessId:id(99),actor:id(98),slug:'foreign',price:1});assert.equal(built.ok,true);
 const calls=[];const response=await requestOrder({kind:'submit',slug:cart.slug,intent:built.intent},async(url,init)=>{calls.push([url,init]);return Response.json({error:'Order unavailable',code:'quote_changed'},{status:409});});
 assert.deepEqual(response,{status:'correctable',code:'quote_changed'});assert.equal(calls.length,1);assert.equal(calls[0][0],'/api/checkout/orders?slug=tienda');assert.deepEqual(JSON.parse(calls[0][1].body),built.intent);
 assert.equal(calls[0][1].credentials,'same-origin');assert.equal(calls[0][1].redirect,'error');assert.equal(calls[0][1].method,'POST');assert.equal('actor' in built.intent,false);assert.equal('businessId' in built.intent,false);
});
test('all-legacy wire stays unversioned; mixed wire wraps legacy version zero without leaking names/prices/scope',async()=>{
 const {readConfiguredCart,addConfiguredVariant,configuredCartIntent}=api();const legacy={version:2,businessId:business,items:[{id:id(25),key:'classic',name:'Clásico',unitPriceMinor:100,currency:'ARS',quantity:2,selection:[{groupId:flavor,picks:[{optionId:muzza,quantity:1}]}],selectionText:'Muzzarella'}]};
 const cart=readConfiguredCart(legacy,business,'tienda').cart;
 const old=configuredCartIntent(cart,checkout);assert.equal(old.ok,true);assert.deepEqual(old.intent,{...checkout,expected:{currency:'ARS',totalMinor:200},lines:[{itemId:id(25),quantity:2,selection:legacy.items[0].selection}]});
 const added=addConfiguredVariant(cart,await context()).cart;const mixed=configuredCartIntent(added,checkout);assert.equal(mixed.ok,true);assert.equal(mixed.intent.version,2);assert.equal(mixed.intent.expected.totalMinor,1000200);
 assert.deepEqual(mixed.intent.lines[0].selection,{kind:'legacy',profileVersion:0,groups:legacy.items[0].selection});
 assert.deepEqual(mixed.intent.lines[1].selection,added.items[1].selection);assert.equal('businessId' in mixed.intent,false);assert.equal('slug' in mixed.intent,false);assert.equal(JSON.stringify(mixed.intent).includes('Clásico'),false);
});
