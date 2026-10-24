import assert from 'node:assert/strict';
import test from 'node:test';
import {harness,load,nodes,text,tick,a,b,business} from './owner-dashboard-fixtures.test.mjs';
const event=fields=>({preventDefault(){},currentTarget:new Map(Object.entries(fields))});
function transport(t){const old=globalThis.fetch,fd=globalThis.FormData;const calls=[],pending=[];globalThis.FormData=class{constructor(v){return v;}};globalThis.fetch=(url,init)=>{calls.push({url,...init});return new Promise(resolve=>pending.push(resolve));};t.after(()=>{globalThis.fetch=old;globalThis.FormData=fd;});return{calls,reply:r=>pending.shift()(r)};}
const form=h=>nodes(h.render()).find(n=>n.type==='form');
const buttons=h=>nodes(h.render()).filter(n=>n.type==='button');
const id='44444444-4444-4444-8444-444444444444';
const category={id,name:'Carta',sort_order:0},item={id,category_id:id,name:'Producto',description:null,price_minor:1,currency:'ARS',is_available:true,sort_order:0};
const group={id,item_id:id,name:'Grupo',selection_mode:'distinct',min_select:1,max_select:1,sort_order:0},option={id,group_id:id,name:'Opción',price_delta_minor:0,is_available:true,sort_order:0};
const props={business,categories:[category],items:[item],groups:[group],options:[option],storefront:{slug:'b',display_name:'B',is_published:true},surchargeMinor:0};
const cases=[
 ['create_category',{name:'Carta',sortOrder:'0'}],['rename_category',{categoryId:id,name:'Otra'}],['reorder_category',{categoryId:id,sortOrder:'1'}],
 ['create_product',{categoryId:id,name:'Producto',description:'',priceMinor:'1.23',currency:'ARS',isAvailable:'false',sortOrder:'0'}],
 ['update_product',{itemId:id,categoryId:id,name:'Producto',description:'',priceMinor:'1.23',currency:'ARS',isAvailable:'false',sortOrder:'0'}],
 ['create_option_group',{itemId:id,name:'Grupo',selectionMode:'distinct',minSelect:'1',maxSelect:'2',sortOrder:'0'}],
 ['update_option_group',{groupId:id,name:'Grupo',selectionMode:'distinct',minSelect:'1',maxSelect:'2',sortOrder:'0'}],
 ['create_option',{groupId:id,name:'Opción',priceDeltaMinor:'0',isAvailable:'false',sortOrder:'0'}],
 ['update_option',{optionId:id,name:'Opción',priceDeltaMinor:'0',isAvailable:'false',sortOrder:'0'}],
 ['set_two_flavor_surcharge',{twoFlavorSurchargeMinor:'1.23'}],['set_published',{isPublished:'false'}],
];
for(const[action,fields]of cases)test(`catalog selected B ${action}, correction and settled locks`,async t=>{
 const tr=transport(t),h=harness('catalog/catalog-editor-client.tsx',props);h.render();h.flush();
 const selected=()=>nodes(h.render()).find(n=>n.type==='form'&&nodes(n).some(i=>i.type==='input'&&i.props.name==='action'&&i.props.value===action));
 const e=event({action,...fields}),callback=selected().props.onSubmit;
 const p=callback(e);await callback(e);assert.equal(tr.calls.length,1);assert.equal(tr.calls[0].url,`/owner/catalog/actions?businessId=${b}`);
 const payload=JSON.parse(tr.calls[0].body);assert.equal('businessId'in payload,false);if(action==='set_published')assert.equal(payload.isPublished,false);
 assert.equal(buttons(h).filter(n=>n.props['aria-busy']).length,1);assert.ok(buttons(h).every(n=>n.props.disabled));
 tr.reply(Response.json({error:'invalid_request'},{status:400}));await p;assert.ok(buttons(h).every(n=>!n.props.disabled));
 const retry=selected().props.onSubmit(e);assert.equal(tr.calls[1].url,tr.calls[0].url);assert.equal(tr.calls[1].body,tr.calls[0].body);tr.reply(Response.json({ok:true}));await retry;
 assert.ok(buttons(h).every(n=>n.props.disabled&&!n.props['aria-busy']));assert.ok(nodes(h.render()).some(n=>n.type==='a'&&n.props.href===`/owner/catalog?businessId=${b}`));
});
test('known missing draft posts only selected create_draft and refreshes same Tienda',async t=>{
 const tr=transport(t),h=harness('first-store-client.tsx',{business});h.render();h.flush();
 const p=form(h).props.onSubmit(event({displayName:'B',slug:'tienda-b'}));assert.equal(tr.calls[0].url,`/owner/onboarding?businessId=${b}`);
 assert.deepEqual(JSON.parse(tr.calls[0].body),{action:'create_draft',displayName:'B',slug:'tienda-b'});
 tr.reply(Response.json({error:'outcome_unknown'},{status:503}));await p;
 assert.ok(nodes(h.render()).some(n=>n.type==='a'&&n.props.href===`/owner/store?businessId=${b}`));assert.match(text(h.render()),/tienda/i);assert.doesNotMatch(text(h.render()),/vidriera/i);
});
test('legacy null-business creation has no selected create_business',async t=>{
 const tr=transport(t),h=harness('first-store-client.tsx',{});h.render();h.flush();const p=form(h).props.onSubmit(event({name:'Legacy'}));
 assert.equal(tr.calls[0].url,'/owner/onboarding');assert.deepEqual(JSON.parse(tr.calls[0].body),{action:'create_business',name:'Legacy'});tr.reply(Response.json({error:'invalid_request'},{status:400}));await p;
});
for(const businessId of [undefined,b])for(const operation of ['replace','detach'])test(`photo ${operation} selection ${businessId??'omitted'} preserves CAS bytes and ignores late cleanup`,async t=>{
 const tr=transport(t);let refreshes=0;const p={itemId:id,itemName:'Producto',photoPath:'old.webp',photoVersion:'9007199254740993',businessId};
 const h=harness('catalog/photo-editor-client.tsx',p,{'next/navigation':{useRouter:()=>({refresh(){refreshes++;}})}},'PhotoEditor');h.render();h.flush();
 const image=new Blob(['bytes']);const input=nodes(h.render()).find(n=>n.type==='input');input.props.ref.current={files:[image],value:'keep.png'};
 const callback=buttons(h)[operation==='replace'?0:1].props.onClick,request=callback();await callback();assert.equal(tr.calls.length,1);
 assert.equal(tr.calls[0].url,`/owner/catalog/items/${id}/photo${businessId?`?businessId=${b}`:''}`);assert.equal(tr.calls[0].headers['x-photo-version'],'9007199254740993');assert.equal(tr.calls[0].method,operation==='replace'?'PUT':'DELETE');assert.equal(tr.calls[0].body,operation==='replace'?image:undefined);
 h.unmount();tr.reply(Response.json({photoPath:null,photoVersion:'9007199254740994'}));await request;assert.equal(refreshes,0);assert.equal(input.props.ref.current.value,'keep.png');
});
for(const file of ['catalog/catalog-editor-client.tsx','first-store-client.tsx'])test(`${file} unmounted A callback cannot settle B or saved UI`,async t=>{
 const tr=transport(t),h=harness(file,file.startsWith('catalog')?{...props,business:{id:a,name:'A'}}:{business:{id:a,name:'A'}});h.render();h.flush();
 const p=form(h).props.onSubmit(event(file.startsWith('catalog')?{action:'set_published',isPublished:'false'}:{displayName:'A',slug:'a'}));h.unmount();
 tr.reply(Response.json(file.startsWith('catalog')?{ok:true}:{storefront:{slug:'a',display_name:'A',is_published:false}}));await p;
 assert.doesNotMatch(text(h.render()),/Cambio guardado|Tienda lista/);
});
test('orders back link remains selected B and requests only GET queue, late A rows ignored',async t=>{
 const tr=transport(t),p={businessId:a},h=harness('orders/order-queue-client.tsx',p);h.render();h.flush();p.businessId=b;h.render();h.flush();
 assert.ok(nodes(h.render()).some(n=>n.type==='a'&&n.props.href===`/owner/catalog?businessId=${b}`));assert.equal(tr.calls.length,2);assert.ok(tr.calls.every(c=>!c.method||c.method==='GET'));
 tr.reply(Response.json({orders:[]}));await tick();assert.doesNotMatch(text(h.render()),/No hay pedidos visibles/);h.unmount();tr.reply(Response.json({orders:[]}));await tick();
});
test('photo dependency cleanup ignores stale A response while B can issue its own exact CAS',async t=>{
 const tr=transport(t);let refreshes=0;const props={businessId:a,itemId:id,itemName:'Producto',photoPath:'old.webp',photoVersion:'7'};
 const h=harness('catalog/photo-editor-client.tsx',props,{'next/navigation':{useRouter:()=>({refresh(){refreshes++;}})}},'PhotoEditor');h.render();h.flush();
 const old=buttons(h)[1].props.onClick();props.businessId=b;h.render();h.flush();tr.reply(Response.json({photoPath:null,photoVersion:'8'}));await old;assert.equal(refreshes,0);
 // Production remounts B, rather than reusing A's pending/version locks.
 const fresh=harness('catalog/photo-editor-client.tsx',{...props}, {'next/navigation':{useRouter:()=>({refresh(){refreshes++;}})}},'PhotoEditor');fresh.render();fresh.flush();
 const next=buttons(fresh)[1].props.onClick();assert.equal(tr.calls[1].url,`/owner/catalog/items/${id}/photo?businessId=${b}`);assert.equal(tr.calls[1].headers['x-photo-version'],'7');tr.reply(Response.json({error:'invalid_image'},{status:422}));await next;assert.equal(refreshes,0);
});
test('selected draft public callback reaches real handler and creates zero businesses',async t=>{
 const old=globalThis.fetch,fd=globalThis.FormData;t.after(()=>{globalThis.fetch=old;globalThis.FormData=fd;});globalThis.FormData=class{constructor(v){return v;}};
 const {handleOnboarding}=load('apps/web/app/owner/onboarding/owner-onboarding.ts');const writes=[];
 const gateway={async confirmedUser(){return a;},async firstBusiness(ownerId,selected){assert.equal(ownerId,a);assert.equal(selected,b);return business;},async storefront(selected){assert.equal(selected,b);return null;},async createBusiness(){throw Error('must not create a business');},async createDraft(selected,display_name,slug){writes.push({selected,display_name,slug});return{display_name,slug,is_published:false};}};
 const origin='https://owner.fixture.invalid';globalThis.fetch=(path,init)=>handleOnboarding(new Request(origin+path,{...init,headers:{...init.headers,host:'owner.fixture.invalid',origin}}),{trustedOrigin:origin,createGateway:async()=>gateway});
 const h=harness('first-store-client.tsx',{business});h.render();h.flush();await form(h).props.onSubmit(event({displayName:'Tienda B',slug:'tienda-b'}));
 assert.deepEqual(writes,[{selected:b,display_name:'Tienda B',slug:'tienda-b'}]);assert.match(text(h.render()),/Tienda lista/);assert.ok(nodes(h.render()).some(n=>n.type==='a'&&n.props.href===`/owner/catalog?businessId=${b}`));
});
for(const selected of [a,b,'99999999-9999-4999-8999-999999999999'])test(`selected catalog public callback and handler resolve only owned ${selected}`,async t=>{
 const old=globalThis.fetch,fd=globalThis.FormData;t.after(()=>{globalThis.fetch=old;globalThis.FormData=fd;});globalThis.FormData=class{constructor(v){return v;}};
 const {handleCatalogPost}=load('apps/web/app/owner/catalog/catalog-actions.ts');const writes=[];
 const gateway={async ownerBusinessId(id){return [a,b].includes(id)?id:null;},async write(w){writes.push(w);}};
 const origin='https://owner.fixture.invalid';globalThis.fetch=(path,init)=>handleCatalogPost(new Request(origin+path,{...init,headers:{...init.headers,host:'owner.fixture.invalid',origin}}),{trustedOrigin:origin,createGateway:async()=>gateway});
 const h=harness('catalog/catalog-editor-client.tsx',{...props,business:{id:selected,name:'Selected'}});h.render();h.flush();await form(h).props.onSubmit(event({action:'set_published',isPublished:'false'}));
 if([a,b].includes(selected)){assert.equal(writes.length,1);assert.equal(writes[0].businessId,selected);assert.equal(writes[0].isPublished,false);}else{assert.equal(writes.length,0);assert.doesNotMatch(text(h.render()),/Cambio guardado/);}
});
