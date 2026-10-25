import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,catalog,cart,order as classic,id,nodes} from './pickup-order-ui-fixtures.mjs';
import {configuredFixture} from './configured-order-fixtures.mjs';
import {normalizeConfiguredPickupIntent,quoteConfiguredPickupOrder} from '../app/lib/configured-order-quote.ts';
import {formatMoney} from '../app/lib/storefront.ts';
import {renderToStaticMarkup} from 'react-dom/server';
const normalize=s=>s.replace(/\s+/g,' ').trim();
const compact=t=>normalize(renderToStaticMarkup(t).replace(/<!--.*?-->/g,'').replace(/<[^>]+>/g,' '));
function accepted(){
 const f=configuredFixture('combo',2);const intent=normalizeConfiguredPickupIntent(f.wire,'pizza').intent;
 const quote=quoteConfiguredPickupOrder(intent,f.snapshot).quote;
 quote.lines[0].selectionText='Resumen aceptado';
 quote.lines[0].components.forEach((c,i)=>{c.name=`Producto congelado ${c.componentId}`;c.groups.forEach((g,j)=>{g.name=`Grupo congelado ${j+1}`;g.picks.forEach((p,k)=>p.name=`Elección congelada ${i+1}-${j+1}-${k+1}`);});});
 return {...classic,version:2,requestId:intent.requestId,receiptId:intent.receiptId,contact:quote.contact,totalMinor:quote.totalMinor,lines:quote.lines};
}
for(const kind of ['pizza','dozen'])test(`stored ${kind} root groups render accepted names/counts without current catalog`,async()=>{
 const f=configuredFixture(kind);const intent=normalizeConfiguredPickupIntent(f.wire,'pizza').intent;const quote=quoteConfiguredPickupOrder(intent,f.snapshot).quote;
 const order={...classic,version:2,requestId:intent.requestId,receiptId:intent.receiptId,contact:quote.contact,totalMinor:quote.totalMinor,lines:quote.lines};
 const old=globalThis.fetch;let calls=0;globalThis.fetch=async(_url,init)=>{calls++;assert.equal(init.method,'GET');return Response.json({order});};
 try{const h=harness('store/order-status-client.tsx',{slug:'tienda',id});await h.tick();const composition=nodes(h.render()).find(n=>n.props?.['aria-label']==='Composición aceptada');
 assert.ok(composition);const line=order.lines[0];assert.equal(compact(composition),normalize(`${line.quantity} × ${line.name} ${line.groups.map(g=>`${g.name}: ${g.picks.map(p=>`${p.quantity} × ${p.name}`).join(' + ')}`).join(' ')} ${formatMoney(line.lineTotalMinor,order.currency)}`));assert.equal(calls,1);
 }finally{globalThis.fetch=old;}
});
const cases=[['store/order-status-client.tsx',{slug:'tienda',id},'order-refresh'],['owner/orders/order-queue-client.tsx',{businessId:id},'queue-refresh'],['store/[slug]/checkout/checkout-client.tsx',{catalog},'order-recover']];
for(const [path,props,button] of cases)test(`actual ${path} renders complete stored components and read-only callbacks`,async()=>{
 const rich=accepted(),before=JSON.stringify(rich),calls=[],old=globalThis.fetch;
 globalThis.fetch=async(url,init)=>{calls.push([url,init]);assert.equal(init.method,'GET');assert.equal(init.credentials,'same-origin');assert.equal(init.cache,'no-store');assert.equal(init.redirect,'error');return Response.json(path.includes('queue')?{orders:[rich]}:{order:rich});};
 try{
 const map=new Map([['qwerty:cart:v1:'+id,JSON.stringify(cart)],['qwerty:pickup:v1:tienda',JSON.stringify({businessId:id,slug:'tienda',requestId:rich.requestId,receiptId:rich.receiptId})]]);
 const h=harness(path,props,map);if(button==='order-recover')await h.find(button).props.onClick();await h.tick();
 let tree=h.render();const composition=nodes(tree).filter(n=>n.props?.['aria-label']==='Composición aceptada');assert.equal(composition.length,1);
 const descriptions=nodes(composition[0]).filter(n=>n.props?.['data-component-instance']!==undefined);
 assert.deepEqual(descriptions.map(compact),rich.lines[0].components.map(c=>`${c.name} · Unidad ${c.instanceIndex+1} ${c.groups.map(g=>`${g.name}: ${g.picks.map(p=>`${p.quantity} × ${p.name}`).join(' + ')}`).join(' ')}`));
 assert.equal(compact(composition[0]),`2 × ${rich.lines[0].name} ${descriptions.map(compact).join(' ')} ${normalize(formatMoney(rich.lines[0].lineTotalMinor,rich.currency))}`);
 const htmlText=compact(tree);assert.ok(htmlText.includes('pendiente de pago'));assert.ok(htmlText.includes('verificación'));assert.ok(htmlText.includes(normalize(formatMoney(rich.totalMinor,rich.currency))));assert.equal(htmlText.includes('schemaVersion'),false);
 assert.equal(JSON.stringify(rich),before);assert.deepEqual(JSON.parse(map.get('qwerty:cart:v1:'+id)),cart);
 const n=calls.length;
 if(button==='order-recover'){assert.equal(h.find(button),undefined);assert.equal(h.find('order-confirm').props.disabled,true);assert.equal(calls.length,n);}
 else {await h.find(button).props.onClick();await h.tick();tree=h.render();assert.equal(calls.length,n+1);assert.equal(nodes(tree).filter(n=>n.props?.['aria-label']==='Composición aceptada').length,1);}
 assert.ok(calls.every(([url])=>!url.includes('catalog')&&!url.includes('receipt')));assert.equal(h.writes.filter(([key])=>key.startsWith('qwerty:pickup')).length,0);
 }finally{globalThis.fetch=old;}
});
