import assert from 'node:assert/strict';
import test from 'node:test';
import {normalizePickupIntent,quotePickupOrder} from '../app/lib/order-quote.ts';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const business=id(99),group=(n,item,mode,min,max)=>({id:id(n),business_id:business,item_id:id(item),name:'Grupo '+n,selection_mode:mode,min_select:min,max_select:max,sort_order:n});
const option=(n,g,name,delta)=>({id:id(n),business_id:business,group_id:id(g),name,price_delta_minor:delta,is_available:true,sort_order:n});
const snapshot={version:1,fingerprint:'a'.repeat(64),businessId:business,slug:'pizza',surchargeMinor:5000,items:[{id:id(1),business_id:business,name:'Pizza',price_minor:100000,currency:'ARS',is_available:true},{id:id(2),business_id:business,name:'Docena',price_minor:120000,currency:'ARS',is_available:true}],groups:[group(10,1,'distinct',1,1),group(11,1,'distinct',1,2),group(12,2,'quantity',12,12)],options:[option(20,10,'Grande',20000),option(21,10,'Chica',0),option(22,11,'Muzza',0),option(23,11,'Napolitana',10000),option(24,11,'Otra',0),option(25,12,'Carne',0),option(26,12,'Verdura',1000)]};
const pick=(n,quantity=1)=>({optionId:id(n),quantity}),selection=(n,picks)=>({groupId:id(n),picks});
const input={requestId:id(41),receiptId:id(40),contact:{name:' Ana ',email:'ana@example.test ',telephone:'+54 111'},expected:{currency:'ARS',totalMinor:396000},lines:[{itemId:id(1),quantity:2,selection:[selection(10,[pick(20)]),selection(11,[pick(22),pick(23)])]},{itemId:id(2),quantity:1,selection:[selection(12,[pick(25,6),pick(26,6)])]}]};
const normalized=raw=>{const r=normalizePickupIntent(raw,'pizza');assert.equal(r.ok,true,JSON.stringify(r));return r.intent;};
function freeze(value){if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))freeze(child);}return value;}
function quote(raw=input,catalog=snapshot){return quotePickupOrder(normalized(raw),catalog);}

test('normalizes intent independently of catalog or quote, strict shape/contact/IDs and bounded immutable input',()=>{
 const raw=structuredClone(input);raw.requestId='AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA';raw.lines.reverse();raw.lines[1].selection.reverse();raw.lines[1].selection.find(x=>x.groupId===id(11)).picks.reverse();const before=structuredClone(raw);
 const result=normalizePickupIntent(freeze(raw),'pizza');assert.equal(result.ok,true);assert.equal(result.intent.requestId,raw.requestId.toLowerCase());assert.deepEqual(result.intent.contact,{name:'Ana',email:'ana@example.test',telephone:'+54 111'});assert.equal(result.intent.version,1);assert.equal(result.intent.slug,'pizza');
 const reordered=structuredClone(raw);reordered.lines.reverse();reordered.lines[0].selection.reverse();assert.deepEqual(normalizePickupIntent(reordered,'pizza'),result);assert.deepEqual(raw,before);
 for(const bad of [null,[],{...input,actorId:business},{...input,requestId:'guess'},{...input,contact:{...input.contact,email:'invalid'}},{...input,expected:{currency:'ARS',totalMinor:Infinity}},{...input,lines:[]}])assert.deepEqual(normalizePickupIntent(bad,'pizza'),{ok:false,code:'invalid_request'});
 const many=structuredClone(input);many.lines=Array.from({length:100},(_,i)=>({itemId:id(500+i),quantity:1,selection:[]}));assert.equal(normalizePickupIntent(many,'pizza').ok,true);many.lines.push({itemId:id(900),quantity:1,selection:[]});assert.deepEqual(normalizePickupIntent(many,'pizza'),{ok:false,code:'invalid_request'});
 const thousand=structuredClone(input);thousand.lines=[{itemId:id(1),quantity:99,selection:[selection(10,Array.from({length:1000},(_,i)=>pick(2000+i)))]}];assert.equal(normalizePickupIntent(thousand,'pizza').ok,true);thousand.lines[0].selection[0].picks.push(pick(4000));assert.deepEqual(normalizePickupIntent(thousand,'pizza'),{ok:false,code:'invalid_selection'});
 for(const quantity of [0,1.5,100]){const bad=structuredClone(input);bad.lines[0].quantity=quantity;assert.deepEqual(normalizePickupIntent(bad,'pizza'),{ok:false,code:'invalid_request'});}
 const forged=structuredClone(input);forged.lines[0].unitPriceMinor=1;assert.deepEqual(normalizePickupIntent(forged,'pizza'),{ok:false,code:'invalid_request'});
});

