import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
process.env.USELESS_LINKEDIN_WORKSPACE ||= os.tmpdir();
process.env.USELESS_LINKEDIN_TEST_LOCAL='1';
const skill=path.resolve(process.env.USELESS_LINKEDIN_TEST_SKILL||path.join(import.meta.dirname,'..'));
const lib=name=>import(pathToFileURL(path.join(skill,'runtime/tools/lib',name)).href);
const {request,parse,add}=await lib('core.mjs');
const {buildDiscoveryPlan,relevance}=await lib('discovery-plan.mjs');
const {readApiPage}=await lib('discovery-sources.mjs');
const {needsTriage,triageRulesHash}=await lib('discovery-triage.mjs');
const {failureDisposition}=await lib('discovery-policy.mjs');
const {lbaPosting}=await lib('official-job-apis.mjs');
async function server(handler){const app=http.createServer(handler);await new Promise(r=>app.listen(0,'127.0.0.1',r));return {url:`http://127.0.0.1:${app.address().port}`,close:()=>new Promise(r=>app.close(r))};}
const reply=(res,body,status=200,headers={})=>{res.writeHead(status,{'content-type':'application/json',...headers});res.end(JSON.stringify(body));};
const ftRow=n=>({id:String(n),intitule:'Alternance JavaScript '+n,description:'Développer des logiciels en alternance.',dateCreation:`2026-09-${String(30-n).padStart(2,'0')}T12:00:00Z`,dateActualisation:'2026-10-01T12:00:00Z',entreprise:{nom:'Synthetic company '+n},lieuTravail:{libelle:'France'},alternance:true});
const lbaRow=n=>({identifier:{id:String(n).padStart(24,'0'),partner_job_id:'fixture-'+n,partner_label:'offres_emploi_lba'},workplace:{name:'Synthetic employer '+n,location:{address:'France'}},apply:{url:'https://example.org/apply'},contract:{type:['Apprentissage']},offer:{title:'Développeur TypeScript '+n,description:'Une offre synthétique.',status:'Active',publication:{creation:'2026-10-01T12:00:00Z'}}});
function ftSource(url,extra={}){return {name:'FT fixture',provider:'france-travail',api_url:url+'/search',api_token_env:'SYNTHETIC_FT_TOKEN',listing_mode:'disabled',web_search:false,queries:['alternance data'],api:{page_size:2,range_limit:6,params:{sort:1},...extra}};}
async function workspace(portals,extra={}){const dir=await fs.mkdtemp(path.join(process.env.USELESS_LINKEDIN_TEST_TMP||os.tmpdir(),'ul-official-'));await fs.writeFile(path.join(dir,'config.json'),JSON.stringify({version:1,queries:['alternance data'],locations:['France'],include_keywords:['alternance'],role_keywords:['data','javascript','typescript'],portals,discovery:{web_search:false,respect_robots:false,min_interval_ms:0,max_requests_per_run:0,max_pages_per_task:0,refresh_hours:0,retry_base_seconds:0,...extra}}));return dir;}
const data=(dir,name)=>path.join(dir,'个人资料/applications/automation',name);
const json=async file=>JSON.parse(await fs.readFile(file,'utf8'));
async function command(dir,tool,flags=[],env={}){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,[path.join(skill,'runtime/tools',tool+'.mjs'),'--config','config.json',...flags],{cwd:dir,env:{...process.env,USELESS_LINKEDIN_WORKSPACE:dir,USELESS_LINKEDIN_TEST_LOCAL:'1',PYTHONUTF8:'1',SYNTHETIC_FT_TOKEN:'synthetic-access',SYNTHETIC_LBA_TOKEN:'synthetic-access',...env},stdio:['ignore','pipe','pipe']});let out='',err='';child.stdout.on('data',s=>out+=s);child.stderr.on('data',s=>err+=s);child.on('error',reject);child.on('exit',code=>code?reject(Error(err||out)):resolve(JSON.parse(out)));});}

