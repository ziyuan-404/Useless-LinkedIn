import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {read,write,transaction} from './core.mjs';
import {triageOne} from './discovery-triage.mjs';
import {root,toolsRoot} from '../runtime.mjs';
import {normalizeUrl} from './job-signals.mjs';
import {validatePostingLink,applyPostingLinks} from './posting-identity.mjs';
import {observedCapture} from './research-evidence.mjs';
import {postingRequirements} from './job-requirements.mjs';
export async function recordResearch(home,config,configFile,input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['version','imports','tasks','captures','decisions','links','taskBatch','constraintReviews'].includes(k)))throw Error('Record expects version/imports/tasks/captures/decisions/links/taskBatch/constraintReviews');
 if(input.version!==undefined&&input.version!==1)throw Error('Unsupported research record version');
 for(const key of ['imports','tasks','captures','decisions','links','constraintReviews'])if(input[key]!==undefined&&!Array.isArray(input[key]))throw Error(key+' must be an array');
 let store=await read(path.join(home,'leads.json'),{jobs:[]});const tasks=await read(path.join(home,'search-queue.json'),[]),hashes=[];
 const findJob=item=>item.id?store.jobs.find(j=>j.id===item.id):store.jobs.find(j=>normalizeUrl(j.url)===normalizeUrl(item.url));
 for(const item of [...(input.captures||[]),...(input.decisions||[])]){
  if(!(findJob(item)||!item.id&&item.url&&(input.imports||[]).some(j=>normalizeUrl(j.url)===normalizeUrl(item.url)))||!item.captureFile)throw Error('Unknown lead or missing captureFile');
  const file=await fs.realpath(path.resolve(root,item.captureFile));if(!file.startsWith(await fs.realpath(root)+path.sep))throw Error('Capture must be within workspace');hashes.push(createHash('sha256').update(await fs.readFile(file)).digest('hex'));
 }
 for(const t of input.tasks||[])if(!tasks.some(q=>q.id===t.id&&!q.retired)||!['completed','partial','blocked'].includes(t.status)||!t.evidence?.trim()||!Number.isFinite(Date.parse(t.capturedAt))||Math.abs(Date.now()-Date.parse(t.capturedAt))>86400000)throw Error('Task results require a current task ID, observed evidence and recent timestamp');
 let taskBatch;
 if(input.taskBatch){
  const taskFile=await fs.realpath(path.resolve(root,input.taskBatch));if(!taskFile.startsWith(await fs.realpath(path.join(home,'research-task-batches'))+path.sep))throw Error('Use the taskBatch returned by research --tasks');
  taskBatch=await read(taskFile);for(const t of taskBatch.tasks){const result=input.tasks?.find(x=>x.id===t.id);if(!result||result.query!==t.query||result.status==='completed'&&!result.endCondition?.trim())throw Error('Task batch requires every issued task, its exact query, observation and completed endCondition');}
 }
 for(const link of input.links||[])hashes.push(createHash('sha256').update(await fs.readFile(path.resolve(root,link.evidenceFile))).digest('hex'));
 const reviews=[];for(const item of input.constraintReviews||[]){
  const job=findJob(item);if(!job||!item.interpretation?.trim())throw Error('Constraint review needs a known id, groupId, quote and interpretation');
  const captureFile=item.captureFile||job.triage?.captureFile,captured=await observedCapture(root,home,job,{captureFile,cached:true});
  const clause=postingRequirements(job,captured.jd).clauses.find(c=>c.groupId===item.groupId&&(!item.quote||c.quote===item.quote));if(!clause)throw Error('Constraint review must reference the exact extracted source clause');
  if(item.interpretation.length>600)throw Error('Constraint interpretation must be concise (max 600 characters)');
  const file=await fs.realpath(path.resolve(root,captureFile)),sha256=createHash('sha256').update(await fs.readFile(file)).digest('hex');hashes.push(sha256);reviews.push({...item,quote:clause.quote,sourceFile:file,sourceSha256:sha256,reviewedAt:new Date().toISOString(),candidateDecision:false});
 }
 const key=createHash('sha256').update(JSON.stringify([2,input,hashes,config])).digest('hex'),file=path.join(home,'research-records',key+'.json'),previous=await read(file);
 if(previous?.complete)return {...previous,reused:true,file};
 const results=[];
 const run=async(tool,data,flag)=>{const inputFile=path.join(home,'research-records',key+'-'+flag+'.json');await write(inputFile,data);const p=spawnSync(process.execPath,[path.join(toolsRoot,tool+'.mjs'),'--config',configFile,'--summary',flag,inputFile,'--import-only'],{encoding:'utf8',maxBuffer:2e6});if(p.status!==0)throw Error((p.stderr||p.stdout).slice(-1000));return JSON.parse(p.stdout);};
 let importedIdsFile;
 if(input.imports?.length){
  results.push({kind:'imports',result:await run('scan',input.imports,'--import')});store=await read(path.join(home,'leads.json'),{jobs:[]});
  importedIdsFile=path.join(home,'research-records',key+'-ids.json');await write(importedIdsFile,[...new Set(input.imports.map(item=>findJob(item)?.id).filter(Boolean))]);
 }
 const links=[];for(const item of input.links||[])links.push(await validatePostingLink(root,store.jobs,item));
 const staged=structuredClone(store);applyPostingLinks(staged.jobs,links);
 // Validate the entire evidence batch before alias or triage writes.
 for(const [kind,items] of [['captures',input.captures||[]],['decisions',input.decisions||[]]])for(const item of items){
  const job=item.id?staged.jobs.find(j=>j.id===item.id):staged.jobs.find(j=>normalizeUrl(j.url)===normalizeUrl(item.url));
  if(job.submitted||job.historyMatch||['submitting','submission-unconfirmed'].includes(job.state))throw Error('Existing application requires reconciliation, not discovery overwrite');
  await observedCapture(root,home,job,item,kind==='decisions'?item:undefined);
 }
 if(links.length){await transaction(s=>applyPostingLinks(s.jobs,links));results.push({kind:'links',recorded:links.length});store=await read(path.join(home,'leads.json'));}
 if(reviews.length){await transaction(s=>{s.constraintReviews={...(s.constraintReviews||{}),...Object.fromEntries(reviews.map(r=>[r.groupId,r]))};});results.push({kind:'constraintReviews',recorded:reviews.length});}
 for(const [kind,items] of [['captures',input.captures||[]],['decisions',input.decisions||[]]])for(const item of items){
  const job=findJob(item);if(!job)throw Error('Imported lead not found');
  if(job.submitted||job.historyMatch||['submitting','submission-unconfirmed'].includes(job.state))throw Error('Existing application requires reconciliation, not discovery overwrite');
  const result=await triageOne(job,config,kind==='decisions'?{decision:item}:{observedCapture:item});results.push({kind,id:job.id,status:result.status});
 }
 // Completion is recorded only after all supplied JD observations validate successfully.
 if(input.tasks?.length)results.push({kind:'tasks',result:await run('scan',input.tasks,'--task-results')});
 if(taskBatch){await write(path.resolve(root,input.taskBatch),{...taskBatch,closed:true,recordedAt:new Date().toISOString()});}
 const report={complete:true,reused:false,recorded:results.length,importedIdsFile,results,recordedAt:new Date().toISOString()};await write(file,report);return {...report,file};
}