test('server quote derives immutable names/options/prices, exact dozen and one two-flavor surcharge without effects',()=>{
 const raw=structuredClone(input),catalog=structuredClone(snapshot),before=structuredClone({raw,catalog}),oldFetch=globalThis.fetch;let calls=0;globalThis.fetch=()=>{calls++;throw Error('unexpected network');};
 try{const result=quote(freeze(raw),freeze(catalog));assert.equal(result.ok,true);const q=result.quote;assert.equal(q.version,1);assert.equal(q.snapshotFingerprint,catalog.fingerprint);assert.equal(q.businessId,business);assert.equal(q.currency,'ARS');assert.equal(q.totalMinor,396000);assert.deepEqual(q.contact,{name:'Ana',email:'ana@example.test',telephone:'+54 111'});assert.equal(q.lines[0].name,'Pizza');assert.equal(q.lines[0].unitPriceMinor,135000);assert.equal(q.lines[0].lineTotalMinor,270000);assert.equal(q.lines[0].surchargeMinor,5000);assert.equal(q.lines[1].unitPriceMinor,126000);assert.equal(q.lines[0].selectionText,'Grande · Mitad Muzza / mitad Napolitana');assert.equal(q.lines[1].selectionText,'6 Carne + 6 Verdura');assert.deepEqual({raw,catalog},before);assert.equal(calls,0);}finally{globalThis.fetch=oldFetch;}
 const one=structuredClone(input);one.lines[0].selection[1].picks=[pick(22)];one.expected.totalMinor=366000;assert.equal(quote(one).ok,true);assert.equal(quote(one).quote.lines[0].surchargeMinor,0);
});

test('malformed repeated groups/picks, distinct quantity, foreign/unavailable options and invalid dozen never quote',()=>{
 const variants=[];let raw=structuredClone(input);raw.lines[0].selection.push(structuredClone(raw.lines[0].selection[0]));variants.push(raw);
 raw=structuredClone(input);raw.lines[0].selection[1].picks.push(pick(22));variants.push(raw);
 raw=structuredClone(input);raw.lines[0].selection[1].picks[0].quantity=2;variants.push(raw);
 raw=structuredClone(input);raw.lines[0].selection[1].picks=[pick(25)];variants.push(raw);
 raw=structuredClone(input);raw.lines[0].selection[1].picks.push(pick(24));variants.push(raw);
 for(const units of [5,7]){raw=structuredClone(input);raw.lines[1].selection[0].picks[0].quantity=units;variants.push(raw);}
 for(const bad of variants){const before=structuredClone(bad),n=normalizePickupIntent(freeze(bad),'pizza');const result=n.ok?quotePickupOrder(n.intent,snapshot):n;assert.deepEqual(result,{ok:false,code:'invalid_selection'});assert.deepEqual(bad,before);}
 const catalog=structuredClone(snapshot);catalog.options[0].is_available=false;assert.deepEqual(quote(input,catalog),{ok:false,code:'invalid_selection'});
});

test('single currency rejects mixed order without conversion or input mutation and quote changes require review',()=>{
 const catalog=structuredClone(snapshot);catalog.items[1].currency='USD';const before=structuredClone({input,catalog});assert.deepEqual(quote(input,catalog),{ok:false,code:'mixed_currency'});assert.deepEqual({input,catalog},before);
 const raw=structuredClone(input);raw.lines=raw.lines.slice(1);raw.expected={currency:'USD',totalMinor:126000};const usd=quote(raw,catalog);assert.equal(usd.ok,true);assert.equal(usd.quote.currency,'USD');assert.equal(usd.quote.totalMinor,126000);
 const changed=structuredClone(input);changed.expected.totalMinor=1;const result=quote(changed);assert.equal(result.ok,false);assert.equal(result.code,'quote_changed');assert.equal(result.quote.totalMinor,396000);assert.equal(changed.expected.totalMinor,1);
});

test('unsupported/inconsistent snapshot, foreign business and unsafe computed amounts fail without a quote',()=>{
 for(const modify of [s=>{s.version=2;},s=>{s.fingerprint='invalid';},s=>{s.items[0].business_id=id(98);}]){const s=structuredClone(snapshot);modify(s);assert.deepEqual(quote(input,s),{ok:false,code:'unavailable'});}
 const s=structuredClone(snapshot);s.items[0].price_minor=Number.MAX_SAFE_INTEGER;assert.deepEqual(quote(input,s),{ok:false,code:'amount_out_of_range'});
});
