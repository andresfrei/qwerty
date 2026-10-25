// Synthetic session/catalog only; no hosted clients or records.
export const business = '11111111-1111-4111-8111-111111111111';
export const item = '22222222-2222-4222-8222-222222222222';
export const owner = '33333333-3333-4333-8333-333333333333';
export const foreign = '44444444-4444-4444-8444-444444444444';
export const origin = 'https://owner.fixture.invalid';
export const standard = {schemaVersion:1,kind:'standard'};
export function fixture() {
 const state = {
  calls:[], saves:0, identity:0, capability:'ready', failure:null, rpcResult:undefined, counts:{}, afterCommit:null,
  user:{id:owner,email:'owner@example.invalid',email_confirmed_at:'2026-01-01',is_anonymous:false,role:'authenticated'},
  rows:{businesses:[{id:business,name:'Fixture',owner_id:owner}],
   catalog_items:[{id:item,business_id:business,name:'Synthetic item',price_minor:1200,currency:'ARS',is_available:true}],
   catalog_option_groups:[],catalog_options:[],catalog_item_configurations:[],business_catalog_settings:[]},
 };
 const client = {
  auth:{async getUser(){state.identity++; return {data:{user:state.user},error:null};}},
  from(table){
   const filters=[]; let columns, one=false, count, exactCount=false;
   const q={select(v,opts){columns=v;exactCount=opts?.count==='exact';return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},in(k,v){filters.push(r=>v.includes(r[k]));return q;},order(){return q;},limit(v){count=v;return q;},maybeSingle(){one=true;return q;},
    then(resolve,reject){state.calls.push({table,columns});if(state.failure===table)return Promise.resolve({data:null,error:{code:'bad'}}).then(resolve,reject);
     let rows=state.rows[table].filter(r=>filters.every(f=>f(r))).map(r=>Object.fromEntries(columns.split(',').map(k=>[k,r[k]])));
     const total=rows.length;if(count!==undefined)rows=rows.slice(0,count);
     return Promise.resolve({data:one?rows[0]??null:rows,error:null,count:exactCount?(table in state.counts?state.counts[table]:total):null}).then(resolve,reject);
    }};return q;
  },
  async rpc(name,args){
   state.calls.push({rpc:name,args});
   if(name==='catalog_configuration_capabilities')return state.capability==='ready'?{data:[{version:2,schemaVersion:1}],error:null}:state.capability==='legacy_only'?{data:null,error:{code:'PGRST202',message:'Could not find the function public.catalog_configuration_capabilities without parameters in the schema cache',details:'Searched for the function public.catalog_configuration_capabilities without parameters, but no matches were found in the schema cache.'}}:{data:null,error:{code:'503'}};
   if(name!=='save_catalog_item_configuration')throw Error('Unexpected RPC');
   state.saves++;
   if(state.rpcResult!==undefined){if(state.rpcResult instanceof Error)throw state.rpcResult;return state.rpcResult;}
   const index=state.rows.catalog_item_configurations.findIndex(r=>r.business_id===args.p_business&&r.item_id===args.p_item);
   const current=state.rows.catalog_item_configurations[index];
   if((current?.version??0)!==args.p_expected_version)return {data:{code:'configuration_version_conflict'},error:null};
   const profile={business_id:args.p_business,item_id:args.p_item,version:args.p_expected_version+1,is_active:args.p_is_active,document:structuredClone(args.p_document)};
   if(index<0)state.rows.catalog_item_configurations.push(profile);else state.rows.catalog_item_configurations[index]=profile;
   if(state.afterCommit==='throw')throw Error('Lost after commit');
   if(state.afterCommit==='malformed')return {data:{code:'saved',profile:{}},error:null};
   return {data:{code:'saved',profile:structuredClone(profile)},error:null};
  },
 };
 return {state,client};
}
export function request(method='POST',body={expectedVersion:0,isActive:true,document:standard},query=`businessId=${business}&itemId=${item}`,headers={}) {
 return new Request(`${origin}/owner/catalog/configurations?${query}`,{method,headers:{host:'owner.fixture.invalid',...(method==='POST'?{origin,'content-type':'application/json'}:{}),...headers},...(method==='POST'?{body:JSON.stringify(body)}:{})});
}
