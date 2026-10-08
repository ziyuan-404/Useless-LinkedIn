import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {researchScope,researchConfig,researchQueue} from '../runtime/tools/lib/research-queue.mjs';
import {buildDiscoveryPlan,mergeTasks} from '../runtime/tools/lib/discovery-plan.mjs';
import {checkApplicationHistory} from '../runtime/tools/lib/application-history.mjs';

const cli=path.resolve(import.meta.dirname,'../runtime/tools/useless-linkedin.mjs');
const save=async(file,value)=>{await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,JSON.stringify(value));};
const load=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const home=root=>path.join(root,'个人资料/applications/automation');
async function temp(){return fs.mkdtemp(path.join(process.env.USELESS_LINKEDIN_TEST_ARTIFACTS||os.tmpdir(),'research-efficiency-'));}
async function run(root,...args){return new Promise((resolve,reject)=>{const p=spawn(process.execPath,[cli,...args],{cwd:root,env:{...process.env,USELESS_LINKEDIN_WORKSPACE:root,USELESS_LINKEDIN_TEST_LOCAL:'1',PYTHONUTF8:'1'}});let out='',err='';p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>err+=x);p.on('error',reject);p.on('exit',code=>resolve({code,out,err,json:()=>JSON.parse(out)}));});}
const base={version:1,queries:['old query'],query_matrix:{roles:['old role'],contracts:['stage']},include_keywords:['stage'],role_keywords:['old role'],portals:[{name:'Board',provider:'wttj',wttj:{queries:['old provider query']},web_queries:['old web query']}],discovery:{web_queries:['old open web query']}};
const intent={queries:['alternance Agent IA'],role_keywords:['Agent IA'],include_keywords:['alternance'],exclude_keywords:['senior']};

test('task queries reach API/provider/web discovery before scanning and unused old matrices are replaced',()=>{
 const scoped=researchConfig(base,researchScope(base,intent),{targeted:true}),tasks=buildDiscoveryPlan(scoped);
 assert.ok(tasks.some(t=>t.kind==='api'&&t.query==='alternance Agent IA'));
 assert.ok(tasks.some(t=>t.portal==='Open Web'));assert.ok(tasks.some(t=>t.portal==='Company Careers'));
 assert.ok(tasks.every(t=>!t.query.includes('old')));assert.deepEqual(scoped.query_matrix,{roles:[],contracts:[]});
 assert.deepEqual(researchConfig(scoped,scoped.research_scope,{targeted:true}),scoped,'reapplication for registered sources must be stable');
 const extended=researchConfig(base,researchScope(base,{...intent,queries:[...intent.queries,'alternance Support technique']}),{targeted:true});
 assert.ok(buildDiscoveryPlan(extended).some(t=>t.id===tasks.find(t=>t.kind==='api').id),'adding a query must not reset the existing query cursor');
 const explicit=researchConfig(base,researchScope(base,{...intent,query_matrix:{roles:['Support technique'],contracts:['apprentissage']}}),{targeted:true});
 assert.ok(buildDiscoveryPlan(explicit).some(t=>t.query.includes('apprentissage Support technique')));
 assert.throws(()=>researchScope(base,{queries:'bad'}));assert.throws(()=>researchScope(base,{query_matrix:{roles:[1]}}));
});

test('screening changes retain IDs/cursors, actual source filters reset them, legacy exact configurations migrate once',()=>{
 const source={name:'Board',provider:'wttj',wttj:{filters:'country:FR'},include_keywords:['stage']};
 const config={version:1,queries:['same query'],portals:[source],discovery:{web_search:false}};
 const first=buildDiscoveryPlan(config),changed=buildDiscoveryPlan({...config,portals:[{...source,include_keywords:['alternance'],role_keywords:['Agent IA']}]});
 assert.deepEqual(changed.map(t=>t.id),first.map(t=>t.id));
 const old=first.map(t=>({...t,status:'partial',cursor:{page:7},updatedAt:new Date().toISOString()}));assert.equal(mergeTasks(changed,old,{resume:true})[0].cursor.page,7);
 const different=buildDiscoveryPlan({...config,portals:[{...source,wttj:{filters:'country:BE'}}]});assert.equal(mergeTasks(different,old,{resume:true})[0].cursor,undefined);
 const legacy={...first[0],id:first[0].legacyId,signatureVersion:undefined,status:'partial',cursor:{page:9}};
 const migrated=mergeTasks(first,[legacy],{resume:true});assert.equal(migrated.length,first.length);assert.equal(migrated[0].cursor.page,9);assert.equal(migrated[0].id,first[0].id);
});