test('defaults use native HTTP, expanded skills, sorted incremental FT and complete LBA export',async()=>{
 const config=parse(await fs.readFile(path.join(skill,'workspace-template/个人资料/portals.yml'),'utf8'),'yaml');
 for(const portal of config.portals)assert.notEqual(portal.http_client,'impit',portal.name);
 for(const title of ['Alternant JavaScript','Alternance TypeScript','Apprentie React','Stage Node.js'])assert.equal(relevance({title},config).matches,true,title);
 const ft=config.portals.find(p=>p.provider==='france-travail');assert.equal(ft.api.params.sort,1);assert.equal(ft.incremental.newest_first,true);assert.equal(ft.incremental.stop_on_unchanged,true);
 const lba=config.portals.find(p=>p.provider==='la-bonne-alternance');assert.equal(lba.api.mode,'export');
 const plan=buildDiscoveryPlan(config);assert.equal(plan.filter(t=>t.kind==='api'&&t.provider==='la-bonne-alternance').length,1);assert.ok(plan.find(t=>t.provider==='la-bonne-alternance').url.endsWith('/export'));
 assert.equal(config.discovery.triage_refresh_hours,0);
});

test('automatic exclusions persist after 168 hours but changed rules and disappearance reopen them',()=>{
 const c={include_keywords:['alternance'],role_keywords:['data']},job={state:'discovered',discoveryDisposition:'review',triage:{status:'excluded',method:'rules',checkedAt:'2020-01-01T00:00:00Z',rulesHash:triageRulesHash(c,{})}};
 assert.equal(needsTriage(job,c),false);assert.equal(needsTriage(job,{...c,role_keywords:['javascript']}),true);assert.equal(needsTriage({...job,possiblyClosed:true},c),true);
 assert.equal(needsTriage(job,{...c,exclude_scope:'full-jd'}),true);
 assert.equal(needsTriage(job,{...c,discovery:{triage_refresh_hours:168}}),true);
});

test('changed listing content reopens automatic triage while repeated observations and manual exclusions persist',()=>{
 const store={jobs:[]},posting={url:'https://example.org/jobs/123',title:'Engineer',discoveryOnly:true,discoveryDisposition:'review',discoveryContentHash:'old'};
 add(store,posting);store.jobs[0].triage={status:'excluded',method:'rules'};add(store,posting);assert.equal(store.jobs[0].triage.status,'excluded');
 add(store,{...posting,description:'Now contains a data role',discoveryContentHash:'new'});assert.equal(store.jobs[0].triage,undefined);assert.match(store.jobs[0].description,/data/);
 store.jobs[0].triage={status:'excluded',method:'manual'};add(store,{...posting,discoveryContentHash:'next'});assert.equal(store.jobs[0].triage.method,'manual');
});

test('indexed company duplicates preserve matching semantics and enrichments',()=>{
 const store={jobs:[]};add(store,{url:'https://example.org/jobs/1',title:'Data',company:'Fixture',location:'France'});add(store,{url:'https://example.org/jobs/2',title:'Data',company:'Fixture',location:'France'});assert.deepEqual(store.jobs[1].possibleDuplicates,[store.jobs[0].id]);
 add(store,{url:'https://example.org/jobs/3',title:'Other'});add(store,{url:'https://example.org/jobs/3',title:'Other',company:'Enriched',location:'France'});add(store,{url:'https://example.org/jobs/4',title:'Other',company:'Enriched',location:'France'});assert.deepEqual(store.jobs[3].possibleDuplicates,[store.jobs[2].id]);
});

