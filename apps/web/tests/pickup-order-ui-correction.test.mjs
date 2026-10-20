import assert from 'node:assert/strict';
import test from 'node:test';
import {harness,prepare,catalog,cart,order,id,receiptId,text,nodes} from './pickup-order-ui-fixtures.mjs';

test('throwing storage getter or read on recovery mount shows unavailable storage and makes no GET',async()=>{
 const old=globalThis.fetch;let count=0;globalThis.fetch=async()=>{count++;throw Error('unexpected');};
 try{for(const getter of [true,false]){const map=new Map();if(!getter)map.get=()=>{throw new DOMException('denied','SecurityError');};let h;assert.doesNotThrow(()=>{h=harness('store/order-status-client.tsx',{slug:'tienda'},map,undefined,{denied:getter});});assert.ok(text(h.render()).includes('No pudimos acceder al almacenamiento'));assert.equal(count,0);assert.equal(h.writes.length,0);}}finally{globalThis.fetch=old;}
});
