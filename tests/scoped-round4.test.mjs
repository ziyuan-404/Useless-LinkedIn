import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

test('new elements stay inside the page, move without resizing and can be removed',async()=>{
 const events=[],animations=[];
 class Element{
  constructor(tag='DIV'){this.tagName=tag.toUpperCase();this.style={};this.dataset={};this.children=[];this.className='';this.textContent='';this.clientWidth=794;this.clientHeight=1123;}
  setAttribute(){}removeAttribute(){}append(node){this.children.push(node);node.parent=this;}remove(){this.parent.children=this.parent.children.filter(node=>node!==this);}
  getBoundingClientRect(){return{width:parseFloat(this.style.width)||794,height:parseFloat(this.style.height)||1123};}
  animate(frames,options){animations.push({frames,options});}
 }
 const page=new Element(),interaction={draggable(){return this;},resizable(){return this;},actionChecker(){return this;},unset(){}};
 const context={HTMLElement:Element,interact:()=>interaction,getComputedStyle:el=>({position:el.style.position||'static',fontSize:'16px',opacity:1,color:'rgb(23,35,52)',backgroundColor:'rgb(255,255,255)'}),document:{body:page,documentElement:{},querySelector:()=>page,createElement:tag=>new Element(tag),addEventListener(){}},window:{location:{origin:'http://127.0.0.1:8766'},parent:{postMessage:data=>events.push(data)}}};
 vm.createContext(context);vm.runInContext(await fs.readFile(new URL('../runtime/editor/frame-editor.js',import.meta.url),'utf8'),context);
 const api=context.window.editorApi;
 for(const kind of ['text','block','separator','image']){
  api.insert(kind,{x:9999,y:9999,text:'Controlled fixture',image:'data:image/png;base64,AA==',duration:520,easing:'cubic-bezier(.22,1,.36,1)'});
  const element=page.children.at(-1),size=[element.style.width,element.style.height];
  assert.ok(parseFloat(element.style.left)+parseFloat(element.style.width)<=794);
  assert.ok(parseFloat(element.style.top)+parseFloat(element.style.height)<=1123);
  assert.equal(api.details().added,true);assert.equal(api.details().kind,kind);api.set('y',-8);assert.deepEqual([element.style.width,element.style.height],size);
  api.set('reset');assert.equal(element.style.position,'absolute');assert.deepEqual([element.style.width,element.style.height],size);assert.equal(element.dataset.editorY,undefined);api.removeAdded();assert.equal(page.children.length,0);
 }
 assert.equal(animations.length,4);assert.equal(animations[0].options.duration,520);
 assert.throws(()=>api.insert('image',{image:'https://example.com/a.png'}),/Select an image/);
 assert.ok(events.some(event=>event.type==='dirty'));
});

test('the trend counter starts together with the line and uses the same deceleration',async()=>{
 const source=await fs.readFile(new URL('../runtime/shared/motion.js',import.meta.url),'utf8');
 const code=source.slice(source.indexOf('export function animateTrend'),source.indexOf('export function wirePageLink')).replace('export ','');
 const effects=[];
 class Node{style={};children=[];append(child){this.children.push(child);}replaceChildren(){this.children=[];}animate(frames,options){effects.push({frames,options});}}
 const number=new Node(),counter={dataset:{trendCount:'14'},querySelector:()=>number,getAnimations:()=>[]};
 const line={getTotalLength:()=>100,animate:(frames,options)=>effects.push({frames,options})};
 const chart={dataset:{},closest:()=>({querySelector:()=>counter}),querySelector:selector=>selector==='.trend-line'?line:null,querySelectorAll:()=>[]};
 const context={document:{createElement:()=>new Node()},reduce:{matches:false},ease:'cubic-bezier(.22,1,.36,1)'};
 vm.createContext(context);vm.runInContext(code,context);context.animateTrend(chart);
 assert.equal(effects.length,3);assert.equal(number.children.length,2);
 for(const effect of effects){assert.equal(effect.options.duration,1050);assert.equal(effect.options.delay,undefined);assert.equal(effect.options.easing,context.ease);}
 assert.equal(number.children[0].children[0].children.at(-1).textContent,'1');assert.equal(number.children[1].children[0].children.at(-1).textContent,'4');
});
