import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import vm from 'node:vm';
import {genieFrames} from '../runtime/shared/workspace-genie.js';
import {storageName,resolveStoragePath} from '../runtime/tools/lib/storage-paths.mjs';

test('cancel reloads the active saved document even when another folder is selected, and keeps failed reloads dirty',async()=>{
 const source=await fs.readFile(new URL('../runtime/editor/editor.js',import.meta.url),'utf8');
 const code=source.slice(source.indexOf('async function openMaterial('),source.indexOf("project.addEventListener('change'"));
 for(const success of [true,false]){
  const calls=[],context={project:{value:'other-folder',selectedOptions:[{textContent:'Other folder'}]},kind:{value:'letter'},loading:false,saving:false,dirty:true,active:{project:'loaded-folder',kind:'cv'},activeLabel:'Loaded folder',frame:{},surface:{style:{}},name:{},loadTimer:null,updateControls(){},setState(){},show(){},fitCanvas(){},t:key=>key,$:()=>({}),clearTimeout(){},setTimeout:()=>1,fetch:async url=>{calls.push(url);return{ok:success,text:async()=>'<html>Saved document</html>',json:async()=>({error:'Controlled read failure'})};}};
  vm.createContext(context);vm.runInContext(code,context);await context.openMaterial({...context.active});
  assert.deepEqual(calls,['/document/loaded-folder/cv']);
  assert.equal(context.activeLabel,'Loaded folder');assert.equal(context.dirty,!success);
  if(success)assert.equal(context.frame.src,'/document/loaded-folder/cv');
 }
});

test('genie surface deforms toward the clicked tab, is reversible, and stays finite when scrolled',()=>{
 const geometry={width:1280,height:820,crop:1600,target:{left:810,top:1545,width:125,height:38}};
 const out=genieFrames(geometry),enter=genieFrames(geometry,true);
 const numbers=frame=>frame.transform.slice(9,-1).split(',').map(Number);
 const map=(m,x,y)=>({x:(m[0]*x+m[4]*y+m[12])/(m[3]*x+m[7]*y+m[15]),y:(m[1]*x+m[5]*y+m[13])/(m[3]*x+m[7]*y+m[15])});
 for(const frame of [...out,...enter])assert.ok(numbers(frame).every(Number.isFinite));
 assert.equal(out[0].opacity,1);assert.equal(out.at(-1).opacity,0);
 assert.deepEqual(numbers(out.at(-1)),numbers(enter[0]));
 const first=numbers(out[0]),last=numbers(out.at(-1)),middle=numbers(out[30]);
 for(const [x,y] of [[0,1600],[1280,2420]]){const p=map(first,x,y);assert.ok(Math.abs(p.x-x)<1e-7&&Math.abs(p.y-y)<1e-7);}
 const top=map(last,0,1600),bottom=map(last,1280,2420);assert.ok(Math.abs(top.x-810)<1e-7&&Math.abs(top.y-1545)<1e-7);assert.ok(Math.abs(bottom.x-935)<1e-7&&Math.abs(bottom.y-1583)<1e-7);
 assert.ok(Math.abs(middle[7])>1e-6,'perspective deforms content instead of uniformly shrinking it');
 const card=numbers(out[32]);
 const cardTop=map(card,0,1600),cardRight=map(card,1280,1600),cardBottom=map(card,1280,2420);
 assert.ok(cardRight.x-cardTop.x<700,'a smaller card appears before the pull starts');
 assert.ok(cardTop.y>1700&&cardBottom.y<2300,'the gathered card remains in the content area before suction');
});

test('each workspace page targets its own navigation tab, regardless of the destination',async()=>{
 const source=await fs.readFile(new URL('../runtime/shared/motion.js',import.meta.url),'utf8');
 const prepare=source.slice(source.indexOf(' const prepareGenie='),source.indexOf(' const source=data=>'));
 const selectors=[],style={};
 const boxes={main:{left:0,top:66,width:1280,height:2000},header:{bottom:66},current:{left:693,top:14,width:150,height:38}};
 const context={innerHeight:900,main:{style,getBoundingClientRect:()=>boxes.main},document:{querySelector(selector){selectors.push(selector);return {getBoundingClientRect:()=>selector==='.topbar'?boxes.header:boxes.current};}}};
 vm.createContext(context);vm.runInContext(`${prepare}\nthis.geometry=prepareGenie({view:'dashboard'});`,context);
 assert.deepEqual(selectors,['.topbar','.workspace-tab[aria-current="page"]']);
 assert.equal(context.geometry.target.left,693);assert.equal(context.geometry.target.top,-52);
 assert.equal(context.geometry.height,834);
});

test('readable storage migration preserves content, resolves old references and is idempotent',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ul-storage-'));
 const home=path.join(root,'个人资料/applications/automation'),cv=path.join(root,'个人资料/CV'),old='2026-09-26-0123456789abcdef-9988-v2-v3',id='0123456789abcdef';
 const beforeEnv=process.env.USELESS_LINKEDIN_STATE_DIR;delete process.env.USELESS_LINKEDIN_STATE_DIR;
 try{
  await fs.mkdir(path.join(home,'jobs',id),{recursive:true});await fs.mkdir(path.join(cv,old),{recursive:true});
  const content=Buffer.from('Original PDF bytes'),historical=JSON.stringify({path:`个人资料/CV/${old}/sample.pdf`});
  await fs.writeFile(path.join(cv,old,'sample.pdf'),content);await fs.writeFile(path.join(home,'jobs',id,'receipt.json'),historical);
  const job={id,company:'Société / Test',title:'Développeur & Data (H/F)',createdAt:'2026-09-26T10:00:00Z',output:path.join(cv,old),state:'submitted',submitted:true};
  await fs.writeFile(path.join(home,'leads.json'),JSON.stringify({version:1,jobs:[job]}));
  const tool=path.resolve(import.meta.dirname,'../runtime/tools/rename-storage.mjs'),env={...process.env,USELESS_LINKEDIN_WORKSPACE:root};
  const run=flags=>spawnSync(process.execPath,[tool,'--audit','个人资料/audits/migration',...flags],{env,encoding:'utf8'});
  assert.equal(run([]).status,0);assert.ok((await fs.stat(path.join(cv,old))).isDirectory(),'dry run leaves source in place');
  const result=run(['--apply']);assert.equal(result.status,0,result.stderr);
  const store=JSON.parse(await fs.readFile(path.join(home,'leads.json'),'utf8')),saved=store.jobs[0];assert.equal(saved.id,id);assert.equal(saved.state,'submitted');assert.equal(saved.submitted,true);
  assert.match(saved.output,/Société - Test/);assert.doesNotMatch(saved.output,/0123456789abcdef/);
  assert.deepEqual(await fs.readFile(path.join(saved.output,'sample.pdf')),content);
  assert.equal(await fs.readFile(path.join(home,'jobs',saved.directory,'receipt.json'),'utf8'),historical,'historical proof is not rewritten');
  assert.equal(await resolveStoragePath(root,path.join(cv,old,'sample.pdf')),path.join(saved.output,'sample.pdf'));
  assert.match(run(['--apply']).stdout,/nothing changed/);
  assert.doesNotMatch(storageName({date:'2026-10-02',company:'CON',role:'数据/开发:*'}),/[<>:"/\\|?*]/);
 }finally{if(beforeEnv!==undefined)process.env.USELESS_LINKEDIN_STATE_DIR=beforeEnv;await fs.rm(root,{recursive:true,force:true});}
});
