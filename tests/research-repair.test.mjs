import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {classifyLiveness} from '../runtime/tools/lib/job-signals.mjs';
import {relevance} from '../runtime/tools/lib/discovery-plan.mjs';
import {researchQueue} from '../runtime/tools/lib/research-queue.mjs';
import {applyPostingLinks} from '../runtime/tools/lib/posting-identity.mjs';
import {postingRequirements} from '../runtime/tools/lib/job-requirements.mjs';
import {gateDraft,koKeys} from '../runtime/tools/lib/gate-draft.mjs';

const cli=path.resolve(import.meta.dirname,'../runtime/tools/useless-linkedin.mjs');
const sha=x=>createHash('sha256').update(x).digest('hex');
const home=root=>path.join(root,'个人资料/applications/automation');
const save=async(file,value)=>{await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,JSON.stringify(value));};
const load=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const now=()=>new Date().toISOString();
const lead=(id,url,title='Alternance Developer',extra={})=>({id,key:url,url,title,company:'Fixture',state:'discovered',createdAt:now(),lastSeenAt:now(),discoveryDisposition:'review',...extra});
async function fixture(jobs=[],web=false){const root=await fs.mkdtemp(path.join(process.env.USELESS_LINKEDIN_TEST_ARTIFACTS||os.tmpdir(),'research-repair-'));await save(path.join(root,'config.json'),{version:1,queries:['alternance developer'],include_keywords:['alternance'],role_keywords:['developer'],portals:[],discovery:{web_search:web,company_careers:web}});await save(path.join(home(root),'leads.json'),{version:1,jobs,scans:[]});return root;}
async function run(root,...args){return new Promise((resolve,reject)=>{const p=spawn(process.execPath,[cli,...args],{cwd:root,env:{...process.env,USELESS_LINKEDIN_WORKSPACE:root,USELESS_LINKEDIN_TEST_LOCAL:'1'}});let out='',err='';p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>err+=x);p.on('error',reject);p.on('exit',code=>resolve({code,out,err,json:()=>JSON.parse(out)}));});}
async function manifest(root,flags=[]){const r=await run(root,'research','--config','config.json',...flags);assert.equal(r.code,0,r.err);return r.json().manifest;}
async function trusted(root,job,capture){const file=path.join(home(root),'triage',job.id+'.json');await save(file,capture);const s=await load(path.join(home(root),'leads.json'));s.jobs.find(j=>j.id===job.id).triage={status:'candidate',captureFile:path.relative(root,file),captureHash:sha(JSON.stringify(capture)),checkedAt:now()};await save(path.join(home(root),'leads.json'),s);return file;}
const page=(url,jd)=>({kind:'full-page',url,finalUrl:url,status:200,jd,bodyText:jd+' Postuler',applyControls:['Postuler'],capturedAt:now(),liveness:{result:'active',code:'apply_control_visible'}});

test('real WTTJ closure variants are expired; commercial development is not software development',()=>{
 for(const bodyText of ['This position is no longer available.','This position is no longer accepting applications.','This job is no longer available.'])assert.equal(classifyLiveness({bodyText}).result,'expired');
 assert.equal(classifyLiveness({bodyText:'An available position. Apply now',applyControls:['Apply now']}).result,'active');
 const scope={role_keywords:['developer','développeur','data','AI'],include_keywords:['alternance']};
 for(const title of ['Bussines Developer - Alternance','Business Developer AI — alternance','Alternance Développeur Commercial Luxe'])assert.equal(relevance({title},scope).matches,false);
 assert.equal(relevance({title:'Alternance Business Developer'},{role_keywords:['Business Developer'],include_keywords:['alternance']}).matches,true);
 assert.equal(relevance({title:'Alternance développeur Python pour logiciel commercial'},scope).matches,true);
});

