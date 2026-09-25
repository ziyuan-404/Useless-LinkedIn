import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
process.env.USELESS_LINKEDIN_WORKSPACE ||= os.tmpdir();
const {dependency}=await import('../runtime/tools/runtime.mjs');
const {chromium}=dependency('playwright');

const skill=path.resolve(import.meta.dirname,'..');
const career=path.join(skill,'runtime/tools/useless-linkedin.mjs');
function run(workspace,...args){return spawnSync(process.execPath,[career,...args],{cwd:workspace,env:{...process.env,USELESS_LINKEDIN_WORKSPACE:workspace},encoding:'utf8',maxBuffer:4e6});}

test('Playwright PDFs pass compression and rendered PDF QA',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'useless-linkedin-pdf-'));
  await fs.mkdir(path.join(dir,'work'));
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage();
    for(const name of ['candidate-CV','candidate-Lettre']){
      await page.setContent(`<html><body><h1>${name}</h1><p>Reviewed application material fixture.</p></body></html>`);
      await page.pdf({path:path.join(dir,`${name}.pdf`),format:'A4'});
    }
  }finally{await browser.close();}
  const script=path.resolve(import.meta.dirname,'../runtime/tools/pdf-qa.py');
  const result=spawnSync(process.env.USELESS_LINKEDIN_PYTHON||'python',[script,dir],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  const qa=JSON.parse(await fs.readFile(path.join(dir,'work/qa.json'),'utf8'));
  assert.equal(qa.files.length,2);
  assert.equal(qa.state,'pending-visual-review');
  for(const entry of qa.files)assert.ok((await fs.stat(path.join(dir,'work',`${path.parse(entry.file).name}-pdf.png`))).size>0);
});

test('discovery import to reviewed materials and unconfirmed submission',async()=>{
  const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'useless-linkedin-flow-'));
  assert.equal(run(workspace,'init','--workspace',workspace).status,0);
  const url='https://www.welcometothejungle.com/en/companies/example/jobs/fixture-developer_paris';
  const imported=path.join(workspace,'discovered.json');
  await fs.writeFile(imported,JSON.stringify([{url,title:'Alternance développeur logiciel',company:'Fixture Employer',portal:'Welcome to the Jungle',location:'Paris'}]));
  const scan=spawnSync(process.execPath,[path.join(skill,'runtime/tools/scan.mjs'),'--import',imported,'--import-only','--portal','Welcome to the Jungle'],{cwd:workspace,env:{...process.env,USELESS_LINKEDIN_WORKSPACE:workspace},encoding:'utf8'});
  assert.equal(scan.status,0,scan.stderr);
  const id=JSON.parse(scan.stdout).added[0].id;
  assert.equal(run(workspace,'tracker','--history').status,0);
  const jd='Alternance développeur logiciel à Paris. Développer des applications web, créer des API REST, écrire des tests, collaborer avec une équipe technique. '.repeat(4);
  const capture=path.join(workspace,'capture.json');
  await fs.writeFile(capture,JSON.stringify({kind:'full-page',url,jd,bodyText:jd+' Apply',applyControls:['Apply'],capturedAt:new Date().toISOString()}));
  const first=run(workspace,'pipeline','--id',id,'--web-capture',capture);assert.equal(first.status,0,first.stderr);
  const jobDir=path.join(workspace,'00-个人资料/applications/automation/jobs',id);
  const context=JSON.parse(await fs.readFile(path.join(jobDir,'context.json')));
  const resume=path.join(workspace,'00-个人资料/海投简历','fixture.pdf');
  const pdfScript='from reportlab.pdfgen import canvas;import sys;c=canvas.Canvas(sys.argv[1]);c.drawString(72,750,"Fixture developer resume for a controlled test of reviewed application material and upload processing.");c.save()';
  const pdf=spawnSync(process.env.USELESS_LINKEDIN_PYTHON||'python',['-c',pdfScript,resume],{encoding:'utf8'});assert.equal(pdf.status,0,pdf.stderr);
  const added=run(workspace,'resume','add','--file',resume,'--family','software');assert.equal(added.status,0,added.stderr);
  const resumeId=JSON.parse(added.stdout).id;
  assert.equal(run(workspace,'resume','audit','--id',resumeId).status,0);
  assert.equal(run(workspace,'resume','verify','--id',resumeId,'--evidence','Controlled fixture review').status,0);
  const keys=['contract','rhythm','location','remote','start','education','experience','technology','french','english','permit','salary','credentials','duplicate'];
  const sections=Object.fromEntries('ABCDEFG'.split('').map(x=>[x,{score:3,reason:'Controlled fixture only'}]));
  const assessment={contextHash:context.contextHash,company:'Fixture Employer',role:'Développeur logiciel',ko:{status:'PASS',items:keys.map(key=>({key,result:'PASS',reason:'Controlled fixture only'}))},sections,priority:3,decision:{route:'bulk',resumeFamily:'software',strongestEvidence:['Controlled fixture'],gaps:[],nextAction:'Review material',owner:'agent'},questions:[]};
  const assessmentFile=path.join(workspace,'assessment-fixture.json');await fs.writeFile(assessmentFile,JSON.stringify(assessment));
  const second=run(workspace,'pipeline','--id',id,'--web-capture',capture,'--assessment',assessmentFile);assert.equal(second.status,0,second.stderr);
  const leads=path.join(workspace,'00-个人资料/applications/automation/leads.json');
  assert.equal(JSON.parse(await fs.readFile(leads)).jobs[0].state,'materials-pending-review');
  assert.equal(run(workspace,'state','--id',id,'--to','review-required').status,0);
  const approved=run(workspace,'state','--id',id,'--to','approved','--evidence','Controlled fixture review');assert.equal(approved.status,0,approved.stderr);
  const snapshot=JSON.parse(await fs.readFile(leads)).jobs[0].approvalSnapshot.id;
  assert.equal(run(workspace,'state','--id',id,'--to','submitting').status!==0,true);
  const grant=run(workspace,'authorization','--grant','--job-id',id,'--actions','submit','--approval-snapshot-id',snapshot,'--source','Controlled test authorization');assert.equal(grant.status,0,grant.stderr);
  assert.equal(run(workspace,'state','--id',id,'--to','submitting').status,0);
  assert.equal(run(workspace,'state','--id',id,'--to','submission-unconfirmed').status,0);
  assert.notEqual(run(workspace,'state','--id',id,'--to','submitted','--evidence','Controlled simulated success page, no external submission').status,0);
  assert.equal(JSON.parse(await fs.readFile(leads)).jobs[0].state,'submission-unconfirmed');
  assert.equal(createHash('sha256').update(await fs.readFile(resume)).digest('hex').length,64);
});
