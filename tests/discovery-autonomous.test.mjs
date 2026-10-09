import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import tls from 'node:tls';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
process.env.USELESS_LINKEDIN_WORKSPACE ||= os.tmpdir();
process.env.USELESS_LINKEDIN_TEST_LOCAL='1';
const skill=path.resolve(process.env.USELESS_LINKEDIN_TEST_SKILL||path.join(import.meta.dirname,'..'));
const lib=name=>import(pathToFileURL(path.join(skill,'runtime/tools/lib',name)).href);
const {searchPage,verifySearchResult}=await lib('web-discovery.mjs');
const {request,parse}=await lib('core.mjs');
const {alertLinks}=await lib('alert-links.mjs');
const {sourceHealth}=await lib('discovery-health.mjs');
const {buildDiscoveryPlan}=await lib('discovery-plan.mjs');
const {renderListing}=await lib('rendered-listing.mjs');
const {observedJobApi}=await lib('observed-job-api.mjs');
const json=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const state=(dir,file)=>path.join(dir,'个人资料/applications/automation',file);
async function server(handler){const app=http.createServer(handler);await new Promise(r=>app.listen(0,'127.0.0.1',r));return {url:`http://127.0.0.1:${app.address().port}`,close:()=>new Promise(r=>app.close(r))};}
const send=(res,body,type='text/html',status=200)=>{res.writeHead(status,{'content-type':type});res.end(typeof body==='object'?JSON.stringify(body):body);};
const jd='Développer des logiciels et analyser les données data SQL dans notre équipe en alternance. '.repeat(8);
const posting=(url,title='Alternance Data Engineer')=>`<h1>${title}</h1><script type="application/ld+json">${JSON.stringify({'@type':'JobPosting',title,url,description:jd,employmentType:'alternance',hiringOrganization:{name:'Synthetic Employer'}})}</script><a href="/apply">Postuler</a>`;
async function workspace(portals=[],discovery={}){const dir=await fs.mkdtemp(path.join(process.env.USELESS_LINKEDIN_TEST_TMP||os.tmpdir(),'ul-autonomous-'));await fs.writeFile(path.join(dir,'config.json'),JSON.stringify({version:1,queries:['alternance data'],include_keywords:['alternance'],role_keywords:['data'],locations:['France'],portals,discovery:{web_search:false,min_interval_ms:0,respect_robots:false,max_requests_per_run:80,retry_base_seconds:0,refresh_hours:0,...discovery}}));return dir;}
async function cli(dir,tool,...flags){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,[path.join(skill,'runtime/tools',tool+'.mjs'),...flags],{cwd:dir,env:{...process.env,USELESS_LINKEDIN_WORKSPACE:dir,USELESS_LINKEDIN_TEST_LOCAL:'1',PYTHONUTF8:'1'},stdio:['ignore','pipe','pipe']});let out='',err='';child.stdout.on('data',s=>out+=s);child.stderr.on('data',s=>err+=s);child.on('error',reject);child.on('exit',code=>code?reject(Error(err||out)):resolve(JSON.parse(out)));});}
const scan=(dir,...flags)=>cli(dir,'scan','--config','config.json','--summary',...flags);

