import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
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

test('precision generator produces sourced CV and motivation letter artifacts',async()=>{
  const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'useless-linkedin-precision-'));
  assert.equal(run(workspace,'init','--workspace',workspace).status,0);
  const resumeTemplatePath=path.join(workspace,'个人资料/template/resume.html');
  const resumeTemplate=await fs.readFile(resumeTemplatePath,'utf8');
  const legacyContact='<div class="contact-item"><strong>Phone</strong><span>old-phone</span></div><div class="contact-item"><strong>Email</strong><span>old-email</span></div><div class="contact-item"><a href="https://old-github.invalid">old-github</a></div><div class="contact-item"><a href="https://old-linkedin.invalid">old-linkedin</a></div><div class="contact-item"><strong>Address</strong><span>old-address</span></div>';
  await fs.writeFile(resumeTemplatePath,resumeTemplate.replace('<div class="contact-item contact-details">Contact information to complete</div>',legacyContact));
  const basicsPath=path.join(workspace,'个人资料/profile/basics.md');
  const basicsQuote='Confirmed profile fact for controlled precision workflow.';
  await fs.writeFile(basicsPath,`# basics\n\n- 姓名: Test Candidate\n\n${basicsQuote}\n\nEducation route confirmed for the controlled fixture.\n`);
  const experienceDir=path.join(workspace,'个人资料/profile/experiences');
  const first='时间: 2025-01—2025-12\nControlled software delivery experience for the first sourced role.';
  const second='时间: 2024-01—2024-12\nControlled data project experience for the second sourced role.';
  await fs.writeFile(path.join(experienceDir,'first.md'),first);await fs.writeFile(path.join(experienceDir,'second.md'),second);
  const basicsSource={path:'个人资料/profile/basics.md',quote:basicsQuote};
  const replacement=(selector,text,index)=>({selector,text,...(index===undefined?{}:{index}),sources:[basicsSource]});
  const payload={
    cv:[
      replacement('.subtitle','Software Developer · Controlled Fixture'),replacement('.profil-text','Developer profile based on a confirmed controlled source.'),
      replacement('.contact-details','candidate@example.test\nÎle-de-France'),replacement('.lang-bullets','French B2\nEnglish B2'),replacement('.skill-bullets','JavaScript and APIs\nAutomated testing'),replacement('.profil-header-target','Controlled contract route'),replacement('.availability','Available for the controlled workflow'),replacement('.course-list','Software engineering coursework'),
      ...[0,1,2,3].flatMap(index=>[replacement('.item-title',`Sourced role ${index+1}`,index),replacement('.item-sub',`Sourced organization ${index+1}`,index),replacement('.item-loc','Paris',index)]),
      ...[0,1,2,3].map(index=>replacement('.item-bullets',`Controlled sourced achievement for slot ${index+1}.`,index)),
      {selector:'.item-date',text:'01-12/2025',index:0,sources:[{path:'个人资料/profile/experiences/first.md',quote:'时间: 2025-01—2025-12'}]},
      {selector:'.item-date',text:'01-12/2024',index:1,sources:[{path:'个人资料/profile/experiences/second.md',quote:'时间: 2024-01—2024-12'}]},
      replacement('.item-date','03/2026',2),replacement('.item-date','01/2025',3),replacement('.item-title','Education',4),replacement('.item-date','2024-2026',4),replacement('.item-sub','Controlled education route',4),replacement('.item-loc','Paris',4)
    ],
    letter:[replacement('.personal-info','candidate@example.test\nÎle-de-France'),replacement('.subject','Application · Software Developer'),replacement('.letter','I am applying through this isolated workflow fixture.\nMy profile facts are sourced from the controlled local profile.\nTest Candidate')]
  };
  const payloadFile=path.join(workspace,'precision-payload.json');await fs.writeFile(payloadFile,JSON.stringify(payload));
  const generated=spawnSync(process.execPath,[path.join(skill,'runtime/tools/generate-application.mjs'),'--company','Fixture Employer','--role','Software Developer','--claims',payloadFile,'--date','2026-09-25'],{cwd:workspace,env:{...process.env,USELESS_LINKEDIN_WORKSPACE:workspace},encoding:'utf8',maxBuffer:4e6});
  assert.equal(generated.status,0,generated.stderr);
  const output=path.join(workspace,'个人资料/CV/2026-09-25-Fixture-Employer-Software-Developer');
  const names=await fs.readdir(output);assert.equal(names.filter(name=>name.endsWith('.pdf')).length,2);
  const cvHtml=await fs.readFile(path.join(output,'resume.html'),'utf8');assert.doesNotMatch(cvHtml,/candidate@example\.com|>Candidate<|old-(phone|email|github|linkedin|address)|<img/);
  const letterHtml=await fs.readFile(path.join(output,'motivation-letter.html'),'utf8');assert.doesNotMatch(letterHtml,/<p>Test Candidate<\/p>/,'candidate name must not be duplicated as a letter paragraph');
  const qa=JSON.parse(await fs.readFile(path.join(output,'work/qa.json'),'utf8'));assert.equal(qa.state,'pending-visual-review');assert.equal(qa.files.length,2);
  for(const name of ['resume.png','motivation-letter.png'])assert.ok((await fs.stat(path.join(output,'work',name))).size>0);
});