test('known contract/title conflicts are deferred while unknown contracts remain reviewable and explicit IDs remain available',()=>{
 const scope=researchScope({},intent),jobs=[{id:'stage',title:'Agent IA - Stage',state:'discovered',triage:{status:'blocked'}},{id:'senior',title:'Agent IA Senior',state:'discovered',triage:{status:'blocked'}},{id:'target',title:'Alternance Agent IA',state:'discovered'},{id:'unknown',title:'Agent IA',state:'discovered'},{id:'other',title:'Pharmacy',state:'discovered'},{id:'attempt',title:'Alternance Agent IA',state:'submission-unconfirmed'}];
 const q=researchQueue(jobs,scope);assert.deepEqual(q.ids,['target','unknown']);assert.deepEqual(q.lanes.conflict,['senior','stage']);assert.deepEqual(new Set(q.deferredIds),new Set(['stage','senior','other']));assert.equal(jobs[0].state,'discovered');
 assert.deepEqual(researchQueue(jobs,scope,{ids:['stage']}).ids,['stage']);assert.equal(researchQueue(jobs,scope,{includeUnmatched:true}).ids.length,5);
 const mixed={id:'mixed',title:'Agent IA - Stage / Alternance',state:'discovered'};assert.deepEqual(researchQueue([mixed],scope).ids,['mixed']);
});

test('read-only local history checks exact aliases, preserve uncertain attempts and never merge title-only matches',async()=>{
 const root=await temp(),artifact=path.join(root,'receipt.json');await fs.writeFile(artifact,'fixture receipt');
 const receipt={artifactPath:'receipt.json',artifactSha256:createHash('sha256').update('fixture receipt').digest('hex')};
 const jobs=[{id:'sent',url:'https://employer.example/jobs/123',urlAliases:['https://board.example/jobs/9'],title:'Agent IA',company:'Fixture',state:'submitted',submitted:true,submissionEvidence:JSON.stringify(receipt)},{id:'new',url:'https://board.example/jobs/9?utm_source=feed',title:'Agent IA',company:'Fixture',state:'discovered'},{id:'fuzzy',url:'https://employer.example/jobs/456',title:'Agent IA',company:'Fixture',state:'discovered'},{id:'unconfirmed',url:'https://employer.example/jobs/789',state:'submission-unconfirmed'}];
 const before=JSON.stringify(jobs),checks=await checkApplicationHistory(root,jobs,{rows:[]});
 assert.equal(checks.find(h=>h.id==='new').disposition,'existing-application');assert.equal(checks.find(h=>h.id==='new').receiptStatus,'consistent');assert.equal(checks.find(h=>h.id==='fuzzy').disposition,'possible-duplicate');assert.equal(checks.find(h=>h.id==='unconfirmed').receiptStatus,'needs-reconciliation');assert.equal(JSON.stringify(jobs),before);
 await fs.appendFile(artifact,'tamper');assert.equal((await checkApplicationHistory(root,jobs,{rows:[]})).find(h=>h.id==='new').receiptStatus,'needs-reconciliation');
});

test('real research CLI applies scope before HTTP and resumes a cursor without restarting the first page',async()=>{
 const root=await temp(),offsets=[],details=[];let host;
 const server=http.createServer((req,res)=>{
  if(req.url.startsWith('/api')){const u=new URL(req.url,host),offset=Number(u.searchParams.get('offset'));offsets.push([u.searchParams.get('q'),offset]);return res.end(JSON.stringify({jobs:[{url:host+'/job/'+offset,title:'Alternance Agent IA',company:'Fixture'}],total:2}));}
  details.push(req.url);res.end('<html><title>Alternance Agent IA</title><p>'+('Alternance Agent IA. Python and API development. '.repeat(12))+'</p><a href="/apply">Postuler</a></html>');
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));host='http://127.0.0.1:'+server.address().port;
 try{
  await save(path.join(root,'config.json'),{...base,portals:[{name:'Fixture',api_url:host+'/api?q={query}',api:{rows_path:'jobs',fields:{url:'url',title:'title',company:'company'},page_size:1,pagination:{mode:'offset',param:'offset',total_path:'total'}},web_search:false,renderer:'http'}],discovery:{web_search:false,respect_robots:false,min_interval_ms:0}});
  await save(path.join(root,'scope.json'),intent);
  const first=await run(root,'research','--run','--config','config.json','--scope','scope.json','--max-requests','1','--limit','1','--no-browser');assert.equal(first.code,0,first.err);
  const one=await load(first.json().manifest),task=(await load(path.join(home(root),'search-queue.json'))).find(t=>!t.retired);assert.equal(task.cursor.offset,1);assert.deepEqual(offsets,[['alternance Agent IA',0]]);
  const next=await run(root,'research','--run','--resume','--config',one.configFile,'--scope',path.join(path.dirname(first.json().manifest),'scope.json'),'--max-requests','1','--limit','1','--no-browser');assert.equal(next.code,0,next.err);assert.deepEqual(offsets,[['alternance Agent IA',0],['alternance Agent IA',1]]);
  const two=await load(next.json().manifest),queue=await load(path.join(home(root),'search-queue.json'));assert.equal(queue.filter(t=>!t.retired).length,1);assert.equal(queue[0].id,task.id);assert.ok(two.remaining>0);
  const before=details.length,continued=await run(root,'research','--continue',next.json().manifest);assert.equal(continued.code,0,continued.err);assert.equal((await load(continued.json().manifest)).cards.length,1);assert.equal(details.length,before+1);assert.equal(offsets.length,2);
  const zero=await load(path.join(home(root),'zero-token-scan.json'));assert.equal(zero.modelCalls,0);assert.equal(zero.modelTokens,0);assert.ok(first.out.length<2000);
 }finally{await new Promise(r=>server.close(r));}
});