test('script search verifies all results beyond ten, rejects categories and preserves page cursors across budgets',async t=>{
 const hits=[];let app;app=await server((req,res)=>{const u=new URL(req.url,app.url);hits.push(u.pathname+u.search);
  if(u.pathname==='/search'){const page=Number(u.searchParams.get('pageno'));return send(res,{results:page===1?Array.from({length:14},(_,i)=>({url:app.url+'/jobs/'+(i+1),title:'Untrusted search title'})):page===2?[{url:app.url+'/jobs/remote',title:'Alternance Data'}]:[]},'application/json');}
  if(u.pathname==='/jobs/remote')return send(res,'<h1>Remote jobs</h1><a href="/jobs/1">Alternance Data Engineer</a>');
  return send(res,posting(app.url+u.pathname));
 });t.after(app.close);
 const dir=await workspace([{name:'Synthetic job board',search_domain:'127.0.0.1',queries:['alternance data']}],{web_backend:'searxng',searxng:{api_url:app.url+'/search'},company_careers:false});
 const first=await scan(dir,'--zero-token','--max-requests','3','--no-browser');assert.equal(first.requests,3);assert.equal(first.added,2);assert.equal(first.complete,false);
 await scan(dir,'--resume','--zero-token','--no-browser');const jobs=(await json(state(dir,'leads.json'))).jobs;
 assert.equal(jobs.length,14);assert.ok(jobs.every(j=>j.title==='Alternance Data Engineer'));assert.equal(hits.filter(h=>h.includes('/search?')&&h.includes('pageno=1')).length,1);
 assert.equal(jobs.some(j=>j.url.endsWith('/remote')),false);const task=(await json(state(dir,'search-queue.json'))).find(t=>t.portal==='Synthetic job board');assert.equal(task.completed,false);assert.equal(task.reason,'search_end_unverified');
 const machine=await json(state(dir,'zero-token-scan.json'));assert.equal(machine.modelCalls,0);assert.equal(machine.modelTokens,0);
 const digest=await json(state(dir,'digest.json'));assert.equal(digest.newCount,12);assert.ok(digest.sourceIssues.length>0);
});

test('503 during detail verification resumes without fetching search results again',async t=>{
 let fail=true,searches=0;let app;app=await server((req,res)=>{if(req.url.startsWith('/search')){searches++;return send(res,{results:[{url:app.url+'/jobs/1'}]},'application/json');}if(fail)return send(res,'temporary','text/plain',503);return send(res,posting(app.url+'/jobs/1'));});t.after(app.close);
 const dir=await workspace([{name:'Fixture',search_domain:'127.0.0.1'}],{web_backend:'searxng',searxng:{api_url:app.url+'/search'}});
 await scan(dir,'--zero-token');assert.equal((await json(state(dir,'search-queue.json')))[0].status,'retry-wait');fail=false;
 await scan(dir,'--zero-token','--resume');assert.equal((await json(state(dir,'leads.json'))).jobs.length,1);assert.equal(searches,2); // second page only, initial results reused
});

test('configuring an automatic backend unparks old Agent tasks and verified search windows refresh without Agent work',async t=>{
 let app;app=await server((req,res)=>send(res,{results:[]},'application/json'));t.after(app.close);
 const dir=await workspace([{name:'Fixture',search_domain:'127.0.0.1'}]);await scan(dir,'--zero-token');assert.equal((await json(state(dir,'search-queue.json')))[0].reason,'automatic_search_backend_not_configured');
 const c=await json(path.join(dir,'config.json'));c.discovery.web_backend='searxng';c.discovery.searxng={api_url:app.url+'/search'};await fs.writeFile(path.join(dir,'config.json'),JSON.stringify(c));await scan(dir,'--resume','--zero-token');
 const task=(await json(state(dir,'search-queue.json')))[0];assert.equal(task.status,'retry-wait');assert.equal(task.searchWindowVerified,true);assert.equal(task.completed,false);assert.ok(Date.parse(task.nextRetryAt)>Date.now());const repeat=await scan(dir,'--resume','--zero-token');assert.equal(repeat.requests,0);
});

test('configured search page budget pauses after verifying the page and resumes at the next page',async t=>{
 let app;app=await server((req,res)=>{const url=new URL(req.url,app.url);if(url.pathname==='/search'){const page=Number(url.searchParams.get('pageno'));return send(res,{results:page<=2?[{url:app.url+'/jobs/'+page}]:[]},'application/json');}send(res,posting(app.url+url.pathname));});t.after(app.close);
 const dir=await workspace([{name:'Fixture',search_domain:'127.0.0.1'}],{web_backend:'searxng',searxng:{api_url:app.url+'/search'}});
 const first=await scan(dir,'--max-pages','1');assert.equal(first.added,1);const task=(await json(state(dir,'search-queue.json')))[0];assert.equal(task.reason,'configured_page_budget');assert.equal(task.cursor.searchPage,2);
 await scan(dir,'--resume','--max-pages','1');assert.equal((await json(state(dir,'leads.json'))).jobs.length,2);
});

