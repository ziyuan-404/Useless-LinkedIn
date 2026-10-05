import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {spawn} from 'node:child_process';
import net from 'node:net';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {openDashboard,insertRecord,updateRecord,syncSubmittedLead,fields,localDate} from '../runtime/tools/lib/dashboard-db.mjs';
import {localMinute,recordDate,timestampFromInput} from '../runtime/dashboard/dashboard-datetime.js';
import {validateMatchReview} from '../runtime/tools/lib/match-review.mjs';
const cli=path.resolve('runtime/tools/useless-linkedin.mjs'),sha=x=>createHash('sha256').update(x).digest('hex');
const run=(workspace,...args)=>spawnSync(process.execPath,[cli,...args],{cwd:workspace,env:{...process.env,USELESS_LINKEDIN_WORKSPACE:workspace,PYTHONUTF8:'1'},encoding:'utf8'});
const save=(file,value)=>fs.writeFile(file,typeof value==='string'?value:JSON.stringify(value));
const temp=()=>fs.mkdtemp(path.join(process.env.USELESS_LINKEDIN_TEST_ARTIFACTS||os.tmpdir(),'submission-metadata-'));
const receipt=(stamp='2026-10-03T20:38:49.271Z')=>JSON.stringify({kind:'platform-status',observedAt:stamp,artifactSha256:'a'.repeat(64)});
const lead=(extra={})=>({id:'job-1',url:'https://example.org/job',company:'Example',title:'Developer',state:'submitted',submitted:true,matchLevel:'延伸',submissionEvidence:receipt(),...extra});

test('receipt minute is persisted, repeated sync is idempotent and explicit edited time is preserved',async()=>{
 const workspace=await temp(),db=openDashboard(workspace);try{
  const row=syncSubmittedLead(db,lead());assert.equal(row.submitted_at,'2026-10-03T20:38:49.271Z');assert.match(recordDate(row),/^2026-10-03 \d{2}:38$/);
  const events=db.prepare('SELECT count(*) n FROM application_events').get().n;assert.equal(syncSubmittedLead(db,lead()).version,row.version);assert.equal(db.prepare('SELECT count(*) n FROM application_events').get().n,events);
  const edited=updateRecord(db,row.id,{version:row.version,submitted_at:'2026-10-03T22:37:00+02:00'});assert.equal(edited.submitted_at,'2026-10-03T20:37:00.000Z');assert.equal(syncSubmittedLead(db,lead()).submitted_at,edited.submitted_at);
  assert.throws(()=>updateRecord(db,row.id,{version:edited.version,submitted_at:'2026-10-03T22:38'}),/timezone/);
 }finally{db.close();}
});

test('local midnight and daylight-saving transitions retain minute accuracy and follow-up day',async()=>{
 const prior=process.env.TZ;process.env.TZ='Europe/Paris';const workspace=await temp(),db=openDashboard(workspace);try{
  const row=syncSubmittedLead(db,lead({submissionEvidence:receipt('2026-10-03T23:38:49Z')}));assert.equal(row.date,'2026-10-04');assert.equal(recordDate(row),'2026-10-04 01:38');assert.equal(row.followup_date,'2026-10-11');
  assert.equal(localMinute('2026-10-25T00:30:00Z'),'2026-10-25T02:30');assert.equal(localMinute('2026-10-25T01:30:00Z'),'2026-10-25T02:30');assert.equal(timestampFromInput('2026-10-04T01:38'),'2026-10-03T23:38:00.000Z');
 }finally{db.close();if(prior===undefined)delete process.env.TZ;else process.env.TZ=prior;}
});

test('migration preserves date-only import values and a later receipt cannot invent their submission time',async()=>{
 const workspace=await temp(),db=openDashboard(workspace);try{
  assert.equal(fields.length,23);const row=insertRecord(db,{id:'job-1',date:'2026-09-01',company:'Historical',role:'Developer',status:'已提交',applied:'☑'},{sourceSheet:'Sheet1',sourceRow:2});
  const saved=syncSubmittedLead(db,lead());assert.equal(saved.date,row.date);assert.equal(saved.submitted_at,'');assert.equal(recordDate(saved),'2026-09-01');
  db.exec('ALTER TABLE applications DROP COLUMN submitted_at');
 }finally{db.close();}
 const migrated=openDashboard(workspace);try{assert.equal(migrated.prepare('SELECT submitted_at,date FROM applications').get().submitted_at,'');assert.equal(migrated.prepare('SELECT date FROM applications').get().date,'2026-09-01');}finally{migrated.close();}
});

