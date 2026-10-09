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
const {listing,posting}=await lib('listings.mjs'),{normalizeUrl,classifyLiveness}=await lib('job-signals.mjs');
const {inferCareerSource,readApiPage}=await lib('discovery-sources.mjs'),{relevance,buildDiscoveryPlan}=await lib('discovery-plan.mjs');
const {failureDisposition,robotsPolicy,createDiscoveryFetcher}=await lib('discovery-policy.mjs');
const {add,compactObservations}=await lib('core.mjs');
const {acquireFileLock}=await lib('file-lock.mjs');
async function workspace(config={}){
 const dir=await fs.mkdtemp(path.join(process.env.USELESS_LINKEDIN_TEST_TMP||os.tmpdir(),'ul-recovery-'));
 await fs.writeFile(path.join(dir,'config.json'),JSON.stringify({version:1,queries:['stage data'],portals:[],...config,discovery:{web_search:false,respect_robots:false,min_interval_ms:0,retry_base_seconds:0,...config.discovery}}));return dir;
}
const data=(dir,name)=>path.join(dir,'个人资料/applications/automation',name);
async function command(dir,tool,flags=[]){return new Promise((resolve,reject)=>{
 const child=spawn(process.execPath,[path.join(skill,'runtime/tools',tool+'.mjs'),...flags],{cwd:dir,env:{...process.env,USELESS_LINKEDIN_WORKSPACE:dir,USELESS_LINKEDIN_TEST_LOCAL:'1',PYTHONUTF8:'1'},stdio:['ignore','pipe','pipe']});
 let out='',err='';child.stdout.on('data',s=>out+=s);child.stderr.on('data',s=>err+=s);child.on('error',reject);child.on('exit',code=>code?reject(Error(err||out)):resolve(JSON.parse(out)));
});}
const run=(dir,...flags)=>command(dir,'scan',['--config','config.json',...flags]);
const leads=async dir=>JSON.parse(await fs.readFile(data(dir,'leads.json'),'utf8')).jobs;
async function server(handler){const app=http.createServer(handler);await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));return {url:`http://127.0.0.1:${app.address().port}`,close:()=>new Promise(resolve=>app.close(resolve))};}

test('503 API and HTML recover on resume; legacy needs-agent transient errors also recover',async()=>{
 let healthy=false,host,calls=0;
 const app=await server((req,res)=>{calls++;if(!healthy){res.statusCode=503;res.end('Temporary outage');return;}if(req.url.startsWith('/api'))res.end(JSON.stringify({jobs:[{url:host+'/job/1',title:'Stage data'}]}));else res.end('<a href="/job/2">Stage data engineer</a>');});host=app.url;
 const dir=await workspace({portals:[{name:'API',api_url:host+'/api',api:{exhaustive:true},web_search:false},{name:'HTML',career_url:host+'/careers',exhaustive_listing:true,web_search:false}]});
 try{
  const first=await run(dir);assert.equal(first.requests,2);assert.ok(first.searchRequests.every(t=>t.status==='retry-wait'&&t.failureClass==='transient'));
  const file=data(dir,'search-queue.json'),queue=JSON.parse(await fs.readFile(file,'utf8'));queue[0].status='needs-agent';delete queue[0].nextRetryAt;await fs.writeFile(file,JSON.stringify(queue));
  healthy=true;const second=await run(dir,'--resume');assert.equal(second.requests,2);assert.equal(second.complete,true);assert.equal(calls,4);assert.equal((await leads(dir)).length,2);
 }finally{await app.close();await fs.rm(dir,{recursive:true,force:true});}
});

test('429 honors Retry-After across runs and does not spin or lose its cursor',async()=>{
 let status=429;
 const app=await server((req,res)=>{res.statusCode=status;res.setHeader('Retry-After','60');res.end(status===200?'<a href="/job/1">Stage data</a>':'Rate limited');});
 const dir=await workspace({portals:[{name:'Rate limited',career_url:app.url+'/list',web_search:false,exhaustive_listing:true}]});
 try{
  const first=await run(dir);assert.equal(first.requests,1);assert.ok(Date.parse(first.searchRequests[0].nextRetryAt)>Date.now()+50000);
  status=200;assert.equal((await run(dir,'--resume')).requests,0);
  const file=data(dir,'search-queue.json'),queue=JSON.parse(await fs.readFile(file,'utf8'));queue[0].nextRetryAt=new Date(0).toISOString();await fs.writeFile(file,JSON.stringify(queue));
  assert.equal((await run(dir,'--resume')).complete,true);
 }finally{await app.close();await fs.rm(dir,{recursive:true,force:true});}
});

