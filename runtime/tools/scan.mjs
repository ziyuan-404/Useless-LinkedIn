import fs from 'node:fs/promises';
import path from 'node:path';
import {args} from './runtime.mjs';
import {listing,posting} from './lib/listings.mjs';
import {home,config,request,transaction,write,exportList,read,hash,publicUrl,normalizeUrl,expandObservations} from './lib/core.mjs';
import {conditionalFetcher} from './lib/conditional-fetch.mjs';
import {buildDiscoveryPlan,mergeTasks,relevance,taskId,taskPriority} from './lib/discovery-plan.mjs';
import {readApiPage,listingNext,inferCareerSource} from './lib/discovery-sources.mjs';
import {failureDisposition,httpFailure,createDiscoveryFetcher} from './lib/discovery-policy.mjs';
import {stageDiscovery} from './lib/discovery-journal.mjs';
import {acquireFileLock} from './lib/file-lock.mjs';
import {validateLead} from './lib/schema.mjs';
import {credentialsReady} from './lib/official-job-apis.mjs';
import {searchPage,verifySearchResult,webBackend} from './lib/web-discovery.mjs';
import {companySources} from './lib/company-registry.mjs';
import {careerPage} from './lib/career-extractor.mjs';
import {sourceHealth,discoveryDigest} from './lib/discovery-health.mjs';
import {enrichCareerSources} from './lib/career-providers.mjs';
import {loadBlacklist,blacklistMatch} from './lib/blacklist.mjs';
import {mapBounded,mapPriorityBounded,serialQueue} from './lib/async-pool.mjs';
import {researchConfig} from './lib/research-queue.mjs';

