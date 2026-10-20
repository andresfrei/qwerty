import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import * as React from 'react';
const require=createRequire(import.meta.url);
export const id='11111111-1111-4111-8111-111111111111', receiptId='22222222-2222-4222-8222-222222222222';
export const item={id,business_id:id,category_id:id,name:'Agua ilustrativa',description:null,price_minor:100,currency:'ARS',is_available:true,sort_order:0};
export const catalog={status:'ok',storefront:{business_id:id,slug:'tienda',display_name:'Tienda ilustrativa',is_published:true},categories:[{category:{id,business_id:id,name:'Carta',sort_order:0},items:[item]}],groups:[],options:[],surchargeMinor:0};
export const cart={version:2,businessId:id,items:[{id,key:id,name:item.name,unitPriceMinor:100,currency:'ARS',quantity:1,selection:[],selectionText:''}]};
export const order={id,requestId:id,receiptId,currency:'ARS',totalMinor:100,fulfillmentState:'pendiente_de_pago',paymentState:'pendiente',createdAt:'2026-01-01T00:00:00Z',contact:{name:'Ana',email:'ana@fixture.invalid',telephone:'123'},lines:[{itemId:id,name:item.name,quantity:1,unitPriceMinor:100,lineTotalMinor:100,selectionText:''}]};
export const nodes=t=>!t||typeof t!=='object'?[]:[t,...React.Children.toArray(t.props?.children).flatMap(nodes)];
export const text=t=>typeof t==='string'?t:!t||typeof t!=='object'?'':React.Children.toArray(t.props?.children).map(text).join(' ');
export function harness(path,props, map=new Map([['qwerty:cart:v1:'+id,JSON.stringify(cart)]]), sourceOverride, storageControl={denied:false}){
 const source=sourceOverride??readFileSync(new URL('../app/'+path,import.meta.url),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const slots=[],effects=[],writes=[];let cursor=0;
 const changed=(a,b)=>!a||a.length!==b.length||a.some((v,i)=>v!==b[i]);
 const hooks={useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},useRef(initial){const i=cursor++;return slots[i]??={current:initial};},useMemo(fn,deps){const i=cursor++;if(!slots[i]||changed(slots[i].deps,deps))slots[i]={value:fn(),deps};return slots[i].value;},useEffect(fn,deps){const i=cursor++;if(changed(slots[i],deps)){slots[i]=deps;effects.push(fn);}}};
 const storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>{map.set(k,v);writes.push([k,v]);}};
 const module={exports:{}};
 const storageScope={get localStorage(){if(storageControl.denied)throw new DOMException('Storage denied','SecurityError');return storage;}};
 new Function('require','module','exports','storageScope','with(storageScope){'+compiled+'}')(name=>name==='react'?hooks:name.startsWith('@/app/lib/')?require('../app/lib/'+name.slice(10)+'.ts'):require(name),module,module.exports,storageScope);
 const render=()=>{cursor=0;const tree=module.exports.default(props);while(effects.length)effects.shift()();return tree;};
 const find=id=>nodes(render()).find(n=>n.props?.id===id);
 render();render();
 return{render,find,map,writes,props,storageControl,form:()=>nodes(render()).find(n=>n.type==='form').props.onSubmit({preventDefault(){}}),tick:()=>new Promise(r=>setImmediate(r))};
}
export async function prepare(h){for(const [key,value]of Object.entries(order.contact))h.find('contact-'+key).props.onChange({target:{value}});await h.form();h.find('receipt-file').props.onChange({currentTarget:{files:[new File(['original'],'receipt.pdf')]}});await h.find('receipt-upload').props.onClick();}
