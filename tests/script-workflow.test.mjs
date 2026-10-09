import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {selectLeads,materialPreflight,requirementHints,composePayload} from '../runtime/tools/lib/work-packets.mjs';
const skill=path.resolve(import.meta.dirname,'..'),cli=path.join(skill,'runtime/tools/useless-linkedin.mjs');
const sha=x=>createHash('sha256').update(x).digest('hex');
const temp=()=>fs.mkdtemp(path.join(process.env.USELESS_LINKEDIN_TEST_ARTIFACTS||os.tmpdir(),'script-workflow-'));
const save=async(file,data)=>{await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,typeof data==='string'?data:JSON.stringify(data));};
const data=(root,name)=>path.join(root,'个人资料/applications/automation',name);
async function run(workspace,...flags){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,[cli,...flags],{cwd:workspace,env:{...process.env,USELESS_LINKEDIN_WORKSPACE:workspace,USELESS_LINKEDIN_TEST_LOCAL:'1',PYTHONUTF8:'1'},stdio:['ignore','pipe','pipe']});let out='',err='';child.stdout.on('data',s=>out+=s);child.stderr.on('data',s=>err+=s);child.on('error',reject);child.on('exit',code=>resolve({code,out,err,json:()=>JSON.parse(out)}));});}
const jd='Alternance software developer. Python, JavaScript, APIs and tests. Bachelor or engineering cursus; 12 mois. Start and rhythm are not stated. '.repeat(5);

test('literal bounded lead queries cannot leak the complete store or misclassify nonmatches',async()=>{
 const jobs=Array.from({length:120},(_,i)=>({id:'job-'+i,company:i<11?'Noota':'Other',title:'Software Developer',url:'https://employer.example/'+i,state:'discovered',jd:'large navigation and history '.repeat(1000)}));
 assert.equal(selectLeads(jobs,{query:'Noota',limit:10}).total,11);assert.equal(selectLeads(jobs,{query:'Noota',limit:10}).remaining,1);assert.equal(selectLeads(jobs,{query:'.*'}).total,0);assert.throws(()=>selectLeads(jobs,{limit:0}));
 const root=await temp();await save(data(root,'leads.json'),{version:1,jobs,scans:[]});const before=await fs.readFile(data(root,'leads.json'));
 const p=await run(root,'leads','--query','Noota','--limit','1');assert.equal(p.code,0,p.err);assert.equal(p.json().cards.length,1);assert.equal(p.json().total,11);assert.ok(p.out.length<1200);assert.doesNotMatch(p.out,/navigation/);assert.deepEqual(await fs.readFile(data(root,'leads.json')),before);assert.equal(JSON.parse(await fs.readFile(p.json().file)).items[0].jd,jobs[0].jd);
});

