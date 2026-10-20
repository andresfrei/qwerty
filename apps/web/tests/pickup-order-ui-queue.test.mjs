import assert from 'node:assert/strict';
import test from 'node:test';
import {harness,id,order,text,nodes} from './pickup-order-ui-fixtures.mjs';
test('owner queue read only, empty and all errors clear previous private data',async()=>{
 const old=globalThis.fetch;let response=()=>Response.json({orders:[order]});const calls=[];
 globalThis.fetch=async(url,init)=>{calls.push([url,init]);return response();};
 try{const h=harness('owner/orders/order-queue-client.tsx',{businessId:id});await h.tick();assert.ok(text(h.render()).includes('Ana'));assert.equal(calls[0][0],'/api/business/orders?businessId='+id);for(const status of [401,403,503]){response=()=>Response.json({error:'private provider'},{status});await h.find('queue-refresh').props.onClick();assert.ok(!text(h.render()).includes('Ana'));assert.ok(!text(h.render()).includes('private provider'));}response=()=>Response.json({orders:[]});await h.find('queue-refresh').props.onClick();assert.ok(text(h.render()).includes('No hay pedidos visibles'));assert.equal(h.writes.length,0);assert.ok(calls.every(([,init])=>init.method==='GET'));assert.equal(nodes(h.render()).filter(n=>n.type==='button').length,1);
 }finally{globalThis.fetch=old;}
});