test('FT OAuth performs real form authentication, renews a 401 once and never saves tokens',async()=>{
 let tokens=0,searches=0,form;const app=await server(async(req,res)=>{
  if(req.url==='/token'){let body='';for await(const chunk of req)body+=chunk;form=new URLSearchParams(body);tokens++;return reply(res,{access_token:'synthetic-'+tokens,expires_in:3600});}
  searches++;if(searches===1)return reply(res,{},401);assert.equal(req.headers.authorization,'Bearer synthetic-2');reply(res,{resultats:[ftRow(1)]},200,{'content-range':'offres 0-0/1'});
 }),source=ftSource(app.url);delete source.api_token_env;source.oauth={token_url:app.url+'/token',client_id_env:'FIXTURE_FT_CLIENT_ID',client_secret_env:'FIXTURE_FT_CLIENT_SECRET'};
 const dir=await workspace([source]);
 try{const report=await command(dir,'scan',[],{FIXTURE_FT_CLIENT_ID:'synthetic-client',FIXTURE_FT_CLIENT_SECRET:'synthetic-secret',FRANCE_TRAVAIL_TOKEN:''});assert.equal(report.added.length,1);assert.equal(tokens,2);assert.equal(form.get('scope'),'o2dsoffre api_offresdemploiv2');assert.equal(form.get('grant_type'),'client_credentials');assert.equal(form.get('client_secret'),'synthetic-secret');
  const persisted=await fs.readFile(data(dir,'search-queue.json'),'utf8')+await fs.readFile(data(dir,'last-scan.json'),'utf8');assert.doesNotMatch(persisted,/synthetic-secret|synthetic-2/);
 }finally{await app.close();await fs.rm(dir,{recursive:true,force:true});}
});

test('credential-bearing redirects cannot forward OAuth bodies or bearer tokens to another origin',async()=>{
 let leaked=0;const other=await server((req,res)=>{leaked++;res.end('{}');}),app=await server((req,res)=>{res.writeHead(307,{location:other.url+'/leak'});res.end();});
 try{await assert.rejects(request(app.url+'/token',{method:'POST',body:'client_secret=synthetic-secret',credentialBody:true}),/changed origin/);await assert.rejects(request(app.url+'/search',{headers:{authorization:'Bearer synthetic'},credentialHeaders:true}),/changed origin/);assert.equal(leaked,0);}finally{await app.close();await other.close();}
});

test('missing official credentials make zero requests and adding them automatically resumes the task',async()=>{
 let calls=0;const app=await server((req,res)=>{calls++;reply(res,{resultats:[ftRow(1)]},200,{'content-range':'offres 0-0/1'});}),source=ftSource(app.url),dir=await workspace([source]);
 source.oauth={client_id_env:'ABSENT_FIXTURE_ID',client_secret_env:'ABSENT_FIXTURE_SECRET'};await fs.writeFile(path.join(dir,'config.json'),JSON.stringify({version:1,queries:['data'],portals:[source],discovery:{web_search:false,respect_robots:false,min_interval_ms:0}}));
 try{const absent=await command(dir,'scan',[],{SYNTHETIC_FT_TOKEN:''});assert.equal(calls,0);assert.equal(absent.searchRequests.find(t=>t.kind==='api').failureClass,'credentials-missing');const resumed=await command(dir,'scan',['--resume']);assert.equal(calls,1);assert.equal(resumed.added.length,1);}finally{await app.close();await fs.rm(dir,{recursive:true,force:true});}
});

test('FT traverses beyond its range window with inclusive date overlap and durable pagination',async()=>{
 const rows=Array.from({length:11},(_,n)=>ftRow(n+1)),seen=[];const app=await server((req,res)=>{const u=new URL(req.url,'http://fixture');const [start,end]=u.searchParams.get('range').split('-').map(Number),eligible=rows.filter(r=>r.dateCreation<=u.searchParams.get('maxCreationDate')),batch=eligible.slice(start,end+1);seen.push({start,max:u.searchParams.get('maxCreationDate')});reply(res,{resultats:batch},start+batch.length>=eligible.length?200:206,{'content-range':`offres ${start}-${start+batch.length-1}/${eligible.length}`});}),dir=await workspace([ftSource(app.url)]);
 try{const first=await command(dir,'scan',['--max-pages','2']);assert.equal(first.complete,false);assert.equal((await json(data(dir,'search-queue.json'))).find(t=>t.kind==='api').cursor.offset,4);const completed=await command(dir,'scan',['--resume']);assert.equal(completed.complete,true);const jobs=(await json(data(dir,'leads.json'))).jobs;assert.equal(jobs.length,11);assert.ok(new Set(seen.map(p=>p.max)).size>1);assert.ok(seen.every(p=>p.start<6));assert.equal(jobs[0].updatedAt,'2026-10-01T12:00:00Z');assert.ok(jobs.every(j=>j.requisitionId));}finally{await app.close();await fs.rm(dir,{recursive:true,force:true});}
});