test('Brave honors explicit search end and exposes its provider window without silent truncation',async()=>{
 process.env.SYNTHETIC_BRAVE='fixture';const calls=[];
 const result=await searchPage({query:'data',cursor:{searchPage:10}},{discovery:{web_backend:'brave',brave:{api_token_env:'SYNTHETIC_BRAVE'}}},{fetchPage:async(url,options)=>{calls.push({url,options});return {status:200,body:JSON.stringify({web:{results:[{url:'https://example.org/jobs/1'}]},query:{more_results_available:true}})};}});
 assert.equal(new URL(calls[0].url).searchParams.get('offset'),'9');assert.equal(result.nextPage,null);assert.equal(result.endEvidence,false);assert.equal(result.reason,'search_provider_window');
 const ended=await searchPage({query:'data'},{discovery:{web_backend:'brave',brave:{api_token_env:'SYNTHETIC_BRAVE'}}},{fetchPage:async()=>({status:200,body:JSON.stringify({web:{results:[]},query:{more_results_available:false}})})});assert.equal(ended.endEvidence,true);
 delete process.env.SYNTHETIC_BRAVE;
});

test('domain scope, expired JSON-LD and unverified search snippets never create postings',async()=>{
 let calls=0;const fetchPage=async url=>{calls++;return {status:200,finalUrl:url,body:posting(url).replace('"employmentType"','"validThrough":"2000-01-01","employmentType"')};};
 assert.equal((await verifySearchResult({url:'https://evil.example/jobs/1'},{searchDomain:'example.org'},{fetchPage})).reason,'search_domain_mismatch');assert.equal(calls,0);
 assert.equal((await verifySearchResult({url:'https://example.org/jobs/1'},{searchDomain:'example.org'},{fetchPage})).jobs.length,0);
});

test('company registry uses one task per board and sitemap index/feed/detail queues survive budgets',async t=>{
 const hits=[];let app;app=await server((req,res)=>{hits.push(req.url);
  if(req.url==='/careers')return send(res,'<h1>Careers</h1><link rel="alternate" type="application/rss+xml" href="/feed">');
  if(req.url==='/sitemap.xml')return send(res,`<sitemapindex><sitemap><loc>${app.url}/jobs-map.xml</loc></sitemap></sitemapindex>`,'application/xml');
  if(req.url==='/jobs-map.xml')return send(res,`<urlset><url><loc>${app.url}/jobs/1</loc><lastmod>2026-10-01</lastmod></url><url><loc>${app.url}/privacy</loc></url><url><loc>https://evil.example/jobs/99</loc></url></urlset>`,'application/xml');
  if(req.url==='/feed')return send(res,`<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Data role</title><link href="${app.url}/jobs/2"/></entry></feed>`,'application/atom+xml');
  return send(res,posting(app.url+req.url));
 });t.after(app.close);const dir=await workspace();await fs.mkdir(path.join(dir,'个人资料'),{recursive:true});await fs.writeFile(path.join(dir,'个人资料/companies.yml'),JSON.stringify({version:1,companies:[{name:'Synthetic Employer',career_url:app.url+'/careers'}]}));
 const plan=await cli(dir,'scan','--config','config.json','--plan');assert.equal(plan.taskCount,1);
 await scan(dir,'--max-requests','2');const first=(await json(state(dir,'search-queue.json')))[0];assert.ok(first.cursor.careerQueue.length);
 await scan(dir,'--resume');const jobs=(await json(state(dir,'leads.json'))).jobs;assert.equal(jobs.length,2);assert.equal((await json(state(dir,'search-queue.json')))[0].completed,true);assert.equal(hits.includes('/privacy'),false);assert.equal(hits.filter(h=>h==='/careers').length,1);
 const oldHits=hits.filter(h=>h==='/jobs/1').length;await scan(dir);assert.equal(hits.filter(h=>h==='/jobs/1').length,oldHits);assert.equal((await json(state(dir,'leads.json'))).jobs.some(j=>j.possiblyClosed),false);
});