test('manual JD/closure and task results persist once, completed tasks disappear, unrelated pending coverage remains',async()=>{
 const root=await temp();await save(path.join(root,'config.json'),{version:1,queries:['alternance Agent IA'],role_keywords:['Agent IA'],include_keywords:['alternance'],portals:[],discovery:{web_search:true,company_careers:true}});
 const job={id:'fixture',key:'https://employer.example/job/123',url:'https://employer.example/job/123',title:'Alternance Agent IA',company:'Fixture',state:'discovered',createdAt:new Date().toISOString(),lastSeenAt:new Date().toISOString(),discoveryDisposition:'review',triage:{status:'blocked',checkedAt:new Date().toISOString()}};
 await save(path.join(home(root),'leads.json'),{version:1,jobs:[job],scans:[]});
 const first=await run(root,'research','--run','--config','config.json');assert.equal(first.code,0,first.err);const m=await load(first.json().manifest),tasks=await load(m.tasksFile);assert.equal(tasks.length,2);
 const jd='Alternance Agent IA. Python and API development. '.repeat(10);await save(path.join(root,'observed.json'),{kind:'full-page',url:job.url,jd,bodyText:jd+' Postuler',applyControls:['Postuler'],capturedAt:new Date().toISOString()});
 await save(path.join(root,'record.json'),{version:1,captures:[{id:job.id,captureFile:'observed.json'}],tasks:[{id:tasks[0].id,status:'completed',capturedAt:new Date().toISOString(),evidence:'Observed this query and all its search pages; full JD preserved.'}]});
 const recorded=await run(root,'research','--record','record.json','--manifest',first.json().manifest);assert.equal(recorded.code,0,recorded.err);assert.equal(recorded.json().complete,true);
 const before=await fs.readFile(path.join(home(root),'leads.json')),repeat=await run(root,'research','--record','record.json','--manifest',first.json().manifest);assert.equal(repeat.code,0,repeat.err);assert.equal(repeat.json().reused,true);assert.deepEqual(await fs.readFile(path.join(home(root),'leads.json')),before);
 const remaining=await run(root,'research','--tasks','--manifest',first.json().manifest);assert.equal(remaining.code,0,remaining.err);assert.equal(remaining.json().total,1);
 const pending=await run(root,'research','--screen-only','--manifest',first.json().manifest);assert.equal(pending.json().status,'task-results-required');
 const template=await load(remaining.json().recordTemplate);template.tasks[0].capturedAt=new Date().toISOString();template.tasks[0].evidence='Fixture query has further unchecked pages; coverage stays partial.';await save(remaining.json().recordTemplate,template);assert.equal((await run(root,'research','--record',remaining.json().recordTemplate,'--manifest',first.json().manifest)).code,0);
 assert.equal((await load(path.join(home(root),'leads.json'))).jobs[0].triage.status,'candidate');
 const read=await run(root,'research','--screen-only','--manifest',first.json().manifest);assert.equal(read.code,0,read.err);assert.ok((await load(read.json().manifest)).cards[0].fullJd);
 const closing={kind:'full-page',url:job.url,jd:'This job has expired',bodyText:'This job has expired',applyControls:[],capturedAt:new Date().toISOString()};await save(path.join(root,'closed.json'),closing);await save(path.join(root,'closed-record.json'),{captures:[{id:job.id,captureFile:'closed.json'}]});
 const closed=await run(root,'research','--record','closed-record.json','--manifest',first.json().manifest);assert.equal(closed.code,0,closed.err);assert.equal((await load(path.join(home(root),'leads.json'))).jobs[0].state,'expired');
});

