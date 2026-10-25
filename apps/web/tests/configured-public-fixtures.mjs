import {load} from './owner-first-store-fixtures.mjs';
export const id=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`;
export const business=id(1), pizza=id(3), dozen=id(4), combo=id(5), size=id(6), flavor=id(7), variety=id(8);
export const small=id(9), large=id(10), muzza=id(11), napo=id(12), carne=id(13), component=id(14);
export const base='https://public.example.invalid', key='sb_publishable_synthetic';
export function fixture(){
 const item=(itemId,name,price)=>({id:itemId,business_id:business,category_id:id(2),name,description:null,price_minor:price,currency:'ARS',is_available:true,sort_order:0,photo_path:null});
 const group=(groupId,itemId,min,max,mode='distinct')=>({id:groupId,business_id:business,item_id:itemId,name:'Grupo ilustrativo',selection_mode:mode,min_select:min,max_select:max,sort_order:0});
 const option=(optionId,groupId,name)=>({id:optionId,business_id:business,group_id:groupId,name,price_delta_minor:0,is_available:true,sort_order:0});
 const profile=(itemId,document)=>({business_id:business,item_id:itemId,version:1,is_active:true,document});
 const rows={business_storefronts:[{business_id:business,slug:'tienda',display_name:'Tienda ilustrativa',is_published:true}],
 catalog_categories:[{id:id(2),business_id:business,name:'Carta',sort_order:0}],
 catalog_items:[item(pizza,'Pizza ilustrativa',0),item(dozen,'Docena ilustrativa',1200000),item(combo,'Combo ilustrativo',3000000)],
 catalog_option_groups:[group(size,pizza,1,1),group(flavor,pizza,1,2),group(variety,dozen,12,12,'quantity')],
 catalog_options:[option(small,size,'Chica'),option(large,size,'Grande'),option(muzza,flavor,'Muzzarella'),option(napo,flavor,'Napolitana'),option(carne,variety,'Carne')],
 business_catalog_settings:[{business_id:business,two_flavor_surcharge_minor:100000}],
 catalog_item_configurations:[profile(pizza,{schemaVersion:1,kind:'pizza',sizeGroupId:size,flavorGroupId:flavor,matrix:[small,large].flatMap(s=>[muzza,napo].map(f=>({sizeOptionId:s,flavorOptionId:f,priceMinor:f===muzza?1000000:1200000,available:s===large||f===muzza})))}),
 profile(dozen,{schemaVersion:1,kind:'dozen',varietyGroupId:variety}),
 profile(combo,{schemaVersion:1,kind:'combo',components:[{componentId:component,itemId:pizza,quantity:2,order:0,fixedGroupPicks:[{groupId:flavor,picks:[{optionId:muzza,quantity:1}]}],allowedOptions:[]}]})]};
 const calls=[];let capability=[{version:2,schemaVersion:1}];let override;
 const fetcher=async(input,init)=>{
  const url=new URL(String(input));calls.push({url,init});
  if(override){const response=await override(url,init);if(response)return response;}
  if(url.pathname.endsWith('/rpc/catalog_configuration_capabilities'))return capability instanceof Response?capability:Response.json(capability);
  const table=url.pathname.split('/').at(-1);let data=rows[table];if(!data)throw Error('unexpected public table '+table);
  data=data.filter(row=>[...url.searchParams].every(([field,filter])=>{
   if(filter.startsWith('eq.'))return String(row[field])===filter.slice(3);
   if(filter.startsWith('in.('))return filter.slice(4,-1).split(',').includes(row[field]);
   return true;
  }));
  return Response.json(data,{headers:{'content-range':data.length?`0-${data.length-1}/${data.length}`:'*/0'}});
 };
 const reader=()=>load('apps/web/app/lib/configured-storefront-reader.ts',{'./supabase/config.ts':{getSupabaseConfig:()=>({url:base,anonKey:key})}}).readConfiguredStorefront;
 return {rows,calls,fetcher,read:()=>reader()('tienda',fetcher),set capability(value){capability=value;},set override(value){override=value;}};
}
export const missingCapability=()=>Response.json({code:'PGRST202',message:'Could not find the function public.catalog_configuration_capabilities without parameters in the schema cache',details:'Searched for the function public.catalog_configuration_capabilities without parameters, but no matches were found in the schema cache.',hint:null},{status:404});
export const pizzaChoice=(s=large,f=muzza)=>({kind:'leaf',profileVersion:1,groups:[{groupId:size,picks:[{optionId:s,quantity:1}]},{groupId:flavor,picks:[{optionId:f,quantity:1}]}]});
