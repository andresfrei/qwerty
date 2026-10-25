import {load} from './owner-first-store-fixtures.mjs';
import * as React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
export const nodes=t=>!t||typeof t!=='object'?[]:t.type?.name==='AsyncActionButton'?nodes(t.type(t.props)):[t,...React.Children.toArray(t.props?.children).flatMap(nodes)];
export const text=t=>renderToStaticMarkup(t).replace(/<!--.*?-->/g,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
export function component(file,props,exportName='default',extra={}){
 const slots=[],effects=[];let cursor=0,dead=false;
 const hooks={...React,useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},useRef(initial){return slots[cursor++]??={current:initial};},useMemo(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((v,j)=>v!==old.deps[j]))slots[i]={value:fn(),deps};return slots[i].value;},useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((v,j)=>v!==old.deps[j]))effects.push(()=>{old?.cleanup?.();slots[i]={deps,cleanup:fn(),effect:fn};});}};
 const module=load(file,{react:hooks,'next/dynamic':{default:()=>function DeferredPicker(){return null;}},...extra});
 const render=()=>{cursor=0;const tree=module[exportName](props);while(effects.length&&!dead)effects.shift()();return tree;};
 const find=id=>{const all=nodes(render());return all.find(n=>n.props?.id===id)??all.find(n=>n.props?.id?.endsWith('-'+id));};
 return {render,find,props,replayEffects(){for(const s of slots)if(s?.effect){s.cleanup?.();s.cleanup=s.effect();}},unmount(){dead=true;for(const s of slots)s?.cleanup?.();},tick:()=>new Promise(r=>setImmediate(r))};
}
export function storage(initial=[]){const values=new Map(initial),writes=[];return{values,writes,getItem:key=>values.get(key)??null,setItem(key,value){values.set(key,value);writes.push([key,value]);}};}
