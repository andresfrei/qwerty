import assert from 'node:assert/strict';
import test from 'node:test';
import {harness,prepare,catalog,cart,order,id,receiptId,text,nodes} from './pickup-order-ui-fixtures.mjs';
const checkout='store/[slug]/checkout/checkout-client.tsx',key='qwerty:pickup:v1:tienda',cartKey='qwerty:cart:v1:'+id;
const rejected=code=>Response.json({error:'Order unavailable',code},{status:409});
const repriced={...catalog,categories:[{...catalog.categories[0],items:[{...catalog.categories[0].items[0],price_minor:200}]}]};
const button=(h,label)=>nodes(h.render()).find(n=>n.type==='button'&&text(n).startsWith(label));
function assertRetained(h){assert.equal(h.find('contact-name').props.value,'Ana');assert.ok(text(h.render()).includes('receipt.pdf'));assert.equal(JSON.parse(h.map.get(cartKey)).items[0].unitPriceMinor,100);}

test('409 quote_changed permits actual reprice/contact correction after reload with the same request key',async()=>{
 const old=globalThis.fetch,calls=[];let requestId;
 globalThis.fetch=async(url,init)=>{calls.push([url,init]);if(url==='/api/checkout/session')return Response.json({ready:true});if(url.startsWith('/api/checkout/receipts?'))return Response.json({receiptId},{status:201});if(init.method==='GET')return Response.json({error:'Order outcome unknown',code:'outcome_unknown',requestId},{status:503});requestId=JSON.parse(init.body).requestId;return rejected('quote_changed');};
 try{
  const h=harness(checkout,{catalog});await prepare(h);await h.find('order-confirm').props.onClick();assertRetained(h);
  assert.equal(nodes(h.render()).find(n=>n.type==='fieldset').props.disabled,false,'definitive quote rejection unlocks corrections');
  assert.equal(JSON.parse(h.map.get(key)).correction,'quote_changed');
  const reload=harness(checkout,{catalog:repriced},h.map);const count=calls.length;assert.equal(calls.length,count,'reload never POSTs');
  assert.equal(nodes(reload.render()).find(n=>n.type==='fieldset').props.disabled,false);
  await reload.find('order-recover').props.onClick();await reload.tick();assert.equal(calls.at(-1)[1].method,'GET');assert.equal(nodes(reload.render()).find(n=>n.type==='fieldset').props.disabled,false,'recovery miss does not erase known correction');
  button(reload,'Aceptar ').props.onClick();reload.render();assert.equal(JSON.parse(h.map.get(cartKey)).items[0].unitPriceMinor,200);
  await prepare(reload);reload.find('contact-name').props.onChange({target:{value:'Ana corregida'}});await reload.form();
  let finish;globalThis.fetch=async(url,init)=>{calls.push([url,init]);assert.equal(init.method,'POST');const intent=JSON.parse(init.body);assert.equal(intent.requestId,requestId);assert.equal(intent.expected.totalMinor,200);assert.equal(intent.contact.name,'Ana corregida');assert.equal(JSON.parse(h.map.get(key)).correction,undefined,'pending reference persisted before revised POST');return new Promise(r=>{finish=()=>r(Response.json({order:{...order,requestId,totalMinor:200,contact:intent.contact,lines:[{...order.lines[0],unitPriceMinor:200,lineTotalMinor:200}]}},{status:201}));});};
  const first=reload.find('order-confirm').props.onClick();await reload.find('order-confirm').props.onClick();assert.equal(calls.filter(([,init])=>init.method==='POST'&&String(init.body).includes('"requestId"')).length,2);finish();await first;reload.render();assert.ok(reload.find('order-tracking'));assert.equal(JSON.parse(h.map.get(cartKey)).items.length,0);
 }finally{globalThis.fetch=old;}
});

test('unsafe/malformed rejections and legacy references remain frozen; unknown never mints or posts again',async()=>{
 const old=globalThis.fetch;
 try{for(const body of [{error:'Order unavailable',code:'idempotency_conflict'},{error:'Order unavailable',code:'receipt_used'},{error:'Order unavailable',code:'invalid_receipt'},{error:'wrong',code:'quote_changed'},{error:'Order unavailable',code:'quote_changed',extra:true},null]){
  let count=0;globalThis.fetch=async(url)=>{count++;return url==='/api/checkout/session'?Response.json({ready:true}):url.startsWith('/api/checkout/receipts?')?Response.json({receiptId},{status:201}):Response.json(body,{status:409});};
  const h=harness(checkout,{catalog});await prepare(h);await h.find('order-confirm').props.onClick();assertRetained(h);const ref=h.map.get(key);assert.equal(nodes(h.render()).find(n=>n.type==='fieldset').props.disabled,true);await h.find('order-confirm').props.onClick();assert.equal(count,3);assert.equal(h.map.get(key),ref);
 }
 const map=new Map([[cartKey,JSON.stringify(cart)],[key,JSON.stringify({businessId:id,slug:'tienda',requestId:id,receiptId})]]);let count=0;globalThis.fetch=async()=>{count++;return Response.json({error:'Order outcome unknown',code:'outcome_unknown',requestId:id},{status:503});};const h=harness(checkout,{catalog},map);const ref=map.get(key);await h.find('order-recover').props.onClick();await h.tick();await h.find('order-confirm').props.onClick();assert.equal(count,1);assert.equal(map.get(key),ref);assert.equal(nodes(h.render()).find(n=>n.type==='fieldset').props.disabled,true);
 }finally{globalThis.fetch=old;}
});

