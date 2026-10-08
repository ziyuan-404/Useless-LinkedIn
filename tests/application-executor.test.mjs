import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {inspectIabForm,executeIabPlan,formSignature} from '../runtime/tools/lib/iab-application.mjs';
import {validateAnswer,answerFor,loadAnswers} from '../runtime/tools/lib/form-answers.mjs';
import {factPacket,compactCapture} from '../runtime/tools/lib/agent-packet.mjs';

const require=createRequire(import.meta.url),{chromium}=require('playwright');
const skill=path.resolve(import.meta.dirname,'..'),cli=path.join(skill,'runtime/tools/useless-linkedin.mjs');
const sha=value=>createHash('sha256').update(value).digest('hex');
const run=(workspace,...args)=>spawnSync(process.execPath,[cli,...args],{cwd:workspace,env:{...process.env,USELESS_LINKEDIN_WORKSPACE:workspace,PYTHONUTF8:'1'},encoding:'utf8',maxBuffer:4e6});
const save=(file,data)=>fs.writeFile(file,typeof data==='string'?data:JSON.stringify(data));
const keys=['contract','rhythm','location','remote','start','education','experience','technology','french','english','permit','salary','credentials','duplicate'];
let browser,server,url;
const html=mode=>`<!doctype html><html><body><main>
${mode==='preexisting'?'<p>Thank you for applying</p>':''}
<form id="application"><label for="email">Email</label><input id="email" type="email" required>
<label for="full">Full name</label><input id="full" required>
<label for="sponsor">Will you now or in the future require sponsorship?</label><select id="sponsor" required><option value="">Choose</option><option value="yes">Yes</option><option value="no">No</option></select>
<label for="cv">CV</label><input id="cv" type="file" accept=".pdf" required ${mode==='hidden'?'style="display:none"':''}>
<label for="updates">Email updates</label><input id="updates" type="checkbox">
<button id="submit" type="submit">Submit application</button></form></main>
<script>window.submissions=0;document.querySelector('form').onsubmit=e=>{e.preventDefault();window.submissions++;${mode==='silent'||mode==='preexisting'?'':"document.querySelector('main').innerHTML='<section><h1>Application submitted</h1><p>Your application was sent successfully. This is a controlled local fixture only.</p></section>';"}};
${mode==='conditional'?"document.querySelector('#sponsor').onchange=()=>{if(!document.querySelector('#extra'))document.querySelector('#sponsor').insertAdjacentHTML('afterend','<label for=extra>New required question</label><input id=extra required>')};":''}
</script></body></html>`;
before(async()=>{
  server=http.createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html'});res.end(html(new URL(req.url,'http://localhost').searchParams.get('mode')||'normal'));});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));url='http://127.0.0.1:'+server.address().port+'/apply';
  browser=await chromium.launch({headless:true});
});
after(async()=>{await browser?.close();await new Promise(resolve=>server.close(resolve));});
function bind(page){
  const wrap=locator=>new Proxy(locator,{get(target,key){const value=target[key];if(typeof value!=='function')return value;return (...args)=>{const last=args.at(-1);if(last&&typeof last==='object'&&'timeoutMs' in last){args[args.length-1]={...last,timeout:last.timeoutMs};delete args[args.length-1].timeoutMs;}return value.apply(target,args);};}});
  return {url:()=>page.url(),playwright:{evaluate:(fn,arg)=>page.evaluate(fn,arg),domSnapshot:()=>{throw Error('Full page snapshots are disabled in this workflow');},locator:s=>wrap(page.locator(s)),getByLabel:(s,o)=>wrap(page.getByLabel(s,o)),getByRole:(s,o)=>wrap(page.getByRole(s,o)),waitForEvent:(name,o)=>page.waitForEvent(name,{timeout:o.timeoutMs})}};
}
async function fixture(target=url){
  const workspace=await fs.mkdtemp(path.join(process.env.USELESS_LINKEDIN_TEST_ARTIFACTS||os.tmpdir(),'application-fixture-'));
  const init=run(workspace,'init','--workspace',workspace);assert.equal(init.status,0,init.stderr);
  const basics='- 邮箱: candidate@example.org\n- 姓名: Example Candidate\n- 工作许可: Candidate does not require sponsorship.\n';await save(path.join(workspace,'个人资料/profile/basics.md'),basics);
  const dir=path.join(workspace,'个人资料/applications/automation/jobs','2026-10-03__Example__Developer');await fs.mkdir(dir,{recursive:true});
  const pdf=path.join(workspace,'个人资料/CV/Example-CV.pdf');await save(pdf,'%PDF-1.4\nControlled fixture PDF data; not a real application.\n'+'.'.repeat(120));
  const jd='Developer alternance responsibilities and qualifications. '.repeat(14),sources={'个人资料/profile/basics.md':basics},contextHash=sha(JSON.stringify({jd,sources}));
  await save(path.join(dir,'context.json'),{url:target,contextHash,captured:{url:target,finalUrl:target,jd,capturedAt:new Date().toISOString(),liveness:{result:'active'}},sources});await save(path.join(dir,'capture.json'),{url:target,finalUrl:target,jd});await save(path.join(dir,'jd.txt'),jd);await save(path.join(dir,'assessment.json'),{});await save(path.join(dir,'questions.json'),[]);
  const job={id:'job-1',key:target,url:target,title:'Developer',company:'Example',state:'review-required',directory:path.basename(dir),createdAt:new Date().toISOString(),lastSeenAt:new Date().toISOString(),submitted:false,possibleDuplicates:[],output:pdf,contextHash,discoveryDisposition:'candidate'};
  const leads=path.join(workspace,'个人资料/applications/automation/leads.json');await save(leads,{version:1,jobs:[job],scans:[]});
  const approved=run(workspace,'state','--id','job-1','--to','approved','--evidence','Controlled fixture reviewed');assert.equal(approved.status,0,approved.stderr);
  const auth=run(workspace,'authorization','--grant','--workspace-scope','--actions','prepare_materials,prefill_form,upload_files,submit','--source','Controlled local test only');assert.equal(auth.status,0,auth.stderr);
  const records=[{questions:['Will you now or in the future require sponsorship?'],answer:'No',status:'confirmed',sources:[{path:'个人资料/profile/basics.md',quote:'Candidate does not require sponsorship.'}]}];const answers=path.join(workspace,'answers.json');await save(answers,records);const register=run(workspace,'apply','--answers',answers);assert.equal(register.status,0,register.stderr);
  return {workspace,dir,leads,pdf,job};
}
async function prepare(f,page){
  const tab=bind(page),form=await inspectIabForm(tab),file=path.join(f.workspace,'form.json');await save(file,form);
  const p=run(f.workspace,'apply','--id','job-1','--prepare','--form',file);assert.equal(p.status,0,p.stderr);
  const summary=JSON.parse(p.stdout),plan=JSON.parse(await fs.readFile(summary.plan));return {tab,form,plan,summary};
}