test('embedded NEXT_DATA JobPosting, Atom and DTD rejection use real parsers',()=>{
 const p=parse(`<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({props:{data:[{'@type':42},{'@type':'JobPosting',title:'Data',url:'https://example.org/jobs/1'}]}})}</script>`);assert.equal(p.jobs.length,1);
 const xml=parse('<feed xmlns="http://www.w3.org/2005/Atom"><entry><link href="https://example.org/jobs/1"/><title>Data</title></entry></feed>','xml');assert.equal(xml.entries[0].url,'https://example.org/jobs/1');assert.throws(()=>parse('<!DOCTYPE a [<!ENTITY x "secret">]><a/>','xml'));
});

test('real Chromium renders embedded structured listings',async t=>{
 let app;app=await server((req,res)=>send(res,`<div id="root"></div><script>setTimeout(()=>{document.body.innerHTML=${JSON.stringify(posting('http://127.0.0.1/jobs/1')).replaceAll('<','\\u003c')}},30)</script>`));t.after(app.close);
 const raw=await renderListing(app.url,{settleMs:100});assert.equal(parse(raw.body).jobs.length,1);assert.match(raw.visibleText,/Alternance Data/);
});

test('MIME alert parsing decodes quoted-printable, filters senders and ignores unsubscribe',async()=>{
 const eml=Buffer.from('From: Alerts <alerts@example.org>\r\nMessage-ID: <synthetic-1@example.org>\r\nSubject: Jobs\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n<a href=3D"https://example.org/jobs/1">Alternance Data</a><a href=3D"https://evil.example/jobs/2">Ad</a><a href=3D"https://example.org/unsubscribe">Stop</a>');
 const result=await alertLinks(eml,{allowed_hosts:['example.org'],allowed_senders:['alerts@example.org']});assert.equal(result.suggestions.length,1);assert.equal(result.suggestions[0].title,'Alternance Data');assert.equal((await alertLinks(eml,{allowed_hosts:['example.org'],allowed_senders:['other@example.org']})).suggestions.length,0);
});

test('alert intake is idempotent and scan verifies alerts without a search backend',async t=>{
 let app;app=await server((req,res)=>send(res,posting(app.url+'/jobs/1')));t.after(app.close);const dir=await workspace();await fs.writeFile(path.join(dir,'alerts.json'),JSON.stringify({allowed_hosts:['127.0.0.1']}));await fs.writeFile(path.join(dir,'alert.eml'),`From: alerts@example.org\r\nMessage-ID: <fixture@example.org>\r\nContent-Type: text/plain\r\n\r\n${app.url}/jobs/1`);
 const first=await cli(dir,'alerts','--eml','alert.eml','--settings','alerts.json');assert.equal(first.processed,1);const again=await cli(dir,'alerts','--eml','alert.eml','--settings','alerts.json');assert.equal(again.processed,0);
 await scan(dir,'--alerts',first.file,'--zero-token');assert.equal((await json(state(dir,'leads.json'))).jobs.length,1);
});

test('source health opens a circuit after failures and reports abrupt zero results',()=>{
 const next=sourceHealth({Fixture:{lastFound:4} },[{name:'Fixture',found:0,attempts:[{count:0}]}]);assert.equal(next.Fixture.warning,'unexpected_zero_results');
 const failed=sourceHealth({},[{name:'Fixture',found:0,attempts:[{error:'HTTP 503'},{error:'HTTP 503'},{error:'HTTP 503'}]}]);assert.ok(failed.Fixture.circuitUntil);
 assert.equal(sourceHealth(next,[{name:'Fixture',found:0,unchanged:true,attempts:[{count:0}]}]).Fixture.warning,null);
 assert.deepEqual(sourceHealth({},[{name:'Fixture',found:0,attempts:[{error:'Budget reached',deferred:true}]}]),{});
});

