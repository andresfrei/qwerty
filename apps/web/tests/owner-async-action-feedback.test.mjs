import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,nodes,text,business,storefront,category,item,group,option,id} from './owner-first-store-fixtures.mjs';

const props={categories:[category],items:[item],groups:[group],options:[option],storefront,surchargeMinor:50};
const event=fields=>({preventDefault(){},currentTarget:new Map(Object.entries(fields))});
const forms=h=>nodes(h.render()).filter(n=>n.type==='form');
const buttons=h=>nodes(h.render()).filter(n=>n.type==='button');
const label=b=>text(nodes(b).find(n=>n.props?.className==='async-action-label')??b);
function pending(button,name) {
 assert.equal(label(button),name);
 assert.equal(button.props.disabled,true);
 assert.equal(button.props['aria-busy'],true);
 assert.equal(nodes(button).filter(n=>n.props?.className==='async-action-spinner').length,1);
}
function deferredTransport(t) {
 const oldFetch=globalThis.fetch,oldData=globalThis.FormData;
 const calls=[];let resolve,reject;
 globalThis.FormData=class{constructor(value){return value;}};
 globalThis.fetch=(url,init)=>{calls.push({url,...init});return new Promise((yes,no)=>{resolve=yes;reject=no;});};
 t.after(()=>{globalThis.fetch=oldFetch;globalThis.FormData=oldData;});
 return {calls,respond:r=>resolve(r),fail:()=>reject(new Error('synthetic response loss'))};
}

for(const [name,initial,fields,payload,pendingName] of [
 ['business',{}, {name:'Nombre conservado'},{action:'create_business',name:'Nombre conservado'},'Creando negocio…'],
 ['storefront',{business},{displayName:'Mi visible',slug:'mi-visible'},{action:'create_draft',displayName:'Mi visible',slug:'mi-visible'},'Creando vidriera…'],
]) test(`setup ${name}: initiating feedback, same-tick guard, denial retry and unknown retention`,async t=>{
 const transport=deferredTransport(t),h=harness('first-store-client.tsx',initial),e=event(fields);
 const callback=forms(h)[0].props.onSubmit;
 const operation=callback(e);await callback(e);
 assert.equal(transport.calls.length,1);pending(buttons(h)[0],pendingName);
 assert.equal(nodes(h.render()).find(n=>n.type==='fieldset').props.disabled,true);
 assert.deepEqual(JSON.parse(transport.calls[0].body),payload);
 assert.equal(transport.calls[0].url,'/owner/onboarding');
 transport.respond(Response.json({error:'invalid_request'},{status:400}));await operation;
 assert.equal(nodes(h.render()).find(n=>n.type==='fieldset').props.disabled,false);
 assert.deepEqual(Object.fromEntries(e.currentTarget),fields);
 const retry=forms(h)[0].props.onSubmit(e);transport.fail();await retry;
 assert.equal(buttons(h)[0].props['aria-busy'],false);
 assert.equal(buttons(h)[0].props.disabled,true);
 await forms(h)[0].props.onSubmit(e);assert.equal(transport.calls.length,2);
 const refresh=nodes(h.render()).find(n=>n.type==='a'&&n.props.href==='/owner');
 assert.ok(refresh);assert.equal(refresh.props.onClick,undefined);
 assert.deepEqual(Object.fromEntries(e.currentTarget),fields);
});

