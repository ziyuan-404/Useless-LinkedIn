import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {cardViewport,cardFrames} from '../runtime/shared/workspace-card.js';

test('the rounded surface covers the visible slice at every retained scroll position',()=>{
 for(const scroll of [0,720,2500]){
  const box={left:80,top:66-scroll,width:1280,height:3362};
  const visible=cardViewport(box,66,720);
  assert.deepEqual(visible,{left:80,top:66,width:1280,height:654,crop:scroll,bottom:2708-scroll});
  assert.equal(box.top+visible.crop,visible.top);
  assert.equal(box.top+box.height-visible.bottom,720);
 }
 assert.deepEqual(cardViewport({left:0,top:66,width:1280,height:654},66,720),{left:0,top:66,width:1280,height:654,crop:0,bottom:0});
});

test('the visible surface shares the content animation and is removed after a switch',async()=>{
 const source=await fs.readFile(new URL('../runtime/shared/motion.js',import.meta.url),'utf8');
 const created=[],animations=[];
 const makeAnimation=(frames,options)=>{
  const entry={frames,options,startTime:null,cancelled:false,cancel(){this.cancelled=true;}};
  animations.push(entry);return entry;
 };
 const main={style:{removeProperty(){}},getBoundingClientRect:()=>({left:0,top:-654,width:1280,height:3362}),before(e){created.push(e);},animate:makeAnimation};
 const context={main,innerWidth:1280,innerHeight:720,cardFrames,cardViewport,cleanupGenie(){},settled:async()=>{},document:{querySelector:()=>({getBoundingClientRect:()=>({bottom:66})}),documentElement:{classList:{add(){},remove(){}}},createElement:()=>({style:{},setAttribute(){},animate:makeAnimation,remove(){this.removed=true;}})}};
 vm.createContext(context);
 const declarations='let animation=null,surfaceAnimation=null,cardSurface=null,cardGeometry=null;';
 const prepare=source.slice(source.indexOf(' const prepareCard='),source.indexOf(' const header=data=>'));
 const reset=source.slice(source.indexOf(' const resetCard='),source.indexOf(' const source=data=>'));
 vm.runInContext(declarations+prepare+reset+'\nglobalThis.prepare=prepareCard;globalThis.animate=animateCard;globalThis.reset=resetCard;',context);
 context.prepare({view:'editor'});
 assert.deepEqual({...created[0].style},{left:'0px',top:'66px',width:'1280px',height:'654px'});
 context.animate('shrink',760);
 const [content,surface]=animations;
 assert.deepEqual(content.options,surface.options);
 for(let i=0;i<content.frames.length;i++){
  assert.equal(content.frames[i].transform,surface.frames[i].transform);
  assert.match(content.frames[i].clipPath,/inset\(720px 0 1988px 0 round/);
 }
 assert.equal(surface.frames.at(-1).borderRadius,'32px');
 assert.match(surface.frames.at(-1).boxShadow,/48px/);
 context.animate('out',520);
 assert.ok(content.cancelled&&surface.cancelled);
 context.reset();
 assert.ok(created[0].removed&&animations.at(-1).cancelled);
});
