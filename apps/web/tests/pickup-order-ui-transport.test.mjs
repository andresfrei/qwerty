import assert from 'node:assert/strict';
import test from 'node:test';
import { requestOrder, validateOrder } from '../app/lib/pickup-order-client.ts';
import { saveAttempt, readAttempt, clearSubmittedCart } from '../app/lib/pickup-attempt.ts';
const id = '11111111-1111-4111-8111-111111111111';
const receiptId = '22222222-2222-4222-8222-222222222222';
const order = { id, requestId: id, receiptId, currency:'ARS', totalMinor:100, fulfillmentState:'pendiente_de_pago', paymentState:'pendiente', createdAt:'2026-01-01T00:00:00Z', contact:{name:'Ana',email:'ana@fixture.invalid',telephone:'123'}, lines:[{itemId:id,name:'Agua',quantity:1,unitPriceMinor:100,lineTotalMinor:100,selectionText:''}] };
test('transport whitelist, binding, exact status and safe failures', async () => {
  let calls = 0;
  const fetcher = async (url, init) => { calls++; assert.equal(url, '/api/checkout/orders?slug=tienda&requestId='+id); assert.equal(init.method,'GET'); assert.equal(init.cache,'no-store'); assert.equal(init.redirect,'error'); assert.equal(init.credentials,'same-origin'); assert.equal(init.body,undefined); return Response.json({order:{...order,secret:'never'}}); };
  const result = await requestOrder({kind:'recover',slug:'tienda',requestId:id},fetcher);
  assert.equal(result.status,'confirmed'); assert.equal(result.order.secret,undefined); assert.equal(calls,1);
  for (const changed of [{requestId:receiptId},{receiptId:id},{totalMinor:101},{paymentState:'paid'},{lines:[]}]) assert.equal(validateOrder({...order,...changed},{requestId:id,receiptId}),null);
  for (const [status,body,expected] of [[401,{error:'Session required'},'session'],[403,{error:'Owner access required'},'forbidden'],[404,{error:'Order not found'},'missing'],[503,{error:'private-provider'},'unknown'],[200,{order:{...order,requestId:receiptId}},'unknown']]) {
    const next = await requestOrder({kind:'recover',slug:'tienda',requestId:id},async()=>Response.json(body,{status}));
    assert.equal(next.status,expected); assert.ok(!JSON.stringify(next).includes('private-provider'));
  }
  assert.equal((await requestOrder({kind:'recover',slug:'tienda',requestId:id},async()=>{throw Error('secret');})).status,'unknown');
});
test('POST uses exact intent, malformed success cannot confirm and GET ID is bound',async()=>{
 const intent={requestId:id,receiptId,contact:order.contact,expected:{currency:'ARS',totalMinor:100},lines:[{itemId:id,quantity:1,selection:[]}]};
 const result=await requestOrder({kind:'submit',slug:'tienda',intent},async(url,init)=>{assert.equal(url,'/api/checkout/orders?slug=tienda');assert.deepEqual(JSON.parse(init.body),intent);return Response.json({order},{status:201});});
 assert.equal(result.status,'confirmed');
 assert.equal((await requestOrder({kind:'known',id:receiptId},async()=>Response.json({order}))).status,'error');
 for(const [status,code] of [[409,'catalog_changed'],[422,'invalid_selection']]) assert.deepEqual(await requestOrder({kind:'submit',slug:'tienda',intent},async()=>Response.json({error:'Order unavailable',code},{status})),{status:'correctable',code});
 assert.equal((await requestOrder({kind:'queue',businessId:id},async()=>Response.json({orders:Array(101).fill(order)}))).status,'error');
});
test('references persist only technical selectors and failure never claims durability',()=>{
 const map=new Map(), storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};
 const reference={businessId:id,slug:'tienda',requestId:id};
 assert.equal(saveAttempt(storage,{...reference,contact:order.contact}),true);
 assert.deepEqual(readAttempt(storage,'tienda'),reference);
 assert.ok(![...map.values()].join('').includes('Ana'));
 assert.equal(saveAttempt({setItem(){throw Error();}},reference),false);
 assert.equal(saveAttempt(storage,{...reference,slug:'../bad'}),false);
 map.set('qwerty:pickup:v1:tienda',JSON.stringify({...reference,contact:order.contact}));
 assert.equal(readAttempt(storage,'tienda'),null);
});
test('clear only matching submitted snapshot, never another cart or intervening edits',()=>{
 const map=new Map([['qwerty:cart:v1:'+id,'submitted'],['unrelated','keep']]);
 const storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};
 assert.equal(clearSubmittedCart(storage,id,'old'),false); assert.equal(map.get('qwerty:cart:v1:'+id),'submitted');
 assert.equal(clearSubmittedCart(storage,id,'submitted'),true); assert.equal(JSON.parse(map.get('qwerty:cart:v1:'+id)).items.length,0);assert.equal(map.get('unrelated'),'keep');
});