test('recovery of an old winner after correction edits cannot clear the revised cart',async()=>{
 const old=globalThis.fetch;let requestId;
 globalThis.fetch=async(url,init)=>url==='/api/checkout/session'?Response.json({ready:true}):url.startsWith('/api/checkout/receipts?')?Response.json({receiptId},{status:201}):init.method==='POST'?(requestId=JSON.parse(init.body).requestId,rejected('quote_changed')):Response.json({order:{...order,requestId}});
 try{const h=harness(checkout,{catalog});await prepare(h);await h.find('order-confirm').props.onClick();h.props.catalog=repriced;h.render();h.render();button(h,'Aceptar ').props.onClick();h.find('contact-name').props.onChange({target:{value:'Revisada'}});const snapshot=h.map.get(cartKey);await h.find('order-recover').props.onClick();await h.tick();assert.ok(h.find('order-tracking'));assert.equal(h.map.get(cartKey),snapshot);assert.equal(JSON.parse(snapshot).items[0].unitPriceMinor,200);assert.equal(h.find('contact-name').props.value,'Revisada');}finally{globalThis.fetch=old;}
});

test('a revised POST that loses its response durably returns to frozen unknown with no new key',async()=>{
 const old=globalThis.fetch;let posts=0,requestId;
 globalThis.fetch=async(url,init)=>{if(url==='/api/checkout/session')return Response.json({ready:true});if(url.startsWith('/api/checkout/receipts?'))return Response.json({receiptId},{status:201});if(init.method==='GET')return Response.json({error:'Order outcome unknown',code:'outcome_unknown',requestId},{status:503});posts++;const intent=JSON.parse(init.body);if(posts===1){requestId=intent.requestId;return rejected('quote_changed');}assert.equal(intent.requestId,requestId);throw new TypeError('lost');};
 try{const h=harness(checkout,{catalog});await prepare(h);await h.find('order-confirm').props.onClick();h.find('contact-name').props.onChange({target:{value:'Revisada'}});await h.form();await h.find('order-confirm').props.onClick();const ref=h.map.get(key);assert.equal(JSON.parse(ref).correction,undefined);assert.equal(posts,2);const reloaded=harness(checkout,{catalog},h.map);await reloaded.find('order-confirm').props.onClick();await reloaded.find('order-recover').props.onClick();await reloaded.tick();assert.equal(posts,2);assert.equal(h.map.get(key),ref);assert.equal(nodes(reloaded.render()).find(n=>n.type==='fieldset').props.disabled,true);assert.equal(JSON.parse(h.map.get(cartKey)).items.length,1);}finally{globalThis.fetch=old;}
});

test('throwing storage getter before confirmation gives visible refusal, no POST/reference/latch',async()=>{
 const old=globalThis.fetch;let calls=0;globalThis.fetch=async url=>{calls++;return url==='/api/checkout/session'?Response.json({ready:true}):Response.json({receiptId},{status:201});};
 try{const h=harness(checkout,{catalog});await prepare(h);const writes=h.writes.length;h.storageControl.denied=true;await assert.doesNotReject(h.find('order-confirm').props.onClick());assertRetained(h);assert.ok(text(h.render()).includes('No enviamos el pedido'));assert.equal(calls,2);assert.equal(h.writes.length,writes);assert.equal(h.map.has(key),false);assert.equal(h.find('order-confirm').props.disabled,false);}finally{globalThis.fetch=old;}
});

test('throwing storage getter or read on recovery mount shows unavailable storage and makes no GET',async()=>{
 const old=globalThis.fetch;let count=0;globalThis.fetch=async()=>{count++;throw Error('unexpected');};
 try{for(const getter of [true,false]){const map=new Map();if(!getter)map.get=()=>{throw new DOMException('denied','SecurityError');};let h;assert.doesNotThrow(()=>{h=harness('store/order-status-client.tsx',{slug:'tienda'},map,undefined,{denied:getter});});assert.ok(text(h.render()).includes('No pudimos acceder al almacenamiento'));assert.equal(count,0);assert.equal(h.writes.length,0);}}finally{globalThis.fetch=old;}
});

test('storage getter denial or write failure after authoritative success preserves confirmation and cart with feedback',async()=>{
 const old=globalThis.fetch;
 try{for(const getter of [true,false]){let h;globalThis.fetch=async(url,init)=>{if(url==='/api/checkout/session')return Response.json({ready:true});if(url.startsWith('/api/checkout/receipts?'))return Response.json({receiptId},{status:201});const intent=JSON.parse(init.body);if(getter)h.storageControl.denied=true;else{const set=h.map.set.bind(h.map);h.map.set=(key,value)=>{if(key===cartKey)throw new DOMException('denied','SecurityError');return set(key,value);};}return Response.json({order:{...order,requestId:intent.requestId}},{status:201});};h=harness(checkout,{catalog});await prepare(h);const snapshot=h.map.get(cartKey);await assert.doesNotReject(h.find('order-confirm').props.onClick());assert.ok(h.find('order-tracking'));assert.ok(text(h.render()).includes('No pudimos limpiar el carrito local'));assert.equal(h.map.get(cartKey),snapshot);assert.equal(h.find('contact-name').props.value,'Ana');}}
 finally{globalThis.fetch=old;}
});
