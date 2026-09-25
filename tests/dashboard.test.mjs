import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {openDashboard,insertRecord,updateRecord,syncSubmittedLead,summary} from '../runtime/tools/lib/dashboard-db.mjs';

async function freePort(){const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;}
test('local Dashboard serves records and guards edits',async()=>{
 const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'ul-dashboard-'));const db=openDashboard(workspace);db.close();
 const port=await freePort(),base=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,[path.resolve('runtime/tools/dashboard.mjs'),'--serve','--port',String(port)],{cwd:path.resolve('.'),env:{...process.env,USELESS_LINKEDIN_WORKSPACE:workspace},stdio:'ignore'});
 try{
  let ready=false;for(let i=0;i<100;i++){try{const r=await fetch(`${base}/api/health`);ready=r.ok;if(ready)break;}catch{}await new Promise(resolve=>setTimeout(resolve,50));}assert.ok(ready,'Server did not start');
  const write=(method,url,data,origin=base)=>fetch(base+url,{method,headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(data)});
  assert.equal((await fetch(base+'/')).status,200);
  assert.match(await (await fetch(base+'/dashboard.js')).text(),/申请与下一步/);
  assert.equal((await write('POST','/api/applications',{id:'test-1',date:'2026-09-22',company:'Example',role:'Developer',status:'已提交',applied:'☑'})).status,400);
  assert.equal((await write('POST','/api/applications',{id:'test-1',date:'2026-09-22',company:'Example',role:'Developer'},'http://evil.example')).status,403);
  const created=await write('POST','/api/applications',{id:'test-1',date:'2026-09-22',company:'Example',role:'Developer',job_url:'https://example.org/job'});assert.equal(created.status,201);
  const row=await created.json();assert.equal(row.version,1);
  const changed=await write('PATCH','/api/applications/test-1',{version:1,status:'材料已准备',next_action:'Review PDF'});assert.equal(changed.status,200);assert.equal((await changed.json()).version,2);
  assert.equal((await write('PATCH','/api/applications/test-1',{version:1,status:'待用户'})).status,409);
  assert.equal((await (await fetch(base+'/api/applications?q=Example')).json()).length,1);
  assert.equal((await (await fetch(base+'/api/applications/test-1/events')).json()).length,2);
  assert.equal((await (await fetch(base+'/api/summary')).json()).total,1);
  for(const [id,date,company] of [['test-2','2026-09-20','Zebra'],['test-3','2026-09-21','Éclair'],['test-4','2026-09-19','Alpha']])assert.equal((await write('POST','/api/applications',{id,date,company,role:'Developer'})).status,201);
  const ids=async query=>(await (await fetch(`${base}/api/applications?${query}`)).json()).map(x=>x.id);
  assert.deepEqual(await ids('sort=date-asc'),['test-4','test-2','test-3','test-1']);
  assert.deepEqual(await ids('sort=company-asc'),['test-4','test-3','test-1','test-2']);
  assert.deepEqual(await ids('sort=company-desc'),['test-2','test-1','test-3','test-4']);
  assert.deepEqual(await ids('initial=E&sort=company-asc'),['test-3','test-1']);
  assert.deepEqual(await ids('initial=E&status=待处理'),['test-3']);
  assert.equal((await fetch(base+'/api/applications?sort=unsafe')).status,400);
  assert.equal((await fetch(base+'/dashboard-layout.css')).status,200);
  const summary=await (await fetch(base+'/api/summary')).json();
  assert.equal(summary.pendingVerification,0);
 }finally{child.kill();}
});
test('confirmed lead synchronization creates one verified Dashboard record',async()=>{
 const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'ul-dashboard-sync-'));const db=openDashboard(workspace);
 try{
  const lead={id:'lead-1',url:'https://example.org/posting',company:'Example',title:'Developer',state:'submitted',submitted:true,submissionEvidence:JSON.stringify({kind:'success-page',artifactSha256:'a'.repeat(64)})};
  assert.throws(()=>syncSubmittedLead(db,{...lead,state:'submission-unconfirmed'}));
  const record=syncSubmittedLead(db,lead);assert.equal(record.submission_verified,1);assert.equal(record.status,'已提交');assert.equal(summary(db).verifiedSubmitted,1);
  assert.equal(syncSubmittedLead(db,lead).id,record.id);assert.equal(summary(db).total,1);
  assert.equal(db.prepare("SELECT count(*) n FROM application_events WHERE action='submission-receipt-verified'").get().n,1);
 }finally{db.close();}
});
test('editing a historical row preserves untouched JD whitespace',async()=>{
 const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'ul-dashboard-history-'));const db=openDashboard(workspace);
 try{
  const first=insertRecord(db,{id:'legacy-1',date:'2026-09-22',company:'Example',role:'Developer',jd:'Full posting text\n\n'}, {sourceSheet:'2026-09-22',sourceRow:2});
  const next=updateRecord(db,first.id,{version:first.version,next_action:'Review'});
  assert.equal(next.jd,'Full posting text\n\n');
 }finally{db.close();}
});
test('Dashboard counts unverified submissions and excludes closed follow-ups',async()=>{
 const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'ul-dashboard-counts-'));const db=openDashboard(workspace);
 try{
  insertRecord(db,{id:'pending',date:'2026-09-22',company:'A',role:'Developer',status:'已提交',applied:'☑',submission_evidence:'Historical note',followup_date:'2020-01-01'});
  insertRecord(db,{id:'closed',date:'2026-09-22',company:'B',role:'Developer',status:'跳过',followup_date:'2020-01-01'});
  const counts=summary(db);assert.equal(counts.pendingVerification,1);assert.equal(counts.followupDue,1);
 }finally{db.close();}
});
