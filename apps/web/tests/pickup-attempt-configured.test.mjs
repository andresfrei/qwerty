import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {storage} from './checkout-fixtures.mjs';
import {configuredFixture} from './configured-order-fixtures.mjs';
import {normalizeConfiguredPickupIntent} from '../app/lib/configured-order-quote.ts';
const require=createRequire(import.meta.url),api=()=>require('../app/lib/pickup-attempt.ts');
function intent(){const f=configuredFixture('combo');const {slug,...payload}=normalizeConfiguredPickupIntent(f.wire,'pizza').intent;return{version:2,businessId:f.snapshot.businessId,slug,status:'unknown',intent:payload,cartSnapshot:{key:'qwerty:cart:v3:'+f.snapshot.businessId+':pizza',value:'original cart'}};}
test('full v2 attempt durably roundtrips unchanged choices/contact/expected/component versions',()=>{
 const {saveConfiguredAttempt,readConfiguredAttempt,configuredAttemptKey}=api();const s=storage(),attempt=intent();const before=structuredClone(attempt);
 assert.equal(saveConfiguredAttempt(s,attempt),true);assert.deepEqual(readConfiguredAttempt(s,'pizza'),{ok:true,attempt});assert.deepEqual(attempt,before);assert.equal(s.writes.length,1);assert.equal(s.writes[0][0],configuredAttemptKey('pizza'));
});
test('foreign slug, actor extras and malformed selections reject with zero durable writes',()=>{
 const {saveConfiguredAttempt,readConfiguredAttempt,configuredAttemptKey}=api();const s=storage(),attempt=intent();
 for(const bad of [{...attempt,intent:{...attempt.intent,actor:'forged'}},{...attempt,intent:{...attempt.intent,lines:[{itemId:attempt.intent.lines[0].itemId,quantity:1,selection:{kind:'combo',profileVersion:1,components:[{}]}}]}}])assert.equal(saveConfiguredAttempt(s,bad),false);
 assert.equal(s.writes.length,0);s.values.set(configuredAttemptKey('foreign'),JSON.stringify(attempt));assert.equal(readConfiguredAttempt(s,'foreign').ok,false);
});