const a=args();
if(a.help){console.log('scan [--config FILE] [--portal NAME] [--plan] [--resume] [--max-requests N] [--max-pages N] [--import FILE --import-only] [--listing-capture FILE] [--sources FILE] [--task-results FILE] [--retry-agent] [--zero-token] [--concurrency 4]\n0 = unlimited. --no-browser disables rendered-page fallback. Transient retries honor nextRetryAt.');process.exit(0);}
const loadArray=async(file,label)=>{if(!file)return [];const data=JSON.parse(await fs.readFile(file,'utf8'));if(!Array.isArray(data))throw Error(`${label} expects an array`);return data;};
let c=await config(a.config);
const blacklist=await loadBlacklist();
const registered=await read(path.join(home,'discovered-sources.json'),[]),newSources=await loadArray(a.sources,'sources');
const sourceMap=new Map([...registered,...await companySources(c),...c.portals,...newSources].map(p=>[p.name,p]));c.portals=[...sourceMap.values()];
const learnedApis=await read(path.join(home,'learned-job-apis.json'),{});
for(const source of c.portals){const learned=learnedApis[source.career_url];if(learned&&source.learn_observed_api!==false&&!source.api_url&&!source.provider)Object.assign(source,{api_url:learned.api_url,api:learned.api,listing_mode:'fallback'});}
if(c.research_scope){c=researchConfig(c,c.research_scope,{targeted:!!c.research_targeted});for(const source of c.portals)sourceMap.set(source.name,source);}
await enrichCareerSources(c);
if(a.portal&&!c.portals.some(p=>p.name===a.portal))throw Error(`Unknown source: ${a.portal}`);
const limit=(flag,key)=>{const value=Number(a[flag]??c.discovery?.[key]??0);if(!Number.isInteger(value)||value<0)throw Error(`${flag} must be a nonnegative integer`);return value||Infinity;};
const maxRequests=limit('max-requests','max_requests_per_run'),maxPages=limit('max-pages','max_pages_per_task');
const concurrency=Number(a.concurrency??c.discovery?.concurrency??(a['zero-token']?4:1));if(!Number.isInteger(concurrency)||concurrency<1||concurrency>16)throw Error('concurrency must be 1..16');
if(!a.plan)await fs.mkdir(home,{recursive:true});
const lockPath=path.join(home,'.scan.lock');
const scanLock=a.plan?null:await acquireFileLock(lockPath);
try{
const previous=await read(path.join(home,'search-queue.json'),[]);
const alertsFile=a.alerts||c.discovery?.alerts_file,alerts=alertsFile?await loadArray(path.resolve((await import('./runtime.mjs')).root,alertsFile),'alerts'):[];
const alertPlan=alerts.map(row=>{publicUrl(row.url);const task={kind:'web-search',portal:'Mail Alerts',query:row.url,url:row.url,emailAlert:true,priority:5,refreshHours:168};return {...task,id:taskId(task),status:'pending',completed:false,cursor:{pendingResults:[row],endEvidence:true,reason:'alert_links_checked'}};});
const tasks=mergeTasks([...buildDiscoveryPlan(c),...alertPlan],previous,{resume:!!a.resume,refreshHours:c.discovery?.refresh_hours??24});
const selected=task=>!task.retired&&task.status!=='standby'&&(!a.portal||task.portal===a.portal);
if(a.plan){const plan={version:2,sources:c.portals.length,taskCount:tasks.filter(selected).length,limits:{requests:Number.isFinite(maxRequests)?maxRequests:null,pagesPerTask:Number.isFinite(maxPages)?maxPages:null},tasks:tasks.filter(selected)};if(a.summary){const file=path.join(home,'scan-plan.json');await write(file,plan);console.log(JSON.stringify({file,sources:plan.sources,taskCount:plan.taskCount,limits:plan.limits}));}else console.log(JSON.stringify(plan,null,2));process.exit(0);}
const capturesRaw=a['listing-capture']?JSON.parse(await fs.readFile(a['listing-capture'],'utf8')):[];
const captures=Array.isArray(capturesRaw)?capturesRaw:[capturesRaw];
for(const x of captures){
 if(x.kind!=='listing'||!x.url||!Number.isFinite(Date.parse(x.capturedAt))||Math.abs(Date.now()-Date.parse(x.capturedAt))>86400000||typeof x.bodyText!=='string'||!Array.isArray(x.links)||x.links.some(l=>typeof l.title!=='string'||!l.title.trim()||!x.bodyText.includes(l.title)))throw Error('Listing capture requires recent observed page titles and links');
 publicUrl(x.url);if(x.pageUrl)publicUrl(x.pageUrl);
 for(const url of x.nextUrls||[])publicUrl(new URL(url,x.pageUrl||x.url).href);
 if(x.paginationComplete===true&&(!x.completionEvidence||(x.nextUrls||[]).length))throw Error('Capture completion requires end-of-list evidence and no next URLs');
}
const imported=await loadArray(a.import,'Import'),results=await loadArray(a['task-results'],'task-results');
for(const j of imported){if(typeof j.url!=='string'||typeof j.title!=='string'||!j.title.trim())throw Error('Imported posting requires url and title');publicUrl(j.url);if(j.sourceUrl)publicUrl(j.sourceUrl);if(j.capturedAt&&!Number.isFinite(Date.parse(j.capturedAt)))throw Error('Imported capturedAt must be a valid date-time');}
for(const result of results){
 if(!tasks.some(t=>t.id===result.id))throw Error(`Unknown task result: ${result.id}`);
 if(!['completed','partial','blocked'].includes(result.status)||typeof result.evidence!=='string'||!result.evidence.trim()||!Number.isFinite(Date.parse(result.capturedAt))||Math.abs(Date.now()-Date.parse(result.capturedAt))>86400000)throw Error('Task result requires status, recent capturedAt and observed evidence');
}
const report={version:2,startedAt:new Date().toISOString(),portals:[],added:[],duplicates:[],rejected:[],searchRequests:[],bounded:Number.isFinite(maxRequests)||Number.isFinite(maxPages),resultLimit:null,requests:0,
 limits:{requests:Number.isFinite(maxRequests)?maxRequests:null,pagesPerTask:Number.isFinite(maxPages)?maxPages:null},warnings:[]};
if(c.max_results_per_portal!==undefined)report.warnings.push('Deprecated max_results_per_portal is ignored; all collected postings are retained.');
const logs=new Map(c.portals.map(p=>[p.name,{name:p.name,attempts:[],found:0,filtered:0,review:0,rejected:0}]));
const getLog=name=>{if(!logs.has(name))logs.set(name,{name,attempts:[],found:0,filtered:0,review:0,rejected:0});return logs.get(name);};
const registeredMap=new Map(registered.map(p=>[p.name,p]));for(const p of newSources)registeredMap.set(p.name,p);
const observedInRun=new Set();
const persistSerial=serialQueue();
async function persist(){return persistSerial(async()=>{
 await write(path.join(home,'search-queue.json'),tasks);
 await write(path.join(home,'discovered-sources.json'),[...registeredMap.values()]);
});}
function registerSource(entry){
 if(!entry||sourceMap.has(entry.name))return;
 // The same ATS board may be observed under a different employer/source label.
 if(entry.provider&&[...sourceMap.values()].some(p=>p.provider===entry.provider&&(entry.provider==='greenhouse'?p.board_token===entry.board_token:entry.provider==='lever'?p.site===entry.site&&(p.region||'global')===(entry.region||'global'):false)))return;
 registeredMap.set(entry.name,entry);sourceMap.set(entry.name,entry);
 const extra=buildDiscoveryPlan({...c,portals:[entry],discovery:{...c.discovery,web_search:false}});
 for(const item of extra)if(!tasks.some(t=>t.id===item.id))tasks.push(item);
}
async function collect(rows,source,observation,{observedJob=true}={}){
 const accepted=[],log=getLog(source.name);let invalid=0;log.found+=rows.length;
 for(const row of rows){
  const j=posting(row,source,observation.pageUrl||observation.url||row.url,{observedJob});
  if(!j){invalid++;log.rejected++;report.rejected.push({portal:source.name,url:row.url||'',title:row.title||'',reason:'Not a published posting, invalid URL/title, or explicit source restriction'});continue;}
  try{publicUrl(j.url);}catch(e){invalid++;log.rejected++;report.rejected.push({portal:source.name,url:j.url,reason:e.message});continue;}
  const signals=relevance(j,c,source);
  const blocked=blacklistMatch(j,blacklist);if(blocked){log.rejected++;report.rejected.push({portal:source.name,url:j.url,title:j.title,reason:'blacklist: '+blocked.reason});continue;}
  const record=JSON.parse(JSON.stringify({...j,discoveryContentHash:hash(JSON.stringify([j.title,j.description||j.jd||'',j.contract||'',j.location||'',j.updatedAt||''])),discoverySignals:signals,discoveryDisposition:signals.matches?'candidate':'review',observations:[{...observation,pageUrl:j.sourceUrl||observation.pageUrl,capturedAt:j.capturedAt||observation.capturedAt,source:source.name,url:j.url}]}));
  const at=new Date().toISOString();
  try{await validateLead({...record,id:'pending',key:normalizeUrl(record.url),state:'discovered',createdAt:at,lastSeenAt:at});}catch(e){invalid++;log.rejected++;report.rejected.push({portal:source.name,url:j.url,reason:e.message});continue;}
  accepted.push(record);log.filtered+=signals.matches?1:0;log.review+=signals.matches?0:1;
  registerSource(inferCareerSource(j.url));
 }
 if(accepted.length)await stageDiscovery(home,accepted);
 const keys=accepted.map(j=>normalizeUrl(j.url));for(const key of keys)observedInRun.add(key);keys.invalidCount=invalid;return keys;
}
const importGroups=new Map();
for(const j of imported){if(a.portal&&j.portal!==a.portal)continue;const name=j.portal||new URL(j.url).hostname;if(!importGroups.has(name))importGroups.set(name,[]);importGroups.get(name).push(j);}
for(const [name,rows] of importGroups){
 const source=sourceMap.get(name)||{name};
 await collect(rows,source,{layer:'Import',file:path.resolve(a.import),capturedAt:new Date().toISOString()});
}
for(const result of results){
 const task=tasks.find(t=>t.id===result.id);if(!selected(task))continue;
 Object.assign(task,{status:result.status,completed:result.status==='completed',evidence:result.evidence,finishedAt:result.capturedAt,updatedAt:new Date().toISOString()});
 if(result.cursor)task.cursor=result.cursor;
 if(result.status==='completed')delete task.cursor;
}
const credentials=new Map(),pagesThisRun=new Map(),usedCaptures=new Set(),attemptedFailures=new Set();
const health=await read(path.join(home,'source-health.json'),{}),runFailures=new Map();
const robotsCache=new Map(await read(path.join(home,'robots-cache.json'),[]));
const fetchPage=createDiscoveryFetcher({request,cache:robotsCache,respectRobots:c.discovery?.respect_robots!==false,minIntervalMs:c.discovery?.min_interval_ms??500,beforeRequest:()=>{
 if(report.requests>=maxRequests)throw Object.assign(Error('Configured request budget reached'),{budget:true});
 report.requests++;
}});
function activateFallbacks(){
 for(const task of tasks.filter(t=>t.fallbackOnly)){
  let primary=tasks.filter(t=>t.kind==='api'&&t.portal===task.portal&&!t.retired&&(task.parentTaskId?t.id===task.parentTaskId:task.kind==='web-search'||!t.query||!task.query||t.query===task.query));
  if(!primary.length&&task.kind==='web-search')primary=tasks.filter(t=>t.kind==='listing'&&!t.fallbackOnly&&t.portal===task.portal&&!t.retired);
  const usable=primary.length&&primary.every(t=>t.completed),needsFallback=!primary.length||primary.some(t=>['blocked','needs-agent'].includes(t.status));
  if(needsFallback&&task.status==='standby')task.status='pending';
  else if(usable&&!task.completed)task.status='standby';
 }
}
activateFallbacks();
async function visitWeb(task){
 const source=sourceMap.get(task.portal)||{name:task.portal};
 if(!task.emailAlert&&webBackend(c)==='agent'){task.status='needs-agent';task.reason='automatic_search_backend_not_configured';delete task.failureClass;return;}
 if(task.failureClass==='credentials-missing'||task.reason==='automatic_search_backend_not_configured'){task.status='pending';delete task.failureClass;}
 if((['blocked','needs-agent'].includes(task.status)&&!a['retry-agent'])||Date.parse(task.nextRetryAt||'')>Date.now()||attemptedFailures.has(task.id))return;
 const log=getLog(task.portal),cursor=task.cursor||{};
 try{
  if(!cursor.pendingResults){
   if((pagesThisRun.get(task.id)||0)>=maxPages){task.status='partial';task.reason='configured_page_budget';return;}
   const result=await searchPage(task,c,{fetchPage:(url,opts)=>fetchPage(url,opts,{name:'Search API',respect_robots:false})});
   pagesThisRun.set(task.id,(pagesThisRun.get(task.id)||0)+1);
   const signature=hash(JSON.stringify(result.suggestions.map(r=>normalizeUrl(r.url)).sort()));
   if(result.suggestions.length&&(task.searchSeenPages||[]).includes(signature)){task.status='needs-agent';task.reason='repeated_search_page';task.completed=false;return;}
   task.searchSeenPages=[...(task.searchSeenPages||[]),signature];
   task.providerWindow=result.providerWindow;task.searchSuggestions=result.suggestions;
   task.cursor={searchPage:result.page,pendingResults:result.suggestions.map(r=>({url:r.url,title:r.title})),nextPage:result.nextPage,endEvidence:result.endEvidence,engineFailures:result.engineFailures,reason:result.reason};
   log.attempts.push({taskId:task.id,layer:'SearchAPI',page:result.page,count:result.suggestions.length,reason:result.reason});
  }else if(cursor.pendingResults.length){
   const row=cursor.pendingResults[0];
   const result=await verifySearchResult(row,task,{fetchPage:(url,opts)=>fetchPage(url,opts,source),noBrowser:!!a['no-browser']});
   const accepted=await collect(result.jobs,source,{taskId:task.id,query:task.query,layer:'WebVerification',url:row.url,pageUrl:row.url,capturedAt:new Date().toISOString()},{observedJob:true});
   if(accepted.invalidCount)task.unverifiedResultCount=(task.unverifiedResultCount||0)+accepted.invalidCount;
   for(const entry of result.careerSources||[])registerSource(entry);
   cursor.pendingResults.shift();task.verifiedResults=(task.verifiedResults||0)+result.jobs.length;
   log.attempts.push({taskId:task.id,layer:'WebVerification',url:row.url,count:result.jobs.length,reason:result.reason});
   if(result.reason==='unverified_search_result'){task.unverifiedResultCount=(task.unverifiedResultCount||0)+1;}
  }else if(cursor.nextPage){task.cursor={searchPage:cursor.nextPage};}
  else{
   task.completed=cursor.endEvidence===true&&!cursor.engineFailures?.length&&!task.unverifiedResultCount;
   task.status=task.completed?'completed':'needs-agent';task.reason=task.unverifiedResultCount?'search_results_unverified':cursor.reason;task.cursor=null;
   if(task.completed)task.finishedAt=new Date().toISOString();
   else if(!task.unverifiedResultCount&&!cursor.engineFailures?.length&&!task.emailAlert){
    // A search engine cannot prove open-web exhaustion. Refresh its verified
    // window automatically instead of handing already checked results to Agent.
    task.status='retry-wait';task.searchWindowVerified=true;task.nextRetryAt=new Date(Date.now()+Math.max(1,task.refreshHours??168)*3600000).toISOString();
    task.cursor={searchPage:1};task.searchSeenPages=[];
   }
  }
  task.updatedAt=new Date().toISOString();progress=true;await persist();
 }catch(error){
  Object.assign(task,failureDisposition(error,{attempt:(task.attempts||0)+1,baseSeconds:c.discovery?.retry_base_seconds??30,maxSeconds:c.discovery?.retry_max_seconds??1800}),{updatedAt:new Date().toISOString()});
  attemptedFailures.add(task.id);log.attempts.push({taskId:task.id,layer:'WebVerification',error:error.message,deferred:!!(error.budget||error.deferredUntil||error.credentialsMissing)});await persist();
 }
}
// Visit one page per task in each round, preserving the rest when budgets expire.
let progress=true;
while(progress&&!a['import-only']){
 progress=false;
 const ordered=[...tasks].sort((left,right)=>(Date.parse(left.updatedAt)||0)-(Date.parse(right.updatedAt)||0)||taskPriority(left)-taskPriority(right));
 const visit=concurrency===1?(items,n,priority,fn)=>mapBounded(items,n,fn):mapPriorityBounded;
 await visit(ordered,concurrency,taskPriority,async task=>{
  if(!selected(task)||task.completed)return;
  if(['web-search','career-discovery'].includes(task.kind)){
   if(!a['listing-capture']&&report.requests<maxRequests)await visitWeb(task);return;
  }
  if(!['api','listing'].includes(task.kind))return;
  const source=sourceMap.get(task.portal);if(source?.enabled===false)return;if(!source){task.status='needs-agent';task.reason='source_not_configured';return;}
  const pages=pagesThisRun.get(task.id)||0;
  if(pages>=maxPages){task.status='partial';task.reason='configured_page_budget';return;}
  const currentUrl=task.cursor?.urls?.[0]||task.cursor?.url||task.url;
  const observed=task.kind==='listing'?captures.find(x=>(x.taskId===task.id||!x.taskId)&&(x.url===currentUrl||x.pageUrl===currentUrl)&&!usedCaptures.has(x)):null;
  if(pages===0&&a['retry-agent']&&task.status==='needs-agent'){task.seenPages=[];task.currentPages={};task.currentKeys=[];delete task.hasUnusableRecords;}
  if(source.renderer==='agent'&&!observed){task.status='needs-agent';task.reason='interactive_browser_selected';activateFallbacks();return;}
  // Upgrade old temporary failures rather than permanently parking them as Agent work.
  if(task.status==='needs-agent'&&/HTTP (?:408|425|429|5\d\d)|access_(?:429|5\d\d)|fetch failed|timeout|connection refused/i.test(task.reason||''))task.status='retry-wait';
  if(task.failureClass==='credentials-missing'&&credentialsReady(source)){task.status='pending';delete task.failureClass;delete task.reason;}
  if(!observed&&(['blocked','needs-agent'].includes(task.status)&&!a['retry-agent']||Date.parse(task.nextRetryAt||'')>Date.now()||attemptedFailures.has(task.id)))return;
  // Offline replay never launches unrelated public requests.
  if(a['listing-capture']&&!observed)return;
  if(!observed&&report.requests>=maxRequests){task.status='partial';task.reason='configured_request_budget';return;}
  const log=getLog(source.name);
  if(!observed&&!a['retry-agent']&&(Date.parse(health[source.name]?.circuitUntil||'')>Date.now()||(runFailures.get(source.name)||0)>=3)){
   task.status='retry-wait';task.reason='source_circuit_open';task.nextRetryAt=health[source.name]?.circuitUntil||new Date(Date.now()+6*3600000).toISOString();return;
  }
  try{
   let result;
    const cachedFetch=conditionalFetcher((url,opts)=>fetchPage(url,opts,source),{directory:path.join(home,'page-cache'),enabled:c.discovery?.conditional_requests!==false,fullRefreshHours:source.incremental?.full_refresh_hours??168});
    const sourceFetch=(url,opts)=>cachedFetch(url,opts,source);
   if(task.kind==='api')result=await readApiPage(source,task,{fetchPage:sourceFetch,credentials:credentials.get(source.name)});
   else{
    if(observed){
     usedCaptures.add(observed);
     result={jobs:observed.links,status:200,finalUrl:observed.pageUrl||observed.url,nextUrls:(observed.nextUrls||[]).map(u=>new URL(u,observed.pageUrl||observed.url).href),paginationComplete:observed.paginationComplete,completionEvidence:observed.completionEvidence,blocked:observed.blocked===true};
    }else if(source.career_extract===true&&!source.provider)result=await careerPage(source,task,{fetchPage:sourceFetch,noBrowser:!!a['no-browser'],beforeNavigation:()=>fetchPage.beforeNavigation(currentUrl,source),sitemapHints:()=>[...(robotsCache.get(new URL(task.url).origin)?.body||'').matchAll(/^sitemap:\s*(\S+)/gim)].map(m=>m[1])});
    else result=await listing(currentUrl,{portal:source,fetchPage:sourceFetch,noBrowser:!!a['no-browser'],beforeNavigation:()=>fetchPage.beforeNavigation(currentUrl,source)});
    httpFailure(result);
    if(result.blocked)throw Object.assign(Error('listing_access_'+(result.status||'blocked')),{blocked:true,status:result.status});
    result.url=currentUrl;result.rowCount=result.jobs.length;
    if(!(source.career_extract===true&&!source.provider&&!observed))Object.assign(result,listingNext(source,task,result));
    const remaining=(task.cursor?.urls||[]).slice(1);
    if(remaining.length){result.nextCursor={...(result.nextCursor||{}),urls:[...remaining,...(result.nextCursor?.urls||[])]};result.complete=false;}
    if(result.status<200||result.status>=300||result.blocked){result.complete=false;result.nextCursor=null;result.reason=`listing_access_${result.status||'blocked'}`;}
   }
   if(result.credentials)credentials.set(source.name,result.credentials);
   if(result.observedApi&&source.career_url&&source.learn_observed_api!==false&&!source.api_url&&!source.provider){
    learnedApis[source.career_url]=result.observedApi;await write(path.join(home,'learned-job-apis.json'),learnedApis);
    Object.assign(source,{api_url:result.observedApi.api_url,api:result.observedApi.api,listing_mode:'fallback'});
    const extra=buildDiscoveryPlan({...c,portals:[source],discovery:{...c.discovery,web_search:false}}).filter(t=>t.kind==='api');
    for(const item of extra)if(!tasks.some(t=>t.id===item.id))tasks.push(item);
    task.retired=true;task.retirementReason='replaced_by_observed_public_api';
   }
   pagesThisRun.set(task.id,pages+1);progress=true;
   log.attempts.push({taskId:task.id,layer:observed?'AgentBrowser':task.kind==='api'?'API':'HTTP',url:result.url||task.url,page:result.page??task.cursor?.page??0,count:result.jobs.length,reason:result.reason});
   const collected=await collect(result.jobs,source,{taskId:task.id,query:task.query,location:task.location,layer:observed||result.rendered?'AgentBrowser':task.kind==='api'?'API':'HTTP',url:currentUrl,pageUrl:result.finalUrl||currentUrl,capturedAt:observed?.capturedAt||new Date().toISOString()},{observedJob:task.kind==='api'});
   if(collected.invalidCount||result.unusableRecords){result.complete=false;result.reason='unusable_posting_records';task.hasUnusableRecords=true;}
   task.currentKeys=result.unchangedSnapshot?(task.baselineKeys||[]):[...new Set([...(task.currentKeys||[]),...collected,...(result.skippedKeys||[])])];
   if(result.skippedKeys?.length)log.unchanged=true;
   const signature=hash(JSON.stringify(result.jobs.map(j=>[normalizeUrl(j.url),j.title,j.contract||'',j.publishedAt||'',j.updatedAt||'',hash(j.description||j.jd||'')]).sort()));
   const pageKey=result.pageKey||currentUrl+':'+(result.page??task.cursor?.page??0);
   task.currentPages={...(task.currentPages||{}),[pageKey]:signature};
   const incremental=result.incrementalEligible!==false&&task.refreshing&&source.incremental?.newest_first===true&&source.incremental?.stop_on_unchanged===true&&Date.now()-Date.parse(task.lastFullScanAt||'')<(source.incremental.full_refresh_hours??168)*3600000&&task.baselinePages?.[pageKey]===signature;
   const seenSignature=result.partition?result.partition+':'+signature:signature;
   const repeated=!result.skippedKeys?.length&&result.jobs.length&&(task.seenPages||[]).includes(seenSignature)&&observed?.paginationComplete!==true;
   task.seenPages=[...new Set([...(task.seenPages||[]),seenSignature])];
   task.cursor=incremental?null:result.nextCursor;task.completed=!task.hasUnusableRecords&&(incremental||!!result.complete&&!repeated);task.reason=task.hasUnusableRecords&&!result.nextCursor?'unusable_posting_records':incremental?'incremental_unchanged_page':repeated?'repeated_page':result.reason;
   task.incrementalStopped=incremental||!!result.unchangedSnapshot||!!result.incrementalSnapshot;task.attempts=0;delete task.nextRetryAt;delete task.failureClass;
   task.status=task.completed?'completed':result.nextCursor&&!repeated?'partial':'needs-agent';
   if(result.providerFailure){Object.assign(task,failureDisposition(result.providerFailure,{attempt:(task.attempts||0)+1,baseSeconds:c.discovery?.retry_base_seconds??30,maxSeconds:c.discovery?.retry_max_seconds??1800}));task.completed=false;attemptedFailures.add(task.id);}
   if(task.completed&&!task.incrementalStopped)task.lastFullScanAt=new Date().toISOString();
   task.updatedAt=new Date().toISOString();if(task.completed)task.finishedAt=task.updatedAt;
   if(repeated)task.cursor=null;
   if(task.kind==='api'&&!task.completed&&!task.cursor){
    const fallback={kind:'web-search',fallbackOnly:true,portal:task.portal,parentTaskId:task.id,url:task.url,query:[source.search_domain?`site:${source.search_domain}`:'',task.query,task.location].filter(Boolean).join(' ')||task.url,reason:task.reason,status:'pending',completed:false};fallback.id=taskId(fallback);
    if(!tasks.some(x=>x.id===fallback.id))tasks.push(fallback);
   }
   for(const entry of result.careerSources||[])registerSource(entry);
   activateFallbacks();await persist();
  }catch(e){
   if(!e.budget&&!e.deferredUntil&&!e.credentialsMissing)runFailures.set(source.name,(runFailures.get(source.name)||0)+1);
   Object.assign(task,failureDisposition(e,{attempt:(task.attempts||0)+1,baseSeconds:c.discovery?.retry_base_seconds??30,maxSeconds:c.discovery?.retry_max_seconds??1800}),{updatedAt:new Date().toISOString()});
   attemptedFailures.add(task.id);activateFallbacks();
   log.attempts.push({taskId:task.id,layer:task.kind==='api'?'API':'HTTP',url:currentUrl,error:e.message,deferred:!!(e.budget||e.deferredUntil||e.credentialsMissing)});await persist();
  }
 });
}
for(const observed of captures.filter(x=>!usedCaptures.has(x))){
 const name=observed.portal||new URL(observed.pageUrl||observed.url).hostname;if(a.portal&&name!==a.portal)continue;
 registerSource({name,enabled:true,career_url:observed.url});
 const source=sourceMap.get(name)||{name};
 await collect(observed.links,source,{layer:'AgentBrowser',url:observed.url,pageUrl:observed.pageUrl||observed.url,capturedAt:observed.capturedAt},{observedJob:false});
 const existing=tasks.find(t=>!t.retired&&t.kind==='listing'&&t.portal===name&&t.url===observed.url);
 const followup=existing||{kind:'listing',portal:name,url:observed.url,query:'',location:'',id:taskId({kind:'listing',portal:name,url:observed.url})};
 Object.assign(followup,{status:'needs-agent',completed:false,reason:'unplanned_observed_listing',evidence:observed.completionEvidence||'',updatedAt:observed.capturedAt});
 if(observed.paginationComplete===true){followup.status='completed';followup.completed=true;followup.finishedAt=observed.capturedAt;}
 else if(observed.nextUrls?.length){followup.cursor={urls:observed.nextUrls.map(u=>new URL(u,observed.pageUrl||observed.url).href)};followup.status='partial';}
 if(!tasks.some(t=>t.id===followup.id))tasks.push(followup);
}
for(const log of logs.values()){
 const related=tasks.filter(t=>!t.retired&&t.portal===log.name),done=related.filter(t=>t.completed).length;
 Object.assign(log,{collected:log.filtered+log.review,tasks:related.length,completedTasks:done,status:done===related.length&&related.length?'completed':log.found?'partial-results':'pending'});report.portals.push(log);
}
report.searchRequests=tasks.filter(t=>selected(t)&&!t.completed);
report.coverage={planned:tasks.filter(selected).length,completed:tasks.filter(t=>selected(t)&&t.completed).length,pending:report.searchRequests.length};
report.complete=report.coverage.pending===0;report.finishedAt=new Date().toISOString();
await persist();
await write(path.join(home,'robots-cache.json'),[...robotsCache]);
const updatedHealth=sourceHealth(health,[...logs.values()]);
await transaction(store=>{
 const rulesHash=hash(JSON.stringify({include:c.include_keywords,roles:c.role_keywords,exclude:c.exclude_keywords,aliases:c.keyword_aliases,exclude_scope:c.exclude_scope,sources:[...sourceMap.values()].map(s=>({name:s.name,include:s.include_keywords,roles:s.role_keywords,exclude:s.exclude_keywords,aliases:s.keyword_aliases,exclude_scope:s.exclude_scope}))}));
 if(store.discoveryRulesHash!==rulesHash){
   for(const job of store.jobs.filter(j=>j.discoveryOnly&&['discovered','possible-duplicate'].includes(j.state)&&j.triage?.method!=='manual')){const signals=relevance(job,c,sourceMap.get(job.portal)||{});job.discoverySignals=signals;job.discoveryDisposition=signals.matches?'candidate':'review';if(job.triage?.status==='excluded')job.triage.status='pending';}
  store.discoveryRulesHash=rulesHash;
 }
 for(const task of tasks.filter(t=>selected(t)&&t.completed&&!t.incrementalStopped&&t.currentKeys)){
  const seen=new Set(task.currentKeys);
  for(const job of store.jobs){
    if(job.liveness?.result==='expired')continue;
    if(!expandObservations(job.observations||[]).some(o=>o.taskId===task.id||o.taskIds?.includes(task.id))||[job.url,...(job.urlAliases||[])].some(url=>seen.has(normalizeUrl(url))||observedInRun.has(normalizeUrl(url))))continue;
   const signals=new Map((job.absenceSignals||[]).map(s=>[s.taskId,s]));signals.set(task.id,{taskId:task.id,observedAt:task.finishedAt,reason:'absent_from_complete_snapshot'});job.absenceSignals=[...signals.values()];
   // Missing from a search snapshot requests verification, never an expiry transition.
   if(Date.parse(job.lastSeenAt)<=Date.parse(task.finishedAt))job.possiblyClosed=true;
  }
 }
 const summary=scan=>({version:scan.version,startedAt:scan.startedAt,finishedAt:scan.finishedAt,complete:scan.complete,requests:scan.requests,coverage:scan.coverage,addedCount:scan.addedCount??scan.added?.length??0,duplicateCount:scan.duplicateCount??scan.duplicates?.length??0,rejectedCount:scan.rejectedCount??scan.rejected?.length??0});
 store.scans=[...store.scans.map(summary),summary(report)].slice(-100);
},{onDiscovery:changes=>{for(const result of changes)report[result.duplicate?'duplicates':'added'].push(result);}});
await write(path.join(home,'last-scan.json'),report);
const digestStore=await read(path.join(home,'leads.json'),{jobs:[]}),addedIds=new Set(report.added.map(j=>j.id));
for(const job of digestStore.jobs)if(addedIds.has(job.id)&&updatedHealth[job.portal])updatedHealth[job.portal].lastNewPostingAt=report.finishedAt;
await write(path.join(home,'source-health.json'),updatedHealth);await write(path.join(home,'digest.json'),discoveryDigest(digestStore.jobs,report,updatedHealth));
const machineReport={version:1,startedAt:report.startedAt,finishedAt:report.finishedAt,modelCalls:0,modelTokens:0,concurrency,requests:report.requests,coverage:report.coverage,added:report.added.length,duplicates:report.duplicates.length,complete:report.complete,limitations:'Model-free API/HTTP/local browser scan. Unresolved web-search and access gates remain queued; starting this CLI or reading its summary in an agent conversation still uses conversation tokens.'};
await write(path.join(home,'zero-token-scan.json'),machineReport);
await write(path.join(home,'scan-agent-task.md'),`Read search-queue.json and the Skill workflow discover-jobs.md. Handle every pending web-search/career-discovery task and listing/API task needing Agent access. Retry-wait tasks resume automatically after nextRetryAt; do not bypass robots exclusions or access challenges. Choose public HTTP, an isolated Playwright browser, or an available interactive browser according to site behavior; use Agent WebSearch for open-web search. API success only parks explicitly configured fallback tasks; independent discovery remains active. Follow actual next pages/load-more until observed end; capture pagination URLs. Import arbitrary published detail links with scan --import FILE --import-only. Add employer career sites with scan --sources FILE. Replay observed lists with scan --listing-capture FILE. Persist outcomes with scan --task-results FILE --import-only (id, status: completed/partial/blocked, capturedAt, evidence, optional cursor). Do not mark partial or blocked searches completed. Keep predictions, training advertisements and search summaries separate from published vacancies; Run triage --list-review and triage --list-closed, then triage --run to inspect complete JDs without candidate analysis. Persist observed decisions using triage --decisions FILE; incomplete or blocked reviews remain actionable. Candidate leads proceed to full JD/liveness and candidate gates in process-job.md. Configured budgets preserve pending tasks; scan --resume continues them. Pending tasks: ${report.coverage.pending}.\n`);
await exportList();console.log(JSON.stringify(a.summary?{file:path.join(home,'last-scan.json'),complete:report.complete,requests:report.requests,coverage:report.coverage,added:report.added.length,duplicates:report.duplicates.length}:report,null,2));
}finally{if(scanLock)await scanLock.close();}