const product={categoryId:id,name:'Producto',description:'Conservar',priceMinor:'0,29',currency:'EUR',isAvailable:'false',sortOrder:'2'};
const productPayload={...product,priceMinor:29,isAvailable:false,sortOrder:2};
const groupFields={name:'Docena',selectionMode:'quantity',minSelect:'12',maxSelect:'12',sortOrder:'1'};
const groupPayload={...groupFields,minSelect:12,maxSelect:12,sortOrder:1};
const optionFields={name:'Gusto',priceDeltaMinor:'1.25',isAvailable:'false',sortOrder:'3'};
const optionPayload={...optionFields,priceDeltaMinor:125,isAvailable:false,sortOrder:3};
export const catalogCases=[
 ['Nueva categoría',{action:'create_category',name:'Carta',sortOrder:'0'},{action:'create_category',name:'Carta',sortOrder:0},'Creando categoría…'],
 ['Nombre: Carta ilustrativa',{action:'rename_category',categoryId:id,name:'Carta nueva'},{action:'rename_category',categoryId:id,name:'Carta nueva'},'Guardando categoría…'],
 ['Orden: Carta ilustrativa',{action:'reorder_category',categoryId:id,sortOrder:'3'},{action:'reorder_category',categoryId:id,sortOrder:3},'Guardando orden…'],
 ['Nuevo producto',{action:'create_product',...product},{action:'create_product',...productPayload},'Creando producto…'],
 ['Editar: Pizza ilustrativa',{action:'update_product',itemId:id,...product},{action:'update_product',itemId:id,...productPayload},'Guardando producto…'],
 ['Nuevo grupo: Pizza ilustrativa',{action:'create_option_group',itemId:id,...groupFields},{action:'create_option_group',itemId:id,...groupPayload},'Creando grupo…'],
 ['Editar grupo: Gustos',{action:'update_option_group',groupId:id,...groupFields},{action:'update_option_group',groupId:id,...groupPayload},'Guardando grupo…'],
 ['Nueva opción: Gustos',{action:'create_option',groupId:id,...optionFields},{action:'create_option',groupId:id,...optionPayload},'Creando opción…'],
 ['Editar opción: Muzzarella',{action:'update_option',optionId:id,...optionFields},{action:'update_option',optionId:id,...optionPayload},'Guardando opción…'],
 ['Recargo fijo por dos gustos',{action:'set_two_flavor_surcharge',twoFlavorSurchargeMinor:'1,23'},{action:'set_two_flavor_surcharge',twoFlavorSurchargeMinor:123},'Guardando recargo…'],
 ['Publicación',{action:'set_published',isPublished:'true'},{action:'set_published',isPublished:true},'Publicando tienda…'],
];
for(const [title,fields,payload,pendingName] of catalogCases) test(`catalog ${fields.action}: single initiating spinner, exact payload and shared outcome lock`,async t=>{
 const transport=deferredTransport(t),h=harness('catalog/catalog-editor-client.tsx',props),e=event(fields);
 const form=()=>forms(h).find(n=>n.props['aria-label']===title);
 const callback=form().props.onSubmit,operation=callback(e);
 await callback(e);await forms(h).find(n=>n.props['aria-label']==='Nueva categoría').props.onSubmit(event(catalogCases[0][1]));
 assert.equal(transport.calls.length,1);
 assert.deepEqual(JSON.parse(transport.calls[0].body),payload);
 assert.equal(transport.calls[0].url,'/owner/catalog/actions');
 pending(nodes(form()).find(n=>n.type==='button'),pendingName);
 assert.equal(buttons(h).filter(b=>b.props['aria-busy']).length,1);
 assert.ok(buttons(h).every(b=>b.props.disabled));
 assert.ok(nodes(h.render()).filter(n=>n.type==='fieldset').every(n=>n.props.disabled));
 transport.respond(Response.json({error:'invalid_request'},{status:400}));await operation;
 assert.ok(buttons(h).every(b=>!b.props.disabled));
 assert.deepEqual(Object.fromEntries(e.currentTarget),fields);
 const retry=form().props.onSubmit(e);transport.respond(Response.json({ok:true}));await retry;
 assert.ok(buttons(h).every(b=>b.props.disabled&&!b.props['aria-busy']));
 await form().props.onSubmit(e);assert.equal(transport.calls.length,2);
 const link=nodes(h.render()).find(n=>n.type==='a'&&n.props.href==='/owner/catalog');
 assert.ok(link);assert.equal(link.props.onClick,undefined);assert.equal(transport.calls.length,2);
});

test('catalog unknown remains locked without a spinner; local validation makes no request',async t=>{
 const transport=deferredTransport(t),h=harness('catalog/catalog-editor-client.tsx',props);
 const form=forms(h).find(n=>n.props['aria-label']==='Nuevo producto');
 const before=transport.calls.length;
 const operation=form.props.onSubmit(event({action:'create_product',...product,priceMinor:'bad'}));
 await operation;assert.equal(transport.calls.length,before);
 const request=form.props.onSubmit(event({action:'create_product',...product}));
 transport.fail();await request;
 assert.ok(buttons(h).every(b=>b.props.disabled&&!b.props['aria-busy']));
 await forms(h).find(n=>n.props['aria-label']==='Nuevo producto').props.onSubmit(event({action:'create_product',...product}));assert.equal(transport.calls.length,1);
 assert.match(text(h.render()),/solo lectura/);
});

