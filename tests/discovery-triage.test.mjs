import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
process.env.USELESS_LINKEDIN_WORKSPACE ||= os.tmpdir();
const skill=path.resolve(process.env.USELESS_LINKEDIN_TEST_SKILL||path.join(import.meta.dirname,'..'));
const lib=name=>import(pathToFileURL(path.join(skill,'runtime/tools/lib',name)).href);
const {compactObservations,expandObservations,request,parse}=await lib('core.mjs');
const {relevance}=await lib('discovery-plan.mjs');
const {conditionalFetcher}=await lib('conditional-fetch.mjs');
async function workspace(c={}){const dir=await fs.mkdtemp(path.join(process.env.USELESS_LINKEDIN_TEST_TMP||os.tmpdir(),'ul-triage-'));await fs.writeFile(path.join(dir,'config.json'),JSON.stringify({version:1,queries:['data'],include_keywords:['alternance'],role_keywords:['data'],portals:[],...c,discovery:{web_search:false,respect_robots:false,min_interval_ms:0,retry_base_seconds:0,...c.discovery}}));return dir;}
const data=(dir,name)=>path.join(dir,'个人资料/applications/automation',name);
async function command(dir,tool,...flags){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,[path.join(skill,'runtime/tools',tool+'.mjs'),...flags],{cwd:dir,env:{...process.env,USELESS_LINKEDIN_WORKSPACE:dir,USELESS_LINKEDIN_TEST_LOCAL:'1',PYTHONUTF8:'1'},stdio:['ignore','pipe','pipe']});let out='',err='';child.stdout.on('data',s=>out+=s);child.stderr.on('data',s=>err+=s);child.on('error',reject);child.on('exit',code=>code?reject(Error(err||out)):resolve(JSON.parse(out)));});}
const leads=async dir=>JSON.parse(await fs.readFile(data(dir,'leads.json'),'utf8')).jobs;
const scan=(dir,...flags)=>command(dir,'scan','--config','config.json',...flags);
const triage=(dir,...flags)=>command(dir,'triage','--config','config.json',...flags);
async function server(handler){const app=http.createServer(handler);await new Promise(r=>app.listen(0,'127.0.0.1',r));return {url:`http://127.0.0.1:${app.address().port}`,close:()=>new Promise(r=>app.close(r))};}
const jd='Vous rejoignez notre équipe en alternance pour développer des outils data et analyser les données. '.repeat(6);
const page=(description=jd)=>`<html><title>Engineer</title><h1>Engineer</h1><p>${description}</p><a href="/apply">Postuler</a></html>`;
async function imported(dir,url,title='Engineer'){await fs.writeFile(path.join(dir,'import.json'),JSON.stringify([{url,title}]));await scan(dir,'--import','import.json','--import-only');return (await leads(dir))[0];}

test('default keywords accept software, feminine French roles and VIE; hits report actual words',async()=>{
 const config=parse(await fs.readFile(path.join(skill,'workspace-template/个人资料/portals.yml'),'utf8'),'yaml');
 for(const title of ['Work-study software engineer','Apprentie développeuse web','VIE Data Analyst'])assert.equal(relevance({title},config).matches,true,title);
 assert.deepEqual(relevance({title:'Alternance data'},config).contractHits,['alternance']);
 assert.deepEqual(relevance({title:'Stagiaire data'},config).contractHits,['stagiaire']);
 assert.equal(relevance({title:'Developer internal BIography'},config).matches,false);
 assert.equal(relevance({title:'Alternance data',jd:'A senior mentor will support you.'},config).matches,true);
 assert.equal(relevance({title:'Alternance senior data'},config).matches,false);
});

test('review queue is visible, complete JD promotes it and its capture can be reused',async()=>{
 let calls=0;const app=await server((req,res)=>{calls++;res.end(page());}),dir=await workspace();
 try{const job=await imported(dir,app.url+'/jobs/123');assert.equal(job.discoveryDisposition,'review');assert.equal((await triage(dir,'--list-review')).queue.length,1);
  const report=await triage(dir,'--run','--no-browser');assert.equal(report.results[0].status,'candidate');assert.equal(calls,1);
  const saved=(await leads(dir))[0];assert.equal(saved.discoveryDisposition,'candidate');assert.ok(saved.triage.captureHash);assert.equal(saved.directory,undefined);
  const captured=JSON.parse(await fs.readFile(path.join(dir,saved.triage.captureFile),'utf8'));assert.ok(captured.jd.includes('alternance'));
  await command(dir,'init','--workspace',dir);
  await command(dir,'pipeline','--id',job.id,'--config','config.json','--no-browser');assert.equal(calls,1);
  assert.equal((await leads(dir))[0].state,'awaiting-agent');
  const list=await fs.readFile(data(dir,'list.md'),'utf8');assert.match(list,/搜索分拣/);assert.match(list,/candidate/);assert.equal((await triage(dir)).queue.length,0);
 }finally{await app.close();await fs.rm(dir,{recursive:true,force:true});}
});

