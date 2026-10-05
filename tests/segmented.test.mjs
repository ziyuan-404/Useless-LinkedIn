import test from 'node:test';
import assert from 'node:assert/strict';
import {installSegments} from '../runtime/shared/segmented.js';

test('language thumb preserves its destination while labels fade and layout changes',()=>{
 const names=['document','MutationObserver','ResizeObserver','getComputedStyle','DOMMatrixReadOnly','matchMedia'];
 const previous=new Map(names.map(name=>[name,globalThis[name]]));
 const animations=[],mutations=[],resizes=[],listeners=new Map();
 let pressed=0;
 const buttons=[0,1,2].map(index=>({disabled:false,index,
  box:{left:4+index*70,top:4,width:70,height:34},
  closest(){return this;},getBoundingClientRect(){return this.box;}}));
 const thumb={style:{},className:'',setAttribute(){},animate(frames,options){
  const animation={frames,options,playState:'running',finished:new Promise(()=>{}),
   cancel(){this.playState='idle';}};
  animations.push(animation);return animation;
 }};
 const group={clientLeft:1,clientTop:1,classList:{add(){}},prepend(){},
  getBoundingClientRect(){return {left:0,top:0};},
  querySelector(selector){return selector.includes('aria-pressed')?buttons[pressed]:buttons[0];},
  querySelectorAll(){return buttons;},contains(button){return buttons.includes(button);},
  addEventListener(type,callback){listeners.set(type,callback);}};
 const root={querySelectorAll(selector){return selector==='.language-switch'?[group]:[];}};
 try {
  globalThis.document={createElement(){return thumb;}};
  globalThis.MutationObserver=class {constructor(callback){mutations.push(callback);}observe(){}};
  globalThis.ResizeObserver=class {constructor(callback){resizes.push(callback);}observe(){}};
  globalThis.getComputedStyle=()=>({width:thumb.style.width,transform:thumb.style.transform||'none'});
  globalThis.DOMMatrixReadOnly=class {constructor(transform){this.m41=Number(transform?.match(/translateX\(([-.\d]+)/)?.[1]||0);}};
  globalThis.matchMedia=()=>({matches:false});
  installSegments(root);
  listeners.get('click')({target:buttons[1]});
  assert.equal(animations.length,1);
  assert.equal(animations[0].options.duration,480);
  assert.equal(animations[0].frames[0].width,'70px');
  assert.equal(animations[0].frames.at(-1).width,'70px');
  assert.ok(Math.max(...animations[0].frames.map(frame=>parseFloat(frame.width)))>110,'the thumb stretches farther before settling to its original width');
  const front=frame=>Number(frame.transform.match(/translateX\(([-.\d]+)/)[1])+parseFloat(frame.width);
  assert.ok(Math.max(...animations[0].frames.map(front))<145,'stretch trails the movement instead of overshooting the destination edge');
  assert.equal(thumb.style.transform,'translateX(73px)');
  // Resize can arrive before the 90ms fade has updated aria-pressed.
  resizes[0]();
  assert.equal(thumb.style.transform,'translateX(73px)');
  assert.equal(animations[0].playState,'running');
  pressed=1;mutations[0]();
  assert.equal(animations.length,1,'the committed label update must not restart the slide');
  // A real responsive resize rebases the active slide instead of snapping.
  buttons[1].box.left+=5;resizes[0]();
  assert.equal(animations.length,2);
  assert.equal(animations[1].frames.at(-1).transform,'translateX(78px)');
  assert.equal(animations[1].playState,'running');
  // Rapid choices cannot be pulled back by the previous language commit.
  listeners.get('click')({target:buttons[2]});
  pressed=1;mutations[0]();resizes[0]();
  assert.equal(thumb.style.transform,'translateX(143px)');
  assert.equal(animations.at(-1).playState,'running');
  pressed=2;mutations[0]();
  assert.equal(thumb.style.transform,'translateX(143px)');
 } finally {
  for(const [name,value] of previous) {
   if(value===undefined)delete globalThis[name];else globalThis[name]=value;
  }
 }
});