test('invalid observed source cannot mark a search task complete or fabricate submission',async()=>{
 const root=await temp();await save(path.join(root,'config.json'),{version:1,queries:['Agent IA'],role_keywords:['Agent IA'],portals:[],discovery:{web_search:true,company_careers:false}});
 await save(path.join(home(root),'leads.json'),{version:1,jobs:[{id:'fixture',url:'https://employer.example/job/1',title:'Agent IA',state:'discovered',assessment:{}}],scans:[]});
 const first=await run(root,'research','--run','--config','config.json');assert.equal(first.code,0,first.err);const manifest=await load(first.json().manifest),task=(await load(manifest.tasksFile))[0];
 await save(path.join(root,'wrong.json'),{kind:'full-page',url:'https://other.example/job/2',jd:'Invented'.repeat(100),bodyText:'Invented'.repeat(100)+' Apply',applyControls:['Apply'],capturedAt:new Date().toISOString()});
 await save(path.join(root,'bad.json'),{captures:[{id:'fixture',captureFile:'wrong.json'}],tasks:[{id:task.id,status:'completed',capturedAt:new Date().toISOString(),evidence:'Unrelated page must not complete this task.'}]});
 const bad=await run(root,'research','--record','bad.json','--manifest',first.json().manifest);assert.notEqual(bad.code,0);assert.equal((await load(path.join(home(root),'search-queue.json')))[0].completed,false);assert.equal((await load(path.join(home(root),'leads.json'))).jobs[0].state,'discovered');
});

test('new observed URL and full JD can be imported together without Agent ID lookup or network',async()=>{
 const root=await temp();await save(path.join(root,'config.json'),{version:1,queries:['Agent IA'],role_keywords:['Agent IA'],include_keywords:['alternance'],portals:[],discovery:{web_search:false}});
 const url='https://employer.example/jobs/321',jd='Alternance Agent IA. Python, RAG and API development. '.repeat(10);
 await save(path.join(root,'observed.json'),{kind:'full-page',url,title:'Alternance Agent IA',company:'Fixture',jd,bodyText:'Fixture '+jd+' Postuler',applyControls:['Postuler'],capturedAt:new Date().toISOString()});
 await save(path.join(root,'record.json'),{imports:[{url,title:'Alternance Agent IA',company:'Fixture',capturedAt:new Date().toISOString()}],captures:[{url,captureFile:'observed.json'}]});
 const p=await run(root,'research','--record','record.json','--config','config.json');assert.equal(p.code,0,p.err);const ids=await load(p.json().importedIdsFile);assert.equal(ids.length,1);
 const jobs=(await load(path.join(home(root),'leads.json'))).jobs;assert.equal(jobs[0].id,ids[0]);assert.equal(jobs[0].triage.status,'candidate');assert.equal(jobs[0].jd,jd);assert.equal(jobs[0].submitted,false);assert.equal((await load(path.join(home(root),'last-scan.json'))).requests,0);
});

test('credential-blocked and future-retry tasks stay persisted without becoming repeated Agent work',async()=>{
 const root=await temp();await save(path.join(root,'config.json'),{version:1,queries:['Agent IA'],role_keywords:['Agent IA'],portals:[],discovery:{web_search:false}});
 await save(path.join(home(root),'search-queue.json'),[{id:'credentials',kind:'api',status:'needs-agent',failureClass:'credentials-missing',reason:'API credentials missing: FIXTURE_TOKEN'},{id:'wait',kind:'listing',status:'retry-wait',nextRetryAt:new Date(Date.now()+60000).toISOString()},{id:'web',kind:'web-search',status:'pending',query:'Agent IA'}]);
 const first=await run(root,'research','--config','config.json');assert.equal(first.code,0,first.err);const before=await fs.readFile(path.join(home(root),'search-queue.json'));
 const tasks=await run(root,'research','--tasks','--manifest',first.json().manifest);assert.equal(tasks.code,0,tasks.err);assert.equal(tasks.json().deferred,2);assert.deepEqual(tasks.json().tasks.map(t=>t.id),['web']);assert.deepEqual(await fs.readFile(path.join(home(root),'search-queue.json')),before);
});
