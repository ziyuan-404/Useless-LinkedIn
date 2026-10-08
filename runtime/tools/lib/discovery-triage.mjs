import path from 'node:path';
import {home,request,extract,read,write,hash,transaction,normalizeUrl} from './core.mjs';
import {root} from '../runtime.mjs';
import {relevance} from './discovery-plan.mjs';
import {createDiscoveryFetcher,httpFailure,failureDisposition} from './discovery-policy.mjs';
import {renderListing} from './rendered-listing.mjs';
import {assertTransition} from './state-machine.mjs';
import fs from 'node:fs/promises';
import {acquireFileLock} from './file-lock.mjs';
import {observedCapture as readObservedCapture} from './research-evidence.mjs';
import {identityUrls} from './posting-identity.mjs';
import {captureAtsJd} from './ats-jd.mjs';
import {verifiedCapture} from './work-packets.mjs';

export const triageRulesHash=(config,source)=>hash(JSON.stringify([config.include_keywords,config.role_keywords,config.exclude_keywords,config.keyword_aliases,config.exclude_scope,source.include_keywords,source.role_keywords,source.exclude_keywords,source.keyword_aliases,source.exclude_scope]));
export function needsTriage(job,config,source={}){
 if(job.possiblyClosed)return true;
 if(job.state==='expired')return false;
 if(job.discoveryDisposition!=='review'||job.submitted||job.assessment)return false;
 if(job.triage?.method==='manual'&&['candidate','excluded'].includes(job.triage.status))return false;
 const refresh=config.discovery?.triage_refresh_hours??0;
 if(job.triage?.status==='excluded'&&job.triage.rulesHash===triageRulesHash(config,source)&&(!refresh||Date.now()-Date.parse(job.triage.checkedAt)<refresh*3600000))return false;
 return true;
}
export function triageFetcher(config,{maxRequests=40}={}){
 let requests=0;
 const fetchPage=createDiscoveryFetcher({request,minIntervalMs:config.discovery?.min_interval_ms??500,respectRobots:config.discovery?.respect_robots!==false,beforeRequest:()=>{if(maxRequests&&requests>=maxRequests)throw Object.assign(Error('triage_request_budget'),{budget:true});requests++;}});
 return {fetchPage,get requests(){return requests;}};
}
export async function triageOne(job,config,{fetchPage,noBrowser=false,decision,observedCapture,forceFetch=false}={}){
 await fs.mkdir(path.join(home,'triage'),{recursive:true});
 const lock=await acquireFileLock(path.join(home,'triage',job.id+'.lock'));
 try{return await performTriage(job,config,{fetchPage,noBrowser,decision,observedCapture,forceFetch});}finally{await lock.close();}
}
async function performTriage(job,config,{fetchPage,noBrowser,decision,observedCapture,forceFetch}){
 const source=config.portals.find(s=>s.name===job.portal)||{},rulesHash=triageRulesHash(config,source);
 let captured,summary;
 try{
  if(job.triage?.nextRetryAt&&Date.parse(job.triage.nextRetryAt)>Date.now()&&!decision&&!observedCapture)return {id:job.id,status:job.triage.status,nextRetryAt:job.triage.nextRetryAt};
  const cached=!decision&&!forceFetch&&!job.possiblyClosed?await verifiedCapture(root,job):null;
  if(decision||observedCapture){
   captured=await readObservedCapture(root,home,job,decision||observedCapture,decision);
  }else if(cached?.capture.liveness?.result==='active'){
   captured=cached.capture;
  }else{
   try{captured=await captureAtsJd(job.url,{fetchPage:(url,options)=>fetchPage(url,{...options,httpClient:source.http_client},source)});}catch(error){if(error.budget||error.deferredUntil||error.blocked)throw error;}
   if(!captured){
   let raw=await fetchPage(job.url,{httpClient:source.http_client},source);
   if(![404,410].includes(raw.status))httpFailure(raw);
   captured=extract(raw,job.url,'HTTP');
   if(captured.liveness.result==='uncertain'&&!noBrowser&&['auto','playwright'].includes(source.renderer||'auto')){
    raw=await renderListing(job.url,{beforeNavigation:()=>fetchPage.beforeNavigation(job.url,source)});
    if(![404,410].includes(raw.status))httpFailure(raw);
    captured=extract({...raw,visibleControls:raw.visibleLinks.map(l=>l.title)},job.url,'Playwright');
   }
   }
  }
  if(captured.liveness.result==='active'&&!identityUrls(job).includes(normalizeUrl(captured.finalUrl||captured.url)))captured.liveness={result:'uncertain',code:'posting_redirect_requires_verification',reason:'Detail URL redirected to an unverified posting identity'};
  const signals=relevance({title:captured.title||job.title,jd:captured.jd},config,source);
  const status=captured.liveness.result==='expired'?'expired':captured.liveness.result!=='active'?'needs-agent':decision?.status||(job.triage?.method==='manual'?job.triage.status:signals.matches?'candidate':'excluded');
  const file=path.join(home,'triage',job.id+'.json');await write(file,captured);
  summary={status,method:decision||job.triage?.method==='manual'?'manual':'rules',checkedAt:captured.capturedAt,rulesHash,signals,liveness:captured.liveness,captureFile:path.relative(root,file),captureHash:hash(JSON.stringify(captured)),...(decision?{evidence:decision.evidence}:job.triage?.evidence?{evidence:job.triage.evidence}:{}),...(status==='needs-agent'?{reason:captured.liveness.reason}:{})};
 }catch(error){
  if(decision||observedCapture)throw error;
  const failure=failureDisposition(error,{attempt:(job.triage?.attempts||0)+1,baseSeconds:config.discovery?.retry_base_seconds??30});
  summary={...failure,status:failure.status==='partial'?'pending':failure.status,checkedAt:new Date().toISOString(),rulesHash};
 }
 await transaction(store=>{
  const current=store.jobs.find(j=>j.id===job.id);if(!current)throw Error('Unknown triage lead');
  current.triage=summary;
  if(captured?.liveness?.result==='active'&&!current.contextHash&&!current.assessment&&!current.submitted&&!current.historyMatch){
   current.jd=captured.jd;
   for(const key of ['title','company'])if(!current[key]&&typeof captured[key]==='string'&&captured[key].trim()&&captured.bodyText?.includes(captured[key]))current[key]=captured[key];
  }
 if(summary.status==='candidate'){current.discoveryDisposition='candidate';current.discoverySignals=summary.signals;}
  if(summary.status==='excluded')current.discoveryDisposition='review';
  if(['active','expired'].includes(summary.liveness?.result)){
   current.liveness=summary.liveness;current.possiblyClosed=false;
   if(current.absenceSignals)for(const signal of current.absenceSignals)signal.resolvedAt=summary.checkedAt;
   if(summary.liveness.result==='active')current.lastSeenAt=summary.checkedAt;
   if(summary.status==='expired'&&current.state!=='expired'&&!current.submitted&&!current.historyMatch){try{assertTransition(current.state,'expired',{});current.events=[...(current.events||[]),{at:summary.checkedAt,from:current.state,to:'expired',reason:summary.liveness.code}];current.state='expired';}catch{/* Preserve protected application states. */}}
  }
 });
 return {id:job.id,...summary};
}