test('a posting seen by another query this cycle is not falsely marked possibly closed',async t=>{
 let first=true;let app;app=await server((req,res)=>{const query=new URL(req.url,app.url).searchParams.get('q');send(res,{jobs:first||query==='one'?[{url:app.url+'/jobs/1',title:'Alternance Data Engineer'}]:[]},'application/json');});t.after(app.close);
 const dir=await workspace([{name:'Fixture',api_url:app.url+'/api?q={query}',queries:['one','two'],api:{exhaustive:true},web_search:false}]);await scan(dir);first=false;await scan(dir);assert.equal((await json(state(dir,'leads.json'))).jobs.some(j=>j.possiblyClosed),false);
});

test('ATS board plans do not multiply by query or location matrices',()=>{
 const config={version:1,queries:['one','two'],query_matrix:{roles:['data','web'],contracts:['stage','alternance']},locations:['France','Belgium'],discovery:{web_search:false},portals:[{name:'GH',provider:'greenhouse',board_token:'fixture',web_search:false,listing_mode:'disabled'}]};assert.equal(buildDiscoveryPlan(config).length,1);
});

test('real browser learns a public JobPosting XHR then future cycles use HTTP without opening the page',async t=>{
 let indexRequests=0,apiRequests=0;let app;app=await server((req,res)=>{
  if(req.url==='/api/jobs'){apiRequests++;const data=JSON.stringify({jobs:[{'@type':'JobPosting',url:app.url+'/jobs/1',title:'Alternance Data Engineer',description:jd,hiringOrganization:{name:'Synthetic Employer'}}],next:null});res.setHeader('Content-Length',Buffer.byteLength(data));return send(res,data,'application/json');}
  if(req.url==='/sitemap.xml')return send(res,'missing','text/plain',404);
  indexRequests++;return send(res,'<div id="root"></div><script>fetch("/api/jobs").then(r=>r.json()).then(d=>{document.querySelector("#root").innerHTML=d.jobs.map(j=>`<a href="${j.url}">${j.title}</a>`).join("")})</script>');
 });t.after(app.close);
 const dir=await workspace([{name:'Synthetic XHR',career_url:app.url+'/careers',career_extract:true,renderer:'auto',browser_settle_ms:300,web_search:false}]);
 const first=await scan(dir);assert.equal(first.added,1);assert.equal(first.complete,true);const learned=await json(state(dir,'learned-job-apis.json'));assert.equal(learned[app.url+'/careers'].api.pagination.next_path,'next');
 const previous=indexRequests;await scan(dir);assert.equal(indexRequests,previous);assert.ok(apiRequests>=3);
});

test('XHR learning rejects authenticated requests, signed URLs, category data and unproved pagination',()=>{
 const row={'@type':'JobPosting',title:'Data',url:'https://example.org/jobs/1',description:jd},source='https://example.org/careers',response={url:'https://example.org/api/jobs',method:'GET',authenticated:false,body:JSON.stringify({jobs:[row]})};
 assert.equal(observedJobApi({...response,authenticated:true},source),null);assert.equal(observedJobApi({...response,url:response.url+'?token=secret'},source),null);assert.equal(observedJobApi({...response,body:JSON.stringify({jobs:[{title:'Jobs',url:'https://example.org/jobs/remote'}]})},source),null);
 const learned=observedJobApi(response,source);assert.equal(learned.api.exhaustive,undefined);assert.equal(learned.api.pagination,undefined);
});

