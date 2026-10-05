import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

test('offsets and ordinary edge drags preserve size, corners still resize',async()=>{
 const handlers=new Map();let drag,resize,checker;
 class Element {
  tagName='P';children=[];className='';dataset={};style={};textContent='Sample';
  matches(){return false;}setAttribute(){}removeAttribute(){}
  getBoundingClientRect(){return {left:10,top:20,width:200,height:parseFloat(this.style.height)||40,right:210,bottom:60};}
 }
 const selected=new Element();
 const interaction={draggable(options){drag=options.listeners.move;return this;},resizable(options){resize=options.listeners.move;return this;},actionChecker(callback){checker=callback;return this;},unset(){}};
 const context={HTMLElement:Element,interact:()=>interaction,getComputedStyle:()=>({fontSize:'14px',opacity:1,color:'rgb(0,0,0)',backgroundColor:'rgb(255,255,255)'}),document:{body:{},documentElement:{},addEventListener(type,callback){handlers.set(type,callback);}},window:{location:{origin:'http://127.0.0.1:8766'},parent:{postMessage(){}}}};
 vm.createContext(context);vm.runInContext(await fs.readFile(new URL('../runtime/editor/frame-editor.js',import.meta.url),'utf8'),context);
 handlers.get('click')({target:selected,preventDefault(){}});
 context.window.editorApi.set('y',25);
 assert.equal(selected.dataset.editorY,'25');assert.equal(selected.style.height,undefined);assert.equal(selected.style.width,undefined);
 const edge=checker({clientX:110,clientY:22},{},{name:'resize'},interaction,selected);
 assert.equal(edge.name,'drag');
 drag({target:selected,dx:0,dy:12});assert.equal(selected.dataset.editorY,'37');assert.equal(selected.style.height,undefined);
 assert.equal(checker({clientX:11,clientY:21},{},{name:'resize'},interaction,selected).name,'resize');
 resize({target:selected,rect:{width:205,height:45},deltaRect:{left:0,top:0}});
 assert.equal(selected.style.height,'45px');assert.equal(selected.style.width,'205px');assert.equal(selected.dataset.editorY,'37');
});
