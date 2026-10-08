import {relevance} from './discovery-plan.mjs';
import {identityUrls} from './posting-identity.mjs';
import {schoolAdvertisement} from './job-requirements.mjs';

export const actionable=job=>!job.submitted&&!job.historyMatch&&!['submitted','followup-due','known-application','submitting','submission-unconfirmed','rejected','expired','approved','materials-pending-review','review-required'].includes(job.state);
export function researchScope(config,input={}){
 const scope={};
 for(const key of ['role_keywords','include_keywords','exclude_keywords']){
  scope[key]=input[key]??config[key]??[];
  if(!Array.isArray(scope[key])||scope[key].some(x=>typeof x!=='string'||!x.trim()))throw Error(key+' must be a nonempty-string array');
 }
 scope.keyword_aliases=input.keyword_aliases??config.keyword_aliases??{};
 for(const values of Object.values(scope.keyword_aliases))if(!Array.isArray(values)||values.some(x=>typeof x!=='string'))throw Error('Invalid keyword aliases');
 for(const key of ['queries','web_queries','locations'])if(input[key]!==undefined){
  if(!Array.isArray(input[key])||input[key].some(x=>typeof x!=='string'||!x.trim()))throw Error(key+' must be a nonempty-string array');
  scope[key]=input[key];
 }
 if(input.query_matrix!==undefined){
  if(!input.query_matrix||typeof input.query_matrix!=='object'||Array.isArray(input.query_matrix))throw Error('query_matrix must be an object');
  scope.query_matrix={};for(const key of ['roles','contracts']){const values=input.query_matrix[key]??[];if(!Array.isArray(values)||values.some(x=>typeof x!=='string'||!x.trim()))throw Error('Invalid query_matrix.'+key);scope.query_matrix[key]=values;}
 }
 return scope;
}
// A task scope is applied before discovery, including registered/provider-specific sources.
export function researchConfig(config,scope,{targeted=false}={}){
 const explicit=scope.queries!==undefined||scope.query_matrix!==undefined;
 const queries=scope.queries??(targeted&&scope.role_keywords.length?scope.role_keywords.flatMap(role=>(scope.include_keywords.length?scope.include_keywords:['']).map(contract=>[contract,role].filter(Boolean).join(' '))):undefined);
 const queryConfig=queries!==undefined||explicit?{queries:queries??[],query_matrix:scope.query_matrix??{roles:[],contracts:[]}}:{};
 const matrixQueries=(scope.query_matrix?.roles||[]).flatMap(role=>(scope.query_matrix.contracts?.length?scope.query_matrix.contracts:['']).map(contract=>[contract,role].filter(Boolean).join(' ')));
 const allQueries=queries!==undefined?[...new Set([...queries,...matrixQueries])]:undefined;
 const webQueries=scope.web_queries??allQueries;
 const portals=config.portals.map(source=>{
  const value={...source,...scope,...queryConfig};
  if(webQueries!==undefined)value.web_queries=webQueries;
  if(source.wttj&&allQueries!==undefined)value.wttj={...source.wttj,queries:allQueries};
  return value;
 });
 return {...config,...scope,...queryConfig,portals,discovery:{...config.discovery,...(webQueries?{web_queries:webQueries}:{})},research_scope:scope,research_targeted:targeted};
}
export function researchLane(job,scope){
 const signals=relevance(job,scope);
 if(scope.role_keywords.length&&!signals.roleHits.length)return 'unmatched';
 const other=relevance({title:job.title,contract:job.contract},{include_keywords:['stage','alternance','VIE','CDI','CDD']});
 if(signals.excludeHits.length||scope.include_keywords.length&&!signals.contractHits.length&&other.contractHits.length)return 'conflict';
 return scope.include_keywords.length&&!signals.contractHits.length?'contract-unknown':'target';
}
export function researchQueue(jobs,scope,{ids,includeUnmatched=false}={}){
 if(ids&&(!Array.isArray(ids)||ids.some(id=>!jobs.some(j=>j.id===id))))throw Error('IDs must contain existing lead IDs');
 const rows=jobs.filter(j=>actionable(j)&&!(j.triage?.status==='excluded'&&j.triage.method==='manual')&&(!ids||ids.includes(j.id))).map(job=>{
  const signals=relevance(job,scope);
  const titleSignals=relevance({title:job.title},scope);
  // A missing title match is unresolved, never an exclusion of the underlying lead.
  const lane=researchLane(job,scope),matched=['target','contract-unknown'].includes(lane)&&(job.triage?.status!=='excluded'||signals.matches);
  const priority=(matched?100:0)+(titleSignals.roleHits.length?80:0)+(titleSignals.contractHits.length?30:0)+(job.triage?.status==='candidate'?20:0)+(job.liveness?.result==='active'?10:0)-(schoolAdvertisement(job)?45:0);
  return {job,matched,lane,priority};
 }).sort((a,b)=>Number(b.lane==='target')-Number(a.lane==='target')||b.priority-a.priority||a.job.id.localeCompare(b.job.id));
 const seen=new Set(),linkedDeferred=[];
 const selected=rows.filter(r=>ids||r.matched||includeUnmatched).filter(r=>{
  if(ids||includeUnmatched)return true;
  const urls=identityUrls(r.job),closed=jobs.find(j=>j.state==='expired'&&j.liveness?.result==='expired'&&identityUrls(j).some(u=>urls.includes(u)));
  if(closed||urls.some(u=>seen.has(u))){linkedDeferred.push(r.job.id);return false;}for(const u of urls)seen.add(u);return true;
 });
 return {ids:selected.map(r=>r.job.id),deferredIds:[...rows.filter(r=>!ids&&!includeUnmatched&&!r.matched).map(r=>r.job.id),...linkedDeferred],linkedDeferred,lanes:Object.fromEntries(['target','contract-unknown','conflict','unmatched'].map(lane=>[lane,rows.filter(r=>r.lane===lane).map(r=>r.job.id)]))};
}
export function researchPage(jobs,ids,{offset=0,limit=10}={}){
 if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>100)throw Error('limit 1..100 and nonnegative offset required');
 const byId=new Map(jobs.map(j=>[j.id,j])),end=Math.min(ids.length,offset+limit);
 return {items:ids.slice(offset,end).map(id=>byId.get(id)).filter(j=>j&&actionable(j)&&j.triage?.status!=='excluded'),remaining:Math.max(0,ids.length-end),nextOffset:end<ids.length?end:null};
}
