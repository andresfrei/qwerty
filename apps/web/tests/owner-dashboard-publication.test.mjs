import assert from 'node:assert/strict';
import test from 'node:test';
import { load, harness, nodes, tick, a, b, owner } from './owner-dashboard-fixtures.test.mjs';
test('optional transport adds query only; omitted selection preserves exact default URL, payload and options',async()=>{
  const {sendOwnerMutation}=load('apps/web/app/owner/catalog/catalog-editor.ts');
  const calls=[];const fetcher=async(url,init)=>{calls.push([url,init]);return Response.json({ok:true});};const payload={action:'set_published',isPublished:true};
  await sendOwnerMutation('/owner/catalog/actions',payload,fetcher);
  await sendOwnerMutation('/owner/catalog/actions',payload,fetcher,b);
  assert.equal(calls[0][0],'/owner/catalog/actions');assert.equal(calls[1][0],`/owner/catalog/actions?businessId=${b}`);assert.deepEqual(calls[0][1],calls[1][1]);assert.equal(calls[1][1].body,JSON.stringify(payload));
  await sendOwnerMutation('/owner/catalog/actions',payload,fetcher,'bad');assert.equal(calls.length,2);
});
for(const outcome of ['saved','unknown','rejected']) test(`actual publication hook binds explicit ID; ${outcome} locking follows domain response`,async()=>{
  const old=globalThis.fetch;let finish;const calls=[];globalThis.fetch=(url,init)=>{calls.push([url,init]);return new Promise(resolve=>finish=resolve);};
  try{
    const h=harness('store-publication-client.tsx',{businessId:b,accountId:owner,isPublished:false});h.render();assert.equal(h.find('publication-submit').props.disabled,true);h.flush();
    h.find('publication-submit').props.onClick();h.find('publication-submit').props.onClick();assert.equal(calls.length,1);assert.equal(calls[0][0],`/owner/catalog/actions?businessId=${b}`);assert.deepEqual(JSON.parse(calls[0][1].body),{action:'set_published',isPublished:true});
    assert.equal(h.find('publication-submit').props['aria-busy'],true);
    finish(outcome==='saved'?Response.json({ok:true}):outcome==='unknown'?new Response('lost',{status:503}):Response.json({error:'unauthorized'},{status:401}));await tick();
    assert.equal(h.find('publication-submit').props.disabled,outcome!=='rejected');assert.notEqual(h.find('publication-submit').props['aria-busy'],true);
    const refresh=nodes(h.render()).find(n=>n.type==='a');if(outcome!=='rejected')assert.equal(refresh.props.href,`/owner/store?businessId=${b}`);else assert.equal(refresh,undefined);
    h.unmount();
  }finally{globalThis.fetch=old;}
});
test('publication stale response after store change or unmount cannot settle another context',async()=>{
  const old=globalThis.fetch;let finish;globalThis.fetch=()=>new Promise(resolve=>finish=resolve);
  try{
    for(const mode of ['store','unmount']){
      const h=harness('store-publication-client.tsx',{businessId:b,accountId:owner,isPublished:false});h.render();h.flush();h.find('publication-submit').props.onClick();
      if(mode==='store'){h.props.businessId=a;h.render();}else h.unmount();
      finish(Response.json({ok:true}));await tick();assert.equal(h.find('publication-submit').props['aria-busy'],true);assert.equal(nodes(h.render()).filter(n=>n.type==='a').length,0);
    }
  }finally{globalThis.fetch=old;}
});