test('FT cannot silently complete when one timestamp saturates the range window',async()=>{
 const rows=Array.from({length:10},(_,n)=>({...ftRow(n+1),dateCreation:'2026-09-01T12:00:00Z'}));const app=await server((req,res)=>{const [start,end]=new URL(req.url,'http://fixture').searchParams.get('range').split('-').map(Number);const batch=rows.slice(start,end+1);reply(res,{resultats:batch},206,{'content-range':`offres ${start}-${end}/10`});}),dir=await workspace([ftSource(app.url)]);
 try{const out=await command(dir,'scan');assert.equal(out.complete,false);assert.equal(out.searchRequests.find(t=>t.kind==='api').reason,'timestamp_partition_unresolved');assert.equal((await json(data(dir,'leads.json'))).jobs.length,6);}finally{await app.close();await fs.rm(dir,{recursive:true,force:true});}
});

test('FT date partition keeps fractional-second boundary postings rather than truncating them',async()=>{
 const dates=['2026-09-03T12:00:00.900Z','2026-09-03T12:00:00.800Z','2026-09-02T12:00:00.900Z','2026-09-02T12:00:00.100Z','2026-09-01T12:00:00.000Z'],rows=dates.map((date,n)=>({...ftRow(n+1),dateCreation:date}));
 const app=await server((req,res)=>{const u=new URL(req.url,'http://fixture'),[start,end]=u.searchParams.get('range').split('-').map(Number),eligible=rows.filter(r=>Date.parse(r.dateCreation)<=Date.parse(u.searchParams.get('maxCreationDate'))),batch=eligible.slice(start,end+1);reply(res,{resultats:batch},start+batch.length>=eligible.length?200:206,{'content-range':`offres ${start}-${start+batch.length-1}/${eligible.length}`});}),dir=await workspace([ftSource(app.url,{range_limit:3})]);
 try{const result=await command(dir,'scan');assert.equal(result.complete,true);assert.equal((await json(data(dir,'leads.json'))).jobs.length,5);}finally{await app.close();await fs.rm(dir,{recursive:true,force:true});}
});

test('FT missing or inconsistent pagination metadata stays actionable',async()=>{
 process.env.SYNTHETIC_FT_TOKEN='synthetic-access';let headers={},status=206;const app=await server((req,res)=>reply(res,{resultats:[ftRow(1),ftRow(2)]},status,headers));
 try{const source=ftSource(app.url),task=buildDiscoveryPlan({version:1,portals:[source],discovery:{web_search:false}})[0];const missing=await readApiPage(source,task,{fetchPage:request});assert.equal(missing.complete,false);assert.equal(missing.reason,'pagination_metadata_missing');headers={'content-range':'offres 1-2/10'};assert.equal((await readApiPage(source,task,{fetchPage:request})).reason,'inconsistent_pagination_metadata');status=200;headers={'content-range':'offres */10'};assert.equal((await readApiPage(source,task,{fetchPage:request})).complete,false);}finally{await app.close();delete process.env.SYNTHETIC_FT_TOKEN;}
});

