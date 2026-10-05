import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {args,root,toolsRoot} from './runtime.mjs';
import {home,read,write,hash} from './lib/core.mjs';
import {jobDirectory} from './lib/storage-paths.mjs';
import {selectLeads,verifiedCapture} from './lib/work-packets.mjs';
import {loadBlacklist,blacklistMatch} from './lib/blacklist.mjs';
import {evaluationDefaults,buildEvaluationPrompt,callEvaluationModel,parseModelJson,validateModelEvaluation} from './lib/model-evaluation.mjs';
import {failureDisposition} from './lib/discovery-policy.mjs';
const a=args();if(a.help){console.log('evaluate --plan|--run [--ids FILE | --id ID] [--backend ollama|gemini|openai|openrouter|openai-compatible] [--model NAME] [--base-url URL] [--limit 10] [--retry] [--config FILE]\nDraft A–G/KO assessment; bounded calls, source validation, cache and metrics. No materials, approvals or submissions.');process.exit(0);}
const defaultsByBackend={ollama:'http://127.0.0.1:11434',gemini:'https://generativelanguage.googleapis.com/v1beta',openai:'https://api.openai.com/v1',openrouter:'https://openrouter.ai/api/v1'};
const saved=await read(path.join(root,'个人资料/operations/evaluation.json'),{}),settings={...evaluationDefaults,...saved};
if(a.backend){settings.backend=a.backend;if(!a['base-url'])settings.base_url=defaultsByBackend[a.backend]||settings.base_url;}
if(a.model)settings.model=a.model;if(a['base-url'])settings.base_url=a['base-url'];
if(a.doctor){
 const keyName=settings.api_key_env||(settings.backend==='gemini'?'GEMINI_API_KEY':settings.backend==='openrouter'?'OPENROUTER_API_KEY':'OPENAI_API_KEY');let serviceReady=null,models=[];
 if(settings.backend==='ollama'){
  const base=new URL(settings.base_url);if(!['127.0.0.1','localhost','[::1]'].includes(base.hostname))throw Error('Doctor only probes local Ollama');
  try{const response=await fetch(base.href.replace(/\/$/,'')+'/api/tags',{signal:AbortSignal.timeout(2500),redirect:'error'});serviceReady=response.ok;if(response.ok)models=(await response.json()).models?.map(x=>x.name)||[];}catch{serviceReady=false;}
 }
 console.log(JSON.stringify({backend:settings.backend,model:settings.model,serviceReady,availableModels:models,credentialConfigured:settings.backend==='ollama'?null:!!process.env[keyName],ready:settings.backend==='ollama'?serviceReady&&models.includes(settings.model):!!settings.model&&!!process.env[keyName],calls:0}));process.exit(0);
}
if(!a.plan&&!a.run)throw Error('Choose --plan or --run, or use --doctor');
for(const key of ['max_calls_per_run','max_prompt_bytes','max_output_tokens','timeout_ms'])if(!Number.isInteger(settings[key])||settings[key]<1)throw Error('Invalid evaluation budget: '+key);
if(a.run){const history=spawnSync(process.execPath,[path.join(toolsRoot,'tracker.mjs'),'--history'],{encoding:'utf8'});if(history.status!==0)throw Error('Evaluation history check failed');}
const store=await read(path.join(home,'leads.json'),{jobs:[]}),ids=a.ids?await read(path.resolve(root,a.ids)):undefined;
const candidates=ids||a.id?store.jobs:store.jobs.filter(j=>!j.submitted&&!j.historyMatch&&j.triage?.status==='candidate'&&['discovered','awaiting-agent','needs-decision'].includes(j.state));
const page=selectLeads(candidates,{id:a.id,ids,limit:Number(a.limit??10),offset:Number(a.offset??0)}),runDir=path.join(home,'evaluations',randomUUID()),items=[],blacklist=await loadBlacklist();let calls=0,reused=0;
for(const job of page.items){
 const item={id:job.id};items.push(item);
 try{
  if(job.submitted||job.historyMatch||['submitted','expired','rejected','approved','submitting','materials-pending-review','review-required'].includes(job.state)){item.deferred='ineligible workflow state';continue;}
  if(blacklistMatch(job,blacklist)){item.deferred='blacklisted';continue;}
  const dir=await jobDirectory(root,home,job),verified=await verifiedCapture(root,job,dir);
  if(verified?.capture.liveness?.result!=='active'){item.deferred='fresh active complete JD required';continue;}
  let context=await read(path.join(dir,'context.json'),null);
  if(!context||context.captured.jd!==verified.capture.jd){
   if(!a.run){item.ready=true;item.next='pipeline prepares sourced context before one model call';continue;}
   const prepared=spawnSync(process.execPath,[path.join(toolsRoot,'pipeline.mjs'),'--id',job.id,...(a.config?['--config',a.config]:[]),'--no-browser'],{encoding:'utf8',maxBuffer:2e6});
   if(prepared.status!==0)throw Error('Pipeline context preparation failed');context=await read(path.join(dir,'context.json'),null);if(!context)throw Error('Pipeline did not produce evaluable context');
  }
  const currentSources={};for(const file of Object.keys(context.sources))currentSources[file]=await fs.readFile(path.resolve(root,file),'utf8');
  if(context.contextHash!==hash(JSON.stringify({jd:verified.capture.jd,sources:currentSources})))throw Error('Evaluation context is stale; refresh pipeline');
  context={...context,history:{verified:true,duplicate:job.possibleDuplicates?.length&&!job.duplicateResolution?'unresolved possible duplicate':job.historyMatch||job.submitted?'known application':'no known application found in pipeline history check'}};
  const prompt=await buildEvaluationPrompt(context,settings),cacheFile=path.join(home,'evaluation-cache',prompt.key+'.json'),cached=await read(cacheFile,null);
  item.contextHash=context.contextHash;item.promptBytes=prompt.bytes;item.ready=true;
  if(!a.run)continue;
  if(cached&&cached.sha256===hash(JSON.stringify(cached.envelope))){
   try{await validateModelEvaluation(cached.envelope,{context,dir});item.file=cacheFile;item.reused=true;item.score=cached.envelope.assessment.priority??null;item.reviewRequired=true;reused++;continue;}catch{}
  }
  const failureFile=path.join(home,'evaluation-retries',prompt.key+'.json'),previous=await read(failureFile,null);
  if(!a.retry&&Date.parse(previous?.nextRetryAt||'')>Date.now()){item.deferred='model retry waiting';item.nextRetryAt=previous.nextRetryAt;continue;}
  if(calls>=settings.max_calls_per_run){item.deferred='model call budget reached';continue;}
  calls++;let response;
  try{
   response=await callEvaluationModel(prompt,settings);await write(path.join(runDir,job.id+'-raw.json'),response);
   const envelope=parseModelJson(response.text);envelope.assessment.evaluation={backend:settings.backend,model:settings.model,reviewRequired:true};await validateModelEvaluation(envelope,{context,dir});
   await write(cacheFile,{key:prompt.key,envelope,sha256:hash(JSON.stringify(envelope)),metrics:response.usage,createdAt:new Date().toISOString(),reviewRequired:true});
   item.file=cacheFile;item.score=envelope.assessment.priority??null;item.recommendation=envelope.assessment.ko.status!=='PASS'?'review-knockout':item.score===null?'review-unscored':item.score>=settings.precision_min_score?'precision':item.score>=settings.review_min_score?'bulk-or-review':'skip-after-review';item.reviewRequired=true;item.usage=response.usage;item.latencyMs=response.latencyMs;
   await write(failureFile,{resolvedAt:new Date().toISOString()});
  }catch(error){const failure=failureDisposition(error,{attempt:(previous?.attempts||0)+1});await write(failureFile,{...failure,attempts:(previous?.attempts||0)+1});throw error;}
 }catch(error){item.error=error.message;item.reviewRequired=true;}
}
const manifest=path.join(runDir,'manifest.json');await write(manifest,{version:1,backend:settings.backend,model:settings.model,createdAt:new Date().toISOString(),items,calls,reused,remaining:page.remaining,nextOffset:page.nextOffset,instructions:'All model results are drafts. Read evidence matrix and current source files, then save reviewed assessment via pipeline --assessment FILE --defer-materials. No model result changes application state or qualifies as approval.'});
console.log(JSON.stringify({manifest,backend:settings.backend,model:settings.model,count:items.length,calls,reused,ready:items.filter(i=>i.ready).length,deferred:items.filter(i=>i.deferred).length,errors:items.filter(i=>i.error).length,remaining:page.remaining,nextOffset:page.nextOffset}));
