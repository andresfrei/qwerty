import test from 'node:test';
import assert from 'node:assert/strict';
import {component,nodes,storage,text} from './checkout-fixtures.mjs';
import {fixture,business,pizza,pizzaChoice,id} from './configured-public-fixtures.mjs';
import {addConfiguredVariant,configuredCartStorageKey} from '../app/lib/configured-cart.ts';
const path='apps/web/app/store/[slug]/checkout/checkout-client.tsx';
test('real connected checkout controls prepare, stage, freeze one full v2 request and expose read-only recovery',async()=>{
 const f=fixture(),publicCatalog=await f.read();const cart=addConfiguredVariant({businessId:business,slug:'tienda',items:[]},{catalog:publicCatalog.configurations[pizza].catalog,itemId:pizza,selection:pizzaChoice()}).cart;
 const s=storage([[configuredCartStorageKey(business,'tienda'),JSON.stringify({version:3,...cart})]]),calls=[],oldStorage=globalThis.localStorage,oldFetch=globalThis.fetch;globalThis.localStorage=s;
 globalThis.fetch=async(url,init)=>{calls.push([url,init]);return url==='/api/checkout/session'?Response.json({ready:true}):url.includes('/receipts?')?Response.json({receiptId:id(71)},{status:201}):Response.json({error:'Order outcome unknown'},{status:503});};
 try{const h=component(path,{page:{slug:'tienda',publicCatalog,legacyCatalog:null}},'ConfiguredCheckout');h.render();await h.tick();h.render();h.replayEffects();await h.tick();h.render();assert.equal(s.writes.length,0);
 for(const [key,value]of Object.entries({name:'Ana',email:'ana@example.invalid',telephone:'123'}))h.find('contact-'+key).props.onChange({target:{value}});
 await h.find('configured-prepare').props.onClick();h.find('receipt-file').props.onChange({currentTarget:{files:[new File(['synthetic'],'proof.pdf')]}});await h.find('receipt-upload').props.onClick();const confirm=h.find('order-confirm').props.onClick;await Promise.all([confirm(),confirm()]);
 assert.equal(calls.length,3);assert.equal(JSON.parse(calls[2][1].body).version,2);assert.deepEqual(JSON.parse(s.getItem('qwerty:pickup:v2:tienda')).intent,JSON.parse(calls[2][1].body));assert.equal(h.find('order-confirm').props.disabled,true);assert.ok(text(h.render()).includes('No vuelvas a enviar'));
 await h.find('order-recover').props.onClick();assert.equal(calls.length,4);assert.equal(calls[3][1].method,'GET');assert.deepEqual(JSON.parse(s.getItem(configuredCartStorageKey(business,'tienda'))),{version:3,...cart});
 }finally{globalThis.localStorage=oldStorage;globalThis.fetch=oldFetch;}
});
test('old flat cart on an active profile stays untouched until the real correction picker accepts a current choice',async()=>{
 const f=fixture(),publicCatalog=await f.read();publicCatalog.configurations[pizza].catalog.profiles[0].version=2;
 const oldCart={version:2,businessId:business,items:[{id:pizza,key:pizza,name:'Elección anterior',unitPriceMinor:100,currency:'ARS',quantity:3,selection:[],selectionText:'Anterior'}]},raw=JSON.stringify(oldCart),s=storage([['qwerty:cart:v1:'+business,raw]]),oldStorage=globalThis.localStorage,oldFetch=globalThis.fetch;globalThis.localStorage=s;let calls=0;globalThis.fetch=async()=>{calls++;assert.fail('invalid old cart dispatched');};
 try{const h=component(path,{page:{slug:'tienda',publicCatalog,legacyCatalog:null}},'ConfiguredCheckout');h.render();await h.tick();assert.equal(h.find('configured-prepare').props.disabled,true);assert.equal(s.writes.length,0);h.find(`review-${pizza}`).props.onClick();const picker=nodes(h.render()).find(n=>n.type?.name==='DeferredPicker');assert.ok(picker);assert.equal(picker.props.initial,undefined);assert.equal(picker.props.onAccept(pizzaChoice()),false);assert.equal(s.writes.length,0);assert.equal(picker.props.onAccept({...pizzaChoice(),profileVersion:2}),true);assert.equal(calls,0);assert.equal(s.getItem('qwerty:cart:v1:'+business),raw);const saved=JSON.parse(s.getItem(configuredCartStorageKey(business,'tienda')));assert.equal(saved.items[0].quantity,3);assert.equal(saved.items[0].selection.profileVersion,2);
 }finally{globalThis.localStorage=oldStorage;globalThis.fetch=oldFetch;}
});
test('boundary selects existing classic component when capability is legacy and no new durable data exists',async()=>{
 const f=fixture();f.capability=Response.json({code:'PGRST202',message:'Could not find the function public.catalog_configuration_capabilities without parameters in the schema cache',details:'Searched for the function public.catalog_configuration_capabilities without parameters, but no matches were found in the schema cache.',hint:null},{status:404});const publicCatalog=await f.read();const classic={...publicCatalog,groups:[],options:[],surchargeMinor:0};const s=storage(),old=globalThis.localStorage;globalThis.localStorage=s;
 try{const h=component(path,{page:{slug:'tienda',publicCatalog,legacyCatalog:classic}},'ConfiguredCheckoutClient');h.render();const tree=h.render();assert.equal(tree.type?.name,'CheckoutClient');assert.deepEqual(tree.props.catalog,classic);assert.equal(s.writes.length,0);}finally{globalThis.localStorage=old;}
});