test('FT sorted incremental scan stops at an unchanged page, changed descriptions invalidate it, full refresh observes absence',async()=>{
 let rows=Array.from({length:4},(_,n)=>ftRow(n+1)),calls=0;const app=await server((req,res)=>{calls++;const [start,end]=new URL(req.url,'http://fixture').searchParams.get('range').split('-').map(Number),batch=rows.slice(start,end+1);reply(res,{resultats:batch},start+batch.length>=rows.length?200:206,{'content-range':`offres ${start}-${start+batch.length-1}/${rows.length}`});}),source=ftSource(app.url);source.incremental={conditional:false,newest_first:true,stop_on_unchanged:true,full_refresh_hours:168};const dir=await workspace([source]);
 try{await command(dir,'scan');assert.equal(calls,2);const unchanged=await command(dir,'scan');assert.equal(calls,3);assert.equal(unchanged.complete,true);assert.equal((await json(data(dir,'search-queue.json'))).find(t=>t.kind==='api').incrementalStopped,true);
  rows[0]={...rows[0],description:'Changed JD content'};await command(dir,'scan');assert.equal(calls,5);
  const queue=await json(data(dir,'search-queue.json'));queue.find(t=>t.kind==='api').lastFullScanAt='2020-01-01T00:00:00Z';await fs.writeFile(data(dir,'search-queue.json'),JSON.stringify(queue));rows=rows.slice(0,3);await command(dir,'scan');assert.equal((await json(data(dir,'leads.json'))).jobs.find(j=>j.requisitionId==='4').possiblyClosed,true);
 }finally{await app.close();await fs.rm(dir,{recursive:true,force:true});}
});

test('LBA search excludes predicted recruiters and never claims capped groups exhaustive',async()=>{
 process.env.SYNTHETIC_LBA_TOKEN='synthetic-access';const app=await server((req,res)=>reply(res,{jobs:[lbaRow(1),{...lbaRow(2),identifier:{partner_label:'recruteurs_lba'}},{...lbaRow(3),offer:{...lbaRow(3).offer,status:'Filled'}}],recruiters:[{name:'Predicted employer'}],warnings:[]}));
 try{const source={name:'LBA fixture',provider:'la-bonne-alternance',api_url:app.url+'/search',api_token_env:'SYNTHETIC_LBA_TOKEN',listing_mode:'disabled',web_search:false};const task=buildDiscoveryPlan({version:1,queries:['one','two'],locations:['France','Paris'],portals:[source],discovery:{web_search:false}});assert.equal(task.length,1);const page=await readApiPage(source,task[0],{fetchPage:request});assert.equal(page.jobs.length,1);assert.match(page.jobs[0].url,/itemId=/);assert.equal(page.complete,false);assert.equal(page.reason,'provider_search_window_unverified');}finally{await app.close();delete process.env.SYNTHETIC_LBA_TOKEN;}
});

test('LBA 419 respects Retry-After as a transient retry',async()=>{
 process.env.SYNTHETIC_LBA_TOKEN='synthetic-access';const app=await server((req,res)=>reply(res,{},419,{'retry-after':'90'}));
 try{const source={provider:'la-bonne-alternance',api_token_env:'SYNTHETIC_LBA_TOKEN'};await assert.rejects(readApiPage(source,{url:app.url+'/search'},{fetchPage:request}),error=>{const result=failureDisposition(error,{now:0,baseSeconds:1});assert.equal(result.status,'retry-wait');assert.equal(result.nextRetryAt,'1970-01-01T00:01:30.000Z');return true;});}finally{await app.close();delete process.env.SYNTHETIC_LBA_TOKEN;}
});

test('complete LBA export streams more than 450 jobs, resumes byte cursors and reuses unchanged feeds',async()=>{
 let version=1,downloads=0,metadataCalls=0;const rows=Array.from({length:501},(_,n)=>lbaRow(n+1));const app=await server((req,res)=>{
  if(req.url.startsWith('/export')){metadataCalls++;return reply(res,{url:app.url+'/feed?signature=synthetic-signed-url',lastUpdate:`2026-10-0${version}T03:00:00Z`});}
  downloads++;assert.equal(req.headers.authorization,undefined);reply(res,{jobs:version===1?rows:rows.slice(0,-1),recruiters:[{name:'Predicted employer'}]});
 }),source={name:'LBA export fixture',provider:'la-bonne-alternance',api_url:app.url+'/export',api_token_env:'SYNTHETIC_LBA_TOKEN',listing_mode:'disabled',web_search:false,api:{mode:'export',page_size:200,export_allowed_hosts:['127.0.0.1']},incremental:{conditional:false}},dir=await workspace([source]);
 try{const first=await command(dir,'scan',['--max-pages','1']);assert.equal(first.complete,false);assert.equal(first.added.length,200);assert.ok((await json(data(dir,'search-queue.json'))).find(t=>t.kind==='api').cursor.byteOffset>0);const final=await command(dir,'scan',['--resume']);assert.equal(final.complete,true);assert.equal((await json(data(dir,'leads.json'))).jobs.length,501);assert.equal(downloads,1);await command(dir,'scan');assert.equal(downloads,1);assert.equal(metadataCalls,2);assert.ok((await json(data(dir,'leads.json'))).jobs.every(j=>!j.possiblyClosed));
  const state=await fs.readFile(data(dir,'search-queue.json'),'utf8')+await fs.readFile(data(dir,'last-scan.json'),'utf8');assert.doesNotMatch(state,/synthetic-signed-url|synthetic-access/);
  version=2;await command(dir,'scan');assert.equal(downloads,2);assert.equal((await json(data(dir,'leads.json'))).jobs.filter(j=>j.possiblyClosed).length,1);
 }finally{await app.close();await fs.rm(dir,{recursive:true,force:true});}
});

