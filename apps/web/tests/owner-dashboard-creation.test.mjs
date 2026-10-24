import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { load, harness, nodes, text, tick, storage, a, b, owner, business, storefront } from './owner-dashboard-fixtures.test.mjs';
const file='apps/web/app/owner/store-creation-client.ts';
const ready=(id=b,published=false)=>({state:'ready',businessId:id,business:{...business,id},storefront:{...storefront,is_published:published}});
const partial=(reason='slug_unavailable')=>({state:'partial',businessId:b,business,reason});
const json=(body,status=200)=>Response.json(body,{status});
function session(fetcher, store=storage(), extra={}) {
  const {StoreCreationSession}=load(file); let current=true; const changes=[], navigations=[];
  const s=new StoreCreationSession({accountId:owner,storage:store,fetcher,newId:()=>b,isCurrent:()=>current,onChange:v=>changes.push(v),onReady:id=>navigations.push(id),...extra});
  s.restore(); s.edit('name','Mi tienda'); s.edit('slug','mi-tienda');
  return {s,store,changes,navigations,stop:()=>current=false};
}
test('strict reply runtime validator correlates IDs, exact keys, status and safe values',()=>{
  const {parseCreationReply:p}=load(file);
  assert.equal(p(201,ready(),b).state,'ready'); assert.equal(p(200,ready(b,true),b).storefront.is_published,true);
  for(const body of [ready(a),{...ready(),business:{...business,id:a}},{...ready(),ownerId:owner},{...ready(),storefront:{...storefront,slug:'../bad'}},{...ready(),storefront:{...storefront,is_published:'false'}},[]]) assert.equal(p(201,body,b),null);
  assert.equal(p(409,ready(),b),null); assert.equal(p(200,partial(),b),null);
  for(const reason of ['slug_unavailable','draft_rejected','storefront_missing']) assert.equal(p(409,partial(reason),b).state,'partial');
  assert.equal(p(409,partial('other'),b),null);
});
test('pending duplicate invokes exactly one POST; reference and inputs stored before fetch',async()=>{
  let resolve, calls=0; const store=storage();
  const {s}=session((url,init)=>{calls++; const saved=JSON.parse([...store.values.values()][0]); assert.deepEqual(saved.input,JSON.parse(init.body)); assert.equal(saved.phase,'unknown'); assert.equal(url,'/owner/stores/create'); assert.equal(init.credentials,'same-origin'); assert.equal(init.headers['Content-Type'],'application/json'); return new Promise(r=>resolve=r);},store);
  const first=s.submit(); await s.submit(); assert.equal(calls,1); assert.equal(s.snapshot().pending,'create');
  resolve(json(ready(),201)); await first; assert.equal(s.snapshot().phase,'ready'); assert.equal(s.snapshot().pending,null);
});
test('storage failure sends no POST and retains input/reference',async()=>{
  let calls=0; const store=storage(); store.setItem=()=>{throw Error('denied');}; const {s}=session(async()=>{calls++;},store);
  await s.submit(); assert.equal(calls,0); assert.equal(s.snapshot().input.name,'Mi tienda'); assert.equal(s.snapshot().input.slug,'mi-tienda'); assert.equal(s.snapshot().input.businessId,b); assert.equal(s.snapshot().storageOK,false);
});
test('restoration must finish before any write; invalid storage and getItem failures stay nonwriting',async()=>{
  const {StoreCreationSession}=load(file); let calls=0;
  for(const store of [{getItem(){throw Error('denied');},setItem(){}},{getItem(){return '{bad';},setItem(){}}]) {
    const s=new StoreCreationSession({accountId:owner,storage:store,fetcher:async()=>{calls++;},newId:()=>b,isCurrent:()=>true,onChange(){}});
    await s.submit(); assert.equal(calls,0); s.restore(); await s.submit(); assert.equal(s.snapshot().storageOK,false); assert.equal(calls,0);
  }
});
test('known partial locks canonical name, manual slug correction uses same ID',async()=>{
  const calls=[]; const {s}=session(async(url,init)=>{calls.push(JSON.parse(init.body));return json(calls.length===1?partial():ready(),calls.length===1?409:200);});
  await s.submit(); assert.equal(s.snapshot().phase,'partial'); assert.equal(s.snapshot().input.name,'Tienda B');
  s.edit('name','Changed'); s.edit('slug','manual-address'); await s.submit();
  assert.equal(calls[1].businessId,b); assert.equal(calls[1].name,'Tienda B'); assert.equal(calls[1].slug,'manual-address');
});
test('unknown stops pending but keeps all writes locked and GET errors do not unlock',async()=>{
  const calls=[]; const {s}=session(async(url,init)=>{calls.push([url,init]);return calls.length===1?json({state:'outcome_unknown',businessId:b},503):json({error:'invalid_request'},400);});
  await s.submit(); assert.equal(s.snapshot().phase,'unknown'); assert.equal(s.snapshot().pending,null);
  s.edit('slug','other'); assert.equal(s.snapshot().input.slug,'mi-tienda'); await s.submit(); assert.equal(calls.length,1);
  await s.recover(); assert.equal(s.snapshot().phase,'unknown'); await s.submit(); assert.equal(calls.length,2);
  assert.equal(calls[1][0],`/owner/stores/create?businessId=${b}`); assert.equal(calls[1][1].method,'GET'); assert.equal(calls[1][1].body,undefined);
});
test('mismatched ID, malformed JSON/content type, network error all freeze as unknown',async()=>{
  for(const fetcher of [async()=>json(ready(a)),async()=>new Response('{bad',{headers:{'content-type':'application/json'}}),async()=>new Response(JSON.stringify(ready()),{headers:{'content-type':'text/html'}}),async()=>{throw Error('lost');}]) {
    const {s}=session(fetcher); await s.submit(); assert.equal(s.snapshot().phase,'unknown'); assert.equal(s.snapshot().input.businessId,b);
  }
});
test('only recognized GET ready/partial settles unknown; GET never automatically POSTs',async()=>{
  for(const next of [partial('storefront_missing'),ready(b,true)]) {
    let calls=0; const {s}=session(async(url,init)=>{calls++; return calls===1?json({state:'outcome_unknown',businessId:b},503):json(next,next.state==='ready'?200:409);});
    await s.submit(); await s.recover(); assert.equal(s.snapshot().phase,next.state); assert.equal(calls,2);
    if(next.state==='ready') {assert.equal(s.snapshot().canonical.storefront.is_published,true); await s.submit(); assert.equal(calls,2);}
  }
});
test('restoring retained reference starts GET-only, never generates another UUID',async()=>{
  const store=storage(); const {s}=session(async()=>{throw Error('lost');},store); await s.submit();
  let calls=0; const restored=session(async(url,init)=>{calls++;assert.equal(init.method,'GET');return json(partial(),409);},store,{newId:()=>{throw Error('must not generate');}}).s;
  assert.equal(restored.snapshot().phase,'unknown'); assert.equal(restored.snapshot().input.name,'Mi tienda'); await restored.submit(); assert.equal(calls,0); await restored.recover(); assert.equal(calls,1); assert.equal(restored.snapshot().phase,'partial');
});
test('recognized no-write POST survives restore as editable with same inputs/reference and explicit resubmit only',async()=>{
  const {StoreCreationSession}=load(file);
  for(const [status,error] of [[400,'invalid_request'],[401,'unauthorized'],[403,'request_rejected'],[405,'method_not_allowed'],[503,'unavailable']]) {
    const store=storage();const sent=[];
    const {s}=session(async(url,init)=>{sent.push([url,JSON.parse(init.body)]);return json({error},status);},store);
    await s.submit();assert.equal(s.snapshot().phase,'editable');const retained={...s.snapshot().input};
    assert.equal(JSON.parse([...store.values.values()][0]).phase,'editable');
    let restoredCalls=0;
    const restored=new StoreCreationSession({accountId:owner,storage:store,fetcher:async(url,init)=>{restoredCalls++;sent.push([url,JSON.parse(init.body)]);return json(ready());},newId:()=>{throw Error('must reuse the retained reference');},isCurrent:()=>true,onChange(){}});
    restored.restore();assert.equal(restored.snapshot().phase,'editable',error);assert.deepEqual(restored.snapshot().input,retained);assert.equal(restoredCalls,0);
    restored.edit('slug','corrected-slug');await restored.submit();assert.equal(restoredCalls,1);assert.equal(sent[1][1].businessId,b);assert.equal(sent[1][1].name,retained.name);assert.equal(sent[1][1].slug,'corrected-slug');
  }
});
test('unknown POST restoration stays GET-only through no-write GET errors and transport loss',async()=>{
  const {StoreCreationSession}=load(file);const store=storage();
  const {s}=session(async()=>json({state:'outcome_unknown',businessId:b},503),store);await s.submit();
  const calls=[];let attempts=0;
  const restored=new StoreCreationSession({accountId:owner,storage:store,fetcher:async(url,init)=>{calls.push([url,init]);if(++attempts===3)throw Error('transport lost');return attempts===1?json({error:'invalid_request'},400):json({error:'unavailable'},503);},newId:()=>{throw Error('must not generate');},isCurrent:()=>true,onChange(){}});
  restored.restore();assert.equal(restored.snapshot().phase,'unknown');assert.equal(calls.length,0);
  for(let i=0;i<3;i++) {await restored.submit();assert.equal(calls.length,i);await restored.recover();assert.equal(restored.snapshot().phase,'unknown');assert.equal(JSON.parse([...store.values.values()][0]).phase,'unknown');}
  assert.ok(calls.every(([url,init])=>url===`/owner/stores/create?businessId=${b}`&&init.method==='GET'&&init.body===undefined));
});
test('editable restore still rejects mismatched account, invalid reference and extra input fields',()=>{
  const {StoreCreationSession}=load(file);
  for(const patch of [{accountId:a},{input:{businessId:'bad',name:'Keep',slug:'keep'}},{input:{businessId:b,name:'Keep',slug:'keep',ownerId:owner}}]) {
    const store=storage();store.setItem(`qwerty:store-creation:v1:${owner}`,JSON.stringify({version:1,accountId:owner,input:{businessId:b,name:'Keep',slug:'keep'},phase:'editable',...patch}));
    const restored=new StoreCreationSession({accountId:owner,storage:store,fetcher:()=>{throw Error('no automatic requests');},newId:()=>{throw Error('no UUID generation');},isCurrent:()=>true,onChange(){}});
    restored.restore();assert.equal(restored.snapshot().storageOK,false);
  }
});
test('ready storage update failure cannot enable another creation or reset published canonical',async()=>{
  const store=storage(); let writes=0,calls=0; const write=store.setItem; store.setItem=(k,v)=>{if(++writes===2)throw Error('full');write(k,v);};
  const {s,navigations}=session(async()=>{calls++;return json(ready(b,true));},store); await s.submit(); await s.submit();
  assert.equal(s.snapshot().phase,'ready'); assert.equal(s.snapshot().canonical.storefront.is_published,true); assert.equal(calls,1); assert.deepEqual(navigations,[b]);
});
test('unmount/account transition ignores late state and navigation, leaves persisted unknown for recovery',async()=>{
  let resolve; const {s,stop,store,navigations}=session(()=>new Promise(r=>resolve=r)); const pending=s.submit(); stop(); resolve(json(ready())); await pending;
  assert.equal(s.snapshot().phase,'unknown'); assert.deepEqual(navigations,[]); assert.equal(JSON.parse([...store.values.values()][0]).phase,'unknown');
  const other=session(async()=>json(ready()),store,{accountId:a}); assert.equal(other.s.snapshot().input.businessId,'');
});
test('SSR renders a disabled native write button and noscript explanation',()=>{
  const CreateStore=load('apps/web/app/owner/create-store-client.tsx').default;
  const html=renderToStaticMarkup(React.createElement(CreateStore,{accountId:owner,firstStore:true}));
  assert.match(html,/<noscript>.*JavaScript/); assert.match(html,/<button[^>]*id="create-store-submit"[^>]*disabled=""/);
});
test('only explicit settled intent reset clears canonical reference; cleanup failure remains ready',async()=>{
  const {s,store}=session(async()=>json(ready()));await s.submit();const previous=store.setItem;store.setItem=()=>{throw Error('denied');};
  s.startNewIntent();assert.equal(s.snapshot().phase,'ready');assert.equal(s.snapshot().input.businessId,b);
  store.setItem=previous;s.startNewIntent();assert.equal(s.snapshot().phase,'editable');assert.equal(s.snapshot().input.businessId,'');
  const restored=session(async()=>{throw Error('no request');},store).s;assert.equal(restored.snapshot().phase,'editable');
});
test('known no-write error after partial never unlocks canonical name',async()=>{
  let calls=0;const {s}=session(async()=>++calls===1?json(partial(),409):json({error:'invalid_request'},400));
  await s.submit();s.edit('slug','new-slug');await s.submit();assert.equal(s.snapshot().phase,'partial');s.edit('name','Cannot change');assert.equal(s.snapshot().input.name,'Tienda B');
});
test('actual creation component SSR disables writes without JS; hydration restores before public callbacks',async()=>{
  const store=storage(); const oldWindow=globalThis.window, oldFetch=globalThis.fetch;
  const cryptoDescriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto');
  Object.defineProperty(globalThis,'crypto',{configurable:true,value:{randomUUID:()=>b}});
  globalThis.window={sessionStorage:store,location:{assign(){}}}; let calls=0; globalThis.fetch=async()=>{calls++;return json(ready());};
  try {
    const h=harness('create-store-client.tsx',{accountId:owner,firstStore:true});
    assert.ok(h.find('create-store-submit').props.disabled); assert.ok(h.find('create-store-fields').props.disabled); assert.match(text(h.render()),/Creá tu primera tienda/);
    h.flush(); h.find('create-store-name').props.onChange({target:{value:'Mi tienda'}}); h.find('create-store-slug').props.onChange({target:{value:'mi-tienda'}});
    h.find('create-store-form').props.onSubmit({preventDefault(){}}); h.find('create-store-form').props.onSubmit({preventDefault(){}});
    assert.equal(calls,1); assert.equal(h.find('create-store-fields').props.disabled,true); await tick(); assert.equal(h.find('created-store-link').props.href,`/owner?businessId=${b}`); h.unmount();
  } finally {globalThis.window=oldWindow;globalThis.fetch=oldFetch;Object.defineProperty(globalThis,'crypto',cryptoDescriptor);}
});
test('actual hook root ignores a response after account props change before effects flush',async()=>{
  const oldWindow=globalThis.window, oldFetch=globalThis.fetch; let resolve;const navigations=[];
  globalThis.window={sessionStorage:storage(),location:{assign:id=>navigations.push(id)}};globalThis.fetch=()=>new Promise(r=>resolve=r);
  try {
    const h=harness('create-store-client.tsx',{accountId:owner});h.render();h.flush();
    h.find('create-store-name').props.onChange({target:{value:'Mi tienda'}}); h.find('create-store-slug').props.onChange({target:{value:'mi-tienda'}});
    h.find('create-store-form').props.onSubmit({preventDefault(){}});h.props.accountId=a;h.render();resolve(json(ready()));await tick();assert.deepEqual(navigations,[]);assert.equal(h.find('create-store-submit').props.disabled,true);h.unmount();
  }finally{globalThis.window=oldWindow;globalThis.fetch=oldFetch;}
});
