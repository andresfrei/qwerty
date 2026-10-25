import test from 'node:test';
import assert from 'node:assert/strict';
import {createProfileEditorController,profileIntentKey} from '../app/owner/catalog/catalog-profile-editor.ts';
import {business,item,owner,foreign,standard} from './owner-catalog-configuration-fixtures.mjs';
const scope={accountId:owner,businessId:business,itemId:item};
const row=(version=1,document=standard,is_active=true)=>({business_id:business,item_id:item,version,is_active,document});
const catalog=(profile=null)=>({businessId:business,surchargeMinor:0,items:[{id:item,business_id:business,name:'Synthetic item',price_minor:1200,currency:'ARS',is_available:true}],groups:[],options:[],profiles:profile?[profile]:[]});
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
const ready=profile=>json({capability:'ready',catalog:catalog(profile)});
function fixture() {
 const store=new Map(),calls=[];let read=()=>ready(null),write=()=>json({code:'saved',profile:row()});
 const storage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
 const deps={storage,fetcher:async(path,init)=>{calls.push({path,init});return init.method==='POST'?write():read();},uuid:()=>foreign};
 return {store,storage,calls,deps,setRead:fn=>read=fn,setWrite:fn=>write=fn,create:(s=scope)=>createProfileEditorController(s,deps)};
}
async function loaded(f){const c=f.create();c.restore();await c.load();return c;}
const draft={isActive:true,document:standard};
test('restoration precedes writes; same-tick duplicate persists exact scoped intent then dispatches only once',async()=>{
 const f=fixture();const c=f.create();await c.save();assert.equal(f.calls.length,0);
 c.restore();await c.load();c.edit(draft);
 let finish;f.setWrite(()=>new Promise(r=>finish=r));const first=c.save();const duplicate=c.save();
 assert.equal(c.snapshot().status,'pending');assert.equal(f.calls.filter(c=>c.init.method==='POST').length,1);
 const intent=JSON.parse(f.store.get(profileIntentKey(scope)));assert.deepEqual(intent.scope,scope);assert.deepEqual(intent.payload,{expectedVersion:0,...draft});
 finish(json({code:'saved',profile:row()}));await Promise.all([first,duplicate]);
 assert.equal(c.snapshot().status,'saved');assert.equal(c.snapshot().profile.version,1);
 await c.save();assert.equal(f.calls.filter(c=>c.init.method==='POST').length,1);
 assert.equal(c.adopt(),true);assert.equal(c.snapshot().status,'idle');assert.equal(c.snapshot().profile.version,1);
 await c.save();assert.equal(f.calls.filter(c=>c.init.method==='POST').length,1,'identical draft does not burn a version');
});
test('known rejection keeps draft editable; malformed/lost POST remains frozen',async()=>{
 for(const kind of ['known','lost','malformed']){
  const f=fixture(),c=await loaded(f);c.edit(draft);
  f.setWrite(()=>kind==='known'?json({error:'configuration_rejected'},422):kind==='malformed'?json({code:'saved',profile:row(9)}):Promise.reject(Error('lost')));
  await c.save();assert.equal(c.snapshot().status,kind==='known'?'idle':'unknown');assert.deepEqual(c.snapshot().draft,draft);
  assert.equal(c.edit({isActive:false,document:null}),kind==='known');
  if(kind==='known')assert.equal(f.store.size,0);
 }
});
test('unknown recovery absent or unchanged never unlocks or resends; matching advance achieves, differing advance conflicts',async()=>{
 for(const recovery of ['absent','unchanged','matching','different']){
  const f=fixture();f.setRead(()=>ready(row(4)));const c=await loaded(f);c.edit({isActive:false,document:standard});
  f.setWrite(()=>Promise.reject(Error('lost')));await c.save();
  f.setRead(()=>ready(recovery==='absent'?null:recovery==='unchanged'?row(4):recovery==='matching'?row(5,standard,false):row(6,{schemaVersion:1,kind:'combo',components:[]},false)));
  await c.load();assert.equal(c.snapshot().status,['absent','unchanged'].includes(recovery)?'unknown':recovery==='matching'?'saved':'conflict');
  assert.equal(c.adopt(),['matching','different'].includes(recovery));
  assert.equal(f.calls.filter(c=>c.init.method==='POST').length,1);
  if(recovery==='different')assert.equal(c.snapshot().profile.version,6);
 }
});
test('pending intent survives navigation; restored same account/item remains unknown until observed advance',async()=>{
 const f=fixture(),c=await loaded(f);c.edit(draft);f.setWrite(()=>Promise.reject(Error('lost')));await c.save();c.dispose();
 const restored=f.create();restored.restore();assert.equal(restored.snapshot().status,'unknown');assert.deepEqual(restored.snapshot().draft,draft);
 await restored.save();assert.equal(f.calls.filter(c=>c.init.method==='POST').length,1);
 await restored.load();assert.equal(restored.snapshot().status,'unknown');
 f.setRead(()=>ready(row()));await restored.load();assert.equal(restored.snapshot().status,'saved');assert.equal(restored.adopt(),true);
 restored.edit({isActive:false,document:null});f.setWrite(()=>json({code:'saved',profile:row(2,null,false)}));await restored.save();
 assert.equal(JSON.parse(f.calls.at(-1).init.body).expectedVersion,1);assert.equal(restored.snapshot().profile.version,2);
});
test('corrupt/foreign same-key intent or storage failure cannot dispatch; foreign account/item keys are never restored',async()=>{
 for(const kind of ['corrupt','foreign','get','set']){
  const f=fixture();
  if(kind==='corrupt')f.store.set(profileIntentKey(scope),'not JSON');
  if(kind==='foreign')f.store.set(profileIntentKey(scope),JSON.stringify({version:1,scope:{...scope,accountId:foreign},payload:{expectedVersion:0,...draft}}));
  if(kind==='get')f.storage.getItem=()=>{throw Error('denied');};
  const c=f.create();c.restore();await c.load();c.edit(draft);
  if(kind==='set')f.storage.setItem=()=>{throw Error('full');};
  await c.save();assert.equal(c.snapshot().status,'storage_error',kind);assert.equal(f.calls.filter(c=>c.init.method==='POST').length,0);
 }
 const f=fixture();f.store.set(profileIntentKey({...scope,itemId:foreign}),'foreign invalid');
 const c=await loaded(f);assert.equal(c.snapshot().status,'idle');assert.equal(c.snapshot().profile,null);
});
test('late POST and GET callbacks are dropped after disposal/scope change without touching replacement state or durable intent',async()=>{
 const f=fixture(),old=await loaded(f);old.edit(draft);let finish;
 f.setWrite(()=>new Promise(r=>finish=r));const pending=old.save();old.dispose();
 const fresh=f.create({...scope,accountId:foreign});fresh.restore();assert.equal(fresh.snapshot().status,'loading');
 finish(json({code:'saved',profile:row()}));await pending;assert.notEqual(old.snapshot().status,'saved');assert.equal(fresh.snapshot().profile,null);assert.equal(f.store.size,1);
 let readFinish;f.setRead(()=>new Promise(r=>readFinish=r));const reading=fresh.load();fresh.dispose();readFinish(ready(row()));await reading;assert.equal(fresh.snapshot().profile,null);
});
test('unsupported capability and malformed catalog disable only advanced writes; inactive unknown draft is retained',async()=>{
 for(const capability of ['legacy_only','unavailable','malformed']){
  const f=fixture();f.setRead(()=>capability==='legacy_only'?json({capability}):capability==='unavailable'?json({error:'unavailable'},503):json({capability:'ready',catalog:{}}));
  const c=await loaded(f);assert.equal(c.snapshot().status,capability==='legacy_only'?'legacy_only':'unavailable');assert.equal(c.edit(draft),false);await c.save();assert.equal(f.calls.filter(c=>c.init.method==='POST').length,0);
 }
 const f=fixture();f.setRead(()=>ready(row(8,{future:'preserve'},false)));const c=await loaded(f);
 assert.deepEqual(c.snapshot().draft,{isActive:false,document:{future:'preserve'}});assert.equal(c.snapshot().profile.version,8);
 await c.save();assert.equal(f.calls.filter(c=>c.init.method==='POST').length,0);
});
test('observations never regress the highest seen version and unknown unchanged reads still expose retained controls',async()=>{
 const f=fixture();f.setRead(()=>ready(row(1)));const c=await loaded(f);c.edit({isActive:false,document:null});f.setWrite(()=>Promise.reject(Error('lost')));await c.save();
 c.dispose();const restored=f.create();restored.restore();await restored.load();assert.ok(restored.snapshot().catalog,'unchanged read supplies only display context, not permission to write');assert.equal(restored.snapshot().status,'unknown');
 f.setRead(()=>ready(row(7)));await restored.load();assert.equal(restored.snapshot().status,'conflict');
 f.setRead(()=>ready(row(2,null,false)));await restored.load();assert.equal(restored.snapshot().profile.version,7);assert.equal(restored.snapshot().status,'conflict');
 assert.equal(restored.adopt(),true);assert.equal(restored.snapshot().profile.version,7);
});
test('late old POST cannot settle a new pending operation after read-confirmation and adoption',async()=>{
 const f=fixture(),c=await loaded(f);c.edit(draft);let oldFinish,newFinish;
 f.setWrite(()=>new Promise(r=>oldFinish=r));const old=c.save();
 f.setRead(()=>ready(row()));await c.load();assert.equal(c.adopt(),true);c.edit({isActive:false,document:null});
 f.setWrite(()=>new Promise(r=>newFinish=r));const next=c.save();assert.equal(c.snapshot().status,'pending');
 oldFinish(json({code:'saved',profile:row()}));await old;assert.equal(c.snapshot().status,'pending');assert.equal(c.snapshot().profile.version,1);
 newFinish(json({code:'saved',profile:row(2,null,false)}));await next;assert.equal(c.snapshot().status,'saved');assert.equal(c.snapshot().profile.version,2);
});
test('a fresh read while editing never silently advances CAS over another writer',async()=>{
 const f=fixture(),c=await loaded(f);c.edit(draft);f.setRead(()=>ready(row(3,null,false)));await c.load();
 assert.equal(c.snapshot().status,'conflict');assert.deepEqual(c.snapshot().draft,draft);await c.save();assert.equal(f.calls.filter(c=>c.init.method==='POST').length,0);assert.equal(c.adopt(),true);assert.equal(c.snapshot().profile.version,3);
});
test('component selection independently reads a scoped child and refuses self, nested, foreign or mismatched-currency children before changing the draft',async()=>{
 const other='55555555-5555-4555-8555-555555555555';
 for(const kind of ['nested','foreign','currency','valid']){
  const f=fixture(),c=await loaded(f);c.edit({isActive:true,document:{schemaVersion:1,kind:'combo',components:[]}});
  const before=f.calls.length;assert.equal(await c.addComponent(item),false);assert.equal(f.calls.length,before);
  const child={id:foreign,business_id:kind==='foreign'?other:business,name:'Child',price_minor:20,currency:kind==='currency'?'USD':'ARS',is_available:false};
  const leaf={...child,id:other,business_id:business,currency:'ARS'};
  const nested={schemaVersion:1,kind:'combo',components:[{componentId:item,itemId:other,quantity:1,order:0,fixedGroupPicks:[],allowedOptions:[]}]};
  const childCatalog={businessId:business,surchargeMinor:0,items:kind==='nested'?[child,leaf]:[child],groups:[],options:[],profiles:kind==='nested'?[{business_id:business,item_id:foreign,version:1,is_active:true,document:nested}]:[]};
  f.setRead(()=>json({capability:'ready',catalog:childCatalog}));
  assert.equal(await c.addComponent(foreign),kind==='valid');assert.equal(c.snapshot().draft.document.components.length,kind==='valid'?1:0);
  if(kind==='valid'){const component=c.snapshot().draft.document.components[0];assert.equal(component.componentId,foreign);assert.equal(component.itemId,foreign);}
  assert.equal(f.calls.filter(c=>c.init.method==='POST').length,0);
 }
});
test('version ceiling is never wrapped or persisted as an invalid next CAS attempt',async()=>{
 const f=fixture();f.setRead(()=>ready(row(Number.MAX_SAFE_INTEGER)));const c=await loaded(f);c.edit({isActive:false,document:null});await c.save();assert.equal(f.calls.filter(c=>c.init.method==='POST').length,0);assert.equal(f.store.size,0);assert.equal(c.snapshot().profile.version,Number.MAX_SAFE_INTEGER);
});
test('conflict requires a fresh observed version and explicit adoption; known saved version is retained across reopening',async()=>{
 const f=fixture(),c=await loaded(f);c.edit(draft);f.setWrite(()=>json({error:'configuration_version_conflict'},409));await c.save();
 assert.equal(c.snapshot().status,'conflict');assert.equal(c.adopt(),false);await c.load();assert.equal(c.adopt(),false);
 f.setRead(()=>ready(row(3,null,false)));await c.load();assert.equal(c.snapshot().status,'conflict');assert.equal(c.adopt(),true);assert.equal(c.snapshot().profile.version,3);
 c.edit(draft);f.setWrite(()=>json({code:'saved',profile:row(4)}));await c.save();assert.equal(c.snapshot().profile.version,4);
 c.dispose();const reopened=f.create();reopened.restore();f.setRead(()=>ready(row(4)));await reopened.load();assert.equal(reopened.snapshot().status,'saved');assert.equal(reopened.snapshot().profile.version,4);
});
