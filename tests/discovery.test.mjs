import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
process.env.USELESS_LINKEDIN_WORKSPACE ||= os.tmpdir();
const testSkill=path.resolve(process.env.USELESS_LINKEDIN_TEST_SKILL||path.join(import.meta.dirname,'..'));
const library=name=>pathToFileURL(path.join(testSkill,'runtime/tools/lib',name)).href;
const {buildDiscoveryPlan,expandQueries,mergeTasks,relevance}=await import(library('discovery-plan.mjs'));
const {searchWttj,searchWttjPage}=await import(library('wttj-search.mjs'));
const {posting,listing}=await import(library('listings.mjs'));
const {normalizeUrl}=await import(library('job-signals.mjs'));
const {readApiPage,inferCareerSource}=await import(library('discovery-sources.mjs'));
const scan=path.join(testSkill,'runtime/tools/scan.mjs');
const baseConfig={version:1,queries:['one','two','three','four','five'],portals:[],discovery:{web_search:false}};
async function workspace(config){
 config={...config,discovery:{respect_robots:false,min_interval_ms:0,...config.discovery}};const dir=await fs.mkdtemp(path.join(process.env.USELESS_LINKEDIN_TEST_TMP||os.tmpdir(),'ul-discovery-'));await fs.writeFile(path.join(dir,'config.json'),JSON.stringify(config));return dir;
}
function run(dir,...flags){return new Promise((resolve,reject)=>{
 const child=spawn(process.execPath,[scan,'--config','config.json',...flags],{cwd:dir,env:{...process.env,USELESS_LINKEDIN_WORKSPACE:dir,USELESS_LINKEDIN_TEST_LOCAL:'1',PYTHONUTF8:'1'},stdio:['ignore','pipe','pipe']});
 let stdout='',stderr='';child.stdout.on('data',data=>stdout+=data);child.stderr.on('data',data=>stderr+=data);child.on('error',reject);child.on('exit',code=>{if(code!==0)reject(Error(stderr||stdout));else resolve(JSON.parse(stdout));});
});}
async function server(handler){const app=http.createServer(handler);await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));return {url:`http://127.0.0.1:${app.address().port}`,close:()=>new Promise(resolve=>app.close(resolve))};}
const dataFile=(dir,name)=>path.join(dir,'个人资料/applications/automation',name);
const leads=async dir=>JSON.parse(await fs.readFile(dataFile(dir,'leads.json'),'utf8')).jobs;

test('all queries, additive matrix and locations enter independent API/listing/web tasks',()=>{
 const c={...baseConfig,locations:['France','Remote'],query_matrix:{contracts:['alternance','apprenticeship'],roles:['AI','automation']},discovery:{web_search:true,company_careers:true},portals:[{name:'Any',api_url:'https://api.example.org/jobs?q={query}',search_url:'https://example.org/jobs?q={query}&l={location}'}]};
 assert.equal(expandQueries(c).length,9);
 const plan=buildDiscoveryPlan(c);
 assert.equal(plan.filter(t=>t.kind==='api').length,9);assert.equal(plan.filter(t=>t.kind==='listing').length,18);
 assert.equal(plan.filter(t=>t.kind==='career-discovery').length,18);
 assert.ok(plan.some(t=>t.kind==='web-search'&&t.portal==='Open Web'&&t.query==='five Remote'));
 assert.ok(!plan.some(t=>t.query.includes('Paris')));
 assert.ok(relevance({title:'Graduate Engineer'},{}).matches);
 assert.equal(relevance({title:'Graduate Engineer'},{include_keywords:['alternance'],role_keywords:['data']}).matches,false);
});

test('config rejects invalid dimensions and explicit empty keyword arrays match broadly',()=>{
 assert.throws(()=>buildDiscoveryPlan({...baseConfig,queries:'bad'}),/string array/);
 assert.throws(()=>buildDiscoveryPlan({...baseConfig,portals:[{name:'x'},{name:'x'}]}),/unique/);
 assert.equal(relevance({title:'Anything'},{include_keywords:[],role_keywords:[]}).matches,true);
});