test('complete application flow reaches verified submission and follow-up without external actions',async()=>{
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
  const jobDir=path.join(workspace,'个人资料/applications/automation/jobs',id);
  const context=JSON.parse(await fs.readFile(path.join(jobDir,'context.json')));
  const resume=path.join(workspace,'个人资料/海投简历','fixture.pdf');
  const pdfScript='from reportlab.pdfgen import canvas;import sys;c=canvas.Canvas(sys.argv[1]);c.drawString(72,750,"Fixture developer resume for a controlled test of reviewed application material and upload processing.");c.save()';
  const pdf=spawnSync(process.env.USELESS_LINKEDIN_PYTHON||'python',['-c',pdfScript,resume],{encoding:'utf8'});assert.equal(pdf.status,0,pdf.stderr);
  const added=run(workspace,'resume','add','--file',resume,'--family','software');assert.equal(added.status,0,added.stderr);
  const resumeId=JSON.parse(added.stdout).id;
  assert.equal(run(workspace,'resume','audit','--id',resumeId).status,0);
  assert.equal(run(workspace,'resume','verify','--id',resumeId,'--evidence','Controlled fixture review').status,0);
  const keys=['contract','rhythm','location','remote','start','education','experience','technology','french','english','permit','salary','credentials','duplicate'];
  const sections=Object.fromEntries('ABCDEFG'.split('').map(x=>[x,{score:3,reason:'Controlled fixture only'}]));
  const assessment={contextHash:context.contextHash,company:'Fixture Employer',role:'Développeur logiciel',ko:{status:'PASS',items:keys.map(key=>({key,result:'PASS',reason:'Controlled fixture only'}))},sections,priority:3,matchLevel:'中',decision:{route:'bulk',resumeFamily:'software',strongestEvidence:['Controlled fixture'],gaps:[],nextAction:'Review material',owner:'agent'},questions:[]};
  const assessmentFile=path.join(workspace,'assessment-fixture.json');await fs.writeFile(assessmentFile,JSON.stringify(assessment));
  const second=run(workspace,'pipeline','--id',id,'--assessment',assessmentFile);assert.equal(second.status,0,second.stderr);
  const leads=path.join(workspace,'个人资料/applications/automation/leads.json');
  assert.equal(JSON.parse(await fs.readFile(leads)).jobs[0].state,'materials-pending-review');
  assert.equal(run(workspace,'state','--id',id,'--to','review-required').status,0);
  const approved=run(workspace,'state','--id',id,'--to','approved','--evidence','Controlled fixture review');assert.equal(approved.status,0,approved.stderr);
  const snapshot=JSON.parse(await fs.readFile(leads)).jobs[0].approvalSnapshot.id;
  assert.equal(run(workspace,'state','--id',id,'--to','submitting').status!==0,true);
  const grant=run(workspace,'authorization','--grant','--workspace-scope','--actions','prepare_materials,prefill_form,upload_files,submit','--source','Controlled standing authorization fixture');assert.equal(grant.status,0,grant.stderr);
  assert.ok(snapshot);
  assert.equal(run(workspace,'state','--id',id,'--to','submitting').status,0);
  assert.equal(run(workspace,'state','--id',id,'--to','submission-unconfirmed').status,0);
  assert.notEqual(run(workspace,'state','--id',id,'--to','submitted','--evidence','Controlled simulated success page, no external submission').status,0);
  assert.equal(JSON.parse(await fs.readFile(leads)).jobs[0].state,'submission-unconfirmed');
  const receiptArtifact=path.join(workspace,'controlled-success-page.html');
  await fs.writeFile(receiptArtifact,'<!doctype html><title>Controlled fixture</title><main>Application submitted successfully. This saved file is generated only for an isolated workflow test and does not represent an external application.</main>');
  const receiptFile=path.join(workspace,'controlled-receipt.json');
  await fs.writeFile(receiptFile,JSON.stringify({kind:'success-page',observedAt:new Date().toISOString(),description:'Controlled local success evidence for end-to-end workflow test',artifactPath:path.relative(workspace,receiptArtifact),sourceUrl:url}));
  const submitted=run(workspace,'state','--id',id,'--to','submitted','--receipt',receiptFile);assert.equal(submitted.status,0,submitted.stderr);
  let saved=JSON.parse(await fs.readFile(leads)).jobs[0];
  assert.equal(saved.state,'submitted');assert.equal(saved.submitted,true);assert.equal(saved.dashboardSynced,true);
  const dashboard=run(workspace,'dashboard','--verify');assert.equal(dashboard.status,0,dashboard.stderr);
  let dashboardState=JSON.parse(dashboard.stdout);assert.equal(dashboardState.count,1);assert.equal(dashboardState.summary.verifiedSubmitted,1);
  const syncAgain=run(workspace,'dashboard','--sync-submitted',id);assert.equal(syncAgain.status,0,syncAgain.stderr);
  assert.equal(run(workspace,'state','--id',id,'--to','followup-due','--evidence','Controlled follow-up date reached').status,0);
  assert.equal(JSON.parse(await fs.readFile(leads)).jobs[0].state,'followup-due');
  const returnToSubmitted=run(workspace,'state','--id',id,'--to','submitted','--receipt',receiptFile);assert.equal(returnToSubmitted.status,0,returnToSubmitted.stderr);
  saved=JSON.parse(await fs.readFile(leads)).jobs[0];assert.equal(saved.state,'submitted');
  dashboardState=JSON.parse(run(workspace,'dashboard','--verify').stdout);assert.equal(dashboardState.count,1);assert.equal(dashboardState.summary.verifiedSubmitted,1);
});
