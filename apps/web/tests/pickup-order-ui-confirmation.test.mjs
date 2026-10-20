import assert from 'node:assert/strict';
import test from 'node:test';
import {harness,prepare,catalog,cart,order,id,receiptId,text} from './pickup-order-ui-fixtures.mjs';
const path='store/[slug]/checkout/checkout-client.tsx';
test('real callbacks save before POST, guard double click, freeze contact, clear only bound submitted cart',async()=>{
 const old=globalThis.fetch;const calls=[];let finish,h;
 globalThis.fetch=async(url,init)=>{calls.push([url,init]);if(url==='/api/checkout/session')return Response.json({ready:true});if(url.startsWith('/api/checkout/receipts?'))return Response.json({receiptId},{status:201});assert.ok(h.map.has('qwerty:pickup:v1:tienda'));return new Promise(r=>{finish=r;});};
 try{h=harness(path,{catalog});await prepare(h);const click=h.find('order-confirm').props.onClick;const first=click();await click();assert.equal(calls.length,3);assert.equal(h.find('order-confirm').props.disabled,true);
 h.find('contact-name').props.onChange({target:{value:'Changed'}});assert.equal(h.find('contact-name').props.value,'Ana');
 const intent=JSON.parse(calls[2][1].body);assert.deepEqual(Object.keys(intent),['requestId','receiptId','contact','expected','lines']);
 finish(Response.json({order:{...order,requestId:intent.requestId}},{status:201}));await first;h.render();
 assert.equal(JSON.parse(h.map.get('qwerty:cart:v1:'+id)).items.length,0);assert.ok(h.find('order-tracking'));
 assert.ok(!h.map.get('qwerty:pickup:v1:tienda').includes('Ana'));
 }finally{globalThis.fetch=old;}
});
test('lost response and recovery miss preserve key/data; reload does GET only, no replay or cart clear',async()=>{
 const old=globalThis.fetch,calls=[];let requestId;
 globalThis.fetch=async(url,init)=>{calls.push([url,init]);if(url==='/api/checkout/session')return Response.json({ready:true});if(url.startsWith('/api/checkout/receipts?'))return Response.json({receiptId},{status:201});if(init.method==='POST'){requestId=JSON.parse(init.body).requestId;throw Error('lost');}return Response.json({error:'Order outcome unknown',code:'outcome_unknown',requestId},{status:503});};
 try{const h=harness(path,{catalog});await prepare(h);await h.find('order-confirm').props.onClick();assert.equal(h.find('contact-name').props.value,'Ana');const saved=h.map.get('qwerty:pickup:v1:tienda');await h.find('order-recover').props.onClick();await h.tick();assert.equal(h.map.get('qwerty:pickup:v1:tienda'),saved);assert.deepEqual(JSON.parse(h.map.get('qwerty:cart:v1:'+id)),cart);
 const reloaded=harness(path,{catalog},h.map);const before=calls.length;assert.equal(calls.length,before);globalThis.fetch=async(url,init)=>{calls.push([url,init]);assert.equal(init.method,'GET');return Response.json({order:{...order,requestId}});};await reloaded.find('order-recover').props.onClick();await reloaded.tick();assert.ok(reloaded.find('order-tracking'));assert.deepEqual(JSON.parse(h.map.get('qwerty:cart:v1:'+id)),cart);
 }finally{globalThis.fetch=old;}
});
test('intervening cart edits and malformed/unbound response are retained',async()=>{
 const old=globalThis.fetch;let h;
 globalThis.fetch=async(url,init)=>url==='/api/checkout/session'?Response.json({ready:true}):url.startsWith('/api/checkout/receipts?')?Response.json({receiptId},{status:201}):Response.json({order});
 try{h=harness(path,{catalog});await prepare(h);await h.find('order-confirm').props.onClick();assert.ok(!h.find('order-tracking'));assert.deepEqual(JSON.parse(h.map.get('qwerty:cart:v1:'+id)),cart);
 globalThis.fetch=async()=>{h.map.set('qwerty:cart:v1:'+id,JSON.stringify({...cart,items:[]}));return Response.json({order:{...order,requestId:JSON.parse(h.map.get('qwerty:pickup:v1:tienda')).requestId}});};await h.find('order-recover').props.onClick();await h.tick();assert.ok(h.find('order-tracking'));assert.equal(h.find('contact-name').props.value,'Ana');
 }finally{globalThis.fetch=old;}
});
test('business navigation while POST is pending cannot publish or clear another business',async()=>{
 const old=globalThis.fetch;let finish;const otherId=receiptId;
 globalThis.fetch=async url=>url==='/api/checkout/session'?Response.json({ready:true}):url.startsWith('/api/checkout/receipts?')?Response.json({receiptId},{status:201}):new Promise(r=>{finish=r;});
 try{const h=harness(path,{catalog});await prepare(h);const promise=h.find('order-confirm').props.onClick();const requestId=JSON.parse(h.map.get('qwerty:pickup:v1:tienda')).requestId;const otherCart={...cart,businessId:otherId,items:[]};h.map.set('qwerty:cart:v1:'+otherId,JSON.stringify(otherCart));h.props.catalog={...catalog,storefront:{...catalog.storefront,business_id:otherId,slug:'otra'}};h.render();h.render();assert.equal(h.find('contact-name').props.value,'');finish(Response.json({order:{...order,requestId}},{status:201}));await promise;h.render();assert.ok(!h.find('order-tracking'));assert.deepEqual(JSON.parse(h.map.get('qwerty:cart:v1:'+otherId)),otherCart);
 }finally{globalThis.fetch=old;}
});