test('research inherits scan budget and checks JD-only review matches before selecting Agent cards',async t=>{
 let app;app=await server((req,res)=>{if(req.url.startsWith('/api'))return send(res,{jobs:[{title:'Graduate position',url:app.url+'/jobs/1'}]},'application/json');return send(res,posting(app.url+'/jobs/1','Graduate position'));});t.after(app.close);
 const dir=await workspace([{name:'Fixture',api_url:app.url+'/api',api:{exhaustive:true},web_search:false}],{max_requests_per_run:81,triage_max_requests:4});
 const result=await cli(dir,'research','--run','--zero-token','--config','config.json','--no-browser');const manifest=await json(result.manifest);
 assert.equal((await json(state(dir,'last-scan.json'))).limits.requests,81);assert.equal(manifest.cards.length,1);assert.equal(manifest.cards[0].triage,'candidate');assert.ok(manifest.cards[0].fullJd);const digest=await json(manifest.digestFile);assert.equal(digest.newJobs[0].triage,'candidate');assert.equal(digest.modelCalls,0);assert.equal(digest.eligibility,'Not assessed; model output requires sourced review.');
});

test('incremental sitemap preserves last full-scan time and eventually refetches unchanged details',async t=>{
 let details=0;let app;app=await server((req,res)=>{if(req.url==='/careers')return send(res,'<h1>Careers</h1>');if(req.url==='/sitemap.xml')return send(res,`<urlset><url><loc>${app.url}/jobs/1</loc><lastmod>2026-10-01</lastmod></url></urlset>`,'application/xml');details++;return send(res,posting(app.url+'/jobs/1'));});t.after(app.close);
 const dir=await workspace([{name:'Fixture',career_url:app.url+'/careers',career_extract:true,web_search:false}]);await scan(dir);const before=(await json(state(dir,'search-queue.json')))[0].lastFullScanAt;await scan(dir);assert.equal(details,1);assert.equal((await json(state(dir,'search-queue.json')))[0].lastFullScanAt,before);
 const tasks=await json(state(dir,'search-queue.json'));tasks[0].lastFullScanAt='2000-01-01T00:00:00Z';await fs.writeFile(state(dir,'search-queue.json'),JSON.stringify(tasks));await scan(dir);assert.equal(details,2);
});

test('explicit local search endpoint works with public target protections enabled and refuses redirects',async t=>{
 const app=await server((req,res)=>{if(req.url==='/redirect'){res.writeHead(302,{location:'/search'});res.end();}else send(res,{results:[]},'application/json');});t.after(app.close);const old=process.env.USELESS_LINKEDIN_TEST_LOCAL;delete process.env.USELESS_LINKEDIN_TEST_LOCAL;
 try{await assert.rejects(request(app.url),/Private host/);assert.equal((await request(app.url,{trustedLocalOrigin:app.url})).status,200);await assert.rejects(request(app.url,{trustedLocalOrigin:'http://10.0.0.1'}),/loopback/);await assert.rejects(request(app.url+'/redirect',{trustedLocalOrigin:app.url,redirect:'error'}),/Redirect refused/);}finally{process.env.USELESS_LINKEDIN_TEST_LOCAL=old;}
});