test('WTTJ consumes all pages and distinguishes provider window from full completion',async()=>{
 const pages=[];
 const fetchText=async()=>JSON.stringify({PUBLIC_ALGOLIA_APPLICATION_ID:'ABCDEF12',PUBLIC_ALGOLIA_API_KEY_CLIENT:'a'.repeat(32)});
 const fetchJson=async(url,options)=>{
  const params=new URLSearchParams(JSON.parse(options.body).params),page=Number(params.get('page'));pages.push(page);
  return {nbPages:4,nbHits:8,hitsPerPage:2,hits:[0,1].map(i=>({name:`Role ${page}-${i}`,slug:`role-${page}-${i}`,organization:{slug:'company',name:'Company'}}))};
 };
 const search=await searchWttj({wttj:{queries:['one'],page_size:2}},{fetchText,fetchJson});
 assert.equal(search.jobs.length,8);assert.equal(search.complete,true);assert.deepEqual(pages,[0,1,2,3]);
 const capped=await searchWttjPage({wttj:{page_size:2}},{fetchText,fetchJson:async()=>({hits:[],nbPages:1,nbHits:100,hitsPerPage:2})});
 assert.equal(capped.complete,false);assert.equal(capped.reason,'provider_search_window');
});

test('arbitrary explicit postings and SPA IDs work without a platform or job_pattern',()=>{
 const first=posting({url:'https://new-employer.example/opportunity?id=10',title:'Graduate Engineer',isJob:true},{name:'New'},'https://new-employer.example/careers');assert.ok(first);
 assert.equal(posting({url:'https://new-employer.example/careers',title:'About us'},{name:'New'},'https://new-employer.example/careers'),null);
 assert.notEqual(normalizeUrl('https://employer.example/#/job/one'),normalizeUrl('https://employer.example/#/job/two'));
 assert.equal(posting({url:'https://site.example/recruteurs_lba/123',title:'Recruiter',isJob:true},{name:'x'},'https://site.example'),null);
 assert.equal(inferCareerSource('https://jobs.eu.lever.co/acme/123').region,'eu');
 assert.equal(inferCareerSource('https://job-boards.greenhouse.io/acme/jobs/123').board_token,'acme');
});

test('HTML follows actual next links and accepts employer JSON-LD with unconventional URLs',async()=>{
 const body='<a href="/list?page=2" rel="next" aria-label="Next page">Next</a><script type="application/ld+json">'+JSON.stringify({'@type':'JobPosting',title:'Graduate Engineer',url:'https://employer.example/opportunity?id=1',hiringOrganization:{name:'Acme'}})+'</script>';
 const result=await listing('https://employer.example/list',{portal:{name:'Employer'},fetchPage:async()=>({status:200,finalUrl:'https://employer.example/list',body})});
 assert.equal(result.jobs.length,1);assert.deepEqual(result.nextUrls,['https://employer.example/list?page=2']);
});