test('exact sourced answers distinguish sponsorship, permission and negation',async()=>{
  const f=await fixture();const answers=await loadAnswers(f.workspace);
  assert.equal(answerFor({label:'Do you have permission to work?',type:'text'},answers.records).status,'unknown');
  assert.equal(answerFor({label:'Will you NOT require sponsorship?',type:'text'},answers.records).status,'unknown');
  assert.equal(answerFor({label:'Will you now or in the future require sponsorship?',type:'select',options:[{value:'no',label:'No'}]},answers.records).value,'no');
  assert.equal(answerFor({label:'Email',type:'text'},[{questions:['Email'],answer:'a',sources:[]},{questions:['Email'],answer:'b',sources:[]}]).status,'conflict');
  await fs.appendFile(path.join(f.workspace,'个人资料/profile/basics.md'),'Fact changed');assert.ok((await loadAnswers(f.workspace)).stale.length>0);
});
test('answer sources outside the fact library and stale quotes are refused',async()=>{
  const f=await fixture();await assert.rejects(validateAnswer({status:'confirmed',questions:['Q'],answer:'A',sources:[{path:'个人资料/operations/application-rules.md',quote:'some reference quote'}]},f.workspace),/source must/);
  await assert.rejects(validateAnswer({status:'confirmed',questions:['Q'],answer:'A',sources:[{path:'个人资料/profile/basics.md',quote:'a fabricated source quote'}]},f.workspace),/quote/);
});
test('compact retrieval packets remove navigation and preserve source access',()=>{
  const sources={'个人资料/profile/basics.md':'Core facts','个人资料/profile/experiences/project.md':'# Project\n标签: [SQL]\n'+('Detailed verified evidence. '.repeat(1000))};
  const packet=factPacket(sources);assert.ok(JSON.stringify(packet).length<JSON.stringify(sources).length/20);assert.match(packet.experiences[0].index,/SQL/);assert.equal(packet.experiences[0].path,'个人资料/profile/experiences/project.md');
  assert.equal(compactCapture({jd:'full JD',bodyText:'navigation'.repeat(10000),links:[{url:'noise'}]}).jd,'full JD');assert.equal(compactCapture({jd:'full JD',links:[]}).links,undefined);
});
test('IAB-compatible executor fills, uploads, verifies and records one confirmed submission',async()=>{
  const f=await fixture(),page=await browser.newPage();await page.goto(url);const {tab,plan}=await prepare(f,page);
  const ready=await executeIabPlan(tab,plan);assert.equal(ready.status,'ready-to-submit',JSON.stringify(ready));assert.equal(ready.metrics.filled,3);assert.equal(ready.metrics.uploads,1);assert.equal(await page.evaluate(()=>window.submissions),0);
  const resultFile=path.join(f.workspace,'ready.json');await save(resultFile,ready);const arm=run(f.workspace,'apply','--id','job-1','--arm','--result',resultFile);assert.equal(arm.status,0,arm.stderr);
  assert.equal(JSON.parse(await fs.readFile(f.leads)).jobs[0].state,'submission-unconfirmed');const permit=JSON.parse(await fs.readFile(JSON.parse(arm.stdout).permit));
  const result=await executeIabPlan(tab,plan,{permit});assert.equal(result.status,'success-observed',JSON.stringify(result));assert.equal(result.metrics.alreadyCorrect,4);assert.equal(await page.evaluate(()=>window.submissions),1);
  await save(resultFile,result);const record=run(f.workspace,'apply','--id','job-1','--record',resultFile);assert.equal(record.status,0,record.stderr);assert.equal(JSON.parse(await fs.readFile(f.leads)).jobs[0].state,'submitted');
  const evidence=JSON.parse(JSON.parse(await fs.readFile(f.leads)).jobs[0].submissionEvidence);assert.equal(evidence.kind,'platform-status');assert.match(evidence.artifactPath,/\.json$/);assert.equal(result.evidence.artifactHtml,undefined);
  const again=run(f.workspace,'apply','--id','job-1','--arm','--result',resultFile);assert.notEqual(again.status,0);
  const packet=run(f.workspace,'batch','--stage','submit');assert.equal(JSON.parse(packet.stdout).count,0);await page.close();
});

