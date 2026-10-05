import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import {openDashboard,insertRecord,fields} from '../runtime/tools/lib/dashboard-db.mjs';
import {cardFrames,cardPose} from '../runtime/shared/workspace-card.js';
import {springProgress} from '../runtime/shared/motion-tokens.js';

test('rounded route cards join continuously and leave the viewport in either direction',()=>{
 for(const direction of [-1,1]){
  const geometry={width:1440,direction},shrink=cardFrames('shrink',geometry),out=cardFrames('out',geometry),incoming=cardFrames('in',geometry),expand=cardFrames('expand',geometry);
  const pose=frame=>{const {offset,...style}=frame;return style;};
  assert.deepEqual(pose(shrink[0]),cardPose());assert.deepEqual(pose(shrink.at(-1)),pose(out[0]));
  assert.deepEqual(pose(incoming.at(-1)),pose(expand[0]));assert.deepEqual(pose(expand.at(-1)),cardPose());
  assert.match(shrink.at(-1).borderRadius,/32px/);
  const x=Number(out.at(-1).transform.match(/translate3d\(([^p]+)/)[1]);
  assert.ok(Math.abs(x)>1440*(1+.825)/2,'the departing card is completely offscreen before it is hidden');
  for(const frames of [shrink,out,incoming,expand])for(const frame of frames)assert.doesNotMatch(JSON.stringify(frame),/NaN|Infinity/);
 }
});

test('closing dialog follows scrolling without restarting the original animation',async()=>{
 const source=await fs.readFile(new URL('../runtime/shared/motion.js',import.meta.url),'utf8');
 const code=source.slice(source.indexOf('function followClosingSource'),source.indexOf('function resolveSource'));
 const queued=new Map();let sequence=0,box={left:900,top:400};
 const context={requestAnimationFrame:cb=>{queued.set(++sequence,cb);return sequence;},cancelAnimationFrame:id=>queued.delete(id),springProgress,motion:{close:560}};
 vm.createContext(context);vm.runInContext((await fs.readFile(new URL('../runtime/shared/anchor-motion.js',import.meta.url),'utf8')).replace('export ','')+'\n'+code,context);
 const dialog={open:true,style:{}},state={closing:true,shape:{currentTime:280},source:{isConnected:true,getBoundingClientRect:()=>box}};
 const stop=context.followClosingSource(dialog,state,{left:900,top:500});
 const tick=()=>{const [id,cb]=queued.entries().next().value;queued.delete(id);cb();};
 tick();assert.match(dialog.style.transform,/translate\(0px,-/);
 box={left:920,top:250};state.shape.currentTime=560;tick();
 assert.equal(dialog.style.transform,'translate(20px,-250px)');assert.equal(state.shape.currentTime,560);
 stop();assert.equal(dialog.style.transform,'none');assert.equal(queued.size,0);
});

test('PDF save celebration happens only after a successful response and leaves failed edits dirty',async()=>{
 const source=await fs.readFile(new URL('../runtime/editor/editor.js',import.meta.url),'utf8');
 const code=source.slice(source.indexOf('async function saveMaterial('),source.indexOf("save.addEventListener('click'"));
 for(const success of [true,false]){
  const events=[],context={$:()=>({}),languageLayout:{reserve(){}},active:{project:'fixture',kind:'cv'},saving:false,loading:false,dirty:true,save:{getBoundingClientRect:()=>({left:10,top:10,width:100,height:40})},frame:{contentWindow:{editorApi:{serialize:()=>'<html>Controlled fixture</html>'}}},updateControls(){},setState:(...args)=>events.push(args),celebrateSave:()=>events.push(['particles']),api:async()=>{if(!success)throw Error('Controlled failure');return{pdfPath:'D:/fixture/saved.pdf'};}};
  vm.createContext(context);vm.runInContext(code,context);
  const result=await context.saveMaterial({detail:1,clientX:30,clientY:20});
  assert.equal(result,success);assert.equal(context.dirty,!success);assert.equal(context.saving,false);
  assert.equal(events.some(event=>event[0]==='particles'),success);
  if(success)assert.equal(events.find(event=>event[0]==='saved')[1].path,'D:/fixture/saved.pdf');
 }
});

test('adding context and trash fields preserves a legacy database and its import contract',async()=>{
 const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'ul-legacy-context-'));
 let db=openDashboard(workspace);
 const original=insertRecord(db,{id:'legacy-record',date:'2026-10-02',company:'Controlled fixture',role:'Developer',jd:'Historical JD\n\n'},{sourceSheet:'original',sourceRow:2});
 const history=db.prepare('SELECT * FROM application_events').all();
 for(const name of ['company_info','role_analysis','archived_at'])db.exec(`ALTER TABLE applications DROP COLUMN ${name}`);
 db.close();db=openDashboard(workspace);
 try{
  assert.equal(fields.length,23);const row=db.prepare('SELECT * FROM applications').get();
  for(const name of [...fields,'version','created_at','updated_at','source_sheet','source_row'])assert.equal(row[name],original[name]);
  assert.equal(row.company_info,'');assert.equal(row.role_analysis,'');assert.equal(row.archived_at,'');
  assert.deepEqual(db.prepare('SELECT * FROM application_events').all(),history);
 }finally{db.close();}
});
