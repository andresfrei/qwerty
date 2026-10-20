import assert from 'node:assert/strict';
import test from 'node:test';
import {harness,id,order,text,nodes} from './pickup-order-ui-fixtures.mjs';
test('private tracking uses known-ID only, no cart clear or Auth; stale data hidden after failure',async()=>{
 const old=globalThis.fetch,calls=[];let fail=false;
 globalThis.fetch=async(url,init)=>{calls.push([url,init]);return fail?Response.json({error:'Session required'},{status:401}):Response.json({order});};
 try{const h=harness('store/order-status-client.tsx',{slug:'unpublished',id});await h.tick();assert.ok(text(h.render()).includes('Ana'));assert.equal(calls[0][0],'/api/checkout/orders/'+id);assert.equal(calls[0][1].method,'GET');assert.equal(h.writes.length,0);fail=true;await h.find('order-refresh').props.onClick();assert.ok(!text(h.render()).includes('Ana'));assert.ok(text(h.render()).includes('sesión original'));assert.equal(h.writes.length,0);assert.ok(!nodes(h.render()).some(n=>n.type==='input'));
 }finally{globalThis.fetch=old;}
});
test('recovery without reference never requests; with reference uses scoped GET even unpublished',async()=>{
 const old=globalThis.fetch,calls=[];globalThis.fetch=async(url,init)=>{calls.push([url,init]);return Response.json({order});};
 try{const h=harness('store/order-status-client.tsx',{slug:'unpublished'});await h.tick();assert.equal(calls.length,0);assert.ok(text(h.render()).includes('referencia'));
 const map=new Map([['qwerty:pickup:v1:unpublished',JSON.stringify({businessId:id,slug:'unpublished',requestId:id})]]);const r=harness('store/order-status-client.tsx',{slug:'unpublished'},map);assert.equal(calls.length,0);await r.find('order-refresh').props.onClick();assert.equal(calls[0][0],'/api/checkout/orders?slug=unpublished&requestId='+id);assert.ok(text(r.render()).includes('Ana'));assert.equal(r.writes.length,0);
 }finally{globalThis.fetch=old;}
});