test('connector email reconciliation confirms once without browser snapshots or repeat submission',async()=>{
 const f=await fixture(),page=await browser.newPage();await page.goto(url);const {tab,plan}=await prepare(f,page),ready=await executeIabPlan(tab,plan),file=path.join(f.workspace,'ready.json');await save(file,ready);
 const arm=run(f.workspace,'apply','--id','job-1','--arm','--result',file);assert.equal(arm.status,0,arm.stderr);
 const mail={id:'controlled-confirmation',label_ids:['INBOX'],payload:{headers:[{name:'From',value:'noreply@example.org'},{name:'To',value:'candidate@example.org'},{name:'Date',value:new Date().toUTCString()},{name:'Subject',value:'Application received: Developer at Example'}],parts:[{mime_type:'text/plain',body:{content:'We received your application for Developer at Example.'}}]}};
 const email=path.join(f.workspace,'email.json');await save(email,{structuredContent:mail});
 const result=run(f.workspace,'receipt','--id','job-1','--email',email,'--commit');assert.equal(result.status,0,result.stderr);
 const job=JSON.parse(await fs.readFile(f.leads)).jobs[0],evidence=JSON.parse(job.submissionEvidence),bytes=await fs.readFile(path.join(f.workspace,evidence.artifactPath));assert.equal(job.state,'submitted');assert.equal(evidence.kind,'confirmation-email');assert.equal(await page.evaluate(()=>window.submissions),0,'reconciliation never clicks Submit');
 const repeat=spawnSync(process.execPath,[cli,'receipt','--id','job-1','--email','-','--commit'],{cwd:f.workspace,env:{...process.env,USELESS_LINKEDIN_WORKSPACE:f.workspace,PYTHONUTF8:'1'},input:JSON.stringify(mail)+'\n',encoding:'utf8',timeout:10000});assert.equal(repeat.status,0,repeat.stderr);assert.deepEqual(await fs.readFile(path.join(f.workspace,evidence.artifactPath)),bytes,'stdin reconciliation cannot overwrite the hashed original receipt');await page.close();
});
test('a conditional question stops at the changed structure without submitting',async()=>{
  const target=url+'?mode=conditional',f=await fixture(target),page=await browser.newPage();await page.goto(target);const {tab,plan}=await prepare(f,page);
  const result=await executeIabPlan(tab,plan);assert.equal(result.status,'needs-replan');assert.equal(result.reason,'conditional-fields-changed');assert.equal(await page.evaluate(()=>window.submissions),0);assert.ok(result.form.fields.some(f=>f.key==='extra'));await page.close();
});

