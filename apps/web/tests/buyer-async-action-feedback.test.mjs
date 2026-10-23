import assert from 'node:assert/strict';
import test from 'node:test';
import {harness,prepare,catalog,cart,order,id,receiptId,text,nodes} from './pickup-order-ui-fixtures.mjs';

const checkout='store/[slug]/checkout/checkout-client.tsx';
const cartKey='qwerty:cart:v1:'+id;
const attemptKey='qwerty:pickup:v1:tienda';
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
function pending(button,label){
 assert.equal(button.props['aria-busy'],true);
 assert.equal(button.props.disabled,true);
 assert.ok(text(button).includes(label));
 assert.equal(nodes(button).filter(n=>n.props?.className==='async-action-spinner').length,1);
}
function settled(button){
 assert.equal(button.props['aria-busy'],false);
 assert.equal(nodes(button).filter(n=>n.props?.className==='async-action-spinner').length,0);
}
function contact(h){
 for(const [key,value] of Object.entries(order.contact))h.find('contact-'+key).props.onChange({target:{value}});
}
function retained(h){
 assert.equal(h.find('contact-name').props.value,order.contact.name);
 assert.equal(h.find('contact-email').props.value,order.contact.email);
 assert.deepEqual(JSON.parse(h.map.get(cartKey)),cart);
 assert.ok(text(h.render()).includes('receipt.pdf'));
}
async function intercept(run){
 const old=globalThis.fetch;
 try{await run();}finally{globalThis.fetch=old;}
}
function ready(url){
 return url==='/api/checkout/session'?Response.json({ready:true}):Response.json({receiptId},{status:201});
}

test('guest preparation: pending presentation, immediate duplicate guard and exact session body; denial keeps draft',()=>intercept(async()=>{
 const wait=deferred(),calls=[];
 globalThis.fetch=(url,init)=>{calls.push([url,init]);return wait.promise;};
 const h=harness(checkout,{catalog});contact(h);
 const submit=nodes(h.render()).find(n=>n.type==='form').props.onSubmit;
 const first=submit({preventDefault(){}});await submit({preventDefault(){}});
 const button=()=>nodes(h.render()).find(n=>n.type==='button'&&n.props.type==='submit');
 assert.equal(calls.length,1);
 assert.equal(calls[0][0],'/api/checkout/session');
 assert.equal(calls[0][1].method,'POST');
 assert.deepEqual(JSON.parse(calls[0][1].body),{slug:'tienda'});
 assert.equal(h.map.has(attemptKey),false);
 pending(button(),'Preparando…');
 wait.resolve(Response.json({error:'denied'},{status:503}));await first;
 settled(button());assert.equal(button().props.disabled,false);
 assert.equal(h.find('contact-name').props.value,'Ana');
 assert.deepEqual(JSON.parse(h.map.get(cartKey)),cart);
 assert.equal(h.map.has(attemptKey),false);
}));

test('receipt upload: one original file POST, retained draft on denial and safe manual upload retry',()=>intercept(async()=>{
 globalThis.fetch=async()=>Response.json({ready:true});
 const h=harness(checkout,{catalog});contact(h);await h.form();
 const file=new File(['original'],'receipt.pdf');
 h.find('receipt-file').props.onChange({currentTarget:{files:[file]}});
 const wait=deferred(),calls=[];
 globalThis.fetch=(url,init)=>{calls.push([url,init]);return wait.promise;};
 const click=h.find('receipt-upload').props.onClick,first=click();await click();
 assert.equal(calls.length,1);assert.equal(calls[0][0],'/api/checkout/receipts?slug=tienda');
 assert.equal(calls[0][1].method,'POST');assert.equal(calls[0][1].body,file);
 pending(h.find('receipt-upload'),'Adjuntando…');assert.equal(h.find('receipt-file').props.disabled,true);
 wait.resolve(Response.json({error:'denied'},{status:503}));await first;
 settled(h.find('receipt-upload'));retained(h);assert.equal(h.map.has(attemptKey),false);
 assert.equal(h.find('receipt-upload').props.disabled,false);
 globalThis.fetch=async(url,init)=>{calls.push([url,init]);return Response.json({receiptId},{status:201});};
 await h.find('receipt-upload').props.onClick();
 assert.equal(calls.length,2);assert.equal(calls[1][1].body,file);
 assert.ok(h.find('receipt-original'));settled(h.find('receipt-upload'));retained(h);
}));

