import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync,spawn} from 'node:child_process';
import http from 'node:http';
import {researchQueue,researchPage,researchScope} from '../runtime/tools/lib/research-queue.mjs';
import {collectCompany,companyRecord,reviewCompany,companyDisplay,companyMaterialSources} from '../runtime/tools/lib/company-research.mjs';
import {verifyEmailReceipt,emailQuery} from '../runtime/tools/lib/email-receipt.mjs';
const cli=path.resolve(import.meta.dirname,'../runtime/tools/useless-linkedin.mjs');
const save=async(file,data)=>{await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,JSON.stringify(data));};
const run=(workspace,...args)=>spawnSync(process.execPath,[cli,...args],{cwd:workspace,env:{...process.env,USELESS_LINKEDIN_WORKSPACE:workspace,PYTHONUTF8:'1'},encoding:'utf8'});
const temp=()=>fs.mkdtemp(path.join(process.env.USELESS_LINKEDIN_TEST_ARTIFACTS||os.tmpdir(),'quota-flow-'));
test('target queues prioritize actual role evidence, preserve unmatched leads, and keep stable continuation positions',()=>{
 const scope=researchScope({role_keywords:['agent IA','support technique']}),jobs=[{id:'z',title:'Java Full Stack',state:'discovered'},{id:'a',title:'Alternance Agent IA',state:'discovered'},{id:'b',title:'Assistant support technique',state:'discovered'},{id:'submitted',title:'Agent IA',state:'submission-unconfirmed'}];
 const queue=researchQueue(jobs,scope);assert.deepEqual(queue.ids,['a','b']);assert.deepEqual(queue.deferredIds,['z']);assert.equal(jobs[0].triage,undefined);
 jobs[1].state='approved';assert.deepEqual(researchPage(jobs,queue.ids,{offset:1,limit:1}).items.map(j=>j.id),['b']);assert.deepEqual(researchQueue(jobs,scope,{includeUnmatched:true}).ids,['b','z']);
 assert.deepEqual(researchQueue(jobs,scope,{ids:['z']}).ids,['z']);assert.throws(()=>researchScope({}, {role_keywords:'IA'}));
 const oldExcluded={id:'changed-scope',title:'Support technique',jd:'Support technique alternance',state:'discovered',triage:{status:'excluded',method:'rules'}};
 assert.deepEqual(researchQueue([oldExcluded],scope).ids,['changed-scope'],'old rule exclusion must not hide a newly relevant target');assert.equal(researchPage([oldExcluded],['changed-scope']).items.length,0,'it needs new full-JD triage before Agent handoff');oldExcluded.triage.method='manual';assert.equal(researchQueue([oldExcluded],scope).ids.length,0);
});
test('research CLI uses the zero-token scanner, keeps queues off the bounded manifest, and continues without skipping',async()=>{
 const workspace=await temp(),home=path.join(workspace,'个人资料/applications/automation');
 await save(path.join(workspace,'config.json'),{version:1,portals:[],queries:['agent IA'],role_keywords:['agent IA'],discovery:{web_search:false,min_interval_ms:0}});
 const jobs=[{id:'a',key:'https://example.invalid/a',url:'https://example.invalid/a',title:'Agent IA',company:'Fixture',state:'discovered',discoveryDisposition:'candidate',assessment:{}},{id:'b',key:'https://example.invalid/b',url:'https://example.invalid/b',title:'Agent IA',company:'Fixture',state:'discovered',discoveryDisposition:'candidate',assessment:{}},{id:'old',url:'https://example.invalid/old',title:'Pharmacy',state:'discovered'}];
 await save(path.join(home,'leads.json'),{version:1,jobs,scans:[]});
 const first=run(workspace,'research','--run','--config','config.json','--limit','1');assert.equal(first.status,0,first.stderr);assert.ok(first.stdout.length<2000);
 const manifest=JSON.parse(await fs.readFile(JSON.parse(first.stdout).manifest));assert.deepEqual(manifest.scanner,{modelFree:true,used:true,concurrency:4});assert.equal(manifest.queueIds,undefined);assert.equal(manifest.deferred,1);assert.equal(manifest.cards[0].id,'a');
 jobs[0].state='rejected';await save(path.join(home,'leads.json'),{version:1,jobs,scans:[]});
 const next=run(workspace,'research','--continue',JSON.parse(first.stdout).manifest,'--config','config.json','--limit','1');assert.equal(next.status,0,next.stderr);
 const second=JSON.parse(await fs.readFile(JSON.parse(next.stdout).manifest));assert.equal(second.cards[0].id,'b');assert.equal(second.nextOffset,null);assert.equal(second.scanner.used,false);
 const exhausted=run(workspace,'research','--continue',JSON.parse(next.stdout).manifest,'--config','config.json');assert.equal(exhausted.status,0,exhausted.stderr);assert.equal(JSON.parse(exhausted.stdout).status,'queue-exhausted');assert.match(JSON.parse(exhausted.stdout).next,/research --tasks/);
});
test('company cache reuses sources across roles, checks freshness/hashes and requires exact sourced review',async()=>{
 const workspace=await temp(),home=path.join(workspace,'个人资料/applications/automation'),url='https://fixture.example/about',text='Fixture develops automation software for teams. '.repeat(8);let requests=0;
 const options={fetchPage:async u=>{requests++;return {status:200,finalUrl:u,body:text};},parsePage:body=>({text:body})};
 const collected=await collectCompany(workspace,home,'Fixture',[url],options);assert.equal(collected.status,'collected');
 let current=await companyRecord(workspace,home,{company:'Fixture'});
 await assert.rejects(reviewCompany(workspace,home,{company:'Fixture'},{sourceHash:current.sha256,facts:[{text:'Unsupported claim',quote:'this quote was fabricated',sourceUrl:url}]}),/exact quote/);
 await reviewCompany(workspace,home,{company:'Fixture'},{sourceHash:current.sha256,facts:[{text:'Develops automation software',quote:'Fixture develops automation software for teams.',sourceUrl:url}],inferences:['This may relate to agent development.']});
 current=await companyRecord(workspace,home,{company:'Fixture',title:'Another role'});assert.equal(current.status,'researched');assert.match(companyDisplay(current),/推断：/);assert.equal((await companyMaterialSources(workspace,home,{company:'Fixture'})).length,1);
 const reused=await collectCompany(workspace,home,'Fixture',[url],options);assert.equal(reused.reused,true);assert.equal(requests,1);
 assert.equal((await companyRecord(workspace,home,{company:'Unrelated'})).status,'not-researched');assert.equal((await companyRecord(workspace,home,{company:'Fixture'},{now:Date.now()+31*86400000})).status,'needs-update');
 await fs.appendFile(path.join(workspace,current.sources[0].path),'tampered');assert.equal((await companyRecord(workspace,home,{company:'Fixture'})).status,'source-invalid');assert.equal((await companyMaterialSources(workspace,home,{company:'Fixture'})).length,0);
 await assert.rejects(collectCompany(workspace,home,'Fixture',['https://jobs.lever.co/fixture'],options),/independent official/);
});
test('blocked company collection is a durable failure, not completed research',async()=>{
 const workspace=await temp(),home=path.join(workspace,'个人资料/applications/automation');
 const result=await collectCompany(workspace,home,'Blocked',['https://blocked.example/about'],{fetchPage:async()=>({status:403}),parsePage:()=>({text:''})});assert.equal(result.status,'collection-failed');assert.equal((await companyRecord(workspace,home,{company:'Blocked'})).status,'collection-failed');
});
test('company CLI performs guarded HTTP collection and repeats without a second network fetch',async()=>{
 const workspace=await temp(),home=path.join(workspace,'个人资料/applications/automation');let requests=0;
 const server=http.createServer((req,res)=>{requests++;res.end(req.url==='/robots.txt'?'User-agent: *\nAllow: /':'<html><p>'+('Fixture creates software products for teams. '.repeat(10))+'</p></html>');});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port+'/about';
 try{
  await save(path.join(workspace,'config.json'),{version:1,portals:[],discovery:{min_interval_ms:0}});await save(path.join(home,'leads.json'),{version:1,jobs:[{id:'fixture',company:'Fixture',url:url+'/job'}],scans:[]});
  const collect=()=>new Promise((resolve,reject)=>{const p=spawn(process.execPath,[cli,'company','--id','fixture','--collect','--url',url,'--config','config.json'],{cwd:workspace,env:{...process.env,USELESS_LINKEDIN_WORKSPACE:workspace,USELESS_LINKEDIN_TEST_LOCAL:'1',PYTHONUTF8:'1'}});let out='',err='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.on('error',reject);p.on('exit',code=>resolve({code,out,err}));});
  const first=await collect();assert.equal(first.code,0,first.err);assert.equal(JSON.parse(first.out).status,'collected');assert.equal(requests,2);const second=await collect();assert.equal(JSON.parse(second.out).reused,true);assert.equal(requests,2);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
test('email receipts reject stale/unrelated/activation/draft messages and accept original confirmation without screenshots',()=>{
 const job={id:'fixture-job',company:'Fixture',title:'Agent Developer',url:'https://fixture.example/jobs/123'},since=new Date(Date.now()-60000).toISOString();
 const message={id:'fixture-message',label_ids:['INBOX'],payload:{headers:[{name:'From',value:'ATS <no-reply@fixture.example>'},{name:'To',value:'Candidate <candidate@example.org>'},{name:'Date',value:new Date().toUTCString()},{name:'Subject',value:'Application received: Agent Developer at Fixture'}],parts:[{mime_type:'text/plain',body:{content:'We received your application for Agent Developer at Fixture.'}}]}};
 const receipt=verifyEmailReceipt(job,{structuredContent:message},{since});assert.equal(receipt.type,'email');assert.equal(receipt.email.messageId,'fixture-message');assert.equal(receipt.screenshot,undefined);assert.match(emailQuery(job,since),/after:/);
 const mutate=fn=>{const copy=structuredClone(message);fn(copy);return copy;};
 const linked=verifyEmailReceipt(job,mutate(m=>m.payload.parts[0].body.content+=' Manage: https://fixture.example/login?token=private-token'),{since});assert.equal(linked.removedLinks,1);assert.doesNotMatch(linked.email.body,/private-token/);
 assert.throws(()=>verifyEmailReceipt(job,mutate(m=>m.label_ids=['SENT']),{since}),/sent or draft/);
 assert.throws(()=>verifyEmailReceipt(job,mutate(m=>{m.payload.parts[0].body.content='Confirm your application for Agent Developer at Fixture';m.payload.headers.find(h=>h.name==='Subject').value='Confirm your application';}),{since}),/requires confirmation/);
 assert.throws(()=>verifyEmailReceipt({...job,company:'Other'},message,{since}),/identify/);
 assert.throws(()=>verifyEmailReceipt(job,mutate(m=>m.payload.headers.find(h=>h.name==='Date').value='2020-01-01'),{since}),/dated original/);
 assert.throws(()=>verifyEmailReceipt(job,mutate(m=>{m.payload.headers.find(h=>h.name==='Subject').value='Agent Developer at Fixture';m.payload.parts[0].body.content="Agent Developer at Fixture : votre candidature n'a pas été envoyée.";}),{since}),/No explicit application receipt/);
});