test('resume parsing changes the form before sourced fields can overwrite its autofill',async()=>{
  const f=await fixture(),page=await browser.newPage();await page.goto(url);
  await page.locator('#cv').evaluate(el=>el.addEventListener('change',()=>{document.querySelector('#email').value='parsed@example.org';el.insertAdjacentHTML('afterend','<label for="parsed-question">Parsed resume question</label><input id="parsed-question" required>');}));
  const {tab,plan}=await prepare(f,page),result=await executeIabPlan(tab,plan);assert.equal(result.status,'needs-replan');assert.equal(result.reason,'resume-parsed-form-changed');assert.equal(result.metrics.filled,0);assert.equal(await page.locator('#email').inputValue(),'parsed@example.org');assert.equal(await page.evaluate(()=>window.submissions),0);await page.close();
});

test('Next returns the new form for a fresh plan without treating navigation as submission',async()=>{
  const f=await fixture(),page=await browser.newPage();await page.goto(url);
  await page.locator('#submit').evaluate(el=>{el.textContent='Next';el.onclick=e=>{e.preventDefault();document.querySelector('main').innerHTML='<form><label for="new-question">New page question</label><input id="new-question" required><button>Submit application</button></form>';};});
  const {tab,plan}=await prepare(f,page);assert.equal(plan.action.kind,'next');const result=await executeIabPlan(tab,plan);assert.equal(result.status,'next-page');assert.ok(result.form.fields.some(f=>f.key==='new-question'));assert.equal(await page.evaluate(()=>window.submissions),0);await page.close();
});

test('Next without progress stops after one click and one keyboard fallback',async()=>{
  const f=await fixture(),page=await browser.newPage();await page.goto(url);
  await page.locator('#submit').evaluate(el=>{el.type='button';el.textContent='Next';window.nextClicks=0;el.onclick=()=>window.nextClicks++;});
  const {tab,plan}=await prepare(f,page),result=await executeIabPlan(tab,plan);assert.equal(result.status,'blocked');assert.equal(result.reason,'next-no-progress');assert.equal(await page.evaluate(()=>window.nextClicks),2);assert.equal(await page.evaluate(()=>window.submissions),0);await page.close();
});
test('hidden file controls with visible labels use the same uploader',async()=>{
  const target=url+'?mode=hidden',f=await fixture(target),page=await browser.newPage();await page.goto(target);const {tab,plan}=await prepare(f,page);
  assert.match(plan.steps.find(s=>s.kind==='upload').locator.value,/label/);const result=await executeIabPlan(tab,plan);assert.equal(result.status,'ready-to-submit',JSON.stringify(result));await page.close();
});

test('IAB read-only DOM without FileList and native validity properties still verifies uploads',async()=>{
  const f=await fixture(),page=await browser.newPage();await page.goto(url);
  await page.evaluate(()=>Object.defineProperties(HTMLInputElement.prototype,{files:{get:()=>undefined},accept:{get:()=>undefined},validity:{get:()=>undefined}}));
  const {tab,plan}=await prepare(f,page);assert.equal(plan.form.fields.find(x=>x.key==='cv').accept,'.pdf');
  const result=await executeIabPlan(tab,plan);assert.equal(result.status,'ready-to-submit',JSON.stringify(result));assert.deepEqual(result.form.fields.find(x=>x.key==='cv').files,['Example-CV.pdf']);
  const again=await executeIabPlan(tab,plan);assert.equal(again.metrics.uploads,0);assert.equal(again.metrics.alreadyCorrect,4);await page.close();
});