test('imports retain more than 40 jobs, missing keyword hits, unknown sites and provenance',async()=>{
 const dir=await workspace({...baseConfig,max_results_per_portal:2,include_keywords:['alternance'],role_keywords:['data']});
 try{
  const rows=Array.from({length:105},(_,i)=>({url:`https://any-employer.example/opportunity?id=${i}`,title:`Graduate Engineer ${i}`,portal:'Unknown Employer'}));
  rows.push({url:'https://site.example/recruteurs_lba/123',title:'Recruiter',kind:'predicted-recruiter'});
  await fs.writeFile(path.join(dir,'import.json'),JSON.stringify(rows));const result=await run(dir,'--import','import.json','--import-only');
  assert.equal(result.added.length,105);assert.equal(result.rejected.length,1);assert.ok(result.warnings.length);
  const jobs=await leads(dir);assert.equal(jobs.length,105);assert.ok(jobs.every(j=>j.discoveryDisposition==='review'&&j.observations.length===1));
  await run(dir,'--import','import.json','--import-only');assert.equal((await leads(dir)).length,105);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('request budget persists every query and resumes without query starvation or result caps',async()=>{
 let host;const requests=[];
 const app=await server((req,res)=>{const u=new URL(req.url,host);requests.push(u.searchParams.get('q'));res.end(`<a href="${host}/job/id-${u.searchParams.get('q')}">Role ${u.searchParams.get('q')}</a>`);});host=app.url;
 const dir=await workspace({...baseConfig,discovery:{web_search:false,max_requests_per_run:1},portals:[{name:'Any',search_url:host+'/list?q={query}',exhaustive_listing:true,web_search:false}]});
 try{
  for(let i=0;i<5;i++){const result=await run(dir,...(i?['--resume']:[]));assert.equal(result.requests,1);assert.equal(result.coverage.completed,i+1);}
  assert.deepEqual(requests,['one','two','three','four','five']);assert.equal((await leads(dir)).length,5);
 }finally{await app.close();await fs.rm(dir,{recursive:true,force:true});}
});

test('generic JSON pagination resumes from a saved cursor and HTML still executes after API success',async()=>{
 let host;const offsets=[];let lists=0;
 const app=await server((req,res)=>{const u=new URL(req.url,host);if(u.pathname==='/api'){
  const offset=Number(u.searchParams.get('offset')||0);offsets.push(offset);
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:{total:4,items:[0,1].map(i=>({name:`API ${offset+i}`,links:{detail:host+`/opportunity?id=${offset+i}`}}))}}));
 }else{lists++;res.end(`<a href="${host}/job/extra-123">HTML extra</a>`);}});host=app.url;
 const source={name:'Employer',api_url:host+'/api',api:{rows_path:'data.items',fields:{url:'links.detail',title:'name'},pagination:{mode:'offset',param:'offset',total_path:'data.total'}},career_url:host+'/careers',exhaustive_listing:true,web_search:false};
 const dir=await workspace({...baseConfig,queries:['one'],discovery:{web_search:false,max_requests_per_run:1},portals:[source]});
 try{
  const first=await run(dir);assert.equal(first.coverage.pending,2);assert.equal((await leads(dir)).length,2);
  const second=await run(dir,'--resume');assert.equal(second.coverage.completed,1);assert.equal(lists,1);
  const third=await run(dir,'--resume');assert.equal(third.complete,true);assert.deepEqual(offsets,[0,2]);assert.equal((await leads(dir)).length,5);
 }finally{await app.close();await fs.rm(dir,{recursive:true,force:true});}
});

test('an inaccessible or empty listing stays pending; a fresh IAB end capture completes it',async()=>{
 const app=await server((req,res)=>{res.statusCode=403;res.end('Access denied');});
 const dir=await workspace({...baseConfig,queries:['one'],portals:[{name:'Blocked',career_url:app.url+'/careers',web_search:false}]});
 try{
  const blocked=await run(dir);assert.equal(blocked.complete,false);assert.equal(blocked.searchRequests[0].status,'blocked');assert.match(blocked.searchRequests[0].reason,/403/);
  await fs.writeFile(path.join(dir,'capture.json'),JSON.stringify({kind:'listing',url:app.url+'/careers',capturedAt:new Date().toISOString(),bodyText:'Graduate Engineer',links:[{url:app.url+'/opportunity?id=1',title:'Graduate Engineer',isJob:true}],paginationComplete:true,completionEvidence:'Observed the full list; no next page or load-more control.'}));
  const replay=await run(dir,'--listing-capture','capture.json');assert.equal(replay.requests,0);assert.equal(replay.added.length,1);assert.equal(replay.complete,true);
 }finally{await app.close();await fs.rm(dir,{recursive:true,force:true});}
});