test('reference storage quota failure sends no order and retains draft',async()=>{
 const old=globalThis.fetch;let calls=0;
 globalThis.fetch=async url=>{calls++;return url==='/api/checkout/session'?Response.json({ready:true}):Response.json({receiptId},{status:201});};
 try{const map=new Map([['qwerty:cart:v1:'+id,JSON.stringify(cart)]]);const set=map.set.bind(map);map.set=(key,value)=>{if(key.startsWith('qwerty:pickup:'))throw Error('quota');return set(key,value);};const h=harness(path,{catalog},map);await prepare(h);await h.find('order-confirm').props.onClick();assert.equal(calls,2);assert.equal(map.has('qwerty:pickup:v1:tienda'),false);assert.ok(text(h.render()).includes('No enviamos el pedido'));assert.equal(h.find('contact-name').props.value,'Ana');assert.ok(text(h.render()).includes('receipt.pdf'));assert.equal(JSON.parse(map.get('qwerty:cart:v1:'+id)).items.length,1);
 }finally{globalThis.fetch=old;}
});

test('all submission failures retain contact, file, cart and key without automatic retry',async()=>{
 const old=globalThis.fetch;
 try { for(const status of [400,401,409,422,503]) {
  const calls=[];globalThis.fetch=async(url,init)=>{calls.push([url,init]);return url==='/api/checkout/session'?Response.json({ready:true}):url.startsWith('/api/checkout/receipts?')?Response.json({receiptId},{status:201}):Response.json({error:'private payload'},{status});};
  const h=harness(path,{catalog});await prepare(h);const before=h.map.get('qwerty:cart:v1:'+id);await h.find('order-confirm').props.onClick();assert.equal(calls.length,3);assert.equal(h.map.get('qwerty:cart:v1:'+id),before);assert.equal(h.find('contact-email').props.value,order.contact.email);assert.ok(text(h.render()).includes('receipt.pdf'));assert.ok(!text(h.render()).includes('private payload'));assert.ok(h.map.has('qwerty:pickup:v1:tienda'));assert.ok(!h.find('order-tracking'));await h.find('order-confirm').props.onClick();assert.equal(calls.length,3);
  if(status===401)assert.ok(text(h.render()).includes('sesión original'));else assert.ok(text(h.render()).includes('aún no está confirmado'));
 }}finally{globalThis.fetch=old;}
});

test('mixed currencies block without writing attempt or POST',async()=>{
 const old=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({ready:true});};
 try{const other={...catalog.categories[0].items[0],id:receiptId,currency:'USD'};const mixed={...catalog,categories:[{...catalog.categories[0],items:[catalog.categories[0].items[0],other]}]};const map=new Map([['qwerty:cart:v1:'+id,JSON.stringify({...cart,items:[...cart.items,{...cart.items[0],id:receiptId,key:receiptId,currency:'USD'}]})]]);const h=harness(path,{catalog:mixed},map);await h.find('order-confirm').props.onClick();assert.equal(calls,0);assert.ok(text(h.render()).includes('Separá las compras'));assert.equal(map.has('qwerty:pickup:v1:tienda'),false);assert.equal(JSON.parse(map.get('qwerty:cart:v1:'+id)).items.length,2);
 }finally{globalThis.fetch=old;}
});