test('real TLS IMAP intake uses EXAMINE and BODY.PEEK, resumes UID cursor and never writes remote flags',async t=>{
 const require=createRequire(path.join(skill,'package.json')),{generate}=require('selfsigned');
 const certificate=await generate([{name:'commonName',value:'localhost'}],{algorithm:'sha256',extensions:[{name:'basicConstraints',cA:true},{name:'subjectAltName',altNames:[{type:7,ip:'127.0.0.1'},{type:2,value:'localhost'}]}]});
 const eml=Buffer.from('From: alerts@example.org\r\nMessage-ID: <synthetic-tls@example.org>\r\nContent-Type: text/plain\r\n\r\nhttps://example.org/jobs/1'),commands=[],sockets=new Set();
 const app=tls.createServer({key:certificate.private,cert:certificate.cert},socket=>{
  sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});socket.write('* OK [CAPABILITY IMAP4rev1] Synthetic ready\r\n');let buffer='';
  socket.on('data',chunk=>{buffer+=chunk;while(buffer.includes('\r\n')){const end=buffer.indexOf('\r\n'),line=buffer.slice(0,end);buffer=buffer.slice(end+2);const [tag,...parts]=line.split(' '),command=parts.join(' ');commands.push(command.split(' ')[0]==='LOGIN'?'LOGIN [redacted]':command);
   if(/^CAPABILITY/i.test(command))socket.write('* CAPABILITY IMAP4rev1\r\n');
   else if(/^LIST/i.test(command))socket.write('* LIST (\\Noselect) "/" ""\r\n');
   else if(/^EXAMINE/i.test(command))socket.write('* FLAGS (\\Seen)\r\n* 1 EXISTS\r\n* OK [UIDVALIDITY 7] Validity\r\n* OK [UIDNEXT 2] Next\r\n');
   else if(/^UID SEARCH/i.test(command))socket.write('* SEARCH 1\r\n');
   else if(/^UID FETCH/i.test(command)){
    if(/BODY\.PEEK\[\]/i.test(command)){socket.write(`* 1 FETCH (UID 1 BODY[] {${eml.length}}\r\n`);socket.write(eml);socket.write(')\r\n');}
    else socket.write(`* 1 FETCH (UID 1 RFC822.SIZE ${eml.length} ENVELOPE (NIL "Jobs" ((NIL NIL "alerts" "example.org")) NIL NIL NIL NIL NIL NIL "<synthetic-tls@example.org>"))\r\n`);
   }else if(/^LOGOUT/i.test(command)){socket.write('* BYE Logout\r\n'+tag+' OK Done\r\n');socket.end();continue;}
   socket.write(tag+' OK '+(/^EXAMINE/i.test(command)?'[READ-ONLY] ':'')+'Done\r\n');
  }});
 });await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(()=>{for(const socket of sockets)socket.destroy();return new Promise(r=>app.close(r));});
 const dir=await workspace(),certFile=path.join(dir,'synthetic-ca.crt');await fs.writeFile(certFile,certificate.cert);await fs.writeFile(path.join(dir,'mail.json'),JSON.stringify({allowed_hosts:['example.org'],allowed_senders:['alerts@example.org'],imap:{host:'127.0.0.1',port:app.address().port,mailbox:'JobAlerts',user_env:'SYNTHETIC_MAIL_USER',password_env:'SYNTHETIC_MAIL_PASSWORD'}}));
 const previous={ca:process.env.NODE_EXTRA_CA_CERTS,user:process.env.SYNTHETIC_MAIL_USER,password:process.env.SYNTHETIC_MAIL_PASSWORD};process.env.NODE_EXTRA_CA_CERTS=certFile;process.env.SYNTHETIC_MAIL_USER='fixture';process.env.SYNTHETIC_MAIL_PASSWORD='fixture-only';
 try{
  const first=await cli(dir,'alerts','--imap','--settings','mail.json');assert.equal(first.processed,1);assert.equal(first.links,1);const second=await cli(dir,'alerts','--imap','--settings','mail.json');assert.equal(second.processed,0);
  assert.ok(commands.some(c=>/^EXAMINE/i.test(c)));assert.ok(commands.some(c=>/BODY\.PEEK\[\]/i.test(c)));assert.equal(commands.some(c=>/^(?:SELECT|STORE|APPEND|EXPUNGE)|^UID STORE/i.test(c)),false);assert.equal((await json(state(dir,'alerts-state.json'))).imap.uid,1);
  assert.doesNotMatch(await fs.readFile(state(dir,'alerts-state.json'),'utf8'),/fixture-only/);
 }finally{for(const [key,value] of Object.entries({NODE_EXTRA_CA_CERTS:previous.ca,SYNTHETIC_MAIL_USER:previous.user,SYNTHETIC_MAIL_PASSWORD:previous.password})){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
