import fs from 'node:fs/promises';
import path from 'node:path';
import {args} from './runtime.mjs';
import {listing,posting} from './lib/listings.mjs';
import {home,config,request,transaction,add,write,exportList,read,hash,publicUrl} from './lib/core.mjs';
import {buildDiscoveryPlan,mergeTasks,relevance,taskId} from './lib/discovery-plan.mjs';
import {readApiPage,listingNext,inferCareerSource} from './lib/discovery-sources.mjs';

const a=args();
if(a.help){console.log('scan [--config FILE] [--portal NAME] [--plan] [--resume] [--max-requests N] [--max-pages N] [--import FILE --import-only] [--listing-capture FILE] [--sources FILE] [--task-results FILE]\n0 = unlimited. --no-browser is accepted; website pages are always handled in IAB by the Agent.');process.exit(0);}
const loadArray=async(file,label)=>{if(!file)return [];const data=JSON.parse(await fs.readFile(file,'utf8'));if(!Array.isArray(data))throw Error(`${label} expects an array`);return data;};
const c=await config(a.config);
const registered=await read(path.join(home,'discovered-sources.json'),[]),newSources=await loadArray(a.sources,'sources');
const sourceMap=new Map([...registered,...c.portals,...newSources].map(p=>[p.name,p]));c.portals=[...sourceMap.values()];
if(a.portal&&!c.portals.some(p=>p.name===a.portal))throw Error(`Unknown source: ${a.portal}`);
const limit=(flag,key)=>{const value=Number(a[flag]??c.discovery?.[key]??0);if(!Number.isInteger(value)||value<0)throw Error(`${flag} must be a nonnegative integer`);return value||Infinity;};
const maxRequests=limit('max-requests','max_requests_per_run'),maxPages=limit('max-pages','max_pages_per_task');
if(!a.plan)await fs.mkdir(home,{recursive:true});
const lockPath=path.join(home,'.scan.lock');
async function acquireScanLock(){
 for(let attempt=0;attempt<2;attempt++){
  try{const handle=await fs.open(lockPath,'wx');await handle.writeFile(JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}));return handle;}
  catch(error){
   if(error.code!=='EEXIST')throw error;
   const owner=await read(lockPath,null);
   if(!Number.isInteger(owner?.pid)||owner.pid<1)throw Error('Scan lock has no valid owner; inspect the lock before retrying');
   try{process.kill(owner.pid,0);throw Error(`Another scan is already running (PID ${owner.pid})`);}
   catch(check){if(check.code!=='ESRCH')throw check;}
   // A terminated scan leaves its checkpoint intact; release only its dead lock.
   await fs.unlink(lockPath).catch(e=>{if(e.code!=='ENOENT')throw e;});
  }
 }
 throw Error('Could not acquire scan lock');
}
const scanLock=a.plan?null:await acquireScanLock();
try{
const previous=await read(path.join(home,'search-queue.json'),[]);
const tasks=mergeTasks(buildDiscoveryPlan(c),previous,{resume:!!a.resume,refreshHours:c.discovery?.refresh_hours??24});
const selected=task=>!task.retired&&(!a.portal||task.portal===a.portal);
if(a.plan){console.log(JSON.stringify({version:2,sources:c.portals.length,taskCount:tasks.filter(selected).length,limits:{requests:Number.isFinite(maxRequests)?maxRequests:null,pagesPerTask:Number.isFinite(maxPages)?maxPages:null},tasks:tasks.filter(selected)},null,2));process.exit(0);}
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
async function persist(){
 await write(path.join(home,'search-queue.json'),tasks);
 await write(path.join(home,'discovered-sources.json'),[...registeredMap.values()]);
}
function registerSource(entry){
 if(!entry||sourceMap.has(entry.name))return;
 // The same ATS board may be observed under a different employer/source label.
 if(entry.provider&&[...sourceMap.values()].some(p=>p.provider===entry.provider&&(entry.provider==='greenhouse'?p.board_token===entry.board_token:entry.provider==='lever'?p.site===entry.site&&(p.region||'global')===(entry.region||'global'):false)))return;
 registeredMap.set(entry.name,entry);sourceMap.set(entry.name,entry);
 const extra=buildDiscoveryPlan({...c,portals:[entry],discovery:{...c.discovery,web_search:false}});
 for(const item of extra)if(!tasks.some(t=>t.id===item.id))tasks.push(item);
}
async function collect(rows,source,observation,{observedJob=true}={}){
 const accepted=[],log=getLog(source.name);log.found+=rows.length;
 for(const row of rows){
  const j=posting(row,source,observation.pageUrl||observation.url||row.url,{observedJob});
  if(!j){log.rejected++;report.rejected.push({portal:source.name,url:row.url||'',title:row.title||'',reason:'Not a published posting, invalid URL/title, or explicit source restriction'});continue;}
  try{publicUrl(j.url);}catch(e){log.rejected++;report.rejected.push({portal:source.name,url:j.url,reason:e.message});continue;}
  const signals=relevance(j,c,source);log.filtered+=signals.matches?1:0;log.review+=signals.matches?0:1;
  accepted.push({...j,discoverySignals:signals,discoveryDisposition:signals.matches?'candidate':'review',observations:[{...observation,source:source.name,url:j.url}]});
  registerSource(inferCareerSource(j.url));
 }
 if(accepted.length)await transaction(store=>{for(const job of accepted){const result=add(store,job);report[result.duplicate?'duplicates':'added'].push(result);}});
}
for(const j of imported){
 if(a.portal&&j.portal!==a.portal)continue;
 const source=sourceMap.get(j.portal)||{name:j.portal||new URL(j.url).hostname};
 await collect([j],source,{layer:'Import',file:path.resolve(a.import),url:j.sourceUrl||j.url,capturedAt:j.capturedAt||new Date().toISOString()});
}
for(const result of results){
 const task=tasks.find(t=>t.id===result.id);if(!selected(task))continue;
 Object.assign(task,{status:result.status,completed:result.status==='completed',evidence:result.evidence,finishedAt:result.capturedAt,updatedAt:new Date().toISOString()});
 if(result.cursor)task.cursor=result.cursor;
 if(result.status==='completed')delete task.cursor;
}
const credentials=new Map(),pagesThisRun=new Map(),usedCaptures=new Set();
const fetchPage=async(url,opts)=>{
 if(report.requests>=maxRequests)throw Object.assign(Error('Configured request budget reached'),{budget:true});
 report.requests++;return request(url,opts);
};
// Visit one page per task in each round, preserving the rest when budgets expire.
let progress=true;
while(progress&&!a['import-only']){
 progress=false;
 for(const task of [...tasks].sort((left,right)=>(Date.parse(left.updatedAt)||0)-(Date.parse(right.updatedAt)||0))){
  if(!selected(task)||task.completed||!['api','listing'].includes(task.kind))continue;
  const source=sourceMap.get(task.portal);if(source?.enabled===false)continue;if(!source){task.status='needs-agent';task.reason='source_not_configured';continue;}
  const pages=pagesThisRun.get(task.id)||0;
  if(pages>=maxPages){task.status='partial';task.reason='configured_page_budget';continue;}
  const currentUrl=task.cursor?.urls?.[0]||task.cursor?.url||task.url;
  const observed=captures.find(x=>(x.taskId===task.id||!x.taskId)&&(x.url===currentUrl||x.pageUrl===currentUrl)&&!usedCaptures.has(x));
  if(!observed&&['blocked','needs-agent'].includes(task.status))continue;
  // Offline replay never launches unrelated public requests.
  if(a['listing-capture']&&!observed)continue;
  if(!observed&&report.requests>=maxRequests){task.status='partial';task.reason='configured_request_budget';continue;}
  const log=getLog(source.name);
  try{
   let result;
   if(task.kind==='api')result=await readApiPage(source,task,{fetchPage,credentials:credentials.get(source.name)});
   else{
    if(observed){
     usedCaptures.add(observed);
     result={jobs:observed.links,status:200,finalUrl:observed.pageUrl||observed.url,nextUrls:(observed.nextUrls||[]).map(u=>new URL(u,observed.pageUrl||observed.url).href),paginationComplete:observed.paginationComplete,completionEvidence:observed.completionEvidence,blocked:observed.blocked===true};
    }else result=await listing(currentUrl,{portal:source,fetchPage});
    result.url=currentUrl;result.rowCount=result.jobs.length;
    Object.assign(result,listingNext(source,task,result));
    const remaining=(task.cursor?.urls||[]).slice(1);
    if(remaining.length){result.nextCursor={...(result.nextCursor||{}),urls:[...remaining,...(result.nextCursor?.urls||[])]};result.complete=false;}
    if(result.status<200||result.status>=300||result.blocked){result.complete=false;result.nextCursor=null;result.reason=`listing_access_${result.status||'blocked'}`;}
   }
   if(result.credentials)credentials.set(source.name,result.credentials);
   pagesThisRun.set(task.id,pages+1);progress=true;
   log.attempts.push({taskId:task.id,layer:observed?'AgentBrowser':task.kind==='api'?'API':'HTTP',url:result.url||task.url,page:result.page??task.cursor?.page??0,count:result.jobs.length,reason:result.reason});
   await collect(result.jobs,source,{taskId:task.id,query:task.query,location:task.location,layer:observed?'AgentBrowser':task.kind==='api'?'API':'HTTP',url:currentUrl,pageUrl:result.finalUrl||currentUrl,capturedAt:observed?.capturedAt||new Date().toISOString()},{observedJob:task.kind==='api'});
   const signature=hash(JSON.stringify(result.jobs.map(j=>j.url).sort()));
   const repeated=result.jobs.length&&(task.seenPages||[]).includes(signature)&&observed?.paginationComplete!==true;
   task.seenPages=[...new Set([...(task.seenPages||[]),signature])];
   task.cursor=result.nextCursor;task.completed=!!result.complete&&!repeated;task.reason=repeated?'repeated_page':result.reason;
   task.status=task.completed?'completed':result.nextCursor&&!repeated?'partial':'needs-agent';
   task.updatedAt=new Date().toISOString();if(task.completed)task.finishedAt=task.updatedAt;
   if(repeated)task.cursor=null;
   if(task.kind==='api'&&!task.completed&&!task.cursor){
    const fallback={kind:'web-search',portal:task.portal,parentTaskId:task.id,url:task.url,query:[source.search_domain?`site:${source.search_domain}`:'',task.query,task.location].filter(Boolean).join(' ')||task.url,reason:task.reason,status:'pending',completed:false};fallback.id=taskId(fallback);
    if(!tasks.some(x=>x.id===fallback.id))tasks.push(fallback);
   }
   for(const entry of result.careerSources||[])registerSource(entry);
   await persist();
  }catch(e){
   task.status=e.budget?'partial':'needs-agent';task.reason=e.message;task.updatedAt=new Date().toISOString();
   log.attempts.push({taskId:task.id,layer:task.kind==='api'?'API':'HTTP',url:currentUrl,error:e.message});await persist();
  }
 }
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
await transaction(store=>{store.scans.push(report);store.scans=store.scans.slice(-100);});
await write(path.join(home,'last-scan.json'),report);
await write(path.join(home,'scan-agent-task.md'),`Read search-queue.json and the Skill workflow discover-jobs.md. Handle every pending web-search/career-discovery task and listing/API task needing Agent access. Use IAB for actual website pages; use Agent WebSearch for open-web search. API success does not complete other tasks. Follow actual next pages/load-more until observed end; capture pagination URLs. Import arbitrary published detail links with scan --import FILE --import-only. Add employer career sites with scan --sources FILE. Replay observed lists with scan --listing-capture FILE. Persist outcomes with scan --task-results FILE --import-only (id, status: completed/partial/blocked, capturedAt, evidence, optional cursor). Do not mark partial or blocked searches completed. Keep predictions, training advertisements and search summaries separate from published vacancies; full JD/liveness and candidate gates belong to process-job.md. Configured budgets preserve pending tasks; scan --resume continues them. Pending tasks: ${report.coverage.pending}.\n`);
await exportList();console.log(JSON.stringify(report,null,2));
}finally{if(scanLock){await scanLock.close();await fs.unlink(lockPath);}}
