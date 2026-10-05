import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import vm from 'node:vm';
import {spawn} from 'node:child_process';
import {cardFrames,cardPose} from '../runtime/shared/workspace-card.js';

const skill=path.resolve(import.meta.dirname,'..');
async function freePort(){const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;}

test('both local services serve a persistent host and a separate embedded application',async()=>{
 const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'ul-workspace-'));
 const services=[];
 try{
  for(const view of ['dashboard','editor']){
   const port=await freePort(),base=`http://127.0.0.1:${port}`;
   const child=spawn(process.execPath,[path.join(skill,`runtime/tools/${view}.mjs`),...(view==='dashboard'?['--serve']:[]),'--port',String(port)],{cwd:skill,env:{...process.env,USELESS_LINKEDIN_WORKSPACE:workspace},stdio:'ignore'});services.push(child);
   let ready=false;for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,50));}
   assert.ok(ready,`${view} service did not start`);
   const response=await fetch(base+'/'),host=await response.text();
   assert.equal(response.status,200);assert.match(host,new RegExp(`data-default-view="${view}"`));
   assert.match(host,new RegExp(`data-${view}-port="${port}"`));assert.doesNotMatch(host,/__DEFAULT_VIEW__|__DASHBOARD_PORT__|__EDITOR_PORT__/);
   assert.match(host,/workspace-dashboard/);assert.match(host,/workspace-editor/);
   assert.match(response.headers.get('content-security-policy'),/frame-src 'self' http:\/\/127\.0\.0\.1:8765 http:\/\/127\.0\.0\.1:8766/);
   const app=await (await fetch(base+'/app')).text();assert.doesNotMatch(app,/workspace-stage/);assert.match(app,new RegExp(`${view}\\.js`));
   for(const asset of ['workspace.js','workspace.css','workspace-card.js','workspace-genie.js','motion.js','motion-tokens.js','anchor-motion.js'])assert.equal((await fetch(`${base}/${asset}`)).status,200,`${view}/${asset}`);
   assert.equal((await fetch(base+'/not-an-asset')).status,404);
  }
 }finally{for(const child of services)child.kill();}
});