test('migration of 3000 leads with 20 distinct observations shrinks the snapshot without losing queries',async()=>{
 const dir=await workspace();try{
  const capturedAt='2026-10-01T00:00:00Z',jobs=Array.from({length:3000},(_,n)=>({id:'fixture-'+n,key:'https://employer.example/jobs/'+n,url:'https://employer.example/jobs/'+n,state:'discovered',createdAt:capturedAt,lastSeenAt:capturedAt,observations:Array.from({length:20},(_,q)=>({source:'Synthetic employer',url:'https://employer.example/jobs/'+n,layer:'HTTP',taskId:'task-'+q,query:'query '+q,location:'France',capturedAt}))}));
  await fs.mkdir(path.dirname(data(dir,'leads.json')),{recursive:true});await fs.writeFile(data(dir,'leads.json'),JSON.stringify({version:1,jobs,scans:[]},null,2));
  const before=(await fs.stat(data(dir,'leads.json'))).size,start=performance.now();await scan(dir,'--import-only');const milliseconds=performance.now()-start,after=(await fs.stat(data(dir,'leads.json'))).size,saved=await leads(dir);
  assert.equal(saved.length,3000);assert.equal(expandObservations(saved[0].observations).length,20);assert.ok(after<before*.8,`${before} -> ${after}`);assert.ok(milliseconds<15000,`${milliseconds} ms`);
  await fs.writeFile(path.join(process.env.USELESS_LINKEDIN_TEST_TMP||os.tmpdir(),'distinct-observation-benchmark.json'),JSON.stringify({jobs:3000,distinctObservations:60000,beforeBytes:before,afterBytes:after,milliseconds},null,2));
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('complete irrelevant JD is retained and excluded without expensive profile processing',async()=>{
 let calls=0;const app=await server((req,res)=>{calls++;res.end(page('Nous recherchons un pharmacien pour notre établissement hospitalier. '.repeat(10)));}),dir=await workspace();
 try{const job=await imported(dir,app.url+'/jobs/123','Interne en pharmacie');
  const output=await command(dir,'pipeline','--id',job.id,'--config','config.json','--no-browser');assert.equal(output.skipped,true);assert.equal(output.triage,'excluded');assert.equal(calls,1);
  assert.equal((await leads(dir)).length,1);assert.equal((await triage(dir)).queue.length,0);await triage(dir,'--run','--no-browser');assert.equal(calls,1);
  assert.equal(await fs.stat(data(dir,'tracker.sqlite')).then(()=>true,()=>false),false);
 }finally{await app.close();await fs.rm(dir,{recursive:true,force:true});}
});

test('incomplete JD remains actionable; transient failures retry when due',async()=>{
 let status=503;const app=await server((req,res)=>{res.statusCode=status;res.end(status===200?page('Short JD'):status===201?page(): 'Temporary outage');}),dir=await workspace();
 try{await imported(dir,app.url+'/jobs/123');assert.equal((await triage(dir,'--run','--no-browser')).results[0].status,'retry-wait');status=200;
  assert.equal((await triage(dir,'--run','--no-browser')).results[0].status,'needs-agent');assert.equal((await triage(dir)).queue.length,1);
 }finally{await app.close();await fs.rm(dir,{recursive:true,force:true});}
});

test('redirects to a generic listing cannot confirm relevance or clear disappearance',async()=>{
 const app=await server((req,res)=>{if(req.url.startsWith('/jobs/')){res.statusCode=302;res.setHeader('Location','/list');res.end();}else res.end(page());}),dir=await workspace();
 try{const job=await imported(dir,app.url+'/jobs/123');const store=JSON.parse(await fs.readFile(data(dir,'leads.json'),'utf8'));store.jobs[0].possiblyClosed=true;await fs.writeFile(data(dir,'leads.json'),JSON.stringify(store));
  assert.equal((await triage(dir,'--run','--no-browser')).results[0].status,'needs-agent');assert.equal((await leads(dir))[0].possiblyClosed,true);
  const result=await command(dir,'pipeline','--id',job.id,'--config','config.json','--no-browser','--include-review');assert.equal(result.skipped,true);
 }finally{await app.close();await fs.rm(dir,{recursive:true,force:true});}
});

test('changed rules reopen automatic exclusions rather than silently retaining the skip',async()=>{
 const app=await server((req,res)=>res.end(page('Apprentissage logiciel : développer des outils informatiques. '.repeat(10)))),dir=await workspace();
 try{await imported(dir,app.url+'/jobs/123');assert.equal((await triage(dir,'--run','--no-browser')).results[0].status,'excluded');
  const config=JSON.parse(await fs.readFile(path.join(dir,'config.json'),'utf8'));config.role_keywords=['logiciel'];await fs.writeFile(path.join(dir,'config.json'),JSON.stringify(config));
  assert.equal((await triage(dir)).queue.length,1);assert.equal((await triage(dir,'--run','--no-browser')).results[0].status,'candidate');
 }finally{await app.close();await fs.rm(dir,{recursive:true,force:true});}
});

test('disappearance is surfaced, live details clear it and 410 confirms expiry without changing submission history',async()=>{
 let show=true,gone=false;const app=await server((req,res)=>{if(req.url==='/list'){res.end(show?'<a href="/jobs/123">Engineer</a>':'<html>No vacancies</html>');return;}if(gone){res.statusCode=410;res.end('Gone');return;}res.end(page());});
 const dir=await workspace({portals:[{name:'Employer',career_url:app.url+'/list',exhaustive_listing:true,web_search:false}],discovery:{refresh_hours:0}});
 try{await scan(dir);show=false;await scan(dir);let job=(await leads(dir))[0];assert.equal(job.possiblyClosed,true);assert.equal((await triage(dir,'--list-closed')).queue.length,1);assert.match(await fs.readFile(data(dir,'list.md'),'utf8'),/possibly_closed/);
  assert.equal((await triage(dir,'--run','--no-browser')).results[0].status,'candidate');assert.equal((await leads(dir))[0].possiblyClosed,false);
  await scan(dir);gone=true;assert.equal((await triage(dir,'--run','--no-browser')).results[0].status,'expired');assert.equal((await leads(dir))[0].state,'expired');
  const store=JSON.parse(await fs.readFile(data(dir,'leads.json'),'utf8'));Object.assign(store.jobs[0],{state:'submitted',submitted:true,submissionEvidence:'Fixture receipt',possiblyClosed:true});await fs.writeFile(data(dir,'leads.json'),JSON.stringify(store));
  await triage(dir,'--run','--no-browser');job=(await leads(dir))[0];assert.equal(job.state,'submitted');assert.equal(job.submitted,true);assert.equal(job.liveness.result,'expired');
 }finally{await app.close();await fs.rm(dir,{recursive:true,force:true});}
});

test('manual batch decisions require full-page evidence and remain available for reopening',async()=>{
 const dir=await workspace();try{const job=await imported(dir,'https://employer.example/jobs/123');const capture={kind:'full-page',url:job.url,jd,bodyText:jd+' Postuler',applyControls:['Postuler'],capturedAt:new Date().toISOString()};await fs.writeFile(path.join(dir,'full.json'),JSON.stringify(capture));
  await fs.writeFile(path.join(dir,'decisions.json'),JSON.stringify([{id:job.id,status:'candidate',evidence:'alternance',captureFile:'full.json'}]));assert.equal((await triage(dir,'--decisions','decisions.json')).results[0].status,'candidate');assert.equal((await leads(dir))[0].triage.method,'manual');
  await fs.writeFile(path.join(dir,'decisions.json'),JSON.stringify([{id:job.id,status:'excluded',evidence:'made up',captureFile:'full.json'}]));await assert.rejects(triage(dir,'--decisions','decisions.json'),/evidence/);
  await fs.writeFile(path.join(dir,'decisions.json'),JSON.stringify([{id:job.id,status:'excluded',evidence:'alternance',captureFile:'full.json'}]));await triage(dir,'--decisions','decisions.json');
  const config=JSON.parse(await fs.readFile(path.join(dir,'config.json'),'utf8'));config.role_keywords=[];config.include_keywords=[];await fs.writeFile(path.join(dir,'config.json'),JSON.stringify(config));await scan(dir,'--import','import.json','--import-only');
  assert.equal((await leads(dir))[0].triage.status,'excluded');assert.equal((await leads(dir))[0].discoveryDisposition,'review');
  await triage(dir,'--id',job.id,'--reopen');assert.equal((await leads(dir))[0].triage,undefined);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('lossless context compaction shrinks 20 distinct queries and remains idempotent',()=>{
 const rows=Array.from({length:20},(_,n)=>({source:'Fixture employer',url:'https://employer.example/jobs/123',layer:'HTTP',taskId:'task-'+n,query:'different query '+n,location:'France',pageUrl:'https://employer.example/careers',capturedAt:'2026-10-01T00:00:00Z'}));
 const compact=compactObservations(rows);assert.equal(compact.length,1);assert.equal(expandObservations(compact).length,20);assert.equal(compact[0].count,20);assert.deepEqual(compactObservations(compact),compact);
 assert.ok(JSON.stringify(compact,null,2).length<JSON.stringify(rows,null,2).length*.8);
 const again=compactObservations([...compact,rows[0]]);assert.equal(again[0].count,21);assert.equal(expandObservations(again).find(o=>o.taskId==='task-0').count,2);
 const otherTask=compactObservations([rows[0],{...rows[0],taskId:'new-task'}]);assert.deepEqual(otherTask[0].taskIds,['task-0','new-task']);
});

test('default conditional scan checks later pages even if the first page returns 304',async()=>{
 const requests=[];let version=1;
 const app=await server((req,res)=>{requests.push({url:req.url,etag:req.headers['if-none-match']});const etag=req.url==='/list'? 'first':String(version);res.setHeader('ETag',etag);if(req.headers['if-none-match']===etag){res.statusCode=304;res.end();return;}res.end(req.url==='/list'?'<a href="/jobs/123">Stage data</a><a rel="next" href="/next">Next</a>':`<a href="/jobs/${version===1?'456':'789'}">Stage data</a>`);});
 const dir=await workspace({portals:[{name:'Employer',career_url:app.url+'/list',web_search:false}],discovery:{refresh_hours:0}});
 try{await scan(dir);version=2;await scan(dir);const jobs=await leads(dir);assert.equal(jobs.length,3);assert.equal(jobs.find(j=>j.url.endsWith('/456')).possiblyClosed,true);assert.equal(jobs.find(j=>j.url.endsWith('/123')).possiblyClosed,false);assert.ok(requests.some(r=>r.url==='/list'&&r.etag==='first'));assert.ok(requests.some(r=>r.url==='/next'&&r.etag==='1'));}
 finally{await app.close();await fs.rm(dir,{recursive:true,force:true});}
});

test('conditional cache honors opt-out, rejects orphan 304 and does not cache POST credentials',async()=>{
 const dir=await workspace();try{
  await assert.rejects(conditionalFetcher(async()=>({status:304}),{directory:dir})('https://employer.example/list'),/304/);
  let options;const fetch=conditionalFetcher(async(url,opts)=>{options=opts;return {status:200,body:'ok',headers:{etag:'one'}};},{directory:dir});
  await fetch('https://employer.example/list',{method:'POST',body:'secret'});assert.equal(options.headers,undefined);
  await fetch('https://employer.example/list',{}, {incremental:{conditional:false}});assert.equal(options.headers,undefined);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('real impit client preserves manual redirect checks, status and headers',async()=>{
 const app=await server((req,res)=>{if(req.url==='/redirect'){res.statusCode=302;res.setHeader('Location','/jobs/123');res.end();return;}res.setHeader('ETag','fixture');res.end(page());});
 const prior=process.env.USELESS_LINKEDIN_TEST_LOCAL;process.env.USELESS_LINKEDIN_TEST_LOCAL='1';
 try{const response=await request(app.url+'/redirect',{httpClient:'impit'});assert.equal(response.status,200);assert.equal(response.finalUrl,app.url+'/jobs/123');assert.equal(response.headers.etag,'fixture');assert.match(response.body,/alternance/);}
 finally{if(prior===undefined)delete process.env.USELESS_LINKEDIN_TEST_LOCAL;else process.env.USELESS_LINKEDIN_TEST_LOCAL=prior;await app.close();}
});

test('triage executes an actual browser-rendered JD without profile or materials',async()=>{
 const app=await server((req,res)=>res.end(`<html><title>Engineer</title><div id="root"></div><script>document.getElementById('root').innerHTML=${JSON.stringify('<p>'+jd+'</p><a href="/apply">Postuler</a>')};</script></html>`)),dir=await workspace();
 try{await imported(dir,app.url+'/jobs/123');const result=await triage(dir,'--run');assert.equal(result.results[0].status,'candidate');const job=(await leads(dir))[0];const captured=JSON.parse(await fs.readFile(path.join(dir,job.triage.captureFile),'utf8'));assert.equal(captured.layer,'Playwright');assert.ok(captured.jd.length>300);assert.equal(job.directory,undefined);}
 finally{await app.close();await fs.rm(dir,{recursive:true,force:true});}
});
