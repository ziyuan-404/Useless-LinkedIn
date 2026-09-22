import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {assertTransition} from '../runtime/tools/lib/state-machine.mjs';

const skill=path.resolve(import.meta.dirname,'..');
const career=path.join(skill,'runtime/tools/useless-linkedin.mjs');
const history=path.join(skill,'runtime/tools/lib/history.py');
const sha=x=>createHash('sha256').update(x).digest('hex');
function run(workspace,...args){const p=spawnSync(process.execPath,[career,...args],{cwd:workspace,env:{...process.env,USELESS_LINKEDIN_WORKSPACE:workspace},encoding:'utf8',maxBuffer:4e6});return p;}
async function setup(){const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'career-test-'));const p=run(workspace,'init','--workspace',workspace);assert.equal(p.status,0,p.stderr);return workspace;}
async function lead(workspace,state='discovered'){
  const key='https://example.org/job/1';const job={id:'job-1',key,url:key,state,createdAt:new Date().toISOString(),lastSeenAt:new Date().toISOString(),submitted:state==='submitted',possibleDuplicates:[]};
  const dir=path.join(workspace,'.useless-linkedin/applications/automation');await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,'leads.json'),JSON.stringify({version:1,jobs:[job],scans:[]}));return job;
}
test('workspace init is separate and idempotent',async()=>{
  const workspace=await setup();
  assert.ok((await fs.stat(path.join(workspace,'.useless-linkedin/profile/basics.md'))).isFile());
  await fs.writeFile(path.join(workspace,'.useless-linkedin/profile/basics.md'),'private fact');
  assert.equal(run(workspace,'init','--workspace',workspace).status,0);
  assert.equal(await fs.readFile(path.join(workspace,'.useless-linkedin/profile/basics.md'),'utf8'),'private fact');
});
test('first init works from outside workspace without environment override',async()=>{
  const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'useless-linkedin-first-'));
  const env={...process.env};delete env.USELESS_LINKEDIN_WORKSPACE;
  const p=spawnSync(process.execPath,[career,'init','--workspace',workspace],{cwd:os.tmpdir(),env,encoding:'utf8'});
  assert.equal(p.status,0,p.stderr);
  assert.ok((await fs.stat(path.join(workspace,'.useless-linkedin/profile/basics.md'))).isFile());
  assert.match(await fs.readFile(path.join(workspace,'.gitignore'),'utf8'),/\.useless-linkedin\/profile\//);
  assert.equal(JSON.parse(await fs.readFile(path.join(workspace,'.useless-linkedin/workspace.json'))).workspaceSchemaVersion,1);
});
test('legacy workspace migration adds metadata without changing facts',async()=>{
  const workspace=await setup();const fact=path.join(workspace,'.useless-linkedin/profile/basics.md');
  await fs.writeFile(fact,'confirmed fixture fact');
  await fs.rm(path.join(workspace,'.useless-linkedin/workspace.json'));
  const result=run(workspace,'migrate');assert.equal(result.status,0,result.stderr);
  assert.equal(await fs.readFile(fact,'utf8'),'confirmed fixture fact');
  assert.equal(JSON.parse(await fs.readFile(path.join(workspace,'.useless-linkedin/workspace.json'))).initializedBy,'legacy');
});
test('history reads only dated posting-link column and preserves submitted state',async()=>{
  const workspace=await setup();await lead(workspace,'submitted');
  const workbook=path.join(workspace,'求职Dashboard.xlsx');
  const py=`import openpyxl,sys\np=sys.argv[1];w=openpyxl.load_workbook(p);s=w.create_sheet('2026-09-22');s['N1']='岗位链接';s['O1']='公司官网';s['N2']='https://example.org/job/1';s['O2']='https://example.org/company';w.save(p)`;
  const fixture=spawnSync(process.env.USELESS_LINKEDIN_PYTHON||'python',['-c',py,workbook],{encoding:'utf8'});assert.equal(fixture.status,0,fixture.stderr);
  const scan=spawnSync(process.env.USELESS_LINKEDIN_PYTHON||'python',[history,workbook],{encoding:'utf8'});assert.equal(scan.status,0,scan.stderr);
  assert.deepEqual(JSON.parse(scan.stdout).map(x=>x.url),['https://example.org/job/1']);
  const result=run(workspace,'tracker','--history');assert.equal(result.status,0,result.stderr);
  const saved=JSON.parse(await fs.readFile(path.join(workspace,'.useless-linkedin/applications/automation/leads.json'))).jobs[0];
  assert.equal(saved.state,'submitted');assert.equal(saved.historyEvidence.row,2);
  const pipeline=run(workspace,'pipeline','--id','job-1');assert.equal(pipeline.status,0,pipeline.stderr);
  assert.equal(JSON.parse(pipeline.stdout).state,'submitted');
});
test('authorization grant and revoke are auditable',async()=>{
  const workspace=await setup();
  const snapshotId='fixture-snapshot';
  const grant=run(workspace,'authorization','--grant','--job-id','job-1','--actions','submit,upload_files','--approval-snapshot-id',snapshotId,'--source','user approval fixture');assert.equal(grant.status,0,grant.stderr);
  const id=JSON.parse(grant.stdout).id;
  const check=run(workspace,'authorization','--check','submit','--job-id','job-1','--approval-snapshot-id',snapshotId);assert.equal(check.status,0,check.stderr);assert.deepEqual(JSON.parse(check.stdout).grantIds,[id]);
  assert.equal(run(workspace,'authorization','--check','submit','--job-id','job-1','--approval-snapshot-id','changed').status,2);
  assert.equal(run(workspace,'authorization','--revoke',id).status,0);
  assert.equal(run(workspace,'authorization','--check','submit','--job-id','job-1','--approval-snapshot-id',snapshotId).status,2);
});
test('duplicate resolution keeps transitions under the state machine',async()=>{
  assert.throws(()=>assertTransition('submitted','duplicate-review',{}),/Illegal/);
  const workspace=await setup();await lead(workspace);
  const workbook=path.join(workspace,'求职Dashboard.xlsx');
  const py=`import openpyxl,sys\np=sys.argv[1];w=openpyxl.load_workbook(p);s=w.create_sheet('2026-09-22');s['N1']='岗位链接';s['N2']='https://example.org/job/1';w.save(p)`;
  assert.equal(spawnSync(process.env.USELESS_LINKEDIN_PYTHON||'python',['-c',py,workbook]).status,0);
  const jd='Developer role. '.repeat(25),capture=path.join(workspace,'capture.json');
  await fs.writeFile(capture,JSON.stringify({kind:'full-page',url:'https://example.org/job/1',jd,bodyText:jd+' Apply',applyControls:['Apply'],capturedAt:new Date().toISOString()}));
  const first=run(workspace,'pipeline','--id','job-1','--web-capture',capture);assert.equal(first.status,0,first.stderr);
  const stateFile=path.join(workspace,'.useless-linkedin/applications/automation/leads.json');
  assert.equal(JSON.parse(await fs.readFile(stateFile)).jobs[0].state,'duplicate-review');
  assert.equal(run(workspace,'tracker','--id','job-1','--resolve-duplicate','reviewed same URL, not an application').status,0);
  assert.equal(JSON.parse(await fs.readFile(stateFile)).jobs[0].state,'duplicate-review');
  const second=run(workspace,'pipeline','--id','job-1','--web-capture',capture);assert.equal(second.status,0,second.stderr);
  assert.equal(JSON.parse(await fs.readFile(stateFile)).jobs[0].state,'awaiting-agent');
});
test('PASS bulk selects verified resume without a precision payload',async()=>{
  const workspace=await setup();await lead(workspace);
  const resume=path.join(workspace,'海投简历','sample.pdf');
  const pdfScript='from reportlab.pdfgen import canvas;import sys;c=canvas.Canvas(sys.argv[1]);c.drawString(72,750,"Verified software developer experience with Python, JavaScript, testing, APIs, teamwork, and documented projects across multiple roles.");c.save()';
  const pdf=spawnSync(process.env.USELESS_LINKEDIN_PYTHON||'python',['-c',pdfScript,resume],{encoding:'utf8'});assert.equal(pdf.status,0,pdf.stderr);
  const added=run(workspace,'resume','add','--file',resume,'--family','dev');assert.equal(added.status,0,added.stderr);
  const id=JSON.parse(added.stdout).id;const audited=run(workspace,'resume','audit','--id',id);assert.equal(audited.status,0,audited.stderr);assert.equal(JSON.parse(audited.stdout).status,'audited');assert.equal(run(workspace,'resume','verify','--id',id,'--evidence','Fixture reviewed').status,0);
  const question='Can you work in France?';
  const jd='Developer role. '.repeat(25),bodyText=jd+' Apply now '+question;
  const capture=path.join(workspace,'capture.json');await fs.writeFile(capture,JSON.stringify({kind:'full-page',url:'https://example.org/job/1',jd,bodyText,applyControls:['Apply'],capturedAt:new Date().toISOString()}));
  const first=run(workspace,'pipeline','--id','job-1','--web-capture',capture);assert.equal(first.status,0,first.stderr);
  const dir=path.join(workspace,'.useless-linkedin/applications/automation/jobs/job-1');
  const context=JSON.parse(await fs.readFile(path.join(dir,'context.json')));
  const keys=['contract','rhythm','location','remote','start','education','experience','technology','french','english','permit','salary','credentials','duplicate'];
  const sections=Object.fromEntries('ABCDEFG'.split('').map(x=>[x,{score:3,reason:'Fixture evidence'}]));
  const assessment={contextHash:context.contextHash,company:'Example',role:'Developer',ko:{status:'PASS',items:keys.map(key=>({key,result:'PASS',reason:'Fixture checked'}))},sections,priority:3,decision:{route:'bulk',resumeFamily:'dev',strongestEvidence:['Fixture'],gaps:[],nextAction:'Review resume',owner:'agent'},questions:[{question,answer:'',status:'needs-user',source:'observed-form',sources:[]}]};
  const file=path.join(workspace,'assessment.json');await fs.writeFile(file,JSON.stringify(assessment));
  const second=run(workspace,'pipeline','--id','job-1','--web-capture',capture,'--assessment',file);assert.equal(second.status,0,second.stderr);
  const saved=JSON.parse(await fs.readFile(path.join(workspace,'.useless-linkedin/applications/automation/leads.json'))).jobs[0];
  assert.equal(saved.state,'materials-pending-review');assert.equal(saved.output,resume);assert.equal(saved.applicationMode,'bulk');
});
test('approval binds submit to unchanged material and explicit snapshot grant',async()=>{
  const workspace=await setup();const job=await lead(workspace,'review-required');
  const dir=path.join(workspace,'.useless-linkedin/applications/automation/jobs',job.id);
  await fs.mkdir(dir,{recursive:true});
  const pdf=path.join(workspace,'CV','reviewed.pdf');await fs.writeFile(pdf,'reviewed fixture');
  const fact='.useless-linkedin/profile/basics.md';
  const sources={[fact]:await fs.readFile(path.join(workspace,fact),'utf8')};
  const jd='Reviewed JD fixture';const contextHash=sha(JSON.stringify({jd,sources}));
  await fs.writeFile(path.join(dir,'context.json'),JSON.stringify({contextHash,captured:{jd},sources}));
  await fs.writeFile(path.join(dir,'jd.txt'),jd);
  await fs.writeFile(path.join(dir,'assessment.json'),'{}');await fs.writeFile(path.join(dir,'questions.json'),'[]');
  const leadsFile=path.join(workspace,'.useless-linkedin/applications/automation/leads.json');
  const store=JSON.parse(await fs.readFile(leadsFile));Object.assign(store.jobs[0],{output:pdf,contextHash});await fs.writeFile(leadsFile,JSON.stringify(store));
  const approved=run(workspace,'state','--id',job.id,'--to','approved','--evidence','User reviewed fixture');assert.equal(approved.status,0,approved.stderr);
  const snapshot=JSON.parse(await fs.readFile(leadsFile)).jobs[0].approvalSnapshot;
  assert.match(snapshot.id,/^[a-f0-9]{64}$/);
  const grant=run(workspace,'authorization','--grant','--job-id',job.id,'--actions','submit','--approval-snapshot-id',snapshot.id,'--source','User authorized fixture');assert.equal(grant.status,0,grant.stderr);
  await fs.writeFile(pdf,'changed fixture');
  const submit=run(workspace,'state','--id',job.id,'--to','submitting');assert.notEqual(submit.status,0);
  assert.equal(JSON.parse(await fs.readFile(leadsFile)).jobs[0].state,'review-required');
  const reapproved=run(workspace,'state','--id',job.id,'--to','approved','--evidence','User reviewed replacement fixture');assert.equal(reapproved.status,0,reapproved.stderr);
  const nextSnapshot=JSON.parse(await fs.readFile(leadsFile)).jobs[0].approvalSnapshot.id;
  assert.equal(run(workspace,'authorization','--grant','--job-id',job.id,'--actions','submit','--approval-snapshot-id',nextSnapshot,'--source','User authorized replacement fixture').status,0);
  await fs.appendFile(path.join(workspace,fact),'changed fact');
  assert.notEqual(run(workspace,'state','--id',job.id,'--to','submitting').status,0);
  assert.equal(JSON.parse(await fs.readFile(leadsFile)).jobs[0].state,'review-required');
});
test('legacy workspace directory migrates without deleting candidate facts',async()=>{
  const workspace=await setup();
  const old=path.join(workspace,'.career-os'),next=path.join(workspace,'.useless-linkedin');
  await fs.rename(next,old);
  await fs.writeFile(path.join(old,'profile/basics.md'),'legacy confirmed fixture');
  const result=run(workspace,'migrate','--workspace',workspace);assert.equal(result.status,0,result.stderr);
  assert.equal(JSON.parse(result.stdout).renamedLegacyDirectory,true);
  assert.equal(await fs.readFile(path.join(next,'profile/basics.md'),'utf8'),'legacy confirmed fixture');
  assert.equal(await fs.stat(old).then(()=>true,()=>false),false);
});
test('resume family with multiple verified files requires an active choice',async()=>{
  const workspace=await setup();const pool=path.join(workspace,'.useless-linkedin/audits/resume-pool.json');
  const files=[];for(const [id,name] of [['a','a.pdf'],['b','b.pdf']]){const file=path.join(workspace,'海投简历',name);await fs.writeFile(file,id);files.push({id,path:path.relative(workspace,file),family:'dev',status:'verified',sha256:sha(id)});}
  await fs.writeFile(pool,JSON.stringify({version:1,files}));
  assert.notEqual(run(workspace,'resume','select','--family','dev').status,0);
  assert.equal(run(workspace,'resume','activate','--id','b').status,0);
  assert.match(run(workspace,'resume','select','--family','dev').stdout,/b\.pdf/);
});
test('public URL guard refuses private and non-HTTP destinations',async()=>{
  const workspace=await setup();
  const moduleUrl=new URL('../runtime/tools/lib/core.mjs',import.meta.url).href;
  const code=`import {publicUrl} from ${JSON.stringify(moduleUrl)};for(const url of ['http://172.16.1.1/','http://100.64.0.1/','http://0.0.0.0/','http://[fc00::1]/','file:///etc/passwd']){try{publicUrl(url);process.exit(3)}catch{}}console.log(publicUrl('https://example.org/job'))`;
  const env={...process.env,USELESS_LINKEDIN_WORKSPACE:workspace};delete env.USELESS_LINKEDIN_TEST_LOCAL;
  const result=spawnSync(process.execPath,['--input-type=module','-e',code],{cwd:workspace,env,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/https:\/\/example\.org\/job/);
});