test('privacy-redacted email uses a sourced fill and native validation without guessing its value',async()=>{
  const f=await fixture(),page=await browser.newPage();await page.goto(url);const tab=bind(page),evaluate=tab.playwright.evaluate;
  tab.playwright.evaluate=async(fn,arg)=>{const result=await evaluate(fn,arg);if(result?.fields)for(const field of result.fields)if(field.type==='email'&&field.value)field.value='<redacted>';return result;};
  const form=await inspectIabForm(tab),file=path.join(f.workspace,'form.json');await save(file,form);const prepared=run(f.workspace,'apply','--id','job-1','--prepare','--form',file);assert.equal(prepared.status,0,prepared.stderr);
  const plan=JSON.parse(await fs.readFile(JSON.parse(prepared.stdout).plan));const ready=await executeIabPlan(tab,plan);assert.equal(ready.status,'ready-to-submit',JSON.stringify(ready));assert.deepEqual(ready.redactedFields,['email']);assert.equal(await page.locator('#email').inputValue(),'candidate@example.org');
  plan.steps.find(s=>s.key==='email').value='invalid';const invalid=await executeIabPlan(tab,plan);assert.equal(invalid.status,'needs-agent');assert.equal(invalid.reason,'browser-validation');await page.close();
});
test('changed page structure, unknown options and required answers never trigger submission',async()=>{
  const f=await fixture(),page=await browser.newPage();await page.goto(url);const {tab,plan}=await prepare(f,page);
  await page.locator('#full').evaluate(el=>el.required=false);assert.equal((await executeIabPlan(tab,plan)).status,'needs-replan');assert.equal(await page.evaluate(()=>window.submissions),0);
  await page.goto(url);await page.locator('#sponsor option[value=no]').evaluate(el=>el.textContent='Not specified');const next=await prepare(f,page);assert.ok(next.plan.unresolved.some(f=>f.reason==='option-mismatch'));assert.equal((await executeIabPlan(tab,next.plan)).status,'needs-agent');await page.close();
});
test('stale materials and answer facts prevent arming after a valid fill',async()=>{
  const f=await fixture(),page=await browser.newPage();await page.goto(url);const {tab,plan}=await prepare(f,page);const ready=await executeIabPlan(tab,plan),file=path.join(f.workspace,'ready.json');await save(file,ready);await fs.appendFile(f.pdf,'changed');
  const arm=run(f.workspace,'apply','--id','job-1','--arm','--result',file);assert.notEqual(arm.status,0);assert.match(arm.stderr,/changed/);assert.equal(await page.evaluate(()=>window.submissions),0);await page.close();
});
test('missing confirmation remains unconfirmed and a persisted attempt cannot be retried',async()=>{
  const target=url+'?mode=silent',f=await fixture(target),page=await browser.newPage();await page.goto(target);const {tab,plan}=await prepare(f,page);const ready=await executeIabPlan(tab,plan),file=path.join(f.workspace,'result.json');await save(file,ready);const arm=run(f.workspace,'apply','--id','job-1','--arm','--result',file);assert.equal(arm.status,0,arm.stderr);const permit=JSON.parse(await fs.readFile(JSON.parse(arm.stdout).permit));
  assert.equal((await executeIabPlan(tab,plan,{permit})).status,'submission-unconfirmed');assert.equal(await page.evaluate(()=>window.submissions),1);assert.equal((await executeIabPlan(tab,plan,{permit})).status,'ready-to-submit');assert.equal(await page.evaluate(()=>window.submissions),1);
  const retry=run(f.workspace,'apply','--id','job-1','--prepare','--form',path.join(f.workspace,'form.json'));assert.equal(retry.status,2);assert.equal(JSON.parse(retry.stdout).action,'reconcile-existing-attempt');await page.close();
});
test('a pre-existing thank-you message is not new success evidence',async()=>{
  const target=url+'?mode=preexisting',f=await fixture(target),page=await browser.newPage();await page.goto(target);const {tab,plan}=await prepare(f,page);const ready=await executeIabPlan(tab,plan),file=path.join(f.workspace,'result.json');await save(file,ready);const arm=run(f.workspace,'apply','--id','job-1','--arm','--result',file);assert.equal(arm.status,0,arm.stderr);const permit=JSON.parse(await fs.readFile(JSON.parse(arm.stdout).permit));assert.equal((await executeIabPlan(tab,plan,{permit})).status,'submission-unconfirmed');await page.close();
});
test('a terminal gate skips long analysis, but cannot bypass PASS assessment',async()=>{
  const f=await fixture('https://example.org/job/1'),store=JSON.parse(await fs.readFile(f.leads));store.jobs[0].state='awaiting-agent';await save(f.leads,store);
  const prepared=run(f.workspace,'pipeline','--id','job-1');assert.equal(prepared.status,0,prepared.stderr);
  const context=JSON.parse(await fs.readFile(path.join(f.dir,'context.json')));const gate={assessmentType:'gate',contextHash:context.contextHash,company:'Example',role:'Developer',ko:{status:'FAIL',items:keys.map(key=>({key,result:key==='contract'?'FAIL':'PASS',reason:'Observed fixture criterion',jdQuote:key==='contract'?'Developer alternance responsibilities':''}))},decision:{route:'skip',gaps:['contract'],nextAction:'Skip',owner:'agent'},questions:[]};const file=path.join(f.workspace,'gate.json');await save(file,gate);
  await save(file,{...gate,draft:true,reviewRequired:true});const unreviewed=run(f.workspace,'pipeline','--id','job-1','--assessment',file);assert.notEqual(unreviewed.status,0);assert.match(unreviewed.stderr,/draft must be reviewed/);assert.equal(JSON.parse(await fs.readFile(f.leads)).jobs[0].state,'awaiting-agent');await save(file,gate);
  const p=run(f.workspace,'pipeline','--id','job-1','--assessment',file);assert.equal(p.status,0,p.stderr);assert.equal(JSON.parse(await fs.readFile(f.leads)).jobs[0].state,'rejected');assert.doesNotMatch(await fs.readFile(path.join(f.dir,'report.md'),'utf8'),/## A/);
  gate.ko.status='PASS';gate.ko.items[0].result='PASS';await save(file,gate);const reject=run(f.workspace,'pipeline','--id','job-1','--assessment',file);assert.notEqual(reject.status,0);
});
test('the original login/captcha interruption resumes with its approved snapshot; unconfirmed submission cannot restart',async()=>{
  const f=await fixture();assert.equal(run(f.workspace,'state','--id','job-1','--to','submitting').status,0);
  for(const block of ['blocked-login','blocked-captcha']){
    const paused=run(f.workspace,'state','--id','job-1','--to',block);assert.equal(paused.status,0,paused.stderr);
    const resumed=run(f.workspace,'state','--id','job-1','--to','submitting');assert.equal(resumed.status,0,resumed.stderr);
  }
  assert.equal(run(f.workspace,'state','--id','job-1','--to','submission-unconfirmed').status,0);
  const repeated=run(f.workspace,'state','--id','job-1','--to','submitting');assert.notEqual(repeated.status,0);assert.match(repeated.stderr,/requires reconciliation/);
});

test('bounded assessment batches reuse a common packet and retain remaining jobs',async()=>{
  const f=await fixture('https://example.org/job/1'),store=JSON.parse(await fs.readFile(f.leads));store.jobs[0].state='awaiting-agent';store.jobs.push({...store.jobs[0],id:'job-2',url:'https://example.org/job/2',key:'https://example.org/job/2',directory:'2026-10-03__Example__Developer2'});await save(f.leads,store);const dir=path.join(path.dirname(f.dir),store.jobs[1].directory);await fs.mkdir(dir,{recursive:true});const context=JSON.parse(await fs.readFile(path.join(f.dir,'context.json')));context.url=store.jobs[1].url;context.captured.url=store.jobs[1].url;await save(path.join(dir,'context.json'),context);
  const p=run(f.workspace,'batch','--stage','assess','--limit','1');assert.equal(p.status,0,p.stderr);const summary=JSON.parse(p.stdout);assert.equal(summary.count,1);assert.equal(summary.remaining,1);const manifest=JSON.parse(await fs.readFile(summary.manifest));assert.equal(manifest.factsFiles.length,1);assert.ok(manifest.items[0].agentContext);assert.ok(p.stdout.length<1000);
});
test('summary scan and triage persist full details without returning whole queues',async()=>{
  const f=await fixture(),store=JSON.parse(await fs.readFile(f.leads));store.jobs[0].discoveryDisposition='review';await save(f.leads,store);
  const full=run(f.workspace,'scan','--plan'),brief=run(f.workspace,'scan','--plan','--summary');assert.equal(brief.status,0,brief.stderr);const plan=JSON.parse(brief.stdout);assert.equal(JSON.parse(await fs.readFile(plan.file)).tasks.length,JSON.parse(full.stdout).tasks.length);assert.ok(brief.stdout.length<full.stdout.length/5);
  const triage=run(f.workspace,'triage','--list-review','--summary');assert.equal(triage.status,0,triage.stderr);const summary=JSON.parse(triage.stdout);assert.equal(summary.queue,1);assert.equal(JSON.parse(await fs.readFile(summary.file)).queue[0].id,'job-1');
});
test('templates reuse observed bindings across job URLs and never reuse answers',async()=>{
  const f=await fixture(),page=await browser.newPage();await page.goto(url);const first=await prepare(f,page);assert.equal(first.plan.templateReused,false);const second=await prepare(f,page);assert.equal(second.plan.templateReused,true);
  const store=JSON.parse(await fs.readFile(f.leads)),other=url+'?otherJob=2';store.jobs[0].url=other;store.jobs[0].key=other;await save(f.leads,store);await save(path.join(f.dir,'capture.json'),{url:other,finalUrl:other});await page.goto(other);const third=await prepare(f,page);assert.equal(third.plan.templateId,first.plan.templateId);assert.equal(third.plan.templateReused,true);await page.close();
});
test('checkbox, radio and disabled-until-valid buttons are handled deterministically',async()=>{
  const f=await fixture(),page=await browser.newPage();await page.goto(url);
  await page.locator('form').evaluate(form=>{form.insertAdjacentHTML('beforeend','<fieldset><legend>Preferred language</legend><label><input type="radio" name="lang" value="fr" required>French</label><label><input type="radio" name="lang" value="en">English</label></fieldset>');const button=document.querySelector('#submit');button.disabled=true;form.addEventListener('input',()=>button.disabled=!form.checkValidity());});
  const records=[{questions:['Preferred language'],answer:'French',status:'confirmed',sources:[{path:'个人资料/profile/basics.md',quote:'Example Candidate'}]},{questions:['Email updates'],answer:false,status:'confirmed',sources:[{path:'个人资料/profile/basics.md',quote:'Example Candidate'}]}];const file=path.join(f.workspace,'extra-answers.json');await save(file,records);assert.equal(run(f.workspace,'apply','--answers',file).status,0);const {tab,plan}=await prepare(f,page);const result=await executeIabPlan(tab,plan);assert.equal(result.status,'ready-to-submit',JSON.stringify(result));assert.equal(await page.locator('input[value=fr]').isChecked(),true);assert.equal(await page.locator('#submit').isEnabled(),true);await page.close();
});
test('login and human verification stop before any filling',async()=>{
  const f=await fixture(),page=await browser.newPage();await page.goto(url);const {tab,plan}=await prepare(f,page);await page.locator('form').evaluate(el=>el.insertAdjacentHTML('beforeend','<input type="password" aria-label="Password">'));const login=await executeIabPlan(tab,plan);assert.equal(login.reason,'login');assert.equal(await page.locator('#email').inputValue(),'');await page.goto(url);await page.locator('main').evaluate(el=>el.insertAdjacentHTML('afterbegin','<p>Please verify you are human</p>'));assert.equal((await executeIabPlan(tab,plan)).reason,'challenge');await page.close();
});
test('upload failures have a bounded fallback and do not fill or submit',async()=>{
  const f=await fixture(),page=await browser.newPage();await page.goto(url);const {tab,plan}=await prepare(f,page);let waits=0;tab.playwright.waitForEvent=async()=>{waits++;throw Error('No chooser')};const result=await executeIabPlan(tab,plan);assert.equal(result.reason,'upload-no-filechooser');assert.equal(waits,2);assert.equal(await page.locator('#email').inputValue(),'');assert.equal(await page.evaluate(()=>window.submissions),0);await page.close();
});
test('tampered plans and stale execution permits are rejected',async()=>{
  const f=await fixture(),page=await browser.newPage();await page.goto(url);const {tab,plan,summary}=await prepare(f,page);const ready=await executeIabPlan(tab,plan),file=path.join(f.workspace,'ready.json');await save(file,ready);const tampered={...plan,action:{...plan.action,label:'different'}};await save(summary.plan,tampered);const arm=run(f.workspace,'apply','--id','job-1','--arm','--result',file);assert.notEqual(arm.status,0);assert.match(arm.stderr,/Plan changed/);
  const stale={jobId:plan.jobId,planHash:plan.planHash,attemptId:randomUUID(),issuedAt:'invalid'};assert.equal((await executeIabPlan(tab,plan,{permit:stale})).status,'ready-to-submit');assert.equal(await page.evaluate(()=>window.submissions),0);await page.close();
});