test('proven links protect cross-platform applications in history, pipeline, batch and final prepare without copying receipts',async()=>{
 const sent=lead('sent','https://employer.example/jobs/123','Developer Apprentice',{state:'submitted',submitted:true}),alias=lead('alias','https://board.example/jobs/9','Developer Apprentice',{company:''});
 const root=await fixture([sent,alias]);await fs.writeFile(path.join(root,'receipt.txt'),'fixture receipt');const s=await load(path.join(home(root),'leads.json'));s.jobs[0].submissionEvidence=JSON.stringify({artifactPath:'receipt.txt',artifactSha256:sha('fixture receipt')});await save(path.join(home(root),'leads.json'),s);
 const m=await manifest(root);await save(path.join(root,'route.json'),{kind:'posting-route',fromUrl:alias.url,toUrl:sent.url,observedHref:sent.url,action:'apply-link',capturedAt:now()});
 const linked=await run(root,'research','--link','route.json','--manifest',m);assert.equal(linked.code,0,linked.err);
 const state=await load(path.join(home(root),'leads.json'));assert.equal(state.jobs[1].state,'discovered');assert.equal(state.jobs[1].submitted,undefined);assert.equal(state.jobs[0].submissionEvidence,s.jobs[0].submissionEvidence);
 const history=await run(root,'leads','--id','alias','--check-history');assert.equal(history.json().history[0].disposition,'existing-application');
 const prepared=await run(root,'apply','--id','alias','--prepare');assert.equal(prepared.code,2);assert.equal(prepared.json().action,'reconcile-existing-attempt');
 const pipeline=await run(root,'pipeline','--id','alias');assert.equal(pipeline.json().reason,'existing-application');
 const batch=await run(root,'batch','--stage','assess');assert.equal(batch.code,0,batch.err);assert.equal(batch.json().count,0);
 const submit=await run(root,'state','--id','alias','--to','submitting');assert.notEqual(submit.code,0);assert.match(submit.err,/linked posting requires reconciliation/);
 const before=await fs.readFile(path.join(home(root),'leads.json'));assert.equal((await run(root,'research','--link','route.json','--manifest',m)).json().reused,true);assert.deepEqual(await fs.readFile(path.join(home(root),'leads.json')),before);
});

test('identity rejects mismatched observed links; transitive aliases defer linked closures',async()=>{
 const a=lead('a','https://board.example/jobs/1'),b=lead('b','https://employer.example/jobs/1');const root=await fixture([a,b]),m=await manifest(root);
 await save(path.join(root,'wrong.json'),{kind:'posting-route',fromUrl:a.url,toUrl:b.url,observedHref:'https://employer.example/jobs/2',action:'apply-link',capturedAt:now()});
 const before=await fs.readFile(path.join(home(root),'leads.json'));assert.notEqual((await run(root,'research','--link','wrong.json','--manifest',m)).code,0);assert.deepEqual(await fs.readFile(path.join(home(root),'leads.json')),before);
 const c=lead('c','https://third.example/jobs/1');applyPostingLinks([a,b,c],[{fromUrl:a.url,toUrl:b.url},{fromUrl:b.url,toUrl:c.url}]);assert.ok(a.urlAliases.includes(c.url));
 c.state='expired';c.liveness={result:'expired'};const q=researchQueue([a,b,c],{role_keywords:['developer'],include_keywords:['alternance']});assert.equal(q.ids.length,0);assert.ok(q.deferredIds.includes('a'));assert.ok(q.deferredIds.includes('b'));
});

test('registered HTTP/JSON-LD and published API captures import without fabricated body/control text; tampering fails specifically',async()=>{
 const j=lead('http','https://employer.example/jobs/http'),api=lead('api','https://employer.example/jobs/api');const root=await fixture([j,api]),m=await manifest(root);
 const jd=('Minimum Bac+4. Alternance Developer, Python and API. ').repeat(10),capture={...page(j.url,jd),kind:undefined,bodyText:'Original HTML structured data Postuler'};const file=await trusted(root,j,capture);
 const r=await run(root,'research','--capture','--id',j.id,'--file',file,'--cached','--manifest',m);assert.equal(r.code,0,r.err);assert.equal((await load(path.join(home(root),'leads.json'))).jobs[0].jd,jd);
 const apiPage={...page(api.url,jd),layer:'ATS-API',bodyText:jd,applyControls:[],applicationRouteVerified:false,applicationRouteRequired:true,liveness:{result:'active',code:'api_published_posting'}};const apiFile=await trusted(root,api,apiPage);
 assert.equal((await run(root,'research','--capture','--id',api.id,'--file',apiFile,'--cached','--manifest',m)).code,0);const saved=await load(apiFile);assert.equal(saved.applicationRouteVerified,false);assert.deepEqual(saved.applyControls,[]);
 saved.jd+=' altered';await save(apiFile,saved);const bad=await run(root,'research','--capture','--id',api.id,'--file',apiFile,'--cached','--manifest',m);assert.notEqual(bad.code,0);assert.match(bad.err,/unregistered_capture/);
});

