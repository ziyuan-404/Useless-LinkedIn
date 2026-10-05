import test from 'node:test';
import assert from 'node:assert/strict';
const preference={matches:false};
globalThis.matchMedia=()=>preference;
const {animateLayoutChange,showSelectionGlow}=await import('../runtime/shared/controls.js');

test('reflow continues from the visible position after a rapid second choice',()=>{
 const animations=[];let resting={left:100,top:80,width:180,height:40};let visible;
 const chip={isConnected:true,getBoundingClientRect:()=>visible||resting,
  animate(frames,options){const animation={frames,options,finished:new Promise(()=>{}),cancel(){this.cancelled=true;visible=undefined;}};animations.push(animation);return animation;}};
 animateLayoutChange([chip],()=>{resting={...resting,left:20,top:128};});
 assert.equal(animations[0].frames[0].transform,'translate(80px,-48px)');
 assert.equal(animations[0].options.duration,520);
 visible={...resting,left:65,top:100};
 animateLayoutChange([chip],()=>{resting={...resting,left:205,top:128};});
 assert.equal(animations[0].cancelled,true);
 assert.equal(animations[1].frames[0].transform,'translate(-140px,-28px)');
 preference.matches=true;
 let updated=false;animateLayoutChange([chip],()=>{updated=true;});
 assert.equal(updated,true);assert.equal(animations.length,2);
 preference.matches=false;
});

test('selection halo expands from pointer origin and centers keyboard selection',()=>{
 const previous=globalThis.document;const glows=[];
 globalThis.document={createElement(){const glow={style:{},setAttribute(){},remove(){},animate(frames,options){this.frames=frames;this.options=options;return {finished:new Promise(()=>{})};}};glows.push(glow);return glow;}};
 const chip={getBoundingClientRect:()=>({left:40,top:80,width:200,height:44}),querySelector(){return null;},append(){}};
 try {
  showSelectionGlow(chip,{detail:1,clientX:55,clientY:91});
  assert.equal(glows[0].style.left,'15px');assert.equal(glows[0].style.top,'11px');
  assert.ok(parseFloat(glows[0].style.width)>370,'halo reaches the far corners');
  assert.match(glows[0].frames[0].transform,/scale\(\.02\)/);
  assert.equal(glows[0].frames.at(-1).opacity,0);
  showSelectionGlow(chip,{detail:0,clientX:0,clientY:0});
  assert.equal(glows[1].style.left,'100px');assert.equal(glows[1].style.top,'22px');
 } finally {if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
