import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import ts from 'typescript';
import * as React from 'react';
const require=createRequire(import.meta.url);
export const id='11111111-1111-4111-8111-111111111111';
export const business={id,name:'Negocio ilustrativo'};
export const storefront={slug:'tienda-ilustrativa',display_name:'Tienda ilustrativa',is_published:false};
export const category={id,name:'Carta ilustrativa',sort_order:0};
export const item={id,category_id:id,name:'Pizza ilustrativa',description:null,price_minor:123,currency:'USD',is_available:true,sort_order:0,photo_path:null,photo_version:0};
export const group={id,item_id:id,name:'Gustos',selection_mode:'distinct',min_select:1,max_select:2,sort_order:0};
export const option={id,group_id:id,name:'Muzzarella',price_delta_minor:0,is_available:true,sort_order:0};
// Expand only the hook-free shared presentation; domain components keep their hooks.
export const nodes=t=>!t||typeof t!=='object'?[]:t.type?.name==='AsyncActionButton'?nodes(t.type(t.props)):[t,...React.Children.toArray(t.props?.children).flatMap(nodes)];
export const text=t=>typeof t==='string'?t:!t||typeof t!=='object'?'':React.Children.toArray(t.props?.children).map(text).join(' ');
export function load(file,mocks={},cache=new Map()) {
 file=resolve(file);if(cache.has(file))return cache.get(file);
 const source=readFileSync(file,'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const m={exports:{}};cache.set(file,m.exports);
 new Function('require','module','exports',js)(name=>{
  if(name in mocks)return mocks[name];
  if(name.startsWith('.')||name.startsWith('@/')){
   let path=name.startsWith('@/')?resolve('apps/web',name.slice(2)):resolve(dirname(file),name);
   if(!/\.tsx?$/.test(path)) {try{readFileSync(path+'.ts');path+='.ts';}catch{path+='.tsx';}}
   return load(path,mocks,cache);
  }return require(name);
 },m,m.exports);cache.set(file,m.exports);return m.exports;
}
export function harness(file,props={},mocks={},exportName='default') {
 const slots=[];let cursor=0;
 const hooks={useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],v=>slots[i]=typeof v==='function'?v(slots[i]):v];},useRef(initial){const i=cursor++;return slots[i]??={current:initial};}};
 const module=load('apps/web/app/owner/'+file,{...mocks,react:hooks});
 const render=()=>{cursor=0;return module[exportName](props);};
 return {render,find:id=>nodes(render()).find(n=>n.props?.id===id),tick:()=>new Promise(r=>setImmediate(r))};
}