test('closed observations with no apply controls become expired through the shared capture command',async()=>{
 const j=lead('closed','https://employer.example/jobs/closed'),root=await fixture([j]),m=await manifest(root);await save(path.join(root,'closed.json'),{kind:'full-page',url:j.url,jd:'This position is no longer available.',bodyText:'This position is no longer available.',applyControls:[],capturedAt:now()});
 const r=await run(root,'research','--capture','--id',j.id,'--file','closed.json','--manifest',m);assert.equal(r.code,0,r.err);const saved=(await load(path.join(home(root),'leads.json'))).jobs[0];assert.equal(saved.state,'expired');assert.equal(saved.submitted,undefined);
});

test('legacy exhausted manifests produce next actions; task batches reuse templates and require all exact queries before continuation',async()=>{
 const root=await fixture([],true),m=await manifest(root,['--run']),old=await load(m);delete old.tasksFile;old.version=2;old.nextOffset=null;await save(m,old);
 const next=await run(root,'research','--continue',m);assert.equal(next.code,0,next.err);assert.equal(next.json().status,'queue-exhausted');
 const issued=await run(root,'research','--tasks','--manifest',m,'--limit','2');assert.equal(issued.code,0,issued.err);assert.equal(issued.json().tasks.length,2);const lease=issued.json().taskBatch;
 assert.equal((await run(root,'research','--tasks','--manifest',m)).json().taskBatch,lease);
 assert.equal((await run(root,'research','--continue',m)).json().status,'task-results-required');
 assert.equal((await run(root,'research','--screen-only','--manifest',m)).json().status,'task-results-required');
 const template=await load(issued.json().recordTemplate);for(const t of template.tasks){t.capturedAt=now();t.evidence='Observed this exact query: no end condition reached; scope remains incomplete.';}template.tasks[0].status='completed';await save(issued.json().recordTemplate,template);
 assert.notEqual((await run(root,'research','--record',issued.json().recordTemplate,'--manifest',m)).code,0,'cannot declare completed without an end condition');
 template.tasks[0].endCondition='Observed all returned pages and terminal page for this exact query';await save(issued.json().recordTemplate,template);const done=await run(root,'research','--record',issued.json().recordTemplate,'--manifest',m);assert.equal(done.code,0,done.err);assert.equal((await load(lease)).closed,true);
 const tasks=await load(path.join(home(root),'search-queue.json'));assert.equal(tasks.find(t=>t.id===template.tasks[0].id).status,'completed');assert.equal(tasks.find(t=>t.id===template.tasks[1].id).status,'partial');
});

test('gate drafts contain all 14 current checks, preserve unknowns and batch commits report each failure',async()=>{
 const draft=gateDraft({contextHash:'fixture',company:'Fixture',role:'Developer'});assert.deepEqual(draft.ko.items.map(i=>i.key),koKeys);assert.equal(draft.ko.items.length,14);assert.ok(draft.ko.items.every(i=>i.result==='UNKNOWN'));assert.equal(draft.draft,true);
 const root=await fixture([]);await save(path.join(root,'commit.json'),[{id:'unknown-1',file:'missing1.json'},{id:'unknown-2',file:'missing2.json'}]);const r=await run(root,'batch','--stage','assess','--commit','commit.json');assert.equal(r.code,1);assert.equal(r.json().results.length,2);assert.ok(r.json().results.every(x=>x.ok===false));assert.equal(r.json().remaining,0);
});

