import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,nodes,text,business,storefront} from './owner-first-store-fixtures.mjs';
test('empty owner has an actual first-business form; partial business resumes draft setup',()=>{
 const empty=harness('first-store-client.tsx');assert.ok(nodes(empty.render()).some(n=>n.type==='form'),'first-business form');
 const partial=harness('first-store-client.tsx',{business});assert.match(text(partial.render()),/dirección/i);
});

test('same-tick double submit writes once; partial step uses server business; unknown freezes with input retained',async()=>{
 const originalFetch=globalThis.fetch,OriginalFormData=globalThis.FormData;
 globalThis.FormData=class {constructor(value){return value;}};
 let resolve,calls=[];
 globalThis.fetch=(path,init)=>{calls.push([path,JSON.parse(init.body)]);return new Promise(r=>resolve=r);};
 try{
  const h=harness('first-store-client.tsx');const form=()=>nodes(h.render()).find(n=>n.type==='form');
  const fields=new Map([['name','Nombre conservado']]);const event={preventDefault(){},currentTarget:fields};
  const pending=form().props.onSubmit(event);await form().props.onSubmit(event);assert.equal(calls.length,1);resolve(Response.json({business}));await pending;
  assert.match(text(h.render()),/Configurá tu tienda/);assert.equal(text(nodes(h.find('first-store-submit')).find(n=>n.props?.className==='async-action-label')),'Crear tienda sin publicar');
  const draftFields=new Map([['displayName','Mi visible'],['slug','mi-visible']]);const saved=form().props.onSubmit({preventDefault(){},currentTarget:draftFields});assert.equal(calls[1][0],`/owner/onboarding?businessId=${business.id}`);assert.deepEqual(calls[1][1],{action:'create_draft',displayName:'Mi visible',slug:'mi-visible'});resolve(Response.json({storefront}));await saved;assert.match(text(h.render()),/Configurar catálogo/);
  const lost=harness('first-store-client.tsx');const submit=nodes(lost.render()).find(n=>n.type==='form').props.onSubmit;
  const operation=submit(event);resolve(Response.json({error:'unknown'},{status:503}));await operation;
  await nodes(lost.render()).find(n=>n.type==='form').props.onSubmit(event);assert.equal(calls.length,3);assert.equal(fields.get('name'),'Nombre conservado');assert.match(text(lost.render()),/solo lectura/);assert.equal(nodes(lost.render()).find(n=>n.type==='fieldset').props.disabled,true);
 }finally{globalThis.fetch=originalFetch;globalThis.FormData=OriginalFormData;}
});
