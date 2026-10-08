import path from 'node:path';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {args,root,toolsRoot} from './runtime.mjs';
import {home,read,write,config,exportList} from './lib/core.mjs';
import {jobDirectory} from './lib/storage-paths.mjs';
import {verifiedCapture,requirementHints} from './lib/work-packets.mjs';
import {researchScope,researchConfig,researchLane,researchQueue,researchPage,actionable} from './lib/research-queue.mjs';
import {checkApplicationHistory} from './lib/application-history.mjs';
import {recordResearch} from './lib/research-record.mjs';
import {relevance} from './lib/discovery-plan.mjs';
import {buildDiscoveryPlan,taskId} from './lib/discovery-plan.mjs';
import {acquireFileLock} from './lib/file-lock.mjs';
import {postingRequirements,requirementGroups} from './lib/job-requirements.mjs';
const a=args();if(a.help){console.log('research [--run | --screen-only] [--config FILE] [--scope FILE] [--ids FILE] [--continue MANIFEST] [--resume] [--include-unmatched] [--limit 10] [--offset N] [--concurrency 4] [--max-requests 40] [--triage-requests 40] [--no-browser]\nresearch --plan --manifest MANIFEST\nresearch --tasks --manifest MANIFEST [--limit 5] [--query EXACT_QUERY]\nresearch --capture --id ID --file CAPTURE [--cached] --manifest MANIFEST\nresearch --link ROUTE_EVIDENCE --manifest MANIFEST\nresearch --record FILE --manifest MANIFEST\nTemplates bind issued queries; completed needs endCondition. Cached captures require unchanged registered hashes. Identity links never copy submission state. Read handoff/current full JD; wait 30-60 seconds, do not read runtime or preload later modules.');process.exit(0);}
async function main(){
const previousFile=a.continue||a.manifest,previous=previousFile?await read(path.resolve(root,previousFile)):null;
if(previousFile&&!previous)throw Error('Research manifest not found');
const previousQueue=previous?.queueFile?await read(path.resolve(root,previous.queueFile)):null;
if(a.continue&&(!previous||!Array.isArray(previousQueue?.ids)||!previous.scope))throw Error('Continue requires a scoped research manifest');
const settings=await config(a.config||previous?.configFile||(previousFile?path.join(path.dirname(path.resolve(root,previousFile)),'triage-config.json'):undefined));
const scopeInput=a.scope?await read(path.resolve(root,a.scope)):previous?.scope;
if(a.scope&&!scopeInput)throw Error('Scope file not found');
const scope=researchScope(settings,scopeInput);
if(a.continue&&a.scope&&JSON.stringify(scope)!==JSON.stringify(previous.scope))throw Error('A changed scope needs a new research queue; do not continue the old cursor');
const effective=researchConfig(settings,scope,{targeted:!!a.scope||!!previous?.targeted||!!settings.research_targeted});
if(a.plan){console.log(JSON.stringify({status:previous?.nextOffset===null?'queue-exhausted':'ready',version:previous?.version||null,waitMs:60000,read:['references/research-handoff.md'],next:previous?.nextOffset!==null&&previousFile?`research --continue "${path.resolve(root,previousFile)}"`:previousFile?`research --tasks --manifest "${path.resolve(root,previousFile)}" --limit 5`:'research --run --scope FILE --zero-token --limit 10',instruction:'Follow only this stage. Do not read runtime/schema or preload materials. CLI produces record templates and gate drafts.'}));return;}
const taskBatches=previous?.taskBatches||[];
if(previous&&!a.tasks&&!a.record&&!a.capture&&!a.link){const open=[];for(const file of taskBatches){const batch=await read(file,null);if(batch&&!batch.closed)open.push({file,recordTemplate:batch.recordTemplate});}if(open.length){console.log(JSON.stringify({status:'task-results-required',batches:open,next:`research --record "${open[0].recordTemplate}" --manifest "${path.resolve(root,previousFile)}"`,instruction:'Record completed/partial/blocked observations for every issued query before continuing. Do not invent completion.'}));return;}}
if(a.tasks){
 if(!previous)throw Error('--tasks requires --manifest');
 const current=await read(path.join(home,'search-queue.json'),[]),planned=buildDiscoveryPlan(effective),plannedIds=new Set(planned.flatMap(t=>[t.id,t.legacyId]));
 const snapshot=previous.tasksFile?await read(previous.tasksFile,[]):current.filter(t=>plannedIds.has(t.id)||t.temporary&&plannedIds.has(t.parentTaskId));
 let queryId;
 if(a.query!==undefined){
  if(typeof a.query!=='string'||!a.query.trim())throw Error('--query needs an exact nonempty search query');
  for(const file of taskBatches){const batch=await read(file,null);if(batch&&!batch.closed){console.log(JSON.stringify({status:'task-results-required',tasks:batch.tasks,taskBatch:file,recordTemplate:batch.recordTemplate,record:`research --record "${batch.recordTemplate}" --manifest "${path.resolve(root,previousFile)}"`}));return;}}
  const parent=current.find(t=>plannedIds.has(t.id)&&!t.retired&&['web-search','career-discovery'].includes(t.kind));if(!parent)throw Error('A temporary query needs an active scoped web discovery task; enable Open Web in the search scope first');
  const query={kind:'web-search',portal:'Open Web',query:a.query.trim(),location:'',parentTaskId:parent.id,sourceSignature:'temporary:'+parent.id,temporary:true,status:'pending',completed:false};query.id=taskId(query);queryId=query.id;
  const lock=await acquireFileLock(path.join(home,'.scan.lock'));try{const live=await read(path.join(home,'search-queue.json'),[]),existing=live.find(t=>t.id===query.id);if(!existing)live.push(query);else if(existing.retired)Object.assign(existing,query);await write(path.join(home,'search-queue.json'),live);if(!snapshot.some(t=>t.id===query.id))snapshot.push(existing||query);if(previous.tasksFile)await write(previous.tasksFile,snapshot);current.splice(0,current.length,...live);}finally{await lock.close();}
 }
 const byId=new Map(current.map(t=>[t.id,t]));
 const unresolvedTasks=snapshot.map(t=>byId.get(t.id)||t).filter(t=>!t.retired&&!['completed','standby'].includes(t.status));
 const deferredTask=t=>t.failureClass==='credentials-missing'||/API credentials missing/.test(t.reason||'')||Date.parse(t.nextRetryAt||'')>Date.now();
 const candidates=unresolvedTasks.filter(t=>!deferredTask(t)&&(!queryId||t.id===queryId)),groups=new Map();for(const t of candidates){const key=(['Open Web','Company Careers'].includes(t.portal)?'0': ['web-search','career-discovery'].includes(t.kind)?'1':'2')+'|'+t.portal;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(t);}const tasks=[];const ordered=[...groups.entries()].sort(([a],[b])=>a.localeCompare(b));while(ordered.some(([,v])=>v.length))for(const [,v] of ordered)if(v.length)tasks.push(v.shift());
 const limit=Number(a.limit??5),offset=Number(a.offset??0);researchPage([],[],{limit,offset});
 for(const file of taskBatches){const batch=await read(file,null);if(batch&&!batch.closed){console.log(JSON.stringify({status:'task-results-required',tasks:batch.tasks,taskBatch:file,recordTemplate:batch.recordTemplate,total:tasks.length,deferred:unresolvedTasks.filter(deferredTask).length,record:`research --record "${batch.recordTemplate}" --manifest "${path.resolve(root,previousFile)}"`}));return;}}
 const issued=tasks.slice(offset,offset+limit).map(t=>({id:t.id,portal:t.portal,kind:t.kind,query:t.query||'',url:t.url,status:t.status,reason:t.reason,nextRetryAt:t.nextRetryAt}));let taskBatch,recordTemplate;
 if(issued.length){taskBatch=path.join(home,'research-task-batches',randomUUID()+'.json');recordTemplate=taskBatch.replace(/\.json$/,'-record.json');await write(taskBatch,{tasks:issued,closed:false,recordTemplate,issuedAt:new Date().toISOString()});await write(recordTemplate,{version:1,taskBatch,tasks:issued.map(t=>({id:t.id,query:t.query,status:'partial',capturedAt:'',evidence:'',endCondition:''}))});await write(path.resolve(root,previousFile),{...previous,taskBatches:[...taskBatches,taskBatch]});}
 console.log(JSON.stringify({tasks:issued,taskBatch,recordTemplate,total:tasks.length,deferred:unresolvedTasks.filter(deferredTask).length,remaining:Math.max(0,tasks.length-offset-limit),nextOffset:offset+limit<tasks.length?offset+limit:null,record:`research --record "${recordTemplate||'FILE'}" --manifest "${path.resolve(root,previousFile)}"`,instruction:'Search exactly the issued queries. Fill every observation in recordTemplate; completed requires an observed endCondition. Unsearched tasks stay partial/blocked, never completed.'}));process.exit(0);
}
const runDir=path.join(home,'research',randomUUID()),configFile=path.join(runDir,'config.json');await write(configFile,effective);
if(a.record||a.capture||a.link){const input=a.record?await read(path.resolve(root,a.record)):a.link?{links:[{evidenceFile:a.link}]}:{captures:[{id:a.id,captureFile:a.file,cached:!!a.cached}]};const report=await recordResearch(home,effective,configFile,input);await exportList();console.log(JSON.stringify({report:report.file,complete:report.complete,reused:report.reused,recorded:report.recorded,importedIdsFile:report.importedIdsFile}));process.exit(0);}
const limit=Number(a.limit??previous?.limit??10),offset=Number(a.offset??(a.continue?previous.nextOffset:0));
if(a.continue&&previous.nextOffset===null&&a.offset===undefined){console.log(JSON.stringify({status:'queue-exhausted',remaining:0,next:`research --tasks --manifest "${path.resolve(root,previousFile)}" --limit 5`,instruction:'No next batch. Do not restart the queue or broaden scope without a new task.'}));return;}
researchPage([],[],{limit,offset});
const flags=['--config',configFile,...(a['no-browser']||previous?.noBrowser?['--no-browser']:[])];const stages=[];
function run(tool,options){const p=spawnSync(process.execPath,[path.join(toolsRoot,tool+'.mjs'),...options],{encoding:'utf8',maxBuffer:2e6});if(p.status!==0)throw Error(tool+': '+(p.stderr||p.stdout).slice(-1000));stages.push({tool,result:JSON.parse(p.stdout)});}
// Existing network budgets, robots, retries, pagination and journals remain authoritative.
if(a.run)run('scan',[...flags,'--summary','--zero-token','--concurrency',String(a.concurrency??4),'--max-requests',String(a['max-requests']??40),...(a.resume?['--resume']:[])]);
let store=await read(path.join(home,'leads.json'),{jobs:[]});
const explicitIds=a.ids?await read(path.resolve(root,a.ids)):undefined;
const selected=a.continue?previousQueue:researchQueue(store.jobs,scope,{ids:explicitIds,includeUnmatched:!!a['include-unmatched']});
const history=await checkApplicationHistory(root,store.jobs,{ids:[...new Set([...selected.ids,...store.jobs.filter(j=>!actionable(j)&&(!scope.role_keywords.length||relevance(j,scope).roleHits.length)).map(j=>j.id)])]});
const existing=new Set(history.filter(h=>h.disposition==='existing-application').map(h=>h.id)),historyFile=path.join(runDir,'history.json');await write(historyFile,history);
const reconcileIds=path.join(runDir,'reconcile-ids.json');await write(reconcileIds,history.filter(h=>h.receiptStatus==='needs-reconciliation').map(h=>h.id));
const historySummary={consistent:history.filter(h=>h.receiptStatus==='consistent').length,needsReconciliation:history.filter(h=>h.receiptStatus==='needs-reconciliation').length,reconcileIds};
const idsFile=path.join(runDir,'ids.json');
await write(idsFile,selected.ids);await write(path.join(runDir,'deferred-ids.json'),selected.deferredIds);
const queueFile=path.join(runDir,'queue.json');await write(queueFile,selected);
const scopeFile=path.join(runDir,'scope.json');await write(scopeFile,scope);
const triageConfig=configFile,triageIds=path.join(runDir,'triage-ids.json');await write(triageIds,selected.ids.slice(offset,offset+limit).filter(id=>!existing.has(id)));
if(a.run||a['screen-only']||a.continue){
 run('triage',['--config',triageConfig,...(a['no-browser']||previous?.noBrowser?['--no-browser']:[]),'--run','--include-candidates','--reuse-unresolved','--summary','--max-requests',String(a['triage-requests']??40),'--ids',triageIds,...(a['retry-agent']?['--retry-agent']:[])]);
 store=await read(path.join(home,'leads.json'),{jobs:[]});
}
const unresolved=store.jobs.filter(actionable),page=researchPage(store.jobs,selected.ids,{limit,offset}),cards=[];
for(const job of page.items.filter(j=>!existing.has(j.id))){
 const dir=await jobDirectory(root,home,job),verified=await verifiedCapture(root,job,dir);
 const jdFile=verified?path.join(runDir,job.id+'-jd.txt'):null;if(jdFile)await write(jdFile,verified.capture.jd);
 const hints=verified?Object.fromEntries(Object.entries(requirementHints(verified.capture.jd)).map(([key,quotes])=>[key,quotes.slice(0,1).map(q=>({...q,quote:q.quote.slice(0,180)}))])):{};
 const requirements=postingRequirements(job,verified?.capture.jd||'');for(const clause of requirements.clauses){const review=store.constraintReviews?.[clause.groupId];if(review)try{if(createHash('sha256').update(await fs.readFile(review.sourceFile)).digest('hex')===review.sourceSha256)clause.review={interpretation:review.interpretation,sourceId:review.id,candidateDecision:false};}catch{/* Changed/missing source requires review. */}}
 const requirementsFile=path.join(runDir,job.id+'-requirements.json');await write(requirementsFile,requirements);requirements.file=requirementsFile;requirements.clauses=requirements.clauses.map(c=>({...c,quote:c.quote.slice(0,200)}));
 cards.push({id:job.id,company:job.company,title:job.title,url:job.url,lane:researchLane(job,scope),state:job.state,disposition:job.discoveryDisposition,triage:job.triage?.status||'pending',nextRetryAt:job.triage?.nextRetryAt,liveness:verified?.capture.liveness||job.liveness||{result:'unknown'},fullJd:jdFile,captureFile:verified?.file,captureHash:verified?.sha256,hints,requirements,recordCapture:verified?`research --capture --id ${job.id} --file "${verified.file}" --cached --manifest "${path.join(runDir,'manifest.json')}"`:null,duplicateReview:history.find(h=>h.id===job.id)?.disposition==='possible-duplicate',next:verified?.capture.liveness?.result==='active'?'Read fullJd; then batch assess; edit generated gate-draft.json rather than copying another company gate.':'Verify only missing posting evidence; use capture/link commands, never infer PASS.'});
}
const queues=(await read(path.join(home,'search-queue.json'),[])).filter(t=>!t.retired),counts={total:store.jobs.length,candidate:store.jobs.filter(j=>j.discoveryDisposition==='candidate').length,excluded:store.jobs.filter(j=>j.triage?.status==='excluded').length,closed:store.jobs.filter(j=>j.state==='expired').length,unresolved:unresolved.length};
const tasksFile=path.join(runDir,'tasks.json');await write(tasksFile,queues);
const sourceIssues=Object.values(queues.filter(t=>['blocked','needs-agent','retry-wait'].includes(t.status)).reduce((r,t)=>{const key=t.status+'|'+t.reason,item=r[key]??={status:t.status,reason:t.reason,count:0};item.count++;return r;},{}));
const batchIds=path.join(runDir,'batch-ids.json');await write(batchIds,cards.map(c=>c.id));
const manifest=path.join(runDir,'manifest.json');await write(manifest,{version:3,createdAt:new Date().toISOString(),configFile,targeted:!!effective.research_targeted,limit,noBrowser:!!(a['no-browser']||previous?.noBrowser),historyFile,historySummary,historyCounts:history.reduce((r,h)=>(r[h.disposition]=(r[h.disposition]||0)+1,r),{}),tasksFile,sourceIssues,lanes:Object.fromEntries(Object.entries(selected.lanes||{}).map(([key,values])=>[key,values.length])),scope,queueFile,deferred:selected.deferredIds.length,idsFile,batchIds,stages,counts,scanner:{modelFree:true,used:!!a.run,concurrency:Number(a.concurrency??4)},coverage:queues.reduce((r,t)=>(r[t.status]=(r[t.status]||0)+1,r),{}),cards,remaining:page.remaining,nextOffset:page.nextOffset,executionPolicy:{reconcile:historySummary.needsReconciliation?'leads --ids "'+reconcileIds+'" --check-history --limit 5':null,discoveryNext:queues.some(q=>['pending','partial','retry-wait'].includes(q.status))?`research --run --resume --manifest "${manifest}" --scope "${scopeFile}" --config "${triageConfig}"`:null,tasks:`research --tasks --manifest "${manifest}" --limit 5`,record:`research --record FILE --manifest "${manifest}"`,first:'Continue the stable current batch before discovery or web fallback.',fallback:'Only named unresolved tasks/postings need Agent. Save observed full JD/decisions and task completion through record. Do not read runtime source during normal operation.',next:page.nextOffset===null?null:`research --continue "${manifest}"`,assess:`batch --stage assess --ids "${batchIds}"`,company:`company --plan --ids "${batchIds}"`},instructions:'Hints are retrieval excerpts, never eligibility evidence. Full evidence and all queues stay on disk. Read only current cards and necessary full JDs. History receipts are checked locally; hash consistency does not independently prove success. Conflict/unmatched leads remain deferred; unknown contracts remain reviewable. Continue this queue before another broad search. No chat context is automatically cleared.'});
const saved=await read(manifest),handoff=path.join(runDir,'handoff.json');
await write(handoff,JSON.stringify({manifest,cards,constraintGroups:requirementGroups(cards),waitMs:60000,read:['references/research-handoff.md'],remaining:page.remaining,deferred:selected.deferredIds.length,history:{consistent:historySummary.consistent,needsReconciliation:historySummary.needsReconciliation,next:saved.executionPolicy.reconcile},sourceIssues,executionPolicy:saved.executionPolicy,instructions:'Read only current fullJd files and necessary candidate facts. Use generated gate drafts and task record templates. Record every manual task/JD result; no runtime/schema reading, future-module preload, repeated full browser state or short polling. Files do not clear chat; independent stage sessions require explicit user creation.'}));
console.log(JSON.stringify({manifest,handoff,counts,count:cards.length,deferred:selected.deferredIds.length,remaining:page.remaining,nextOffset:page.nextOffset,scanner:{modelFree:true,used:!!a.run},stages:stages.map(x=>x.result)}));
}
await main().catch(async error=>{
 const diagnostic=path.join(home,'research-errors',randomUUID()+'.json');
 await write(diagnostic,{message:error.message,code:error.code,field:error.field,at:new Date().toISOString(),action:error.action||'Use research --plan --manifest FILE or references/research-handoff.md; preserve unresolved coverage. Do not guess internal source paths.'});
 console.error(JSON.stringify({error:error.message.slice(0,800),code:error.code,field:error.field,action:error.action||'Use research --plan or the generated input template.',diagnostic}));process.exitCode=1;
});
