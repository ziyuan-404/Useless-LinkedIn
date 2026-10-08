import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

test('translation reservations use layout width during route scaling',async()=>{
 const source=(await fs.readFile(new URL('../runtime/shared/language-layout.js',import.meta.url),'utf8')).replace(/^import .+;\r?\n/gm,'').replace(/export /g,'');
 const style={display:'block',fontSize:'14px',lineHeight:'20px',minHeight:'0',paddingLeft:'0',paddingRight:'0',paddingTop:'0',paddingBottom:'0',borderLeftWidth:'0',borderRightWidth:'0',borderTopWidth:'0',borderBottomWidth:'0',whiteSpace:'normal'};
 const node={tagName:'H1',children:[],parentElement:{},dataset:{},style:{setProperty(key,value){this[key]=value;}},classList:{add(){}},offsetWidth:200,matches(){return false;},closest(){return null;},getClientRects(){return [{}];},getBoundingClientRect(){return {width:this.paintWidth??200};}};
 const probe={style:{},setAttribute(){},getBoundingClientRect(){return {width:this.textContent.length*5,height:Math.ceil(this.textContent.length*5/(parseFloat(this.style.width)||10000))*20};}};
 const document={body:{append(){}},createElement(){return probe;},querySelectorAll(selector){return selector.startsWith('[data-')?[node]:[];}};
 const context={document,innerWidth:1440,getComputedStyle:n=>n===probe?probe.style:style,MutationObserver:class{observe(){}},window:{addEventListener(){}},requestAnimationFrame(){},Set,Map,WeakMap,URL,location:{href:'http://127.0.0.1:8765/app'}};
 context.window.parent=context.window;
 vm.createContext(context);vm.runInContext(source,context);
 const layout=context.installLanguageLayout({variants:()=>['x'.repeat(50)]});
 assert.equal(node.style['--language-height'],'40px');
 node.paintWidth=2;layout.reserve();
 assert.equal(node.style['--language-height'],'40px','a nearly collapsed route surface must not become thousands of pixels tall');
});

test('focus-only reservations skip other labels and decorative animation nodes do not schedule full measurements',async()=>{
 const source=(await fs.readFile(new URL('../runtime/shared/language-layout.js',import.meta.url),'utf8')).replace(/^import .+;\r?\n/gm,'').replace(/export /g,'');
 const style={display:'block',fontSize:'14px',lineHeight:'20px',minHeight:'0',paddingLeft:'0',paddingRight:'0',paddingTop:'0',paddingBottom:'0',borderLeftWidth:'0',borderRightWidth:'0',borderTopWidth:'0',borderBottomWidth:'0',whiteSpace:'normal'};
 const label=()=>({tagName:'H1',children:[],parentElement:{},dataset:{},style:{setProperty(key,value){this[key]=value;}},classList:{add(){}},offsetWidth:200,matches(){return false;},closest(){return null;},getClientRects(){return [{}];}});
 const focus=label(),other=label(),calls=new Map([[focus,0],[other,0]]),queued=new Map();let sequence=0,observerCallback;
 const probe={style:{},setAttribute(){},contains(){return false;},getBoundingClientRect(){return {width:40,height:20};}};
 const document={body:{},createElement:()=>probe,querySelectorAll:selector=>selector.startsWith('[data-')?[focus,other]:[]};document.body.append=()=>{};
 const context={document,innerWidth:1440,getComputedStyle:n=>n===probe?probe.style:style,MutationObserver:class{constructor(callback){observerCallback=callback;}observe(){}takeRecords(){return[];}},window:{addEventListener(){}},requestAnimationFrame:callback=>{queued.set(++sequence,callback);return sequence;},cancelAnimationFrame:id=>queued.delete(id),URL,location:{href:'http://127.0.0.1:8765/app'}};
 context.window.parent=context.window;vm.createContext(context);vm.runInContext(source,context);
 const layout=context.installLanguageLayout({variants:node=>{calls.set(node,calls.get(node)+1);return['Controlled label'];}});
 const before=calls.get(other);layout.reserve({querySelectorAll:selector=>selector.startsWith('[data-')?[focus]:[]});assert.equal(calls.get(other),before);
 observerCallback([{target:document.body,type:'childList',addedNodes:[{closest:()=>true}],removedNodes:[]}]);assert.equal(queued.size,0,'halo and particle layers do not remeasure the page');
 const surface={closest:selector=>selector.split(',').includes('.workspace-card-surface')};
 observerCallback([{target:document.body,type:'childList',addedNodes:[surface],removedNodes:[]}]);
 observerCallback([{target:document.body,type:'childList',addedNodes:[],removedNodes:[surface]}]);
 assert.equal(queued.size,0,'temporary card surfaces do not trigger a full language measurement during a route');
 observerCallback([{target:other,type:'characterData'}]);observerCallback([{target:other,type:'characterData'}]);assert.equal(queued.size,1,'real text changes are coalesced');
 const callback=queued.values().next().value;queued.clear();callback();assert.ok(calls.get(other)>before,'real content changes still reserve their translations');
});
