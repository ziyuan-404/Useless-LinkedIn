import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {openDashboard,insertRecord,updateRecord,syncDashboardLead,dbPath} from '../runtime/tools/lib/dashboard-db.mjs';
import {synchronizeDashboard,dashboardPacket} from '../runtime/tools/lib/dashboard-sync.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex');
const cli=path.resolve('runtime/tools/useless-linkedin.mjs');
async function save(file,value){await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,typeof value==='string'?value:JSON.stringify(value,null,2));}
async function fixture({letter=true,state='submitted'}={}){
 const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'ul-dashboard-complete-')),home=path.join(workspace,'个人资料/applications/automation'),dir=path.join(home,'jobs','fixture-job'),output=path.join(workspace,'个人资料/CV/fixture');
 const jd='Fictional full job description. '.repeat(20),contextHash=sha(jd),pdf='%PDF-1.4\nFictional material '+'.'.repeat(200),artifact='<html>Thank you for applying. Fictional success fixture.</html>';
 const assessment={contextHash,company:'Example',role:'Developer',ko:'MARGINAL',matchLevel:'延伸',sections:{A:{reason:'Fictional role analysis'},B:{reason:'Fictional sourced skills and gaps'}},decision:{route:'precision',gaps:['Unconfirmed employer timetable']}};
 await save(path.join(dir,'context.json'),{url:'https://example.invalid/job',contextHash,captured:{jd,liveness:{result:'active'},capturedAt:'2026-10-05T08:00:00Z'}});await save(path.join(dir,'jd.txt'),jd);await save(path.join(dir,'assessment.json'),assessment);
 const materials=[];for(const name of ['Example-CV.pdf',...(letter?['Example-Lettre.pdf']:[])]){const file=path.join(output,name);await save(file,pdf);materials.push({path:path.relative(workspace,file),sha256:sha(pdf)});}
 const artifactPath=path.join(dir,'success.html');await save(artifactPath,artifact);
 const job={id:'fixture-1',key:'https://example.invalid/job',url:'https://example.invalid/job',company:'Example',title:'Developer',portal:'Fictional ATS',state,submitted:state==='submitted',createdAt:'2026-10-05T08:00:00Z',lastSeenAt:'2026-10-05T08:00:00Z',directory:'fixture-job',contextHash,ko:'MARGINAL',requisitionId:'REQ-1',possibleDuplicates:[],output,approvalSnapshot:{assessmentHash:sha(await fs.readFile(path.join(dir,'assessment.json'))),materials},submissionEvidence:JSON.stringify({kind:'success-page',observedAt:'2026-10-05T08:20:00Z',description:'Fictional success',artifactPath:path.relative(workspace,artifactPath),artifactSha256:sha(artifact)})};
 Object.assign(job.approvalSnapshot,{id:'fictional-snapshot',contextHash,answersHash:sha('[]'),reviewedAt:'2026-10-05T08:10:00Z',reviewEvidence:'Fictional reviewed fixture'});
 await save(path.join(home,'leads.json'),{jobs:[job],version:1,scans:[]});const db=openDashboard(workspace);return{workspace,home,dir,output,job,db,jd};
}
test('complete sync recovers full JD, reviewed CV and letter, assessment and metadata; retries are no-ops',async()=>{
 const f=await fixture();try{
  insertRecord(f.db,{id:f.job.id,date:'2026-10-05',company:'Example',role:'Developer',job_url:f.job.url,resume_path:f.output,match_level:'中'});
  const result=await synchronizeDashboard(f.workspace,f.home,f.job,{db:f.db});assert.equal(result.complete,true);const row=f.db.prepare('SELECT * FROM applications').get();
  assert.equal(row.jd,f.jd);assert.equal(row.resume_path,path.join(f.output,'Example-CV.pdf'));assert.equal(row.letter_path,path.join(f.output,'Example-Lettre.pdf'));assert.equal(row.mode,'precision');assert.equal(row.knockout,'MARGINAL');assert.equal(row.requisition_id,'REQ-1');assert.equal(row.channel,'Fictional ATS');assert.match(row.role_analysis,/Fictional role analysis/);assert.match(row.company_info,/尚未提供独立公司研究/);assert.equal(row.match_level,'中','existing human judgement must survive');assert.equal(row.last_contact,'');
  const events=f.db.prepare('SELECT count(*) n FROM application_events').get().n,metadata=f.db.prepare('SELECT * FROM application_sync').get();
  const second=await synchronizeDashboard(f.workspace,f.home,f.job,{db:f.db});assert.equal(second.changed,false);assert.equal(second.version,row.version);assert.equal(f.db.prepare('SELECT count(*) n FROM application_events').get().n,events);assert.deepEqual(f.db.prepare('SELECT * FROM application_sync').get(),metadata);
 }finally{f.db.close();}
});
test('manual edits, interview stages, closed outcomes, and date-only history are preserved',async()=>{
 const f=await fixture();try{
  await synchronizeDashboard(f.workspace,f.home,f.job,{db:f.db});let row=f.db.prepare('SELECT * FROM applications').get();row=updateRecord(f.db,row.id,{version:row.version,company_info:'Human company research',next_action:'Human follow-up',followup_date:'2026-11-01',applied:'☐',awaiting_interview:'☑',status:'撤回'});
  await synchronizeDashboard(f.workspace,f.home,f.job,{db:f.db});const after=f.db.prepare('SELECT * FROM applications').get();for(const k of ['company_info','next_action','followup_date','applied','awaiting_interview','status'])assert.equal(after[k],row[k]);
  const historic={...f.job,id:'history-1',url:'https://example.invalid/history'};insertRecord(f.db,{id:historic.id,date:'2020-01-01',company:'Example',role:'Developer',job_url:historic.url},{sourceSheet:'Original',sourceRow:2});syncDashboardLead(f.db,historic);assert.equal(f.db.prepare('SELECT submitted_at FROM applications WHERE id=?').get(historic.id).submitted_at,'');
 }finally{f.db.close();}
});
test('missing cover letter is explicit and optional; changed or ambiguous materials cannot report complete',async()=>{
 const f=await fixture({letter:false});try{
  let result=await synchronizeDashboard(f.workspace,f.home,f.job,{db:f.db});assert.equal(result.complete,true);assert.ok(result.issues.some(i=>i.field==='letter_path'&&i.reason==='not_in_reviewed_material_manifest'));assert.equal(f.db.prepare('SELECT letter_path FROM applications').get().letter_path,'');
  await fs.appendFile(path.join(f.output,'Example-CV.pdf'),'changed');result=await synchronizeDashboard(f.workspace,f.home,f.job,{db:f.db});assert.equal(result.complete,false);assert.ok(result.issues.some(i=>/Material changed/.test(i.reason)));
 }finally{f.db.close();}
 const g=await fixture();try{const file=path.join(g.output,'Other-CV.pdf');await fs.copyFile(path.join(g.output,'Example-CV.pdf'),file);g.job.approvalSnapshot.materials.push({path:path.relative(g.workspace,file),sha256:sha(await fs.readFile(file))});const result=await synchronizeDashboard(g.workspace,g.home,g.job,{db:g.db});assert.equal(result.complete,false);assert.ok(result.issues.some(i=>i.reason==='ambiguous_materials'));}finally{g.db.close();}
});
test('renamed storage paths are resolved and hash checked instead of discarded',async()=>{
 const f=await fixture();try{const old='个人资料/CV/old-folder';f.job.output=old;f.job.approvalSnapshot.materials=f.job.approvalSnapshot.materials.map(m=>({...m,path:path.join(old,path.basename(m.path))}));await save(path.join(f.home,'storage-path-map.json'),{entries:[{from:old,to:path.relative(f.workspace,f.output)}]});const result=await synchronizeDashboard(f.workspace,f.home,f.job,{db:f.db});assert.equal(result.complete,true);assert.equal(f.db.prepare('SELECT resume_path FROM applications').get().resume_path,path.join(f.output,'Example-CV.pdf'));}finally{f.db.close();}
});
test('a uniquely selected pool PDF is a resume even without CV in its filename',async()=>{
 const f=await fixture({letter:false});try{const file=path.join(f.output,'pool-version.pdf');await fs.rename(path.join(f.output,'Example-CV.pdf'),file);f.job.output=file;f.job.applicationMode='bulk';f.job.approvalSnapshot.materials[0].path=path.relative(f.workspace,file);const result=await synchronizeDashboard(f.workspace,f.home,f.job,{db:f.db});assert.equal(result.complete,true);assert.equal(f.db.prepare('SELECT resume_path FROM applications').get().resume_path,file);}finally{f.db.close();}
});
test('dry-run simulates actual merge without writing the DB, leads or events',async()=>{
 const f=await fixture();f.db.close();const dbBytes=await fs.readFile(dbPath(f.workspace)),leadBytes=await fs.readFile(path.join(f.home,'leads.json'));const result=await synchronizeDashboard(f.workspace,f.home,f.job,{dryRun:true});assert.equal(result.complete,true);assert.equal(result.changed,true);assert.deepEqual(await fs.readFile(dbPath(f.workspace)),dbBytes);assert.deepEqual(await fs.readFile(path.join(f.home,'leads.json')),leadBytes);
});
test('receipt corruption, unrelated context and deleted records cannot silently succeed',async()=>{
 const f=await fixture();try{
  await fs.appendFile(path.join(f.dir,'success.html'),'changed');await assert.rejects(synchronizeDashboard(f.workspace,f.home,f.job,{db:f.db}),/Receipt artifact changed/);assert.equal(f.db.prepare('SELECT count(*) n FROM applications').get().n,0);
  f.job.state='approved';f.job.submitted=false;await save(path.join(f.dir,'context.json'),{url:'https://example.invalid/other',contextHash:f.job.contextHash,captured:{jd:f.jd}});const packet=await dashboardPacket(f.workspace,f.home,f.job);assert.equal(packet.values.jd,'');assert.ok(packet.issues.some(i=>i.reason==='context_identity_or_hash_mismatch'));
  insertRecord(f.db,{id:f.job.id,date:'2026-10-05',company:'Example',role:'Developer',job_url:f.job.url});f.db.prepare("UPDATE applications SET archived_at='2026-10-05T00:00:00Z' WHERE id=?").run(f.job.id);const result=await synchronizeDashboard(f.workspace,f.home,f.job,{db:f.db});assert.equal(result.archived,true);assert.equal(result.changed,false);
 }finally{f.db.close();}
});
test('sync is atomic when audit storage fails and rejects ambiguous identities',async()=>{
 const f=await fixture();try{
  f.db.exec("CREATE TRIGGER fixture_failure BEFORE INSERT ON application_sync BEGIN SELECT RAISE(ABORT,'fixture failure'); END;");await assert.rejects(synchronizeDashboard(f.workspace,f.home,f.job,{db:f.db}),/fixture failure/);assert.equal(f.db.prepare('SELECT count(*) n FROM applications').get().n,0);assert.equal(f.db.prepare('SELECT count(*) n FROM application_events').get().n,0);f.db.exec('DROP TRIGGER fixture_failure');
  for(const id of ['other-1','other-2'])insertRecord(f.db,{id,date:'2026-10-05',company:'Example',role:'Developer',job_url:f.job.url});await assert.rejects(synchronizeDashboard(f.workspace,f.home,f.job,{db:f.db}),/Multiple Dashboard/);
 }finally{f.db.close();}
});
test('batch CLI emits completeness, preserves data in dry run and marks retries pending on failure',async()=>{
 const f=await fixture();f.db.close();await save(path.join(f.workspace,'ids.json'),[f.job.id]);const run=(...args)=>spawnSync(process.execPath,[cli,'dashboard','--sync','--ids','ids.json',...args],{cwd:f.workspace,env:{...process.env,USELESS_LINKEDIN_WORKSPACE:f.workspace},encoding:'utf8'});
 assert.equal(run('--dry-run').status,0);assert.equal(JSON.parse(await fs.readFile(path.join(f.home,'leads.json'))).jobs[0].dashboardSynced,undefined);
 let result=run();assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).incomplete,0);assert.equal(JSON.parse(await fs.readFile(path.join(f.home,'leads.json'))).jobs[0].dashboardSynced,true);
 result=run();assert.equal(JSON.parse(result.stdout).changed,0);
 await fs.appendFile(path.join(f.dir,'success.html'),'corrupt');result=run();assert.equal(result.status,2);assert.equal(JSON.parse(result.stdout).errors,1);assert.equal(JSON.parse(await fs.readFile(path.join(f.home,'leads.json'))).jobs[0].dashboardSynced,false);
});
test('a tracked preparatory row does not become a false prior application in tracker history',async()=>{
 const f=await fixture({state:'approved'});try{await synchronizeDashboard(f.workspace,f.home,f.job,{db:f.db});const result=spawnSync(process.execPath,[cli,'tracker','--history'],{cwd:f.workspace,env:{...process.env,USELESS_LINKEDIN_WORKSPACE:f.workspace},encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(await fs.readFile(path.join(f.home,'leads.json'))).jobs[0].historyMatch,false);}finally{f.db.close();}
});
test('blocked executor results are recorded without a submitted flag',async()=>{
 const f=await fixture({state:'approved'});try{await save(path.join(f.dir,'apply/last-result.json'),{jobId:f.job.id,status:'blocked',reason:'upload-not-confirmed'});await synchronizeDashboard(f.workspace,f.home,f.job,{db:f.db});const row=f.db.prepare('SELECT * FROM applications').get();assert.equal(row.status,'受阻');assert.match(row.notes,/upload-not-confirmed/);assert.equal(row.applied,'☐');assert.equal(row.submission_verified,0);}finally{f.db.close();}
});
test('missing analysis is reported and an approved stage does not reuse a generation instruction',async()=>{
 const f=await fixture({state:'approved'});try{await fs.unlink(path.join(f.dir,'assessment.json'));let result=await synchronizeDashboard(f.workspace,f.home,f.job,{db:f.db});assert.equal(result.complete,false);assert.ok(result.missing.includes('role_analysis'));assert.equal(f.db.prepare('SELECT next_action FROM applications').get().next_action,'执行投递并保存成功凭证');}finally{f.db.close();}
});