async function fixture(){
 const workspace=await temp();assert.equal(run(workspace,'init','--workspace',workspace).status,0);
 const base='Example candidate has a Bachelor qualification.\n',jd='Engineering cursus or equivalent; schedule is not specified. '.repeat(12);
 const directory='2026-10-03__Example__Developer',dir=path.join(workspace,'个人资料/applications/automation/jobs',directory);await fs.mkdir(dir,{recursive:true});
 await save(path.join(workspace,'个人资料/profile/basics.md'),base);await save(path.join(dir,'jd.txt'),jd);const sources={'个人资料/profile/basics.md':base},contextHash=sha(JSON.stringify({jd,sources}));
 await save(path.join(dir,'context.json'),{contextHash,sources,captured:{jd}});await save(path.join(dir,'questions.json'),[]);await save(path.join(dir,'assessment.json'),{assessmentType:'user-selected-application',ko:'MARGINAL'});
 const pdf=path.join(workspace,'个人资料/CV/Example-CV.pdf');await save(pdf,'%PDF-1.4\n'+'.'.repeat(200));
 const job={...lead(),state:'review-required',submitted:false,key:'https://example.org/job',createdAt:new Date().toISOString(),lastSeenAt:new Date().toISOString(),directory,contextHash,output:pdf,possibleDuplicates:[]};delete job.submissionEvidence;
 const leads=path.join(workspace,'个人资料/applications/automation/leads.json');await save(leads,{version:1,jobs:[job],scans:[]});
 const review={jobId:job.id,matchLevel:'延伸',reason:'Education equivalence and schedule remain unconfirmed; this is an explicitly selected stretch application.',sources:[{path:'个人资料/profile/basics.md',quote:'Bachelor qualification'},{path:path.relative(workspace,path.join(dir,'jd.txt')),quote:'Engineering cursus or equivalent'}]};
 return {workspace,dir,job,review,leads};
}
test('match review requires both exact JD and candidate sources, rejecting changed or unrelated claims',async()=>{
 const f=await fixture();assert.equal((await validateMatchReview(f.review,f)).matchLevel,'延伸');
 await assert.rejects(validateMatchReview({...f.review,sources:[f.review.sources[0],f.review.sources[0]]},f),/both JD/);
 await assert.rejects(validateMatchReview({...f.review,sources:[f.review.sources[0],{...f.review.sources[1],quote:'fabricated requirement'}]},f),/quote/);
 const verified=await validateMatchReview(f.review,f);await fs.appendFile(path.join(f.workspace,'个人资料/profile/basics.md'),'changed');await assert.rejects(validateMatchReview(verified,f),/changed/);
});
test('user-selected approval requires match review and correction keeps the material approval snapshot intact',async()=>{
 const f=await fixture();const missing=run(f.workspace,'state','--id','job-1','--to','approved','--evidence','Fictional material review');assert.notEqual(missing.status,0);assert.match(missing.stderr,/matchLevel/);
 await save(path.join(f.dir,'assessment.json'),{assessmentType:'user-selected-application',ko:'MARGINAL',matchLevel:f.review.matchLevel,matchReason:f.review.reason,matchSources:f.review.sources});
 const approved=run(f.workspace,'state','--id','job-1','--to','approved','--evidence','Fictional PDF source/text/visual review');assert.equal(approved.status,0,approved.stderr);
 const old=JSON.parse(await fs.readFile(f.leads)).jobs[0];assert.equal(old.matchLevel,'延伸');const db=openDashboard(f.workspace);try{assert.ok(db.prepare('SELECT id FROM applications WHERE id=?').get(old.id),'approval must synchronize automatically');db.prepare("UPDATE applications SET match_level='无法评分' WHERE id=?").run(old.id);}finally{db.close();}
 const file=path.join(f.workspace,'review.json');await save(file,f.review);const repaired=run(f.workspace,'dashboard','--review-match','job-1','--review',file);assert.equal(repaired.status,0,repaired.stderr);
 const current=JSON.parse(await fs.readFile(f.leads)).jobs[0];assert.equal(current.approvalSnapshot.id,old.approvalSnapshot.id);assert.equal(current.events.at(-1).reason,'match-review');const db2=openDashboard(f.workspace);try{assert.equal(db2.prepare('SELECT match_level FROM applications').get().match_level,'延伸');}finally{db2.close();}
});

test('API orders same-day minutes, counts timestamp days and retains date-only history',async()=>{
 const workspace=await temp(),db=openDashboard(workspace),day=localDate();
 const morning=new Date(day+'T09:01:00').toISOString(),night=new Date(day+'T21:39:00').toISOString();
 insertRecord(db,{id:'morning',date:day,submitted_at:morning,company:'Example',role:'Developer',status:'已提交',applied:'☑',submission_evidence:'Fixture evidence'});
 insertRecord(db,{id:'night',date:'2020-01-01',submitted_at:night,company:'Example',role:'Developer',status:'已提交',applied:'☑',submission_evidence:'Fixture evidence'});
 insertRecord(db,{id:'date-only',date:day,company:'Example',role:'Developer',status:'已提交',applied:'☑',submission_evidence:'Fixture evidence'});db.close();
 const socket=net.createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
 const child=spawn(process.execPath,[cli,'dashboard','--serve','--port',String(port)],{cwd:workspace,env:{...process.env,USELESS_LINKEDIN_WORKSPACE:workspace},stdio:'ignore'});const base='http://127.0.0.1:'+port;
 try{
  let ready=false;for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,40));}assert.ok(ready);
  assert.deepEqual((await (await fetch(base+'/api/applications?sort=date-desc')).json()).map(x=>x.id),['night','morning','date-only']);
  assert.deepEqual((await (await fetch(base+'/api/applications?sort=date-asc')).json()).map(x=>x.id),['date-only','morning','night']);
  assert.equal((await (await fetch(base+'/api/trend')).json()).at(-1).count,3);assert.equal((await fetch(base+'/dashboard-datetime.js')).status,200);
 }finally{child.kill();}
});