test('sources can be registered and web task outcomes preserve independent incomplete tasks',async()=>{
 const dir=await workspace({...baseConfig,queries:['four'],locations:['France'],discovery:{web_search:true,company_careers:true}});
 try{
  await fs.writeFile(path.join(dir,'sources.json'),JSON.stringify([{name:'New Career',career_url:'https://employer.example/careers'}]));
  const first=await run(dir,'--sources','sources.json','--import-only');assert.ok(first.searchRequests.some(t=>t.portal==='New Career'));
  const task=first.searchRequests.find(t=>t.portal==='Open Web');
  await fs.writeFile(path.join(dir,'results.json'),JSON.stringify([{id:task.id,status:'completed',capturedAt:new Date().toISOString(),evidence:'Observed all configured search pages for this query.'}]));
  const second=await run(dir,'--task-results','results.json','--import-only');assert.equal(second.coverage.completed,1);assert.equal(second.complete,false);
  const saved=JSON.parse(await fs.readFile(dataFile(dir,'discovered-sources.json'),'utf8'));assert.equal(saved[0].name,'New Career');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('Greenhouse prospect posts are excluded; Lever pages continue past short provider batches',async()=>{
 const task={url:'https://boards-api.greenhouse.io/v1/boards/acme/jobs'};
 const green=await readApiPage({name:'Acme',provider:'greenhouse'},task,{fetchPage:async()=>({status:200,body:JSON.stringify({jobs:[{internal_job_id:null,title:'Talent Pool'},{internal_job_id:1,title:'Graduate',absolute_url:'https://acme.example/job/1'}]})})});
 assert.equal(green.jobs.length,1);assert.equal(green.complete,true);
 const lever=await readApiPage({name:'Acme',provider:'lever'},{url:'https://api.lever.co/v0/postings/acme?mode=json'},{fetchPage:async()=>({status:200,body:JSON.stringify([{text:'Role',hostedUrl:'https://jobs.lever.co/acme/1'}])})});
 assert.equal(lever.complete,false);assert.equal(lever.nextCursor.offset,1);
});

test('resume preserves partial tasks and refresh resets completed snapshots only after expiry',()=>{
 const plan=buildDiscoveryPlan({...baseConfig,portals:[{name:'Any',career_url:'https://any.example/careers',web_search:false}]}),old=plan.map(t=>({...t,status:'completed',completed:true,finishedAt:new Date(0).toISOString(),cursor:{page:3}}));
 assert.equal(mergeTasks(plan,old,{resume:true})[0].completed,true);
 assert.equal(mergeTasks(plan,old,{refreshHours:24})[0].completed,false);
 const pending={...old[0],completed:false,status:'partial'};assert.equal(mergeTasks(plan,[pending])[0].cursor.page,3);
});

test('changed source filters retire old tasks instead of reusing stale cursors',()=>{
 const source={name:'WTTJ',provider:'wttj',wttj:{filters:'country:FR'}};
 const before=buildDiscoveryPlan({...baseConfig,portals:[source]}).map(t=>({...t,status:'partial',cursor:{page:7}}));
 const plan=buildDiscoveryPlan({...baseConfig,portals:[{...source,wttj:{filters:'country:BE'}}]});
 const merged=mergeTasks(plan,before,{resume:true});
 assert.ok(merged.filter(t=>!t.retired).every(t=>!t.cursor));assert.ok(merged.filter(t=>t.retired).length);
});

test('exact URL duplicates enrich provenance without replacing assessed/submitted facts',async()=>{
 const dir=await workspace(baseConfig);
 try{
  const first={url:'https://employer.example/job/1?utm_source=first',title:'Original Engineer',company:'Original',portal:'Source A'};
  await fs.writeFile(path.join(dir,'import.json'),JSON.stringify([first]));await run(dir,'--import','import.json','--import-only');
  const file=dataFile(dir,'leads.json'),store=JSON.parse(await fs.readFile(file,'utf8'));store.jobs[0].state='submitted';store.jobs[0].submitted=true;await fs.writeFile(file,JSON.stringify(store));
  await fs.writeFile(path.join(dir,'import.json'),JSON.stringify([{...first,url:'https://employer.example/job/1?utm_source=second',title:'New title',company:'New',portal:'Source B',location:'Paris'}]));
  const report=await run(dir,'--import','import.json','--import-only'),saved=(await leads(dir))[0];
  assert.equal(report.duplicates.length,1);assert.equal(saved.state,'submitted');assert.equal(saved.title,'Original Engineer');assert.equal(saved.company,'Original');assert.equal(saved.location,'Paris');assert.equal(saved.observations.length,2);assert.deepEqual(saved.sources,['Source A','Source B']);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('unplanned arbitrary IAB pagination survives the next run as a registered source',async()=>{
 const dir=await workspace(baseConfig);
 try{
  const capture={kind:'listing',url:'https://new-employer.example/careers',portal:'New',capturedAt:new Date().toISOString(),bodyText:'Graduate Engineer',links:[{url:'/opportunity?id=1',title:'Graduate Engineer',isJob:true}],nextUrls:['?page=2']};
  await fs.writeFile(path.join(dir,'capture.json'),JSON.stringify(capture));const first=await run(dir,'--listing-capture','capture.json');
  assert.equal(first.added.length,1);const task=first.searchRequests.find(t=>t.kind==='listing');assert.ok(task.cursor.urls[0].endsWith('?page=2'));
  const plan=await run(dir,'--plan','--resume');assert.equal(plan.tasks.find(t=>t.id===task.id).cursor.urls[0],task.cursor.urls[0]);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('repeated API pages stop with an explicit incomplete task',async()=>{
 let host;const app=await server((req,res)=>res.end(JSON.stringify({jobs:[{url:host+'/job/same',title:'Same role'}]})));host=app.url;
 const dir=await workspace({...baseConfig,portals:[{name:'Repeated',api_url:host+'/api',api:{pagination:{mode:'page'}},web_search:false}]});
 try{
  const report=await run(dir);assert.equal(report.requests,2);assert.equal(report.complete,false);assert.equal(report.added.length,1);assert.ok(report.searchRequests.some(t=>t.reason==='repeated_page'));
 }finally{await app.close();await fs.rm(dir,{recursive:true,force:true});}
});

test('API auth is refused on cross-origin pagination and stripped on HTTP redirects',async()=>{
 const name='UL_DISCOVERY_TEST_TOKEN';process.env[name]='controlled-fixture-token';
 try{
  await assert.rejects(()=>readApiPage({name:'API',api_token_env:name},{url:'https://api.example.org/jobs',cursor:{url:'https://other.example.org/next'}},{fetchPage:async()=>{throw Error('must not fetch');}}),/changed API origin/);
  let received='';const destination=await server((req,res)=>{received=req.headers.authorization||'';res.end('ok');});
  const origin=await server((req,res)=>{res.writeHead(302,{Location:destination.url+'/next'});res.end();});
  const beforeLocal=process.env.USELESS_LINKEDIN_TEST_LOCAL;process.env.USELESS_LINKEDIN_TEST_LOCAL='1';
  try{const {request}=await import(library('core.mjs'));await request(origin.url,{headers:{Authorization:'Bearer controlled-fixture-token'}});assert.equal(received,'');}
  finally{if(beforeLocal===undefined)delete process.env.USELESS_LINKEDIN_TEST_LOCAL;else process.env.USELESS_LINKEDIN_TEST_LOCAL=beforeLocal;await origin.close();await destination.close();}
 }finally{delete process.env[name];}
});

test('HTTP next-page cursor persists at the page budget and resumes to observed static end',async()=>{
 let host;const visited=[];
 const app=await server((req,res)=>{const page=Number(new URL(req.url,host).searchParams.get('page')||1);visited.push(page);res.end(`<a href="${host}/job/${page}">Engineer ${page}</a>`+(page===1?'<a href="?page=2" rel="next">Next page</a>':''));});host=app.url;
 const dir=await workspace({...baseConfig,queries:['one'],discovery:{web_search:false,max_pages_per_task:1},portals:[{name:'Paged HTML',career_url:host+'/careers',exhaustive_listing:true,web_search:false}]});
 try{
  const first=await run(dir);assert.equal(first.complete,false);assert.equal(first.searchRequests[0].reason,'configured_page_budget');assert.ok(first.searchRequests[0].cursor.urls[0].endsWith('?page=2'));
  const second=await run(dir,'--resume');assert.equal(second.complete,true);assert.deepEqual(visited,[1,2]);assert.equal((await leads(dir)).length,2);
 }finally{await app.close();await fs.rm(dir,{recursive:true,force:true});}
});

test('scan recovers a dead process lock but does not overwrite a running scanner',async()=>{
 const dir=await workspace(baseConfig),lock=dataFile(dir,'.scan.lock');
 try{
  await fs.mkdir(path.dirname(lock),{recursive:true});await fs.writeFile(lock,JSON.stringify({pid:2147483647}));
  const report=await run(dir,'--import-only');assert.equal(report.complete,true);assert.equal(await fs.stat(lock).then(()=>true,()=>false),false);
  await fs.writeFile(lock,JSON.stringify({pid:process.pid}));await assert.rejects(()=>run(dir,'--import-only'),/already running/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
