import test from 'node:test';
import assert from 'node:assert/strict';
import {moneyMinor,moneyText,catalogFormPayload,sendOwnerMutation,suggestedSlug} from '../app/owner/catalog/catalog-editor.ts';
import {harness,nodes,text,category,item,group,option,storefront,id} from './owner-first-store-fixtures.mjs';
const form=value=>new Map(Object.entries(value));
test('decimal text conversion, safe integer boundaries, ISO currencies and existing action contracts',()=>{
 for(const[value,expected]of [['0',0],['1,23',123],['0.29',29],['90071992547409.91',Number.MAX_SAFE_INTEGER]]){assert.equal(moneyMinor(value),expected);assert.equal(moneyMinor(moneyText(expected)),expected);}
 for(const value of ['-1','1.234','1e2','Infinity','','90071992547409.92'])assert.ok(Number.isNaN(moneyMinor(value)),value);
 assert.equal(suggestedSlug('Mi Pizzería & Café'),'mi-pizzeria-cafe');assert.equal(suggestedSlug('a'.repeat(100)).length,63);
 const product={action:'create_product',categoryId:id,name:'Pizza',description:'',priceMinor:'0,29',currency:'USD',isAvailable:'false',sortOrder:'1'};
 assert.deepEqual(catalogFormPayload(form(product)),{...product,priceMinor:29,isAvailable:false,sortOrder:1});
 assert.equal(catalogFormPayload(form({...product,currency:'usd'})),null);assert.equal(catalogFormPayload(form({...product,priceMinor:'-1'})),null);
 const quantity=catalogFormPayload(form({action:'create_option_group',itemId:id,name:'Docena',selectionMode:'quantity',minSelect:'12',maxSelect:'12',sortOrder:'0'}));assert.equal(quantity.minSelect,12);assert.equal(quantity.maxSelect,12);
 assert.equal(catalogFormPayload(form({...quantity,minSelect:'13',maxSelect:'12',sortOrder:'0'})),null);
});
test('transport is same-origin/no-store/redirect-error; explicit errors versus ambiguous outcomes',async()=>{
 let init;
 const saved=await sendOwnerMutation('/owner/catalog/actions',{action:'set_published',isPublished:true},async(path,options)=>{assert.equal(path,'/owner/catalog/actions');init=options;return Response.json({ok:true});});assert.equal(saved.kind,'saved');assert.equal(init.credentials,'same-origin');assert.equal(init.cache,'no-store');assert.equal(init.redirect,'error');
 for(const response of [()=>{throw new Error('network');},()=>Response.json({ok:false}),()=>Response.json({error:'unavailable'},{status:503}),()=>new Response('not json')])assert.equal((await sendOwnerMutation('/owner/catalog/actions',{},response)).kind,'unknown');
 const conflict=await sendOwnerMutation('/owner/onboarding',{},async()=>Response.json({error:'slug_unavailable'},{status:409}));assert.equal(conflict.kind,'rejected');assert.equal(conflict.message,'Esa dirección no está disponible');
});
test('actual React submit callbacks preserve input on rejection and lock all forms after unknown',async()=>{
 const originalFetch=globalThis.fetch,OriginalFormData=globalThis.FormData;globalThis.FormData=class{constructor(value){return value;}};
 let calls=0,resolve;globalThis.fetch=()=>{calls++;return new Promise(r=>resolve=r);};
 try{
  const h=harness('catalog/catalog-editor-client.tsx',{categories:[category],items:[item],groups:[group],options:[option],storefront,surchargeMinor:0});
  const formNode=()=>nodes(h.render()).find(n=>n.type==='form'&&n.props['aria-label']==='Nueva categoría');const fields=form({action:'create_category',name:'Conservar',sortOrder:'0'}),event={preventDefault(){},currentTarget:fields};
  const pending=formNode().props.onSubmit(event);await formNode().props.onSubmit(event);assert.equal(calls,1);resolve(Response.json({error:'invalid_name'},{status:400}));await pending;assert.equal(fields.get('name'),'Conservar');assert.match(text(h.render()),/Revisá/);
  const next=formNode().props.onSubmit(event);resolve(Response.json({error:'unavailable'},{status:503}));await next;await formNode().props.onSubmit(event);assert.equal(calls,2);assert.ok(nodes(h.render()).filter(n=>n.type==='fieldset').every(n=>n.props.disabled));assert.match(text(h.render()),/No sabemos si se guardó/);
 }finally{globalThis.fetch=originalFetch;globalThis.FormData=OriginalFormData;}
});
