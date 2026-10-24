import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from './owner-first-store-fixtures.mjs';

const first = '11111111-1111-4111-8111-111111111111';
const second = '22222222-2222-4222-8222-222222222222';
const foreign = '33333333-3333-4333-8333-333333333333';
const owner = '44444444-4444-4444-8444-444444444444';
const origin = 'https://qwerty.test';
const root = 'apps/web/app/owner/';
const stateDraft={slug:'dos',display_name:'Dos',is_published:false};
function session(user = {id: owner, email: 'owner@example.test', email_confirmed_at: '2026-01-01', role: 'authenticated', is_anonymous: false}) {
  const log = [], writes = [];
  const rows = [{id:first, name:'Uno', owner_id:owner}, {id:second, name:'Dos', owner_id:owner}, {id:foreign, name:'Ajena', owner_id:foreign}];
  return {log, writes, client: {auth:{async getUser(){log.push(['getUser']);return {data:{user},error:null};}}, from(table) {
    const filters = []; let limit = Infinity;
    const query = {
      range(start,end){limit=end-start+1;return query;}, select(){return query;}, eq(key,value){filters.push([key,value]);return query;}, order(){return query;}, limit(value){limit=value;return query;},
      insert(value){writes.push([table,value]);return query;}, single(){return Promise.resolve({data:{...stateDraft},error:null});},
      maybeSingle(){return Promise.resolve({data:null,error:null});},
      then(resolve){log.push([table,...filters]);return Promise.resolve({data:rows.filter(row=>filters.every(([k,v])=>row[k]===v)).slice(0,limit),error:null}).then(resolve);},
    };return query;
  }}};
}
const catalog = load(root+'catalog/catalog-actions.ts');
const {createSupabaseCatalogGateway} = load(root+'catalog/catalog-gateway.ts');
// Use the real public action shape, not an internal write plan.
const action = {action:'create_category', name:'Nueva', sortOrder:0};
function request(query='') {return new Request(origin+'/owner/catalog/actions'+query,{method:'POST',headers:{origin,host:'qwerty.test','content-type':'application/json'},body:JSON.stringify(action)});}

test('selected second owned business scopes catalog writes; absent selection stays first', async()=>{
  for (const [query,expected] of [['?businessId='+second,second],['',first]]) {
    const state=session();
    const response=await catalog.handleCatalogPost(request(query),{trustedOrigin:origin,createGateway:async()=>createSupabaseCatalogGateway(state.client)});
    assert.equal(response.status,200,await response.text());
    assert.equal(state.writes.length,1);
    assert.equal(state.writes[0][1].business_id,expected);
  }
});
test('foreign selection never falls back or writes', async()=>{
  const state=session();
  const response=await catalog.handleCatalogPost(request('?businessId='+foreign),{trustedOrigin:origin,createGateway:async()=>createSupabaseCatalogGateway(state.client)});
  assert.equal(response.status,401);assert.deepEqual(await response.json(),{error:'unauthorized'});
  assert.equal(response.headers.get('set-cookie'),null);assert.equal(response.headers.get('cache-control'),'private, no-store');
  assert.deepEqual(state.writes,[]);
});
test('malformed, repeated and extra query parameters reject before creating a client',async()=>{
  for (const query of ['?businessId=no','?businessId='+first+'&businessId='+second,'?extra=1']) {
    let clients=0;
    const response=await catalog.handleCatalogPost(request(query),{trustedOrigin:origin,createGateway:async()=>{clients++;return null;}});
    assert.equal(response.status,400);assert.deepEqual(await response.json(),{error:'invalid_request'});
    assert.equal(response.headers.get('set-cookie'),null);assert.equal(clients,0);
  }
});
