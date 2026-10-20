import test from 'node:test';
import assert from 'node:assert/strict';
import {OnboardingError, handleOnboarding} from '../app/owner/onboarding/owner-onboarding.ts';
const origin='https://owner.fixture.invalid';
const req=(body={action:'create_business',name:'Mi negocio'},extra={})=>new Request(origin+'/owner/onboarding',{method:'POST',headers:{host:'owner.fixture.invalid',origin,'content-type':'application/json',...extra},body:JSON.stringify(body)});
export function fixture(){
 const writes=[];let business=null,draft=null;
 const gateway={async confirmedUser(){return 'owner';},async firstBusiness(){return business;},async storefront(){return draft;},async createBusiness(ownerId,name){writes.push({ownerId,name});business={id:'own',name};return business;},async createDraft(businessId,displayName,slug){writes.push({businessId,displayName,slug,isPublished:false});draft={slug,display_name:displayName,is_published:false};return draft;}};
 return {gateway,writes,deps:{trustedOrigin:origin,createGateway:async()=>gateway}};
}
test('confirmed owner creates a business, then an unpublished draft; replay resumes without writes',async()=>{
 const f=fixture();let r=await handleOnboarding(req(),f.deps);assert.equal(r.status,201);assert.equal((await r.json()).business.name,'Mi negocio');
 r=await handleOnboarding(req({action:'create_draft',displayName:'Mi tienda',slug:'mi-tienda'}),f.deps);assert.equal(r.status,201);assert.equal((await r.json()).storefront.is_published,false);
 await handleOnboarding(req(),f.deps);await handleOnboarding(req({action:'create_draft',displayName:'Otro',slug:'otro'}),f.deps);assert.equal(f.writes.length,2);
});
