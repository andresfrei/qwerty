import test from 'node:test';
import assert from 'node:assert/strict';
import {component,nodes,text} from './checkout-fixtures.mjs';
import {priceProfileSelection} from '../app/lib/catalog-profile-pricing.ts';
import {fixture,business,pizza,dozen,combo,size,flavor,variety,small,large,muzza,napo,carne,component as cid,pizzaChoice} from './configured-public-fixtures.mjs';
const path='apps/web/app/store/configured-selection-client.tsx';
async function picker(itemId,initial){const f=fixture();const result=await f.read();const accepted=[];const h=component(path,{catalog:result.configurations[itemId].catalog,itemId,scope:`${business}:tienda:${itemId}`,initial,onAccept:s=>{accepted.push(s);return true;}},'ConfiguredSelection');return{h,accepted};}
const choose=(h,id,value)=>h.find(id).props.onChange({target:{value,checked:value}});
test('actual pizza controls require size/allowed flavor and display T1 full price, not base',async()=>{
 const {h,accepted}=await picker(pizza);let tree=h.render();assert.equal(h.find('picker-accept').props.disabled,true);assert.equal(text(tree).includes('$ 0'),false);
 choose(h,`size-${size}`,large);choose(h,`flavor-first-${flavor}`,muzza);assert.ok(text(h.render()).includes('10.000'));assert.equal(h.find('picker-accept').props.disabled,false);
 choose(h,`flavor-second-${flavor}`,napo);assert.ok(text(h.render()).includes('12.000'));h.find('picker-accept').props.onClick();assert.equal(accepted.length,1);
 choose(h,`size-${size}`,small);assert.equal(h.find('picker-accept').props.disabled,true);assert.equal(nodes(h.find(`flavor-second-${flavor}`)).some(n=>n.props?.value===napo&&n.props.disabled),true);
});
test('identical halves normalize through T1 without surcharge, rapid counters do not lose updates',async()=>{
 const {h,accepted}=await picker(pizza,pizzaChoice());choose(h,`flavor-second-${flavor}`,muzza);assert.ok(text(h.render()).includes('10.000'));h.find('picker-accept').props.onClick();assert.equal(accepted[0].groups.find(g=>g.groupId===flavor).picks.length,1);
 const dozenPicker=await picker(dozen);const change=dozenPicker.h.find(`count-${variety}-${carne}`).props.onChange;
 change({target:{value:'11'}});assert.equal(dozenPicker.h.find('picker-accept').props.disabled,true);change({target:{value:'12'}});assert.equal(dozenPicker.h.find('picker-accept').props.disabled,false);dozenPicker.h.find('picker-accept').props.onClick();assert.equal(dozenPicker.accepted[0].groups[0].picks[0].quantity,12);assert.ok(text(dozenPicker.h.render()).includes('12.000'));
});
test('fixed combo allowlists and exhausted fixed options cannot be bypassed by actual control callbacks',async()=>{
 const f=fixture();f.rows.catalog_item_configurations.find(p=>p.item_id===combo).document.components[0].allowedOptions=[{groupId:size,optionIds:[small]}];let result=await f.read();const catalog=result.configurations[combo].catalog;
 const h=component(path,{catalog,itemId:combo,scope:'allowed',onAccept:()=>assert.fail('invalid selection accepted')},'ConfiguredSelection');h.render();assert.equal(nodes(h.find(`instance-${cid}-0-size-${size}`)).some(n=>n.props?.value===large),false);choose(h,`instance-${cid}-0-size-${size}`,large);choose(h,`instance-${cid}-1-size-${size}`,small);assert.equal(h.find('picker-accept').props.disabled,true);
 f.rows.catalog_options.find(o=>o.id===muzza).is_available=false;result=await f.read();assert.equal(result.configurations[combo].status,'ready');assert.equal(result.configurations[dozen].status,'ready');const exhausted=component(path,{catalog:result.configurations[combo].catalog,itemId:combo,scope:'exhausted',onAccept:()=>assert.fail('agotado accepted')},'ConfiguredSelection');exhausted.render();choose(exhausted,`instance-${cid}-0-size-${size}`,small);choose(exhausted,`instance-${cid}-1-size-${size}`,small);assert.equal(exhausted.find('picker-accept').props.disabled,true);exhausted.find('picker-accept').props.onClick();
});
test('standard generic controls preserve same-render checkbox updates and charge no pizza fee',async()=>{
 const f=fixture();f.rows.catalog_item_configurations.find(p=>p.item_id===pizza).document={schemaVersion:1,kind:'standard'};f.rows.catalog_items.find(i=>i.id===pizza).price_minor=100;f.rows.catalog_options.find(o=>o.id===muzza).price_delta_minor=20;f.rows.catalog_options.find(o=>o.id===napo).price_delta_minor=30;const result=await f.read(),catalog=result.configurations[pizza].catalog,accepted=[];
 const h=component(path,{catalog,itemId:pizza,scope:'standard',onAccept:s=>{accepted.push(s);return true;}},'ConfiguredSelection');h.render();const first=h.find(`count-${flavor}-${muzza}`).props.onChange,second=h.find(`count-${flavor}-${napo}`).props.onChange;first({target:{checked:true}});second({target:{checked:true}});h.find(`count-${size}-${small}`).props.onChange({target:{checked:true}});h.find('picker-accept').props.onClick();assert.equal(accepted.length,1);assert.deepEqual(priceProfileSelection({catalog,itemId:pizza,selection:accepted[0]}),{ok:true,unitPriceMinor:150,surchargeMinor:0});
});
test('disposed picker ignores an old complete accept callback',async()=>{
 const {h,accepted}=await picker(pizza,pizzaChoice());const click=h.find('picker-accept').props.onClick;h.unmount();click();assert.equal(accepted.length,0);
});
test('combo exposes fixed products and independent instance sizes, no substitutions or child charges',async()=>{
 const {h,accepted}=await picker(combo);const tree=h.render();assert.equal(nodes(tree).filter(n=>n.props?.['data-fixed-instance']).length,2);assert.ok(text(tree).includes('Muzzarella'));assert.equal(nodes(tree).some(n=>n.props?.name==='itemId'),false);
 choose(h,`instance-${cid}-0-size-${size}`,small);choose(h,`instance-${cid}-1-size-${size}`,large);assert.equal(h.find('picker-accept').props.disabled,false);assert.ok(text(h.render()).includes('30.000'));h.find('picker-accept').props.onClick();
 assert.deepEqual(accepted[0].components.map(c=>c.selection.groups.find(g=>g.groupId===size).picks[0].optionId),[small,large]);assert.equal(accepted[0].components.every(c=>c.selection.groups.find(g=>g.groupId===flavor).picks[0].optionId===muzza),true);
});