test('confirmation: reference saved before single POST; unknown stops spinner but remains locked with receipt and draft',()=>intercept(async()=>{
 globalThis.fetch=async url=>ready(url);
 const h=harness(checkout,{catalog});await prepare(h);
 const wait=deferred(),calls=[];
 globalThis.fetch=(url,init)=>{
  assert.ok(h.map.has(attemptKey));calls.push([url,init]);return wait.promise;
 };
 const click=h.find('order-confirm').props.onClick,first=click();await click();
 assert.equal(calls.length,1);pending(h.find('order-confirm'),'Confirmando compra…');
 const saved=h.map.get(attemptKey),reference=JSON.parse(saved);
 assert.equal(calls[0][0],'/api/checkout/orders?slug=tienda');assert.equal(calls[0][1].method,'POST');
 assert.deepEqual(JSON.parse(calls[0][1].body),{requestId:reference.requestId,receiptId,contact:order.contact,expected:{currency:'ARS',totalMinor:100},lines:[{itemId:id,quantity:1,selection:[]}]});
 wait.resolve(Response.json({error:'unknown'},{status:503}));await first;
 settled(h.find('order-confirm'));assert.equal(h.find('order-confirm').props.disabled,true);
 settled(h.find('order-recover'));assert.equal(h.find('order-recover').props.disabled,false);
 retained(h);assert.ok(h.find('receipt-original'));assert.equal(h.find('receipt-file').props.disabled,true);
 assert.equal(h.map.get(attemptKey),saved);await click();assert.equal(calls.length,1);
}));

test('unknown-attempt recovery: pending only during original-reference GET, no replay or unlock on denial',()=>intercept(async()=>{
 globalThis.fetch=async url=>url.startsWith('/api/checkout/orders')?Response.json({},{status:503}):ready(url);
 const h=harness(checkout,{catalog});await prepare(h);await h.find('order-confirm').props.onClick();
 const saved=h.map.get(attemptKey),reference=JSON.parse(saved),writes=h.writes.length;
 const wait=deferred(),calls=[];
 globalThis.fetch=(url,init)=>{calls.push([url,init]);return wait.promise;};
 const click=h.find('order-recover').props.onClick;click();click();
 assert.equal(calls.length,1);pending(h.find('order-recover'),'Consultando…');
 settled(h.find('order-confirm'));
 assert.equal(calls[0][0],'/api/checkout/orders?slug=tienda&requestId='+reference.requestId);
 assert.equal(calls[0][1].method,'GET');assert.equal(calls[0][1].body,undefined);
 wait.resolve(Response.json({},{status:401}));await h.tick();
 settled(h.find('order-recover'));assert.equal(h.find('order-confirm').props.disabled,true);
 assert.equal(h.map.get(attemptKey),saved);assert.equal(h.writes.length,writes);retained(h);
 assert.ok(h.find('receipt-original'));assert.ok(text(h.render()).includes('sesión original'));
}));

for(const recovery of [false,true])test(`private ${recovery?'reference recovery':'tracking'} refresh: GET-only duplicate guard, pending feedback and private data clearing`,()=>intercept(async()=>{
 const map=new Map([[attemptKey,JSON.stringify({businessId:id,slug:'tienda',requestId:id,receiptId})]]);
 globalThis.fetch=async()=>Response.json({order});
 const h=harness('store/order-status-client.tsx',recovery?{slug:'tienda'}:{slug:'tienda',id},map);
 if(recovery)await h.find('order-refresh').props.onClick();else await h.tick();
 assert.ok(text(h.render()).includes(order.contact.email));
 const wait=deferred(),calls=[],saved=map.get(attemptKey),writes=h.writes.length;
 globalThis.fetch=(url,init)=>{calls.push([url,init]);return wait.promise;};
 const click=h.find('order-refresh').props.onClick,first=click();await click();
 assert.equal(calls.length,1);pending(h.find('order-refresh'),'Consultando…');
 assert.ok(!text(h.render()).includes(order.contact.email));
 assert.equal(calls[0][0],recovery?'/api/checkout/orders?slug=tienda&requestId='+id:'/api/checkout/orders/'+id);
 assert.equal(calls[0][1].method,'GET');assert.equal(calls[0][1].body,undefined);
 wait.resolve(Response.json({error:'denied'},{status:401}));await first;
 settled(h.find('order-refresh'));assert.ok(!text(h.render()).includes(order.contact.email));
 assert.equal(map.get(attemptKey),saved);assert.equal(h.writes.length,writes);
}));

test('read-only owner queue: pending feedback, single GET, old private results cleared during refresh and denial',()=>intercept(async()=>{
 globalThis.fetch=async()=>Response.json({orders:[order]});
 const h=harness('owner/orders/order-queue-client.tsx',{businessId:id});await h.tick();
 assert.ok(text(h.render()).includes(order.contact.email));
 const wait=deferred(),calls=[],writes=h.writes.length;
 globalThis.fetch=(url,init)=>{calls.push([url,init]);return wait.promise;};
 const click=h.find('queue-refresh').props.onClick,first=click();await click();
 assert.equal(calls.length,1);pending(h.find('queue-refresh'),'Actualizando pedidos…');
 assert.equal(calls[0][0],'/api/business/orders?businessId='+id);
 assert.equal(calls[0][1].method,'GET');assert.equal(calls[0][1].body,undefined);
 assert.ok(!text(h.render()).includes(order.contact.email));
 wait.resolve(Response.json({error:'denied'},{status:403}));await first;
 settled(h.find('queue-refresh'));assert.ok(!text(h.render()).includes(order.contact.email));
 assert.equal(h.writes.length,writes);assert.equal(nodes(h.render()).filter(n=>n.type==='button').length,1);
 assert.ok(nodes(h.render()).some(n=>n.type==='a'&&n.props.href==='/owner/catalog'));
}));
