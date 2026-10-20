import test from 'node:test';
import assert from 'node:assert/strict';
import {handleCatalogPost} from '../app/owner/catalog/catalog-actions.ts';
import {harness,nodes,category,item,group,option,storefront,id} from './owner-first-store-fixtures.mjs';
const origin='https://owner.fixture.invalid';
const props={categories:[category],items:[item],groups:[group],options:[option],storefront,surchargeMinor:0};
const product={categoryId:id,name:'Producto',description:'Conservar',priceMinor:'0,29',currency:'EUR',isAvailable:'false',sortOrder:'2'};
const groupFields={name:'Docena',selectionMode:'quantity',minSelect:'12',maxSelect:'12',sortOrder:'1'};
const optionFields={name:'Gusto',priceDeltaMinor:'1.25',isAvailable:'false',sortOrder:'3'};
const cases=[
 ['Nueva categoría',{action:'create_category',name:'Carta',sortOrder:'0'},'insert_category'],
 ['Nombre: Carta ilustrativa',{action:'rename_category',categoryId:id,name:'Carta nueva'},'update_category'],
 ['Orden: Carta ilustrativa',{action:'reorder_category',categoryId:id,sortOrder:'3'},'update_category'],
 ['Nuevo producto',{action:'create_product',...product},'insert_item'],
 ['Editar: Pizza ilustrativa',{action:'update_product',itemId:id,...product},'update_item'],
 ['Nuevo grupo: Pizza ilustrativa',{action:'create_option_group',itemId:id,...groupFields},'insert_option_group'],
 ['Editar grupo: Gustos',{action:'update_option_group',groupId:id,...groupFields},'update_option_group'],
 ['Nueva opción: Gustos',{action:'create_option',groupId:id,...optionFields},'insert_option'],
 ['Editar opción: Muzzarella',{action:'update_option',optionId:id,...optionFields},'update_option'],
 ['Recargo fijo por dos gustos',{action:'set_two_flavor_surcharge',twoFlavorSurchargeMinor:'1,23'},'upsert_settings'],
 ['Publicación',{action:'set_published',isPublished:'true'},'update_storefront'],
];
test('every actual React form callback reaches unchanged public catalog handler with exact contract and server-selected business',async()=>{
 const originalFetch=globalThis.fetch,OriginalFormData=globalThis.FormData;globalThis.FormData=class{constructor(v){return v;}};
 const writes=[];
 const gateway={async ownerBusinessId(){return 'server-first-business';},async categoryOwnedBy(b,c){return b==='server-first-business'&&c===id;},async itemOwnedBy(b,i){return b==='server-first-business'&&i===id;},async groupOwnedBy(b,g){return b==='server-first-business'&&g===id;},async optionOwnedBy(b,o){return b==='server-first-business'&&o===id;},async write(w){writes.push(w);}};
 globalThis.fetch=async(path,init)=>{assert.equal(path,'/owner/catalog/actions');const body=JSON.parse(init.body);assert.ok(!('businessId'in body));assert.ok(!('ownerId'in body));return handleCatalogPost(new Request(origin+path,{...init,headers:{...init.headers,host:'owner.fixture.invalid',origin}}),{trustedOrigin:origin,createGateway:async()=>gateway});};
 try{
  for(const[label,fields,kind]of cases){
   const h=harness('catalog/catalog-editor-client.tsx',props),form=nodes(h.render()).find(n=>n.type==='form'&&n.props['aria-label']===label);
   assert.ok(form,label);await form.props.onSubmit({preventDefault(){},currentTarget:new Map(Object.entries(fields))});
   assert.equal(writes.at(-1).kind,kind,label);assert.equal(writes.at(-1).businessId,'server-first-business');assert.ok(nodes(h.render()).filter(n=>n.type==='fieldset').every(n=>n.props.disabled),'successful write freezes until read refresh');
  }
  assert.equal(writes.length,cases.length);assert.equal(writes.find(w=>w.kind==='insert_item').priceMinor,29);assert.equal(writes.find(w=>w.kind==='insert_item').currency,'EUR');assert.equal(writes.find(w=>w.kind==='insert_option_group').maxSelect,12);assert.equal(writes.find(w=>w.kind==='insert_option').isAvailable,false);assert.equal(writes.find(w=>w.kind==='upsert_settings').twoFlavorSurchargeMinor,123);
 }finally{globalThis.fetch=originalFetch;globalThis.FormData=OriginalFormData;}
});
test('published storefront exposes buyer URL; empty publication remains allowed and warned',()=>{
 const h=harness('catalog/catalog-editor-client.tsx',{...props,storefront:{...storefront,is_published:true}});assert.equal(h.find('buyer-link').props.href,'/store/tienda-ilustrativa');
 const empty=harness('catalog/catalog-editor-client.tsx',{...props,categories:[],items:[],groups:[],options:[]});assert.ok(nodes(empty.render()).some(n=>n.type==='form'&&n.props['aria-label']==='Publicación'));
});