test('network connection refusal retains its real transient failure',async()=>{
 const app=await server((req,res)=>res.end('unused')),url=app.url;await app.close();
 const dir=await workspace({portals:[{name:'Offline',career_url:url+'/list',web_search:false}]});
 try{const report=await run(dir);assert.equal(report.requests,1);assert.equal(report.searchRequests[0].status,'retry-wait');assert.match(report.searchRequests[0].reason,/fetch failed|refused/i);}finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('same-origin defaults reject advertisements even with matching job_pattern; explicit hosts work',async()=>{
 const body='<a href="https://evil.example.org/jobs/999">Stage data</a><a href="/jobs/123">Stage data engineer</a><a href="/jobs/123">Voir l’offre</a>';
 const result=await listing('https://employer.example/careers',{portal:{name:'Employer',job_pattern:'/jobs/'},fetchPage:async()=>({status:200,body})});
 assert.equal(result.jobs.length,1);assert.equal(result.jobs[0].title,'Stage data engineer');
 assert.equal(posting({url:'https://trusted.example/jobs/123',title:'Stage data'},{allowed_hosts:['trusted.example']},'https://employer.example').url,'https://trusted.example/jobs/123');
});

test('unconfigured classification routes and CTA-only anchors do not create vacancies',async()=>{
 const body=['remote','teams','engineering','categories','search'].map(s=>`<a href="/jobs/${s}">${s}</a>`).join('')+'<a href="/jobs/123">Postuler</a><a href="/jobs/456">Stage software engineer</a>';
 const result=await listing('https://employer.example/list',{fetchPage:async()=>({status:200,body})});assert.equal(result.jobs.length,1);assert.ok(result.jobs[0].url.endsWith('/456'));
});

test('keyword boundaries prevent intern/BI false positives and recognize contract aliases',()=>{
 const config={include_keywords:['intern','alternance','VIE'],role_keywords:['BI','developer','data'],exclude_keywords:['senior']};
 assert.equal(relevance({title:'Mobilité internationale'},config).matches,false);
 assert.equal(relevance({title:'Developer, internal tools'},config).matches,false);
 for(const title of ['Stagiaire data','VIE developer','Work-study data','Internship BI'])assert.equal(relevance({title},config).matches,true,title);
 assert.equal(relevance({title:'Stage data senior'},config).matches,false);
});

test('canonical identities cover language, LinkedIn IDs, and Greenhouse host aliases',()=>{
 const pairs=[['https://www.welcometothejungle.com/en/companies/acme/jobs/data-1','https://www.welcometothejungle.com/fr/companies/acme/jobs/data-1'],['https://www.linkedin.com/jobs/view/123456','https://fr.linkedin.com/jobs/view/stage-data-123456?trk=feed'],['https://boards.greenhouse.io/acme/jobs/123','https://job-boards.greenhouse.io/acme/jobs/123'],['https://employer.example/jobs/123?lang=fr','https://employer.example/jobs/123?lang=en']];
 for(const [a,b] of pairs)assert.equal(normalizeUrl(a),normalizeUrl(b));
 assert.notEqual(normalizeUrl('https://employer.example/jobs?id=1'),normalizeUrl('https://employer.example/jobs?id=2'));
});

test('verified employer aliases merge but title similarity alone cannot merge different vacancies',()=>{
 const identityEvidence={url:'https://acme.example/careers/123',capturedAt:new Date().toISOString(),evidence:'Observed the original employer page linking to this exact board posting.'};
 const store={jobs:[]},first=add(store,{url:'https://board.example/jobs/123',title:'Stage data',company:'Acme',verifiedIdentity:'verified:acme:123',identityEvidence});
 add(store,{url:'https://acme.example/careers/123',title:'Stage data',company:'Acme',verifiedIdentity:'verified:acme:123',identityEvidence,employerOriginal:true});
 assert.equal(store.jobs.length,1);assert.equal(store.jobs[0].id,first.id);assert.equal(store.jobs[0].url,'https://acme.example/careers/123');assert.equal(store.jobs[0].urlAliases.length,2);
 add(store,{url:'https://board.example/jobs/456',title:'Stage data',company:'Acme'});assert.equal(store.jobs.length,2);
});

test('30 daily observations compact to one counter; aggregation also migrates existing dated rows',()=>{
 const rows=Array.from({length:30},(_,day)=>({taskId:'task',source:'Acme',query:'stage data',layer:'HTTP',url:'https://acme.example/jobs/1',capturedAt:new Date(day*86400000).toISOString()}));
 const result=compactObservations(rows);assert.equal(result.length,1);assert.equal(result[0].count,30);assert.equal(result[0].firstSeenAt,rows[0].capturedAt);assert.equal(result[0].lastSeenAt,rows.at(-1).capturedAt);
 const store={jobs:[]};for(const row of rows)add(store,{url:row.url,title:'Stage data',observations:[row]});assert.equal(store.jobs[0].observations.length,1);assert.equal(store.jobs[0].observations[0].count,30);
});

test('legacy empty transaction locks expire; live PID locks are never stolen',async()=>{
 const dir=await workspace(),file=path.join(dir,'.lock');
 try{
  await fs.writeFile(file,'');await fs.utimes(file,new Date(0),new Date(0));const lock=await acquireFileLock(file);await lock.close();
  await fs.writeFile(file,JSON.stringify({pid:process.pid}));await assert.rejects(()=>acquireFileLock(file),/already running/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('HTML next-chain terminal is complete; dynamic shells and standalone first pages are not',async()=>{
 let host;
 const app=await server((req,res)=>res.end(`<a href="/job/${req.url.includes('page=2')?2:1}">Stage data</a>`+(req.url.includes('page=2')?'':'<a rel="next" href="?page=2">Next</a>')));host=app.url;
 const dir=await workspace({portals:[{name:'Next chain',career_url:host+'/list',web_search:false}]});
 try{const report=await run(dir);assert.equal(report.requests,2);assert.equal(report.complete,true);}finally{await app.close();await fs.rm(dir,{recursive:true,force:true});}
 const {listingNext}=await lib('discovery-sources.mjs');
 assert.equal(listingNext({}, {cursor:{followedNext:true}}, {jobs:[{}],dynamic:true}).complete,false);
 assert.equal(listingNext({}, {}, {jobs:[{}],dynamic:false}).complete,false);
});

test('ATS detection includes embedded Greenhouse, Ashby, SmartRecruiters, Workable, Workday',async()=>{
 assert.equal(inferCareerSource('https://boards.greenhouse.io/embed/job_app?for=acme').board_token,'acme');assert.equal(inferCareerSource('https://boards.greenhouse.io/embed/job_app'),null);
 const cases=[['https://jobs.ashbyhq.com/acme/123','ashby'],['https://jobs.smartrecruiters.com/acme/123','smartrecruiters'],['https://apply.workable.com/acme/j/123','workable'],['https://acme.wd5.myworkdayjobs.com/en-US/Careers/job/123','workday']];
 for(const [url,provider] of cases)assert.equal(inferCareerSource(url).provider,provider);
 const result=await listing('https://acme.example/careers',{fetchPage:async()=>({status:200,body:'<iframe src="https://boards.greenhouse.io/embed/job_board?for=acme"></iframe><script src="https://boards.greenhouse.io/embed/job_board/js?for=acme"></script>'})});
 assert.ok(result.careerSources.every(s=>s.board_token==='acme'));assert.equal(result.careerSources.length,2);
 const plan=buildDiscoveryPlan({version:1,portals:[{name:'GH',provider:'greenhouse',board_token:'acme',include_description:true}]});assert.ok(plan.some(t=>t.url.endsWith('?content=true')));
 const ashby=await readApiPage({name:'Ashby',provider:'ashby'}, {url:'https://api.ashbyhq.com/posting-api/job-board/acme'},{fetchPage:async()=>({status:200,body:JSON.stringify({jobs:[{title:'Stage data',jobUrl:'https://jobs.ashbyhq.com/acme/1',isListed:true},{title:'Hidden',isListed:false}]})})});assert.equal(ashby.jobs.length,1);assert.equal(ashby.complete,true);
});

test('robots longest path and agent rules, crawl-delay pacing, and 429 classification are executable',async()=>{
 const body='User-agent: *\nDisallow: /private\nAllow: /private/jobs\nCrawl-delay: 2\n';
 assert.equal(robotsPolicy(body,'https://acme.example/private').allowed,false);assert.equal(robotsPolicy(body,'https://acme.example/private/jobs/1').allowed,true);
 let now=0,requests=0;
 const fetcher=createDiscoveryFetcher({request:async url=>({status:200,body:url.endsWith('robots.txt')?body:'ok'}),beforeRequest:()=>requests++,now:()=>now,sleep:async ms=>{now+=ms;},minIntervalMs:500});
 await fetcher('https://acme.example/private/jobs/1');await assert.rejects(()=>fetcher('https://acme.example/private/jobs/2'),/host_crawl_delay/);assert.equal(requests,2);
 await assert.rejects(()=>fetcher('https://acme.example/private'),/robots_disallowed/);
 const gate=failureDisposition(Object.assign(Error('HTTP 403'),{status:403}));assert.equal(gate.status,'blocked');
 assert.equal(failureDisposition(Object.assign(Error('Timeout'),{name:'TimeoutError'})).status,'retry-wait');
});

test('unresolved review triage skips expensive history and candidate profile processing',async()=>{
 const app=await server((req,res)=>{res.statusCode=403;res.end('Access denied');});
 const dir=await workspace({include_keywords:['alternance'],role_keywords:['data']});
 try{
  await fs.writeFile(path.join(dir,'import.json'),JSON.stringify([{url:app.url+'/jobs/123',title:'Interne en pharmacie'}]));await run(dir,'--import','import.json','--import-only');
  const job=(await leads(dir))[0],result=await command(dir,'pipeline',['--id',job.id,'--config','config.json']);assert.equal(result.skipped,true);assert.equal(result.triage,'blocked');
  assert.equal(await fs.stat(data(dir,'tracker.sqlite')).then(()=>true,()=>false),false);assert.equal((await leads(dir))[0].directory,undefined);
 }finally{await app.close();await fs.rm(dir,{recursive:true,force:true});}
});

test('API priority is explicit and duplicate locations create no duplicate tasks',()=>{
 const plan=buildDiscoveryPlan({version:1,queries:['one','two','three','four'],locations:['France',' France '],discovery:{web_search:true,web_queries:['broad roles'],company_careers:true},portals:[{name:'Acme',provider:'greenhouse',board_token:'acme',career_url:'https://job-boards.greenhouse.io/acme',listing_mode:'fallback',web_search:'fallback'}]});
 assert.equal(plan.filter(t=>t.kind==='listing').length,1);assert.equal(plan.find(t=>t.kind==='listing').status,'standby');assert.equal(plan.filter(t=>t.portal==='Open Web').length,1);
 assert.ok(plan.find(t=>t.kind==='api').priority<plan.find(t=>t.kind==='listing').priority);
});

test('incremental ordered scans stop at an unchanged page; full censuses flag missing jobs without expiring',async()=>{
 let generation=0,host;const visits=[];
 const app=await server((req,res)=>{const page=Number(new URL(req.url,host).searchParams.get('page')||1);visits.push(page);const rows=page===1?[{url:host+'/job/1',title:'Stage data'}]:generation===2?[]:[{url:host+'/job/2',title:'Stage data'}];res.end(JSON.stringify({jobs:rows,next:page===1?host+'/api?page=2':null}));});host=app.url;
 const dir=await workspace({discovery:{refresh_hours:0},portals:[{name:'Ordered',api_url:host+'/api?page=1',api:{pagination:{next_path:'next'}},incremental:{newest_first:true,stop_on_unchanged:true,full_refresh_hours:168},web_search:false}]});
 try{
  await run(dir);assert.deepEqual(visits,[1,2]);generation=1;const next=await run(dir);assert.equal(next.requests,1);assert.equal(next.complete,true);assert.deepEqual(visits,[1,2,1]);
  const file=data(dir,'search-queue.json'),queue=JSON.parse(await fs.readFile(file,'utf8'));queue[0].lastFullScanAt=new Date(0).toISOString();await fs.writeFile(file,JSON.stringify(queue));generation=2;
  await run(dir);const missing=(await leads(dir)).find(j=>j.url.endsWith('/2'));assert.equal(missing.possiblyClosed,true);assert.equal(missing.state,'discovered');assert.equal(missing.absenceSignals.length,1);
 }finally{await app.close();await fs.rm(dir,{recursive:true,force:true});}
});

test('SQLite page journal recovers a crash checkpoint exactly once while preserving submitted records',async()=>{
 const dir=await workspace();
 try{
  const code=`import {stageDiscovery} from ${JSON.stringify(pathToFileURL(path.join(skill,'runtime/tools/lib/discovery-journal.mjs')).href)};await stageDiscovery(${JSON.stringify(data(dir,''))},[{url:'https://example.org/jobs/1',title:'Stage data',observations:[{source:'Acme',query:'stage data',layer:'API',url:'https://example.org/jobs/1',capturedAt:'2026-01-01T00:00:00Z'}]}]);`;
  await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['--input-type=module','-e',code],{stdio:'pipe'});let err='';child.stderr.on('data',s=>err+=s);child.on('exit',n=>n?reject(Error(err)):resolve());});
  const first=await run(dir,'--import-only');assert.equal(first.added.length,1);assert.equal((await leads(dir))[0].observations[0].count,1);
  await run(dir,'--import-only');assert.equal((await leads(dir))[0].observations[0].count,1);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('rendered-listing adapter extracts JavaScript-created jobs in an isolated real browser',async()=>{
 const {renderListing}=await lib('rendered-listing.mjs');let host;
 const app=await server((req,res)=>res.end('<html><body><div id="root"></div><script>setTimeout(()=>document.querySelector("#root").innerHTML=\'<a href="/jobs/123">Stage data engineer</a>\',50)</script></body></html>'));host=app.url;
 const before=process.env.USELESS_LINKEDIN_TEST_LOCAL;process.env.USELESS_LINKEDIN_TEST_LOCAL='1';
 try{const result=await listing(host,{portal:{name:'SPA',renderer:'auto',browser_settle_ms:200},fetchPage:async()=>({status:200,body:'<div id="root"></div>',finalUrl:host}),renderPage:renderListing});assert.equal(result.rendered,true);assert.equal(result.jobs.length,1);assert.equal(result.jobs[0].title,'Stage data engineer');}
 finally{await app.close();if(before===undefined)delete process.env.USELESS_LINKEDIN_TEST_LOCAL;else process.env.USELESS_LINKEDIN_TEST_LOCAL=before;}
});

test('3000 existing jobs with 60000 dated observations compact and recollect without daily growth',async t=>{
 const dir=await workspace(),at='2026-01-01T00:00:00Z';
 try{
  const jobs=Array.from({length:3000},(_,i)=>{const url=`https://employer.example/jobs/${i}`;return {id:`fixture-${i}`,key:normalizeUrl(url),url,title:`Stage data ${i}`,state:'discovered',createdAt:at,lastSeenAt:at,observations:Array.from({length:20},(_,n)=>({source:'Acme',layer:'Import',query:'',url,capturedAt:new Date(n*86400000).toISOString()}))};});
  await fs.mkdir(path.dirname(data(dir,'leads.json')),{recursive:true});const before=JSON.stringify({version:1,jobs,scans:[]});await fs.writeFile(data(dir,'leads.json'),before);
  await fs.writeFile(path.join(dir,'import.json'),JSON.stringify(jobs.map(({url,title})=>({url,title,portal:'Acme'}))));
  const started=performance.now(),report=await run(dir,'--import','import.json','--import-only'),elapsed=performance.now()-started;
  assert.equal(report.duplicates.length,3000);const saved=await leads(dir);assert.equal(saved.length,3000);assert.ok(saved.every(j=>j.observations.length===1&&j.observations[0].count===21));
  const after=(await fs.stat(data(dir,'leads.json'))).size;t.diagnostic(`Synthetic 3000-job recollection: ${elapsed.toFixed(0)} ms; dated observations 60000 -> ${saved.reduce((n,j)=>n+j.observations.length,0)}; JSON ${Buffer.byteLength(before)} -> ${after} bytes (including scan report).`);
  const repeat=await run(dir,'--import','import.json','--import-only');assert.equal(repeat.added.length,0);assert.ok((await leads(dir)).every(j=>j.observations.length===1&&j.observations[0].count===22));
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('closed vacancy phrases extend to German, Spanish, Italian and Chinese',()=>{
 for(const bodyText of ['Diese Stelle ist nicht mehr verfügbar','La oferta ya no está disponible','Questa posizione non è più disponibile','该职位已关闭'])assert.equal(classifyLiveness({status:200,bodyText}).result,'expired');
});

test('robots is enforced by the CLI without fetching a disallowed listing',async()=>{
 const paths=[];const app=await server((req,res)=>{paths.push(req.url);res.end(req.url==='/robots.txt'?'User-agent: *\nDisallow: /private\n':'<a href="/job/1">Stage data</a>');});
 const dir=await workspace({discovery:{respect_robots:true},portals:[{name:'Private',career_url:app.url+'/private',web_search:false}]});
 try{const report=await run(dir);assert.equal(report.searchRequests[0].status,'blocked');assert.equal(report.searchRequests[0].reason,'robots_disallowed');assert.deepEqual(paths,['/robots.txt']);assert.equal(report.requests,1);}finally{await app.close();await fs.rm(dir,{recursive:true,force:true});}
});

test('a real scan spends its initial request on API and activates only explicitly requested fallback',async()=>{
 let host;const visits=[];const app=await server((req,res)=>{visits.push(req.url);if(req.url==='/api'){res.statusCode=403;res.end('Blocked');}else res.end('<a href="/job/1">Stage data</a>');});host=app.url;
 const dir=await workspace({discovery:{max_requests_per_run:1},portals:[{name:'Employer',api_url:host+'/api',api:{exhaustive:true},career_url:host+'/list',listing_mode:'fallback',exhaustive_listing:true,web_search:false}]});
 try{const first=await run(dir);assert.deepEqual(visits,['/api']);assert.ok(first.searchRequests.some(t=>t.kind==='listing'&&t.status==='partial'));await run(dir,'--resume');assert.deepEqual(visits,['/api','/list']);assert.equal((await leads(dir)).length,1);}finally{await app.close();await fs.rm(dir,{recursive:true,force:true});}
});

test('HTTP errors respect retry policy even when Playwright is explicitly selected',async()=>{
 let renders=0;const result=await listing('https://acme.example/list',{portal:{renderer:'playwright'},fetchPage:async()=>({status:429,headers:{'retry-after':'60'},body:'Rate limit'}),renderPage:async()=>{renders++;throw Error('must not render a rate-limited page');}});
 assert.equal(result.status,429);assert.equal(result.headers['retry-after'],'60');assert.equal(renders,0);
});

test('invalid API rows preserve valid jobs, remain incomplete, and can be explicitly retried after repair',async()=>{
 let host,repaired=false;const app=await server((req,res)=>res.end(JSON.stringify({jobs:[{url:host+'/jobs/123',title:'Stage data'},...(repaired?[]:[{title:'Missing URL'},null])]})));host=app.url;
 const dir=await workspace({portals:[{name:'Partial API',api_url:host+'/api',api:{exhaustive:true},web_search:false}]});
 try{
  const first=await run(dir);assert.equal(first.added.length,1);assert.equal(first.rejected.length,2);assert.equal(first.complete,false);assert.ok(first.searchRequests.some(t=>t.reason==='unusable_posting_records'));
  repaired=true;const second=await run(dir,'--resume','--retry-agent');assert.ok(!second.searchRequests.some(t=>t.kind==='api'));assert.equal(second.complete,true);assert.equal((await leads(dir)).length,1);
 }finally{await app.close();await fs.rm(dir,{recursive:true,force:true});}
});

test('invalid identity evidence is rejected before journaling and cannot poison later transactions',async()=>{
 const dir=await workspace();
 try{
  await fs.writeFile(path.join(dir,'import.json'),JSON.stringify([{url:'https://example.org/jobs/1',title:'Stage data',verifiedIdentity:'unproved'},{url:'https://example.org/jobs/2',title:'Stage data'}]));
  const first=await run(dir,'--import','import.json','--import-only');assert.equal(first.added.length,1);assert.equal(first.rejected.length,1);
  assert.equal((await run(dir,'--import-only')).complete,true);assert.equal((await leads(dir)).length,1);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('broad web fallback stays standby until one of its source queries actually requires it',async()=>{
 let healthy=true;const app=await server((req,res)=>{if(!healthy&&req.url.includes('stage')){res.statusCode=403;res.end('Access gate');}else res.end(JSON.stringify({jobs:[]}));});
 const dir=await workspace({queries:['alternance développeur','stage data'],discovery:{refresh_hours:0,web_queries:['(alternance OR stage) (développeur OR data)']},portals:[{name:'Source',api_url:app.url+'/api?q={query}',api:{exhaustive:true},search_domain:'employer.example',web_search:'fallback'}]});
 try{assert.equal((await run(dir)).complete,true);healthy=false;const second=await run(dir);assert.ok(second.searchRequests.some(t=>t.kind==='web-search'&&t.status==='needs-agent'&&t.reason==='automatic_search_backend_not_configured'));}finally{await app.close();await fs.rm(dir,{recursive:true,force:true});}
});