test('search and complete-JD screening preserve closed, irrelevant and blocked evidence and reuse fresh checks',async()=>{
 const root=await temp(),calls={};const server=http.createServer((req,res)=>{calls[req.url]=(calls[req.url]||0)+1;
  if(req.url==='/list'){res.setHeader('content-type','application/json');return res.end(JSON.stringify({jobs:[1,2,3,4].map(i=>({url:base+'/job/'+i,title:i===3?'Pharmacy role':'Alternance software developer',company:'Controlled employer'}))}));}
  if(req.url==='/job/2'){res.statusCode=404;return res.end('This posting has closed.');}if(req.url==='/job/4'){res.statusCode=403;return res.end('Access denied');}
  const text=req.url==='/job/3'?'Pharmacien dans une pharmacie hospitalière. '.repeat(15):jd;
  res.end('<html><title>Software Developer</title><p>'+text+'</p><a href="/apply">Postuler</a></html>');
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 try{
  await save(path.join(root,'config.json'),{version:1,queries:['software'],include_keywords:['alternance'],role_keywords:['software'],portals:[{name:'Fixture',api_url:base+'/list',api:{rows_path:'jobs',fields:{url:'url',title:'title',company:'company'},exhaustive:true},renderer:'http'}],discovery:{web_search:false,respect_robots:false,min_interval_ms:0}});
  const first=await run(root,'research','--run','--config','config.json','--no-browser');assert.equal(first.code,0,first.err);assert.ok(first.out.length<1800);const report=JSON.parse(await fs.readFile(first.json().manifest));assert.equal(report.counts.total,4);assert.equal(report.counts.closed,1);assert.equal(report.counts.excluded,1);assert.equal(report.deferred,1);assert.equal(calls['/job/3'],1,'unknown-title reviews receive bounded full-JD triage before Agent selection');const active=report.cards.find(j=>j.url.endsWith('/1'));assert.match(await fs.readFile(active.fullJd,'utf8'),/Bachelor/);assert.ok(report.cards.some(j=>j.url.endsWith('/4')&&!j.fullJd));
  const before={...calls};const second=await run(root,'research','--screen-only','--config','config.json','--no-browser');assert.equal(second.code,0,second.err);assert.deepEqual(calls,before,'fresh details and blocked checks are reused without pretending blocked was verified');
  await save(path.join(root,'scope.json'),{role_keywords:['software'],include_keywords:['alternance'],exclude_keywords:['software developer']});
  const scoped=await run(root,'research','--screen-only','--scope','scope.json','--config','config.json','--no-browser');assert.equal(scoped.code,0,scoped.err);assert.deepEqual(calls,before,'changing target rules reclassifies cached complete JDs without HTTP or models');assert.ok(!JSON.parse(await fs.readFile(scoped.json().manifest)).cards.some(c=>c.url.endsWith('/1')));
  const restored=await run(root,'research','--screen-only','--config','config.json','--no-browser');assert.equal(restored.code,0,restored.err);assert.deepEqual(calls,before);assert.ok(JSON.parse(await fs.readFile(restored.json().manifest)).cards.some(c=>c.url.endsWith('/1')),'a prior rule exclusion does not strand the lead in the next scope');
  const store=JSON.parse(await fs.readFile(data(root,'leads.json'))),job=store.jobs.find(j=>j.url.endsWith('/1'));const capture=path.join(root,job.triage.captureFile);await fs.appendFile(capture,' '); // Whitespace does not invalidate the semantic object digest.
  const changed=JSON.parse(await fs.readFile(capture));changed.jd='Tampered description';await save(capture,changed);
  const third=await run(root,'research','--screen-only','--config','config.json','--no-browser');assert.equal(third.code,0,third.err);assert.equal(calls['/job/1'],before['/job/1']+1,'tampered capture must be fetched again');
  const retry=await run(root,'research','--screen-only','--retry-agent','--config','config.json','--no-browser');assert.equal(retry.code,0,retry.err);assert.equal(calls['/job/4'],before['/job/4']+1,'explicit retry can refresh blocked evidence without treating it as active');
  const current=JSON.parse(await fs.readFile(data(root,'leads.json'))).jobs.find(j=>j.url.endsWith('/1')),fresh=JSON.parse(await fs.readFile(path.join(root,current.triage.captureFile)));fresh.capturedAt='2020-01-01T00:00:00Z';await save(path.join(root,current.triage.captureFile),fresh);current.triage.captureHash=sha(JSON.stringify(fresh));const all=JSON.parse(await fs.readFile(data(root,'leads.json')));Object.assign(all.jobs.find(j=>j.id===current.id),current);await save(data(root,'leads.json'),all);
  const stale=await run(root,'research','--screen-only','--config','config.json','--no-browser');assert.equal(stale.code,0,stale.err);assert.equal(calls['/job/1'],before['/job/1']+2,'a matching hash cannot make an old capture fresh');
 }finally{await new Promise(r=>server.close(r));}
});

test('material preflight defers unknown, closed and school-bound routes without declaring qualification PASS',()=>{
 const capturedAt=new Date().toISOString(),job={state:'awaiting-agent',url:'https://employer.example/job'},capture={url:job.url,jd,bodyText:jd+' Apply',applyControls:['Apply'],capturedAt,liveness:{result:'active'}};
 assert.equal(materialPreflight(job,{capture}).ready,true);assert.equal(materialPreflight(job,{capture:{...capture,applyControls:[]}}).ready,false);assert.equal(materialPreflight(job,{capture:{...capture,liveness:{result:'uncertain'}}}).ready,false);
 assert.equal(materialPreflight({...job,submitted:true},{capture}).ready,false);assert.equal(materialPreflight(job,{capture:{...capture,capturedAt:'2020-01-01T00:00:00Z'}}).ready,false);
 assert.ok(materialPreflight(job,{capture:{...capture,jd:jd+' Vous devez rejoindre notre école.'}}).reasons.includes('school_route_requires_review'));
 const hints=requirementHints('x'.repeat(900)+' Bac+5 obligatoire.');assert.ok(hints.education[0].quote.includes('Bac+5'));assert.equal(hints.education[0].reviewRequired,true);
});

test('shared material recipes keep indexed slots and reject accidental duplicates',()=>{
 const item=(text,index)=>({selector:'.item-bullets',index,text,sources:[{path:'profile.md',quote:'source evidence'}]});
 const combined=composePayload({cv:[item('base0',0),item('base1',1)],letter:[]},{cv:[item('target0',0)],letter:[]});assert.deepEqual(combined.cv.map(x=>x.text),['target0','base1']);assert.throws(()=>composePayload({cv:[item('a',0),item('b',0)],letter:[]},{cv:[],letter:[]}),/Duplicate/);
});

async function materialFixture(){
 const root=await temp();const init=await run(root,'init','--workspace',root);assert.equal(init.code,0,init.err);
 const fact='Controlled candidate has a Bachelor qualification and confirmed software project experience.';
 await save(path.join(root,'个人资料/profile/basics.md'),'# Basics\n- 姓名: Fixture Applicant\n'+fact);
 await save(path.join(root,'个人资料/profile/experiences/first.md'),'时间: 2025-01—2025-12\n'+fact);await save(path.join(root,'个人资料/profile/experiences/second.md'),'时间: 2024-01—2024-12\n'+fact);
 const source={path:'个人资料/profile/basics.md',quote:fact},replace=(selector,text,index)=>({selector,text,...(index===undefined?{}:{index}),sources:[source]});
 const payload={cv:[replace('.subtitle','Software Developer'),replace('.profil-text','Software project experience with documented delivery.'),replace('.contact-details','Email: fixture@example.test\nAdresse: Paris'),replace('.lang-bullets','French B2\nEnglish B2'),replace('.skill-bullets','Python\nJavaScript'),replace('.profil-header-target','Recherche alternance'),replace('.availability','September 2027'),replace('.course-list','Software engineering'),...[0,1,2,3].flatMap(i=>[replace('.item-title','Software role '+i,i),replace('.item-sub','Fixture organization',i),replace('.item-loc','Paris',i),replace('.item-bullets','Documented project delivery and tests.',i)]),...[2,3].map(i=>replace('.item-date','2026',i)),...[['first','01-12/2025',0,'时间: 2025-01—2025-12'],['second','01-12/2024',1,'时间: 2024-01—2024-12']].map(([file,text,index,quote])=>({selector:'.item-date',text,index,sources:[{path:'个人资料/profile/experiences/'+file+'.md',quote}]})),replace('.item-title','Bachelor',4),replace('.item-sub','Fixture school',4),replace('.item-loc','Paris',4),replace('.item-date','2024-2027',4)],letter:[replace('.subject','Application software developer'),replace('.personal-info','fixture@example.test\nParis'),replace('.letter','I am applying for this controlled role.\nMy documented software project experience relates to the work described.\nI would welcome a discussion.')]};
 const sources={'个人资料/profile/basics.md':await fs.readFile(path.join(root,source.path),'utf8')},contextHash=sha(JSON.stringify({jd,sources})),jobs=[];
 for(const id of ['ready','closed','school']){
  const directory='2026-10-04__Fixture__'+id,dir=data(root,'jobs/'+directory),url='https://employer.example/'+id;
  const capture={url,jd:id==='school'?jd+' Vous devez rejoindre notre école.':jd,bodyText:jd+' Apply',applyControls:['Apply'],capturedAt:new Date().toISOString(),liveness:{result:id==='closed'?'expired':'active'}};
  const job={id,key:url,url,state:'awaiting-agent',company:'Fixture Employer',title:'Software Developer',directory,contextHash,createdAt:new Date().toISOString(),lastSeenAt:new Date().toISOString(),submitted:false,possibleDuplicates:[]};jobs.push(job);
  await save(path.join(dir,'capture.json'),capture);await save(path.join(dir,'jd.txt'),jd);await save(path.join(dir,'context.json'),{contextHash,sources,captured:capture});await save(path.join(dir,'questions.json'),[]);
  await save(path.join(dir,'assessment.json'),{assessmentType:'user-selected-application',userOverride:{instruction:'Apply to this controlled fictional fixture with the documented unknown conditions.'},ko:'MARGINAL',matchLevel:'延伸',matchReason:'Education equivalence and start or rhythm are not all confirmed.',matchSources:[source,{path:path.relative(root,path.join(dir,'jd.txt')),quote:'Bachelor or engineering cursus'}],payload});
 }
 await save(data(root,'leads.json'),{version:1,jobs,scans:[]});await save(path.join(root,'ids.json'),jobs.map(j=>j.id));return {root,payload};
}

test('local material batch generates only the eligible route, preserves originals and reuses content until sources change',async()=>{
 const {root}=await materialFixture();
 const plan=await run(root,'materials','--plan','--ids','ids.json');assert.equal(plan.code,0,plan.err);assert.equal(plan.json().ready,1);assert.equal(plan.json().deferred,2);
 const first=await run(root,'materials','--run','--ids','ids.json');assert.equal(first.code,0,first.err);assert.equal(first.json().generated,1,await fs.readFile(first.json().result,'utf8'));assert.equal(first.json().errors,0);assert.ok(first.out.length<1000);
 const material=JSON.parse(await fs.readFile(first.json().result)).results.find(x=>x.id==='ready');assert.equal(material.reused,false);assert.ok((await fs.stat(material.preview)).size>1000);const review=JSON.parse(await fs.readFile(material.review));assert.equal(review.texts.length,2);assert.equal(review.state,'pending-visual-review');
 const before=await fs.readFile(path.join(material.output,review.files[0].file));
 const second=await run(root,'materials','--run','--ids','ids.json');assert.equal(second.json().generated,1);assert.equal(JSON.parse(await fs.readFile(second.json().result)).results.find(x=>x.id==='ready').reused,true);
 const job=JSON.parse(await fs.readFile(data(root,'leads.json'))).jobs.find(x=>x.id==='ready');assert.equal(job.state,'materials-pending-review');assert.equal(job.approvalSnapshot,undefined);
 await fs.appendFile(path.join(root,'个人资料/profile/basics.md'),'\nNew confirmed fact.');
 const stale=await run(root,'materials','--run','--ids','ids.json');assert.equal(stale.json().errors,1);assert.equal(stale.json().generated,0);assert.match(await fs.readFile(stale.json().result,'utf8'),/facts changed/);assert.deepEqual(await fs.readFile(path.join(material.output,review.files[0].file)),before);
 await save(path.join(process.env.USELESS_LINKEDIN_TEST_ARTIFACTS||os.tmpdir(),'material-batch-benchmark.json'),{firstGenerated:first.json().generated,secondGenerated:second.json().generated,secondReused:true,deferred:first.json().deferred,preview:material.preview,review:material.review,output:material.output,stdoutBytes:first.out.length});
});

test('standalone material cache detects PDF and template changes and rejects fabricated source quotes',async()=>{
 const {root,payload}=await materialFixture();await save(path.join(root,'payload.json'),payload);
 async function render(){return new Promise((resolve,reject)=>{const p=spawn(process.execPath,[path.join(skill,'runtime/tools/generate-application.mjs'),'--company','Fixture CV Employer','--role','Software Developer','--claims','payload.json','--reuse'],{cwd:root,env:{...process.env,USELESS_LINKEDIN_WORKSPACE:root,PYTHONUTF8:'1'}});let out='',err='';p.stdout.on('data',s=>out+=s);p.stderr.on('data',s=>err+=s);p.on('error',reject);p.on('exit',code=>resolve({code,out,err}));});}
 const first=await render();assert.equal(first.code,0,first.err);const output=JSON.parse(first.out).output;const pdf=(await fs.readdir(output)).find(x=>x.endsWith('.pdf'));await fs.appendFile(path.join(output,pdf),'tampered');
 const second=await render();assert.equal(second.code,0,second.err);assert.equal(JSON.parse(second.out).reused,false);assert.notEqual(JSON.parse(second.out).output,output);
 await fs.appendFile(path.join(root,'个人资料/template/resume.html'),'\n<!-- reviewed template revision -->');const third=await render();assert.equal(third.code,0,third.err);assert.equal(JSON.parse(third.out).reused,false);
 payload.cv[0].sources[0].quote='Fabricated source which does not occur';await save(path.join(root,'payload.json'),payload);const invalid=await render();assert.notEqual(invalid.code,0);assert.match(invalid.err,/Source quote missing/);
});

test('complete PASS assessment can defer writing and rendering until entry planning, with no missing-payload bypass',async()=>{
 const {root}=await materialFixture(),store=JSON.parse(await fs.readFile(data(root,'leads.json'))),job=store.jobs.find(j=>j.id==='ready'),dir=data(root,'jobs/'+job.directory),capture=JSON.parse(await fs.readFile(path.join(dir,'capture.json')));
 capture.kind='full-page';await save(path.join(root,'observed.json'),capture);
 const prepare=await run(root,'pipeline','--id',job.id,'--web-capture','observed.json');assert.equal(prepare.code,0,prepare.err);
 const context=JSON.parse(await fs.readFile(path.join(dir,'context.json'))),keys=['contract','rhythm','location','remote','start','education','experience','technology','french','english','permit','salary','credentials','duplicate'];
 const assessment={contextHash:context.contextHash,company:job.company,role:job.title,ko:{status:'PASS',items:keys.map(key=>({key,result:'PASS',reason:'Controlled fixture criterion checked'}))},sections:Object.fromEntries([... 'ABCDEFG'].map(k=>[k,{score:3,reason:'Controlled fixture analysis'}])),priority:3,matchLevel:'中',decision:{route:'precision',strongestEvidence:['Controlled facts'],gaps:[],nextAction:'Plan route before tailoring',owner:'agent'},questions:[]};
 await save(path.join(root,'pass.json'),assessment);const deferred=await run(root,'pipeline','--id',job.id,'--assessment','pass.json','--defer-materials');assert.equal(deferred.code,0,deferred.err);assert.equal(deferred.json().generated,false);assert.equal(deferred.json().materialPreflight.ready,true);assert.equal((await fs.readdir(path.join(root,'个人资料/CV'))).filter(n=>!n.startsWith('.')).length,0);
 await save(path.join(root,'ready-id.json'),[job.id]);const plan=await run(root,'materials','--plan','--ids','ready-id.json');assert.equal(plan.json().routeReady,1);assert.equal(plan.json().ready,0,'verified route alone cannot generate an unsourced payload');
 const rejected=await run(root,'pipeline','--id',job.id,'--assessment','pass.json');assert.notEqual(rejected.code,0);assert.match(rejected.err,/PASS requires material payload/);
});