test('malformed complete exports stay incomplete and remove partial spool files',async()=>{
 const app=await server((req,res)=>{if(req.url==='/export')reply(res,{url:app.url+'/feed',lastUpdate:'2026-10-01T03:00:00Z'});else res.end('{"recruiters":[]}');}),source={name:'LBA malformed',provider:'la-bonne-alternance',api_url:app.url+'/export',api_token_env:'SYNTHETIC_LBA_TOKEN',listing_mode:'disabled',web_search:false,api:{mode:'export',export_allowed_hosts:['127.0.0.1']},incremental:{conditional:false}},dir=await workspace([source]);
 try{const out=await command(dir,'scan');assert.equal(out.complete,false);assert.equal(out.added.length,0);const files=await fs.readdir(data(dir,'official-feeds'));assert.equal(files.some(f=>f.endsWith('.tmp')||f.endsWith('.ndjson')),false);}finally{await app.close();await fs.rm(dir,{recursive:true,force:true});}
});

test('official export streams a feed larger than the ordinary 8 MB response limit',async()=>{
 const rows=Array.from({length:30},(_,n)=>({...lbaRow(n+1),offer:{...lbaRow(n+1).offer,description:'Data engineering en apprentissage. '.repeat(10000)}}));let bytes=0;
 const app=await server((req,res)=>{if(req.url==='/export')return reply(res,{url:app.url+'/feed',lastUpdate:'2026-10-01T03:00:00Z'});res.setHeader('content-type','application/json');res.write('{"jobs":[');rows.forEach((row,n)=>{const serialized=JSON.stringify(row);bytes+=Buffer.byteLength(serialized);res.write((n?',':'')+serialized);});res.end(']}');}),source={name:'LBA large fixture',provider:'la-bonne-alternance',api_url:app.url+'/export',api_token_env:'SYNTHETIC_LBA_TOKEN',listing_mode:'disabled',web_search:false,api:{mode:'export',page_size:7,export_allowed_hosts:['127.0.0.1']},incremental:{conditional:false}},dir=await workspace([source]);
 try{const output=await command(dir,'scan');assert.equal(output.complete,true);assert.ok(bytes>8e6);assert.equal((await json(data(dir,'leads.json'))).jobs.length,30);}finally{await app.close();await fs.rm(dir,{recursive:true,force:true});}
});

test('missing export snapshots are downloaded again, byte budgets remain incomplete',async()=>{
 let downloads=0;const app=await server((req,res)=>{if(req.url==='/export')return reply(res,{url:app.url+'/feed',lastUpdate:'2026-10-01T03:00:00Z'});downloads++;reply(res,{jobs:[lbaRow(1)]});}),source={name:'LBA snapshot fixture',provider:'la-bonne-alternance',api_url:app.url+'/export',api_token_env:'SYNTHETIC_LBA_TOKEN',listing_mode:'disabled',web_search:false,api:{mode:'export',export_allowed_hosts:['127.0.0.1']},incremental:{conditional:false}},dir=await workspace([source]);
 try{await command(dir,'scan');const feeds=data(dir,'official-feeds');for(const name of await fs.readdir(feeds))if(name.endsWith('.ndjson'))await fs.unlink(path.join(feeds,name));await command(dir,'scan');assert.equal(downloads,2);
  source.api.max_export_bytes=100;const limited=await workspace([source]);try{const output=await command(limited,'scan');assert.equal(output.complete,false);assert.equal(output.added.length,0);}finally{await fs.rm(limited,{recursive:true,force:true});}
 }finally{await app.close();await fs.rm(dir,{recursive:true,force:true});}
});

