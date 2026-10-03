import {createHash} from 'node:crypto';
import {FT_SEARCH,LBA_SEARCH} from './official-job-apis.mjs';
export const searchTaskStatuses=Object.freeze(['pending','standby','partial','retry-wait','blocked','needs-agent','completed','retired']);

const unique=values=>[...new Set(values.map(x=>String(x).trim()).filter(Boolean))];
const locationsFor=values=>[...new Set((values?.length?values:['']).map(x=>x.trim()))];
export const taskPriority=task=>Number(task.priority??({api:0,listing:10,'career-discovery':20,'web-search':30}[task.kind]??40));
export const taskId=task=>createHash('sha256').update(JSON.stringify([task.kind,task.portal,task.url||'',task.query||'',task.location||'',task.sourceSignature||''])).digest('hex').slice(0,24);
export function expandQueries(config,source={}){
 const matrix=source.query_matrix??config.query_matrix??{};
 const queries=unique([...(source.queries??config.queries??[]),...(matrix.roles||[]).flatMap(role=>(matrix.contracts?.length?matrix.contracts:['']).map(contract=>`${contract} ${role}`))]);
 return queries.length?queries:[''];
}
export function renderSearchUrl(template,context={}){
 return template.replace(/\{(query|location|page|offset)\}/g,(_,key)=>encodeURIComponent(String(context[key]??'')));
}
export function relevance(job,config,source={}){
 const norm=s=>String(s||'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[-–_]/g,' ').replace(/\s+/g,' ').trim();
 const text=norm([job.title,job.description,job.jd,job.contract].filter(Boolean).join(' '));
 const rules={...config,...source};
 const groups=[['intern','internship','internships','stage','stages','stagiaire','stagiaires'],['alternance','alternant','alternante','alternants','apprentissage','apprenti','apprentie','apprentice','apprenticeship','work study','dual study'],['vie','volontariat international en entreprise']];
 const boundary=(value,scope=text)=>new RegExp('(?<![\\p{L}\\p{N}])'+value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?![\\p{L}\\p{N}])','u').test(scope);
 const hits=key=>[...new Set((rules[key]||[]).flatMap(word=>{
  const value=norm(word),aliases=[value,...(rules.keyword_aliases?.[word]||[]).map(norm),...(key==='include_keywords'?groups.find(g=>g.includes(value))||[]:[])];return aliases.filter(alias=>boundary(alias,key==='exclude_keywords'&&rules.exclude_scope!=='full-jd'?norm(job.title):text));
 }))];
 const included=hits('include_keywords'),roles=hits('role_keywords'),excluded=hits('exclude_keywords');
 return {contractHits:included,roleHits:roles,excludeHits:excluded,needsFullJd:!job.jd,
  matches:(!(rules.include_keywords||[]).length||included.length>0)&&(!(rules.role_keywords||[]).length||roles.length>0)&&!excluded.length};
}
export function validateDiscoveryConfig(config){
 if(config.version!==1||!Array.isArray(config.portals))throw Error('Invalid portals.yml');
 const sources=config.portals;
 if(new Set(sources.map(p=>p.name)).size!==sources.length)throw Error('Source names must be unique');
 for(const entry of [config,...sources]){
  if(entry!==config&&(typeof entry.name!=='string'||!entry.name.trim()))throw Error('Source requires a name');
  for(const key of ['queries','web_queries','locations','include_keywords','role_keywords','exclude_keywords','search_urls','allowed_hosts'])if(entry[key]!==undefined&&(!Array.isArray(entry[key])||entry[key].some(x=>typeof x!=='string')))throw Error(`${entry.name||'global'}: ${key} must be a string array`);
  if(entry.renderer&&!['http','auto','playwright','agent'].includes(entry.renderer))throw Error('renderer must be http, auto, playwright or agent');
  if(entry.http_client&&!['native','impit'].includes(entry.http_client))throw Error('http_client must be native or impit');
  if(entry.listing_mode&&!['independent','fallback','disabled'].includes(entry.listing_mode))throw Error('listing_mode must be independent, fallback or disabled');
  for(const [key,value] of Object.entries(entry.keyword_aliases||{}))if(!Array.isArray(value)||value.some(x=>typeof x!=='string'))throw Error(`keyword_aliases.${key} must be a string array`);
  for(const [key,value] of Object.entries(entry.incremental||{}))if(key==='full_refresh_hours'&&(!Number.isFinite(value)||value<0))throw Error('incremental.full_refresh_hours must be nonnegative');
  for(const key of ['roles','contracts'])if(entry.query_matrix?.[key]!==undefined&&(!Array.isArray(entry.query_matrix[key])||entry.query_matrix[key].some(x=>typeof x!=='string')))throw Error(`query_matrix.${key} must be a string array`);
  for(const value of [entry.search_url,entry.api_url,entry.career_url,...(entry.search_urls||[])].filter(Boolean)){
   const u=new URL(renderSearchUrl(value));if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw Error('Source URLs must be public HTTP URLs without credentials');
  }
  if(entry.job_pattern)new RegExp(entry.job_pattern);
  if(entry.wttj?.queries!==undefined&&(!Array.isArray(entry.wttj.queries)||entry.wttj.queries.some(x=>typeof x!=='string')))throw Error('wttj.queries must be a string array');
  for(const value of [entry.api?.page_size,entry.wttj?.page_size,entry.wttj?.max_hits,entry.pagination?.page_size].filter(x=>x!==undefined))if(!Number.isInteger(value)||value<1)throw Error('API/listing page sizes must be positive integers');
  if(entry.api?.max_response_bytes!==undefined&&(!Number.isFinite(entry.api.max_response_bytes)||entry.api.max_response_bytes<=0))throw Error('api.max_response_bytes must be positive');
  for(const pagination of [entry.api?.pagination,entry.pagination].filter(Boolean)){
   if(pagination.mode&&!['page','offset'].includes(pagination.mode))throw Error('pagination.mode must be page or offset');
   if(pagination.start!==undefined&&(!Number.isInteger(pagination.start)||pagination.start<0))throw Error('pagination.start must be a nonnegative integer');
  }
 }
 for(const [key,value] of Object.entries(config.discovery||{})){
  if(key==='web_backend'&&!['agent','anysearch'].includes(value))throw Error('discovery.web_backend must be agent or anysearch');
  if(['max_requests_per_run','max_pages_per_task','refresh_hours','web_refresh_hours','min_interval_ms','retry_base_seconds','retry_max_seconds'].includes(key)&&(!Number.isFinite(value)||value<0))throw Error(`discovery.${key} must be a nonnegative number`);
  if(key==='web_queries'&&(!Array.isArray(value)||value.some(x=>typeof x!=='string')))throw Error('discovery.web_queries must be a string array');
 }
 return config;
}
export function buildDiscoveryPlan(config){
 validateDiscoveryConfig(config);
 const tasks=[];
 let sourceSignature;
 const push=task=>{task={...task,sourceSignature};tasks.push({...task,id:taskId(task),priority:taskPriority(task),refreshHours:task.refreshHours??(['web-search','career-discovery'].includes(task.kind)?config.discovery?.web_refresh_hours??168:config.discovery?.refresh_hours??24),status:task.fallbackOnly?'standby':'pending',completed:false});};
 for(const source of config.portals.filter(p=>p.enabled!==false)){
  sourceSignature=createHash('sha256').update(JSON.stringify(source)).digest('hex').slice(0,16);
  const queries=expandQueries(config,source),locations=locationsFor(source.locations??config.locations);
  const templates=[...(source.search_urls||[]),source.search_url,source.career_url].filter(Boolean);
  if(source.provider==='wttj')for(const query of source.wttj?.queries?.length?source.wttj.queries:queries)push({kind:'api',portal:source.name,provider:'wttj',query,location:'',url:source.search_url?renderSearchUrl(source.search_url,{query,location:locations[0]}):'https://www.welcometothejungle.com/fr/jobs'});
  else if(source.provider==='france-travail')for(const query of queries)for(const location of locations)push({kind:'api',portal:source.name,provider:source.provider,query,location,url:source.api_url||FT_SEARCH});
  else if(source.provider==='la-bonne-alternance')push({kind:'api',portal:source.name,provider:source.provider,query:'',location:'',url:source.api_url||(source.api?.mode==='export'?LBA_SEARCH.replace(/\/search$/,'/export'):LBA_SEARCH)});
  else if(source.api_url||['greenhouse','lever','ashby'].includes(source.provider)){
   const template=source.api_url|| (source.provider==='greenhouse'?`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(source.board_token||'')}/jobs${source.include_description?'?content=true':''}`:source.provider==='ashby'?`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(source.site||'')}`:`https://api${source.region==='eu'?'.eu':''}.lever.co/v0/postings/${encodeURIComponent(source.site||'')}?mode=json`);
   if(source.provider==='greenhouse'&&!source.board_token||['lever','ashby'].includes(source.provider)&&!source.site)throw Error(`${source.name}: missing ATS board_token/site`);
   for(const query of template.includes('{query}')?queries:[''])for(const location of template.includes('{location}')?locations:[''])push({kind:'api',portal:source.name,provider:source.provider||'json',query,location,url:renderSearchUrl(template,{query,location,page:source.api?.pagination?.start??1,offset:source.api?.pagination?.start??0})});
  }
  // API success never suppresses configured HTML or web discovery.
  if(source.listing_mode!=='disabled')for(const template of templates)for(const query of template.includes('{query}')?queries:[''])for(const location of template.includes('{location}')?locations:[''])push({kind:'listing',portal:source.name,query,location,fallbackOnly:source.listing_mode==='fallback',url:renderSearchUrl(template,{query,location,page:source.pagination?.start??1,offset:source.pagination?.start??0})});
  if(source.web_search!==false)for(const query of unique(source.web_queries??config.discovery?.web_queries??queries))for(const location of locations){
   const domain=source.search_domain||(templates[0]?new URL(renderSearchUrl(templates[0])).hostname:'');
   if(domain)push({kind:'web-search',portal:source.name,fallbackOnly:source.web_search==='fallback',query:[`site:${domain}`,query,location].filter(Boolean).join(' '),location});
  }
 }
 sourceSignature=undefined;
 if(config.discovery?.web_search!==false)for(const query of unique(config.discovery?.web_queries??expandQueries(config)))for(const location of locationsFor(config.locations)){
  const text=[query,location].filter(Boolean).join(' ');
  push({kind:'web-search',portal:'Open Web',query:text,location});
  if(config.discovery?.company_careers!==false)push({kind:'career-discovery',portal:'Company Careers',query:[text,config.discovery?.career_terms||'(recrutement OR careers OR jobs OR rejoindre)'].join(' '),location});
 }
 return [...new Map(tasks.map(t=>[t.id,t])).values()];
}
export function mergeTasks(plan,previous=[],{resume=false,refreshHours=24,now=Date.now()}={}){
 const old=new Map(previous.filter(x=>x.id).map(x=>[x.id,x]));
 const merged=plan.map(task=>{
  const prior=old.get(task.id);if(!prior)return task;
  const cadence=['web-search','career-discovery'].includes(task.kind)?task.refreshHours??refreshHours:refreshHours;
  const fresh=now-Date.parse(prior.finishedAt||prior.updatedAt||'')<cadence*3600000;
  const boundedRefresh=prior.status==='needs-agent'&&/^provider_(?:search_window_unverified|partial_warnings)$/.test(prior.reason||'')&&!fresh;
  if(!boundedRefresh&&(resume||!prior.completed||fresh))return {...prior,...task,status:prior.status||'pending',completed:!!prior.completed,cursor:prior.cursor};
  return {...task,cycle:(prior.cycle||1)+1,baselinePages:prior.currentPages||{},baselineKeys:prior.currentKeys||[],lastFullScanAt:prior.lastFullScanAt,refreshing:true};
 });
 // Keep history, but never run obsolete URLs/filters after configuration changes.
 const ids=new Set(merged.map(x=>x.id));
 for(const prior of previous)if(!ids.has(prior.id)){
  const activeFallback=prior.parentTaskId&&ids.has(prior.parentTaskId);
  const task={...prior,kind:prior.kind||'web-search',retired:!activeFallback,status:activeFallback?prior.status||'pending':'retired',retirementReason:activeFallback?undefined:'replaced_by_current_search_plan'};
  task.id||=taskId(task);if(!ids.has(task.id)){merged.push(task);ids.add(task.id);}
 }
 return merged;
}
