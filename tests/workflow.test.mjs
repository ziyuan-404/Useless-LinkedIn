import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {assertTransition} from '../.career-os/tools/lib/state-machine.mjs';

const skill=path.resolve(import.meta.dirname,'..');
const career=path.join(skill,'.career-os/tools/career.mjs');
const history=path.join(skill,'.career-os/tools/lib/history.py');
const sha=x=>createHash('sha256').update(x).digest('hex');
function run(workspace,...args){const p=spawnSync(process.execPath,[career,...args],{cwd:workspace,env:{...process.env,CAREER_WORKSPACE:workspace},encoding:'utf8',maxBuffer:4e6});return p;}
async function setup(){const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'career-test-'));const p=run(workspace,'init','--workspace',workspace);assert.equal(p.status,0,p.stderr);return workspace;}
async function lead(workspace,state='discovered'){
  const key='https://example.org/job/1';const job={id:'job-1',key,url:key,state,createdAt:new Date().toISOString(),lastSeenAt:new Date().toISOString(),submitted:state==='submitted',possibleDuplicates:[]};
  const dir=path.join(workspace,'.career-os/applications/automation');await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,'leads.json'),JSON.stringify({version:1,jobs:[job],scans:[]}));return job;
}
test('workspace init is separate and idempotent',async()=>{
  const workspace=await setup();
  assert.ok((await fs.stat(path.join(workspace,'.career-os/profile/basics.md'))).isFile());
  await fs.writeFile(path.join(workspace,'.career-os/profile/basics.md'),'private fact');
  assert.equal(run(workspace,'init','--workspace',workspace).status,0);
  assert.equal(await fs.readFile(path.join(workspace,'.career-os/profile/basics.md'),'utf8'),'private fact');
});
test('history reads only dated posting-link column and preserves submitted state',async()=>{
  const workspace=await setup();await lead(workspace,'submitted');
  const workbook=path.join(workspace,'求职Dashboard.xlsx');
  const py=`import openpyxl,sys\np=sys.argv[1];w=openpyxl.load_workbook(p);s=w.create_sheet('2026-09-22');s['N1']='岗位链接';s['O1']='公司官网';s['N2']='https://example.org/job/1';s['O2']='https://example.org/company';w.save(p)`;
  const fixture=spawnSync(process.env.CAREER_PYTHON||'python',['-c',py,workbook],{encoding:'utf8'});assert.equal(fixture.status,0,fixture.stderr);
  const scan=spawnSync(process.env.CAREER_PYTHON||'python',[history,workbook],{encoding:'utf8'});assert.equal(scan.status,0,scan.stderr);
  assert.deepEqual(JSON.parse(scan.stdout).map(x=>x.url),['https://example.org/job/1']);
  const result=run(workspace,'tracker','--history');assert.equal(result.status,0,result.stderr);
  const saved=JSON.parse(await fs.readFile(path.join(workspace,'.career-os/applications/automation/leads.json'))).jobs[0];
  assert.equal(saved.state,'submitted');assert.equal(saved.historyEvidence.row,2);
  const pipeline=run(workspace,'pipeline','--id','job-1');assert.equal(pipeline.status,0,pipeline.stderr);
  assert.equal(JSON.parse(pipeline.stdout).state,'submitted');
});
test('authorization grant and revoke are auditable',async()=>{
  const workspace=await setup();
  const grant=run(workspace,'authorization','--grant','--job-id','job-1','--actions','submit,upload_files','--source','user approval fixture');assert.equal(grant.status,0,grant.stderr);
  const id=JSON.parse(grant.stdout).id;
  const check=run(workspace,'authorization','--check','submit','--job-id','job-1');assert.equal(check.status,0,check.stderr);assert.deepEqual(JSON.parse(check.stdout).grantIds,[id]);
  assert.equal(run(workspace,'authorization','--revoke',id).status,0);
  assert.equal(run(workspace,'authorization','--check','submit','--job-id','job-1').status,2);
});
test('duplicate resolution keeps transitions under the state machine',async()=>{
  assert.throws(()=>assertTransition('submitted','duplicate-review',{}),/Illegal/);
  const workspace=await setup();await lead(workspace);
  const workbook=path.join(workspace,'求职Dashboard.xlsx');
  const py=`import openpyxl,sys\np=sys.argv[1];w=openpyxl.load_workbook(p);s=w.create_sheet('2026-09-22');s['N1']='岗位链接';s['N2']='https://example.org/job/1';w.save(p)`;
  assert.equal(spawnSync(process.env.CAREER_PYTHON||'python',['-c',py,workbook]).status,0);
  const jd='Developer role. '.repeat(25),capture=path.join(workspace,'capture.json');
  await fs.writeFile(capture,JSON.stringify({kind:'full-page',url:'https://example.org/job/1',jd,bodyText:jd+' Apply',applyControls:['Apply'],capturedAt:new Date().toISOString()}));
  const first=run(workspace,'pipeline','--id','job-1','--web-capture',capture);assert.equal(first.status,0,first.stderr);
  const stateFile=path.join(workspace,'.career-os/applications/automation/leads.json');
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
  const pdf=spawnSync(process.env.CAREER_PYTHON||'python',['-c',pdfScript,resume],{encoding:'utf8'});assert.equal(pdf.status,0,pdf.stderr);
  const added=run(workspace,'resume','add','--file',resume,'--family','dev');assert.equal(added.status,0,added.stderr);
  const id=JSON.parse(added.stdout).id;const audited=run(workspace,'resume','audit','--id',id);assert.equal(audited.status,0,audited.stderr);assert.equal(JSON.parse(audited.stdout).status,'audited');assert.equal(run(workspace,'resume','verify','--id',id,'--evidence','Fixture reviewed').status,0);
  const question='Can you work in France?';
  const jd='Developer role. '.repeat(25),bodyText=jd+' Apply now '+question;
  const capture=path.join(workspace,'capture.json');await fs.writeFile(capture,JSON.stringify({kind:'full-page',url:'https://example.org/job/1',jd,bodyText,applyControls:['Apply'],capturedAt:new Date().toISOString()}));
  const first=run(workspace,'pipeline','--id','job-1','--web-capture',capture);assert.equal(first.status,0,first.stderr);
  const dir=path.join(workspace,'.career-os/applications/automation/jobs/job-1');
  const context=JSON.parse(await fs.readFile(path.join(dir,'context.json')));
  const keys=['contract','rhythm','location','remote','start','education','experience','technology','french','english','permit','salary','credentials','duplicate'];
  const sections=Object.fromEntries('ABCDEFG'.split('').map(x=>[x,{score:3,reason:'Fixture evidence'}]));
  const assessment={contextHash:context.contextHash,company:'Example',role:'Developer',ko:{status:'PASS',items:keys.map(key=>({key,result:'PASS',reason:'Fixture checked'}))},sections,priority:3,decision:{route:'bulk',resumeFamily:'dev',strongestEvidence:['Fixture'],gaps:[],nextAction:'Review resume',owner:'agent'},questions:[{question,answer:'',status:'needs-user',source:'observed-form',sources:[]}]};
  const file=path.join(workspace,'assessment.json');await fs.writeFile(file,JSON.stringify(assessment));
  const second=run(workspace,'pipeline','--id','job-1','--web-capture',capture,'--assessment',file);assert.equal(second.status,0,second.stderr);
  const saved=JSON.parse(await fs.readFile(path.join(workspace,'.career-os/applications/automation/leads.json'))).jobs[0];
  assert.equal(saved.state,'materials-pending-review');assert.equal(saved.output,resume);assert.equal(saved.applicationMode,'bulk');
});