test('temporary exact queries are registered once and their partial coverage survives shared record and legacy manifests',async()=>{
 const root=await fixture([],true),m=await manifest(root,['--run']),old=await load(m);delete old.tasksFile;await save(m,old);
 const issued=await run(root,'research','--tasks','--manifest',m,'--query','site:employer.example alternance Python');assert.equal(issued.code,0,issued.err);const task=issued.json().tasks[0];assert.equal(task.query,'site:employer.example alternance Python');
 const same=await run(root,'research','--tasks','--manifest',m,'--query',task.query);assert.equal(same.json().taskBatch,issued.json().taskBatch);
 const record=await load(issued.json().recordTemplate);record.tasks[0].capturedAt=now();record.tasks[0].evidence='Observed first page only; further results remain unchecked.';await save(issued.json().recordTemplate,record);const saved=await run(root,'research','--record',issued.json().recordTemplate,'--manifest',m);assert.equal(saved.code,0,saved.err);
 const tasks=await load(path.join(home(root),'search-queue.json')),persisted=tasks.find(t=>t.id===task.id);assert.equal(persisted.temporary,true);assert.equal(persisted.retired,false);assert.equal(persisted.status,'partial');assert.equal(persisted.completed,false);
 const next=await run(root,'research','--tasks','--manifest',m,'--query',task.query);assert.equal(next.code,0,next.err);assert.equal(next.json().tasks[0].id,task.id);assert.equal((await load(path.join(home(root),'search-queue.json'))).filter(t=>t.id===task.id).length,1);
});

test('exact shared school clauses reuse reviewed interpretation while changed source invalidates it; no KO is inferred',async()=>{
 const a=lead('a','https://employer.example/jobs/a','Alternance Developer NEXA',{company:'NEXA'}),b=lead('b','https://employer.example/jobs/b','Alternance Developer NEXA',{company:'NEXA'}),root=await fixture([a,b]);
 const jd='Vous souhaitez intégrer notre école pour préparer un BTS.\n'+('Alternance Developer Python, source evidence. '.repeat(10));const af=await trusted(root,a,page(a.url,jd));await trusted(root,b,page(b.url,jd));const m=await manifest(root),group=postingRequirements(a,jd).clauses.find(c=>c.kind==='school');assert.ok(group);
 await save(path.join(root,'review.json'),{constraintReviews:[{id:a.id,groupId:group.groupId,interpretation:'This exact clause describes school enrollment; verify compatibility with the existing school. No candidate eligibility is asserted.'}]});assert.equal((await run(root,'research','--record','review.json','--manifest',m)).code,0);
 const packaged=await manifest(root),cards=(await load(packaged)).cards;assert.equal(cards.find(c=>c.id===b.id).requirements.clauses.find(c=>c.groupId===group.groupId).review.candidateDecision,false);
 const changed=await load(af);changed.bodyText+=' changed';await save(af,changed);const refreshed=await manifest(root);assert.equal((await load(refreshed)).cards.find(c=>c.id===b.id).requirements.clauses.find(c=>c.groupId===group.groupId).review,undefined);
 assert.ok((await load(path.join(home(root),'leads.json'))).jobs.every(j=>!j.assessment&&!j.submitted));
});

test('school indicators affect order without discarding unknown or blocked postings',()=>{
 const jobs=[lead('school','https://school.example/job/1','Alternance Developer NEXA',{triage:{status:'candidate'}}),lead('employer','https://employer.example/job/1','Alternance Developer',{triage:{status:'blocked'}}),lead('unknown','https://employer.example/job/2','Developer',{triage:{status:'pending'}})];
 const q=researchQueue(jobs,{role_keywords:['developer'],include_keywords:['alternance']});assert.equal(q.ids[0],'employer');assert.ok(q.ids.includes('school'));assert.ok(q.ids.includes('unknown'));assert.ok(jobs.every(j=>j.state==='discovered'));
});