for(const operation of ['replace','detach']) test(`photo ${operation}: immediate guard, CAS bytes, conflict disabling, denial retry and uncertain read recovery`,async t=>{
 const transport=deferredTransport(t);let refreshes=0;
 const h=harness('catalog/photo-editor-client.tsx',{itemId:id,itemName:item.name,photoPath:'existing.webp',photoVersion:'9007199254740993'}, {'next/navigation':{useRouter:()=>({refresh(){refreshes++;}})}},'PhotoEditor');
 const image=new Blob(['fictional bytes'],{type:'image/png'});
 const file=()=>nodes(h.render()).find(n=>n.type==='input'&&n.props.type==='file');
 file().props.ref.current={files:[image],value:'selected.png'};
 const index=operation==='replace'?0:1;
 const callback=buttons(h)[index].props.onClick;
 const request=callback();const duplicate=callback();const conflicting=buttons(h)[1-index].props.onClick();
 // Do not await a duplicate callback: the RED implementation starts another unresolved request.
 assert.equal(transport.calls.length,1,'same-tick callbacks share one ref lock');
 await duplicate;await conflicting;
 pending(buttons(h)[index],operation==='replace'?'Adjuntando foto…':'Quitando foto…');
 assert.equal(buttons(h)[1-index].props['aria-busy'],false);
 assert.equal(buttons(h)[1-index].props.disabled,true);assert.equal(file().props.disabled,true);
 const call=transport.calls[0];assert.equal(call.url,`/owner/catalog/items/${id}/photo`);
 assert.equal(call.method,operation==='replace'?'PUT':'DELETE');
 assert.deepEqual(call.headers,operation==='replace'?{'x-photo-version':'9007199254740993','content-type':'image/webp'}:{'x-photo-version':'9007199254740993'});
 assert.equal(call.body,operation==='replace'?image:undefined);
 transport.respond(Response.json({error:'invalid_image'},{status:422}));await request;
 assert.equal(file().props.ref.current.value,'selected.png');assert.equal(file().props.disabled,false);assert.equal(refreshes,0);
 const retry=buttons(h)[index].props.onClick();transport.fail();await retry;
 assert.equal(file().props.ref.current.value,'selected.png');assert.equal(file().props.disabled,true);
 assert.ok(buttons(h).every(b=>b.props.disabled&&!b.props['aria-busy']));
 assert.match(text(h.render()),/No sabemos si/);
 await buttons(h)[index].props.onClick();assert.equal(transport.calls.length,2);
 const link=nodes(h.render()).find(n=>n.type==='a'&&n.props.href==='/owner/catalog');
 assert.ok(link);assert.equal(link.props.onClick,undefined);assert.equal(refreshes,0);
});

for(const response of [()=>Response.json({photoPath:'new.webp',photoVersion:'8'}),()=>Response.json({error:'conflict'},{status:409}),()=>Response.json({error:'unavailable'},{status:503}),()=>Response.json({error:'invalid_image'},{status:503}),()=>Response.json({})]) test('photo success/conflict/unknown never reuse a stale version after response',async t=>{
 const transport=deferredTransport(t);let refreshes=0;
 const h=harness('catalog/photo-editor-client.tsx',{itemId:id,itemName:item.name,photoPath:'old.webp',photoVersion:'7'}, {'next/navigation':{useRouter:()=>({refresh(){refreshes++;}})}},'PhotoEditor');
 const request=buttons(h)[1].props.onClick(),result=response();transport.respond(result);await request;
 assert.ok(buttons(h).every(b=>b.props.disabled&&!b.props['aria-busy']));
 const duplicate=buttons(h)[1].props.onClick();assert.equal(transport.calls.length,1);await duplicate;
 assert.equal(refreshes,result.status===503||text(h.render()).includes('No sabemos si')?0:1);
});

test('photo local file validation has no loader; refreshed version permits the next CAS write',async t=>{
 const transport=deferredTransport(t);
 const props={itemId:id,itemName:item.name,photoPath:'old.webp',photoVersion:'7'};
 const h=harness('catalog/photo-editor-client.tsx',props,{'next/navigation':{useRouter:()=>({refresh(){}})}},'PhotoEditor');
 await buttons(h)[0].props.onClick();assert.equal(transport.calls.length,0);
 assert.ok(buttons(h).every(b=>!b.props['aria-busy']&&!b.props.disabled));
 const request=buttons(h)[1].props.onClick();transport.respond(Response.json({photoPath:null,photoVersion:'8'}));await request;
 assert.ok(buttons(h).every(b=>b.props.disabled));
 props.photoVersion='8';props.photoPath=null;
 assert.ok(buttons(h).every(b=>!b.props.disabled));
 const file=nodes(h.render()).find(n=>n.type==='input');file.props.ref.current={files:[new Blob(['next'])],value:'next.png'};
 const next=buttons(h)[0].props.onClick();assert.equal(transport.calls[1].headers['x-photo-version'],'8');
 transport.respond(Response.json({error:'invalid_image'},{status:422}));await next;
});

test('unpublishing uses its own pending label and preserves the false payload',async t=>{
 const transport=deferredTransport(t),h=harness('catalog/catalog-editor-client.tsx',{...props,storefront:{...storefront,is_published:true}});
 const form=forms(h).find(n=>n.props['aria-label']==='Publicación');
 const request=form.props.onSubmit(event({action:'set_published',isPublished:'false'}));
 pending(buttons(h)[0],'Dejando de publicar…');
 assert.deepEqual(JSON.parse(transport.calls[0].body),{action:'set_published',isPublished:false});
 transport.respond(Response.json({ok:true}));await request;
 assert.ok(buttons(h).every(b=>b.props.disabled&&!b.props['aria-busy']));
});
