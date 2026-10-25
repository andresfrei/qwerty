import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,nodes,text} from './owner-first-store-fixtures.mjs';
import {business,item,owner,foreign,standard} from './owner-catalog-configuration-fixtures.mjs';
const scope={accountId:owner,businessId:business,itemId:item};
const id=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`;
const root={id:item,business_id:business,name:'Synthetic pizza',price_minor:1200,currency:'ARS',is_available:false};
const group=(key,mode,min,max,itemId=item)=>({id:key,business_id:business,item_id:itemId,name:`Group ${key.slice(0,8)}`,selection_mode:mode,min_select:min,max_select:max,sort_order:0});
const option=(key,g)=>({id:key,business_id:business,group_id:g,name:`Option ${key.slice(0,8)}`,price_delta_minor:100,is_available:false,sort_order:0});
const catalog=(groups=[],options=[],profiles=[],items=[root])=>({businessId:business,surchargeMinor:0,items,groups,options,profiles});
const row=(version,document,is_active=true,itemId=item)=>({business_id:business,item_id:itemId,version,is_active,document});
const json=(body,status=200)=>new Response(JSON.stringify(body),{status});
function fixture(initial=catalog(),sharedStore=new Map()) {
 const previous={fetch:globalThis.fetch,window:globalThis.window,crypto:globalThis.crypto};const stored=sharedStore,calls=[];
 let read=()=>json({capability:'ready',catalog:initial}),write=()=>json({error:'configuration_rejected'},422);
 globalThis.window={sessionStorage:{getItem:k=>stored.get(k)??null,setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)}};
 globalThis.fetch=async(path,init)=>{calls.push({path,init});return init.method==='POST'?write():read(path);};
 const props={scope,products:[root]};const h=harness('catalog/catalog-profile-editor-client.tsx',props,{},'CatalogProfileEditor');
 const field=label=>nodes(h.render()).find(n=>n.props?.['aria-label']===label);
 return {h,field,calls,stored,props,setRead:fn=>read=fn,setWrite:fn=>write=fn,
  async open(){await field('Consultar configuración avanzada').props.onClick();await h.tick();h.render();},
  change(label,value){const node=field(label);assert.ok(node,label);node.props.onChange({target:{value,checked:value}});},
  close(){h.unmount();globalThis.fetch=previous.fetch;if(previous.window===undefined)delete globalThis.window;else globalThis.window=previous.window;},
 };
}
test('real explicit type controls do not infer pizza from name; inactive unknown requires explicit replacement',async()=>{
 const f=fixture(catalog([],[],[row(8,{future:'preserve'},false)]));
 try{
  await f.open();assert.equal(f.field('Tipo de configuración').props.value,'legacy');
  assert.equal(f.field('Tipo de configuración').props.disabled,true);
  f.change('Autorizar reemplazo del borrador no reconocido',true);f.change('Tipo de configuración','standard');
  const types=nodes(f.h.render()).filter(n=>n.type==='option').map(n=>n.props.value);for(const type of ['legacy','standard','pizza','dozen','combo'])assert.ok(types.includes(type));
  await f.field('Guardar configuración').props.onClick();
  const payload=JSON.parse(f.calls.at(-1).init.body);assert.equal(payload.expectedVersion,8);assert.deepEqual(payload.document,standard);
  assert.equal(f.field('Tipo de configuración').props.value,'standard');assert.ok(!nodes(f.h.render()).some(n=>n.type==='textarea'));
 }finally{f.close();}
});
test('pizza controls represent every pair, full-price cents and disabled permissions; wrong bounds give classic-editor guidance',async()=>{
 const size=id(1),flavor=id(2),small=id(3),large=id(4),taste=id(5);
 const f=fixture(catalog([group(size,'distinct',1,1),group(flavor,'distinct',1,2)],[option(small,size),option(large,size),option(taste,flavor)]));
 try{
  await f.open();assert.equal(f.field('Tipo de configuración').props.value,'legacy');f.change('Tipo de configuración','pizza');
  f.change('Grupo de tamaños',size);f.change('Grupo de sabores',flavor);
  const prices=nodes(f.h.render()).filter(n=>n.props?.['data-matrix-price']);assert.equal(prices.length,2);
  const pairs=nodes(f.h.render()).filter(n=>n.props?.['data-matrix-permission']);assert.equal(pairs.length,2);
  prices[0].props.onChange({target:{value:'0,29'}});prices[1].props.onChange({target:{value:'12000,00'}});pairs[0].props.onChange({target:{checked:true}});
  await f.field('Guardar configuración').props.onClick();const payload=JSON.parse(f.calls.at(-1).init.body);
  assert.deepEqual(payload.document.matrix.map(r=>r.priceMinor).sort((a,b)=>a-b),[29,1200000]);assert.equal(payload.document.matrix.filter(r=>!r.available).length,1);
  assert.match(text(f.h.render()),/precio completo/i);assert.match(text(f.h.render()),/no adicionales/i);
  assert.equal(nodes(f.h.render()).find(n=>n.props?.['data-matrix-price']).props.value,'0,29','rejection retains entered money text');
  prices[0].props.onChange({target:{value:'0,291'}});await f.field('Guardar configuración').props.onClick();assert.equal(f.calls.filter(c=>c.init.method==='POST').length,1,'fractional cents cannot dispatch');
 }finally{f.close();}
 const wrong=fixture(catalog([group(size,'distinct',0,3)],[]));try{await wrong.open();wrong.change('Tipo de configuración','pizza');assert.match(text(wrong.h.render()),/editor clásico/i);await wrong.field('Guardar configuración').props.onClick();assert.equal(wrong.calls.filter(c=>c.init.method==='POST').length,0);}finally{wrong.close();}
});
test('dozen selects exactly-12 quantity group and uses parent price without a second price write',async()=>{
 const g=id(6),o=id(7),f=fixture(catalog([group(g,'quantity',12,12)],[option(o,g)]));
 try{await f.open();f.change('Tipo de configuración','dozen');f.change('Grupo de las 12 unidades',g);await f.field('Guardar configuración').props.onClick();assert.deepEqual(JSON.parse(f.calls.at(-1).init.body),{expectedVersion:0,isActive:true,document:{schemaVersion:1,kind:'dozen',varietyGroupId:g}});assert.match(text(f.h.render()),/precio fijo del producto/i);assert.equal(f.calls.filter(c=>c.init.method==='POST').length,1);}finally{f.close();}
});
test('fixed combo controls use explicit child read, stable component identity, quantities, fixed groups and exact allowlists',async()=>{
 const child=id(8),g=id(9),o=id(10),childItem={...root,id:child,name:'Synthetic child'};
 const f=fixture();f.props.products=[root,childItem];const childCatalog=catalog([group(g,'distinct',1,1,child)],[option(o,g)],[],[childItem]);
 f.setRead(path=>json({capability:'ready',catalog:new URL(path,'https://fixture.invalid').searchParams.get('itemId')===child?childCatalog:catalog()}));
 try{
  await f.open();f.change('Tipo de configuración','combo');f.change('Producto fijo para agregar',child);await f.field('Agregar producto fijo').props.onClick();
  assert.ok(f.calls.some(c=>c.init.method==='GET'&&c.path.includes(`itemId=${child}`)));
  const component=nodes(f.h.render()).find(n=>n.props?.['data-component-id']);assert.ok(component);const componentId=component.props['data-component-id'];
  f.change(`Cantidad del componente ${componentId}`,'2');f.change(`Fijar grupo ${componentId}:${g}`,true);
  f.change(`Opción fija ${componentId}:${o}`,true);f.change(`Restringir opciones ${componentId}:${g}`,true);f.change(`Opción permitida ${componentId}:${o}`,true);
  await f.field('Guardar configuración').props.onClick();const c=JSON.parse(f.calls.at(-1).init.body).document.components[0];
  assert.deepEqual(c,{componentId,itemId:child,quantity:2,order:0,fixedGroupPicks:[{groupId:g,picks:[{optionId:o,quantity:1}]}],allowedOptions:[{groupId:g,optionIds:[o]}]});
  assert.equal(nodes(f.h.render()).find(n=>n.props?.['data-component-id']).props['data-component-id'],componentId);assert.match(text(f.h.render()),/no se suman/i);
  f.change(`Opción permitida ${componentId}:${o}`,false);await f.field('Guardar configuración').props.onClick();assert.equal(f.calls.filter(c=>c.init.method==='POST').length,1,'empty allowlist does not silently permit a fixed choice');
 }finally{f.close();}
});
test('shared action buttons, same-tick save lock and retained controls survive unknown read-only recovery; context replacement drops callback',async()=>{
 const f=fixture();try{
  await f.open();f.change('Tipo de configuración','standard');let finish;f.setWrite(()=>new Promise(r=>finish=r));
  const first=f.field('Guardar configuración').props.onClick();await f.field('Guardar configuración').props.onClick();
  assert.equal(f.calls.filter(c=>c.init.method==='POST').length,1);assert.ok(nodes(f.h.render()).some(n=>n.props?.className==='async-action-spinner'),'shared pending spinner');
  finish(json({error:'outcome_unknown'},503));await first;assert.equal(nodes(f.h.render()).find(n=>n.type==='fieldset').props.disabled,true);
  await f.field('Consultar configuración avanzada').props.onClick();assert.equal(nodes(f.h.render()).find(n=>n.type==='fieldset').props.disabled,true);assert.equal(f.field('Tipo de configuración').props.value,'standard');
  f.props.scope={...scope,itemId:foreign};f.h.render();await f.h.tick();assert.equal(f.field('Guardar configuración'),undefined,'previous item controls cannot cross scope');
 }finally{f.close();}
});
test('restored unknown combo retains its fixed choices through explicit child context reads, without a second POST',async()=>{
 const child=id(12),g=id(13),o=id(14),childItem={...root,id:child,name:'Restored child'};
 const childCatalog=catalog([group(g,'distinct',1,1,child)],[option(o,g)],[],[childItem]);
 const configure=f=>{f.props.products=[root,childItem];f.setRead(path=>json({capability:'ready',catalog:new URL(path,'https://fixture.invalid').searchParams.get('itemId')===child?childCatalog:catalog()}));};
 const first=fixture();configure(first);let stored,componentId;
 try{
  await first.open();first.change('Tipo de configuración','combo');first.change('Producto fijo para agregar',child);await first.field('Agregar producto fijo').props.onClick();componentId=nodes(first.h.render()).find(n=>n.props?.['data-component-id']).props['data-component-id'];
  first.change(`Fijar grupo ${componentId}:${g}`,true);first.change(`Opción fija ${componentId}:${o}`,true);first.setWrite(()=>Promise.reject(Error('lost')));await first.field('Guardar configuración').props.onClick();stored=first.stored;
 }finally{first.close();}
 const restored=fixture(catalog(),stored);configure(restored);
 try{await restored.open();assert.equal(restored.field(`Opción fija ${componentId}:${o}`)?.props.checked,true);assert.equal(nodes(restored.h.render()).find(n=>n.type==='fieldset').props.disabled,true);assert.equal(restored.calls.filter(c=>c.init.method==='POST').length,0);assert.ok(restored.calls.some(c=>c.path.includes(`itemId=${child}`)));}finally{restored.close();}
});
test('legacy-only and unavailable advanced states render truthful disabled copy',async()=>{
 for(const kind of ['legacy_only','unavailable']){
  const f=fixture();f.setRead(()=>kind==='legacy_only'?json({capability:kind}):json({error:'unavailable'},503));
  try{await f.open();assert.match(text(f.h.render()),/catálogo clásico sigue disponible/i);assert.equal(f.field('Guardar configuración'),undefined);assert.equal(f.calls.filter(c=>c.init.method==='POST').length,0);}finally{f.close();}
 }
});