test('optional AnySearch executes every query but keeps snippets and training/listing pages out of leads',async()=>{
 const queries=[];let app;app=await server(async(req,res)=>{if(req.url!=='/search'){res.end('<h1>Training and job search guide</h1>');return;}let text='';for await(const chunk of req)text+=chunk;const body=JSON.parse(text);queries.push(body.query);assert.equal(body.max_results,10);reply(res,{code:0,data:{results:[{url:app.url+'/jobs/123',title:'Alternance data',snippet:'Possible job'},{url:app.url+'/training',title:'Training'},{url:'file:///private',title:'Bad URL'}]}});});const dir=await workspace([{name:'Web fixture',search_domain:'127.0.0.1',queries:['one','two','three','four'],listing_mode:'disabled'}],{web_backend:'anysearch',anysearch:{api_url:app.url+'/search'}});
 try{const result=await command(dir,'scan',['--zero-token']);assert.equal(queries.length,4);assert.equal(result.added.length,0);assert.equal(result.complete,false);const tasks=await json(data(dir,'search-queue.json'));assert.equal(tasks.length,4);assert.ok(tasks.every(t=>t.searchSuggestions.length===2&&t.providerWindow===10&&t.reason==='search_results_unverified'));}finally{await app.close();await fs.rm(dir,{recursive:true,force:true});}
});

test('AnySearch HTTP success with a failing business code never claims completed coverage',async()=>{
 const app=await server((req,res)=>reply(res,{code:-1,message:'Capabilities temporarily unavailable'})),dir=await workspace([{name:'Web fixture',search_domain:'employer.example',listing_mode:'disabled'}],{web_backend:'anysearch',anysearch:{api_url:app.url+'/search'}});
 try{const result=await command(dir,'scan');assert.equal(result.added.length,0);assert.equal(result.complete,false);assert.equal(result.searchRequests[0].status,'needs-agent');assert.match(result.searchRequests[0].reason,/non-success/);}finally{await app.close();await fs.rm(dir,{recursive:true,force:true});}
});

test('LBA partner identities retain observed links and FT partner jobs share canonical FT URLs',()=>{
 const observed='https://employer.example/jobs/abc-123',partner={...lbaRow(1),identifier:{id:'partner-id',partner_label:'Partner fixture',partner_job_id:'abc-123'},apply:{url:observed}};
 assert.equal(lbaPosting(partner).url,observed);assert.equal(lbaPosting({...partner,apply:{url:'https://employer.example/apply'}}).url,'');
 assert.equal(lbaPosting({...partner,identifier:{id:null,partner_label:'France Travail',partner_job_id:'1234567'}}).url,'https://candidat.francetravail.fr/offres/recherche/detail/1234567');
});

test('large JSON API boards collect every result while configurable byte budgets fail explicitly',async()=>{
 const description='Synthetic public description. '.repeat(20000),jobs=Array.from({length:20},(_,n)=>({id:String(n),title:'Data engineer '+n,jobUrl:'https://employer.example/jobs/'+n,descriptionPlain:description}));
 const app=await server((req,res)=>reply(res,{jobs}));
 try{const source={provider:'ashby',site:'fixture',api_url:app.url+'/jobs'},task={url:app.url+'/jobs'};const page=await readApiPage(source,task,{fetchPage:request});assert.equal(page.jobs.length,20);assert.equal(page.complete,true);await assert.rejects(readApiPage({...source,api:{max_response_bytes:100}},task,{fetchPage:request}),/configured byte budget/);}finally{await app.close();}
});