test('workspace waits for drawing acknowledgements, reuses both frames and rejects foreign messages',async()=>{
 const source=(await fs.readFile(path.join(skill,'runtime/shared/workspace.js'),'utf8')).replace(/^import .+;\r?\n/gm,'');
 const listeners=new Map(),messages=[],nodes=new Map(),pendingAcks=[];
 const location={href:'http://127.0.0.1:8765/?lang=en',protocol:'http:',hostname:'127.0.0.1'};
 const root={dataset:{defaultView:'dashboard',dashboardPort:'8765',editorPort:'8766'},classList:{add(){},remove(){}},lang:'en'};
 const stage={setAttribute(name,value){this[name]=value;}};
 const paragraph={},button={addEventListener(){}},message={hidden:true,dataset:{},querySelector:selector=>selector==='p'?paragraph:button};
 const glass={style:{},animate(){return{finished:Promise.resolve(),cancel(){}};}};
 const emit=event=>{for(const callback of listeners.get('message')||[])callback(event);};
 const acknowledge=(view,type,requestId,extra={})=>emit({source:nodes.get(view).contentWindow,origin:`http://127.0.0.1:${view==='dashboard'?8765:8766}`,data:{type,requestId,...extra}});
 for(const view of ['dashboard','editor']){
  const node={dataset:{},setAttribute(){},inert:false,srcWrites:0,classList:{add(){},remove(){}},style:{removeProperty(){}},animate(){return{finished:Promise.resolve(),cancel(){}};}};
  node.contentWindow={postMessage(data){messages.push({view,...data});const ack={'workspace-prepare':'workspace-prepared','workspace-depart':'workspace-departed','workspace-enter':'workspace-entered','workspace-card-out':'workspace-card-out-done'}[data.type];if(ack){if(data.type==='workspace-prepare')queueMicrotask(()=>acknowledge(view,ack,data.requestId));else pendingAcks.push(extra=>acknowledge(view,ack,data.requestId,extra));}}};
  Object.defineProperty(node,'src',{set(){this.srcWrites++;queueMicrotask(()=>acknowledge(view,'workspace-ready'));}});nodes.set(view,node);
 }
 const languageReplays=[];
 const context={cardFrames,cardPose,document:{body:{},documentElement:root,querySelector(selector){if(selector==='.workspace-stage')return stage;if(selector==='.workspace-transition-glass')return glass;if(selector==='.workspace-message')return message;return nodes.get(selector.replace('#workspace-',''));}},window:{addEventListener(type,listener){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(listener);}},location,history:{replaceState(state,unused,url){location.href=String(url);},pushState(state,unused,url){location.href=String(url);}},localStorage:{getItem(){return null;},setItem(){}},URL,AbortSignal,setTimeout,clearTimeout,fetch:async()=>({ok:true,json:async()=>({playIntro:false})}),revealPage:async()=>{},reducedMotion:()=>false,innerWidth:1440,innerHeight:900,createGlass:()=>({remove(){},play(duration){languageReplays.push(duration);return[{finished:Promise.resolve(),cancel(){}}];}}),motion:{popover:520,routeOut:760,routeIn:1080,intro:2500}};
 await vm.runInNewContext(`(async()=>{${source}})()`,context);
 assert.equal(nodes.get('dashboard').dataset.active,'true');
 const navigate={type:'workspace-navigate',view:'editor',language:'en',origin:{x:.8,y:.04}};
 emit({source:{},origin:'http://evil.invalid',data:navigate});await new Promise(resolve=>setImmediate(resolve));assert.equal(pendingAcks.length,0);
 emit({source:nodes.get('dashboard').contentWindow,origin:'http://127.0.0.1:8765',data:navigate});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(pendingAcks.length,1);assert.equal(messages.at(-1).type,'workspace-depart');assert.equal(nodes.get('dashboard').dataset.active,'true','old frame remains visible until departure finishes');
 pendingAcks.shift()({blocked:true});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(nodes.get('dashboard').dataset.active,'true','unsaved changes block the card switch before shrinking');assert.equal(stage['aria-busy'],'false');
 emit({source:nodes.get('dashboard').contentWindow,origin:'http://127.0.0.1:8765',data:navigate});await new Promise(resolve=>setImmediate(resolve));
 pendingAcks.shift()();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(nodes.get('editor').dataset.active,'true');assert.equal(messages.at(-1).type,'workspace-enter');
 pendingAcks.shift()();pendingAcks.shift()();await new Promise(resolve=>setImmediate(resolve));
 assert.match(location.href,/view=editor/);assert.equal(stage['aria-busy'],'false');
 assert.equal(nodes.get('dashboard').srcWrites,1);assert.equal(nodes.get('editor').srcWrites,1,'switching does not reload either application');
 emit({source:nodes.get('dashboard').contentWindow,origin:'http://127.0.0.1:8765',data:{type:'workspace-language-intent',language:'zh',intentId:7}});
 assert.match(location.href,/lang=en/,'inactive frame cannot override the visible language');
 emit({source:nodes.get('editor').contentWindow,origin:'http://127.0.0.1:8766',data:{type:'workspace-language-intent',language:'fr',intentId:8}});
 assert.match(location.href,/lang=fr/);
 assert.equal(messages.at(-1).intentId,8,'host acknowledges the originating intent');
 assert.equal(messages.at(-1).revision,1);
 emit({source:nodes.get('dashboard').contentWindow,origin:'http://127.0.0.1:8765',data:{type:'workspace-language',language:'en'}});
 assert.match(location.href,/lang=fr/,'delayed rendered-language echoes cannot revert the host');
 assert.deepEqual(languageReplays,[2500],'language intent reuses one glass reveal at the host');
 emit({source:nodes.get('editor').contentWindow,origin:'http://127.0.0.1:8766',data:{type:'workspace-navigate',view:'dashboard',language:'en'}});
 await new Promise(resolve=>setImmediate(resolve));
 assert.match(location.href,/lang=fr/,'navigation cannot replace a newer language intent with still-rendered labels');
 assert.equal(messages.findLast(item=>item.type==='workspace-prepare').language,'fr');
 pendingAcks.shift()();await new Promise(resolve=>setImmediate(resolve));
 pendingAcks.shift()();pendingAcks.shift()();await new Promise(resolve=>setImmediate(resolve));
 assert.match(location.href,/view=dashboard/);assert.match(location.href,/lang=fr/);
});

test('rapid language intents keep the latest labels and reject old host acknowledgements',async()=>{
 const source=(await fs.readFile(path.join(skill,'runtime/shared/language-layout.js'),'utf8')).replace(/^import .+;\r?\n/gm,'').replaceAll('export ','');
 const messages=[],rendered=[],classes=new Set();
 const root={classList:{toggle(name,yes){yes?classes.add(name):classes.delete(name);},remove(name){classes.delete(name);}}};
 const context={document:{documentElement:root,querySelector:()=>null},window:{parent:{postMessage(data){messages.push(data);}}},location:{href:'http://127.0.0.1:8766/app?motion-embedded=1'},URL,innerWidth:1440,innerHeight:900,matchMedia:()=>({matches:false}),requestAnimationFrame:cb=>setImmediate(cb),setTimeout,clearTimeout};
 vm.runInNewContext(`${source}\nthis.changeLabels=changeLabels;`,context);
 const first=context.changeLabels(()=>rendered.push('en'),{language:'en'});
 const latest=context.changeLabels(()=>rendered.push('fr'),{language:'fr'});
 await context.changeLabels(()=>rendered.push('stale'),{language:'en',remote:true,revision:1,intentId:1});
 await context.changeLabels(()=>rendered.push('ack'),{language:'fr',remote:true,revision:2,intentId:2});
 await Promise.all([first,latest]);
 assert.deepEqual(rendered,['fr']);
 assert.equal(classes.has('language-changing'),false);
 await context.changeLabels(()=>rendered.push('old-revision'),{language:'en',remote:true,revision:1});
 assert.deepEqual(rendered,['fr']);
 assert.deepEqual(messages.map(item=>item.type),['workspace-language-intent','workspace-language-intent'],'renders and host updates never emit an echo');
 const back=context.changeLabels(()=>rendered.push('zh'),{language:'zh'});
 await context.changeLabels(()=>rendered.push('interrupted'),{language:'en',remote:true,revision:3});
 await back;
 assert.deepEqual(rendered,['fr','zh'],'a late host update cannot interrupt an unacknowledged click');
});
