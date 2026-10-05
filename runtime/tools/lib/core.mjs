import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {root,toolsRoot,pythonCommand,dependency} from '../runtime.mjs';
import {normalizeUrl,fingerprintText,similarity,classifyLiveness} from './job-signals.mjs';
import {validateLead} from './schema.mjs';
import {acquireFileLock} from './file-lock.mjs';
import {pendingDiscovery,acknowledgeDiscovery} from './discovery-journal.mjs';
export {classifyLiveness};
export const home=path.resolve(root,process.env.USELESS_LINKEDIN_STATE_DIR||'个人资料/applications/automation');
if(!home.startsWith(root+path.sep))throw Error('State directory must remain within workspace');
export const hash=x=>createHash('sha256').update(x).digest('hex');
export async function write(file,obj){await fs.mkdir(path.dirname(file),{recursive:true});const tmp=file+`.${process.pid}.tmp`;await fs.writeFile(tmp,typeof obj==='string'?obj:JSON.stringify(obj,null,2));await fs.rename(tmp,file);}
export async function read(file,fallback){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
export function parse(text,mode='html'){const p=spawnSync(pythonCommand(),[path.join(toolsRoot,'lib/parse.py'),mode],{input:text,encoding:'utf8',maxBuffer:16*1024*1024});if(p.status!==0)throw Error(p.stderr);return JSON.parse(p.stdout);}
export async function config(file='个人资料/portals.yml'){const c=parse(await fs.readFile(path.resolve(root,file),'utf8'),'yaml');if(c.version!==1||!Array.isArray(c.portals))throw Error('Invalid portals.yml');return c;}
function privateAddress(address){
 const ip=address.replace(/^\[|\]$/g,'').toLowerCase();
 if(isIP(ip)===4){
  const [a,b]=ip.split('.').map(Number);
  return a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19)||a===192&&b===0||a===192&&b===88;
 }
 if(isIP(ip)===6)return ip==='::'||ip==='::1'||/^f[cd]/.test(ip)||/^fe[89ab]/.test(ip)||ip.startsWith('ff')||ip.startsWith('::ffff:')&&privateAddress(ip.slice(7));
 return true;
}
export function publicUrl(url){
 const u=new URL(url);
 if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw Error('Only public HTTP URLs supported');
 const host=u.hostname.replace(/^\[|\]$/g,'').toLowerCase();
 if(!process.env.USELESS_LINKEDIN_TEST_LOCAL&&(host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal')||isIP(host)&&privateAddress(host)))throw Error('Private host refused');
 return u.href;
}
export async function assertPublicUrl(url){
 const href=publicUrl(url),host=new URL(href).hostname.replace(/^\[|\]$/g,'');
 if(!process.env.USELESS_LINKEDIN_TEST_LOCAL){
  const addresses=isIP(host)?[{address:host}]:await lookup(host,{all:true,verbatim:true});
  if(!addresses.length||addresses.some(x=>privateAddress(x.address)))throw Error('Private DNS address refused');
 }
 return href;
}
export async function request(url,opts={}){
 const {httpClient='native',credentialBody=false,credentialHeaders=false,responseMode='text',redirect='follow',timeoutMs=18000,maxResponseBytes=8*1024*1024,...init}=opts;
 if(!Number.isFinite(maxResponseBytes)||maxResponseBytes<=0)throw Error('maxResponseBytes must be positive');
 if(!['native','impit'].includes(httpClient))throw Error('Unknown HTTP client');
 const client=httpClient==='impit'?new (dependency('impit').Impit)({browser:'chrome',timeout:18000}):null;
 let current=url,options={...init,headers:{...init.headers}};
 for(let redirects=0;redirects<=5;redirects++){
  current=await assertPublicUrl(current);
  const r=await (client?client.fetch.bind(client):fetch)(current,{...options,redirect:'manual',signal:AbortSignal.timeout(timeoutMs),headers:{'user-agent':'UselessLinkedIn/1.0 (public job discovery)',...options.headers}});
  if(redirect==='error'&&r.status>=300&&r.status<400)throw Error('Redirect refused by caller');
  if(redirect!=='manual'&&[301,302,303,307,308].includes(r.status)){
   const location=r.headers.get('location');if(!location)throw Error('Redirect without location');
   const next=new URL(location,current).href;
   if(new URL(next).origin!==new URL(current).origin&&(credentialBody&&options.body||credentialHeaders))throw Error('Authenticated request changed origin');
   if(new URL(next).origin!==new URL(current).origin)for(const key of Object.keys(options.headers))if(/authorization|cookie|api[-_]key/i.test(key))delete options.headers[key];
   if(r.status===303||(r.status===301||r.status===302)&&options.method==='POST'){options.method='GET';delete options.body;}
   current=next;await assertPublicUrl(current);continue;
  }
  if(responseMode==='stream')return {status:r.status,finalUrl:current,bodyStream:r.body,headers:Object.fromEntries(r.headers)};
  const chunks=[];let bytes=0;
  for await(const chunk of r.body||[]){const data=Buffer.from(chunk);bytes+=data.length;if(bytes>maxResponseBytes)throw Error(`Response exceeds configured byte budget (${maxResponseBytes} bytes)`);chunks.push(data);}
  const body=Buffer.concat(chunks).toString('utf8');
  return {status:r.status,finalUrl:current,body,headers:Object.fromEntries(r.headers)};
 }
 throw Error('Too many redirects');
}
function jobField(value){return typeof value==='string'?parse(value).text.trim():Array.isArray(value)?value.map(jobField).filter(Boolean).join('\n'):'';}
export function extract(raw,url,layer){const p=parse(raw.body);const j=p.jobs[0];let jd=raw.visibleText||p.text;if(j?.description){jd=[jobField(j.description),jobField(j.qualifications),jobField(j.responsibilities),jobField(j.experienceRequirements),jobField(j.educationRequirements)].filter(Boolean).join('\n\n');}const title=j?.title||p.title;const company=j?.hiringOrganization?.name||'';const apply=(raw.visibleControls||p.links.filter(l=>l.url&&!/^(#|javascript:)/i.test(l.url)).map(l=>l.title)).filter(t=>/postuler|je postule\b|apply|candidater|envoyer.*candidature/i.test(t));
 let live=classifyLiveness({status:raw.status,requestedUrl:url,finalUrl:raw.finalUrl,bodyText:raw.visibleText||p.text,applyControls:apply});
 if(live.result==='active'&&(raw.status!==200||!j&&/Consent Management Platform|Personalize Your Options/i.test(jd)))live={result:'uncertain',code:'incomplete_or_consent_page',reason:'Posting content could not be verified'};
 if(j?.validThrough&&Date.parse(j.validThrough)<Date.now())live={result:'expired',code:'validThrough',reason:j.validThrough};
 if(live.code==='insufficient_content'||/captcha|verify you are human|access denied|sign in to|connexion pour/i.test(p.text))live={result:'uncertain',code:'blocked_or_incomplete',reason:'Insufficient posting or access gate'};
 if(live.result==='active'&&jd.length<300)live={result:'uncertain',code:'incomplete_jd',reason:'Apply control without complete JD'};
 return {url,finalUrl:raw.finalUrl,layer,status:raw.status,title,company,jd,bodyText:raw.visibleText||p.text,links:p.links,applyControls:apply,structuredJob:j||null,liveness:live,capturedAt:new Date().toISOString()};}
export async function capture(url){const attempts=[];let best;
 try{const {captureAtsJd}=await import('./ats-jd.mjs');best=await captureAtsJd(url,{fetchPage:request});if(best){attempts.push({layer:'ATS-API',status:best.status,liveness:best.liveness});if(['active','expired'].includes(best.liveness.result))return {...best,attempts,searchNeeded:false};}}catch(error){attempts.push({layer:'ATS-API',error:error.message});}
 for(const [layer,fn] of [['HTTP',request]]){try{const raw=await fn(url);const x=extract(raw,url,layer);attempts.push({layer,status:x.status,liveness:x.liveness});if(!best||x.jd.length>best.jd.length||x.liveness.result==='active')best=x;if(x.liveness.result==='active'||x.liveness.result==='expired')break;}catch(e){attempts.push({layer,error:e.message});}}
 return {...(best||{url,jd:'',liveness:{result:'uncertain',code:'fetch_failed',reason:'All fetch attempts failed'}}),attempts,searchNeeded:!best||best.liveness.result==='uncertain'};}
export async function transaction(fn,{onDiscovery}={}){
 await fs.mkdir(home,{recursive:true});const lock=await acquireFileLock(path.join(home,'.lock'));
 try{
  const store=await read(path.join(home,'leads.json'),{version:1,jobs:[],scans:[]});if(store.version!==1||!Array.isArray(store.jobs)||!Array.isArray(store.scans))throw Error('Invalid lead store');
  const before=new Map(store.jobs.map(j=>[j.id,JSON.stringify(j)])),pending=await pendingDiscovery(home);let receipt=store.discoveryReceipt||0;const changes=[];
  if(store.observationVersion!==3){for(const job of store.jobs)if(job.observations)job.observations=compactObservations(job.observations);store.observationVersion=3;}
  for(const batch of pending){if(batch.sequence<=receipt)continue;for(const job of batch.jobs)changes.push(add(store,job));receipt=batch.sequence;}
  onDiscovery?.(changes);const result=await fn(store);if(pending.length)store.discoveryReceipt=receipt;
  for(const job of store.jobs)if(before.get(job.id)!==JSON.stringify(job))await validateLead(job);
  await write(path.join(home,'leads.json'),store);if(pending.length)await acknowledgeDiscovery(home,receipt);return result;
 }finally{await lock.close();}
}
export function compactObservations(rows){
 const observations=new Map();
 for(const row of expandObservations(rows)){
  const key=JSON.stringify([row.source,normalizeUrl(row.url),row.query||'',row.location||'',row.layer]),old=observations.get(key),first=row.firstSeenAt||row.capturedAt,last=row.lastSeenAt||row.capturedAt;
  if(!old)observations.set(key,{...row,firstSeenAt:first,lastSeenAt:last,count:row.count||1});
  else{const firstSeenAt=[old.firstSeenAt,first].sort()[0],lastSeenAt=[old.lastSeenAt,last].sort().at(-1),taskIds=[...new Set([...(old.taskIds||[]),old.taskId,...(row.taskIds||[]),row.taskId].filter(Boolean))];observations.set(key,{...old,...row,firstSeenAt,lastSeenAt,capturedAt:lastSeenAt,count:old.count+(row.count||1),...(taskIds.length>1?{taskIds}:{})});}
 }
 const grouped=new Map();
 for(const row of observations.values()){
  const key=JSON.stringify([row.source,normalizeUrl(row.url),row.layer]);
  if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(row);
 }
 return [...grouped.values()].map(group=>{
  if(group.length===1)return group[0];
  const last=[...group].sort((a,b)=>a.lastSeenAt.localeCompare(b.lastSeenAt)).at(-1);
  const base={...(last.source===undefined?{}:{source:last.source}),url:last.url,layer:last.layer,capturedAt:last.capturedAt,firstSeenAt:group.map(o=>o.firstSeenAt).sort()[0],lastSeenAt:last.lastSeenAt,count:group.reduce((n,o)=>n+o.count,0)};
  base.contexts=group.map(row=>{const context={...row};for(const key of ['source','url','layer'])delete context[key];if(context.capturedAt===base.capturedAt)delete context.capturedAt;if(context.firstSeenAt===(context.capturedAt||base.capturedAt))delete context.firstSeenAt;if(context.lastSeenAt===(context.capturedAt||base.capturedAt))delete context.lastSeenAt;if(context.count===1)delete context.count;return context;});
  return base;
 });
}
// Shared source/URL fields are stored once; every query, task, date and count remains recoverable.
export function expandObservations(rows){return rows.flatMap(row=>row.contexts?row.contexts.map(context=>({source:row.source,url:row.url,layer:row.layer,...context,capturedAt:context.capturedAt||row.capturedAt,firstSeenAt:context.firstSeenAt||context.capturedAt||row.capturedAt,lastSeenAt:context.lastSeenAt||context.capturedAt||row.capturedAt,count:context.count||1})):[row]);}
const indexes=new WeakMap();
const companyKey=job=>JSON.stringify([job.company,job.title,job.location]);
function indexCompany(index,job){if(!job.company)return;const key=companyKey(job);if(!index.companies.has(key))index.companies.set(key,new Set());index.companies.get(key).add(job);}
const verifiedKey=job=>job.verifiedIdentity&&job.identityEvidence?.url&&Number.isFinite(Date.parse(job.identityEvidence.capturedAt))&&String(job.identityEvidence.evidence||'').trim()?job.verifiedIdentity:null;
function jobIndex(store){
 if(!indexes.has(store)){
  const urls=new Map(),verified=new Map(),companies=new Map(),fingerprinted=[];
  for(const j of store.jobs){for(const url of [j.url,...(j.urlAliases||[])]){const key=normalizeUrl(url);if(key&&!urls.has(key))urls.set(key,j);}if(verifiedKey(j))verified.set(verifiedKey(j),j);}
  const index={urls,verified,companies,fingerprinted};for(const j of store.jobs){indexCompany(index,j);if(j.fingerprint)fingerprinted.push(j);}indexes.set(store,index);
 }
 return indexes.get(store);
}
export function add(store,job){const key=normalizeUrl(job.url);if(!key)throw Error('Invalid posting URL');const verified=verifiedKey(job),index=jobIndex(store),old=index.urls.get(key)||(verified&&index.verified.get(verified));if(old){old.lastSeenAt=new Date().toISOString();old.sources=[...new Set([...(old.sources||[]),job.portal||job.url])];
 old.observations=compactObservations([...(old.observations||[]),...(job.observations||[])]);
 old.urlAliases=[...new Set([...(old.urlAliases||[]),old.url,job.url])];index.urls.set(key,old);
 old.key=normalizeUrl(old.url);
 if(['discovered','possible-duplicate'].includes(old.state)&&/^(?:voir l['’]offre|postuler|apply(?: now)?|view (?:job|details))$/i.test(old.title||'')&&job.title)old.title=job.title;
 // Prefer an explicitly verified employer URL; an ID/title guess cannot merge sources.
 if(verified&&job.employerOriginal===true&&!old.submitted&&!old.historyMatch){old.url=job.url;old.key=key;old.employerOriginal=true;}
 if(verified){old.verifiedIdentity=verified;old.identityEvidence=job.identityEvidence;index.verified.set(verified,old);}
 if(job.discoveryContentHash){
  if(old.discoveryContentHash&&old.discoveryContentHash!==job.discoveryContentHash&&old.triage?.method!=='manual'&&old.discoveryOnly&&!old.assessment&&!old.submitted){delete old.triage;old.discoveryDisposition=job.discoveryDisposition;old.discoverySignals=job.discoverySignals;for(const field of ['title','description','jd','contract','updatedAt'])if(job[field]!==undefined)old[field]=job[field];}
  old.discoveryContentHash=job.discoveryContentHash;
 }
 if(old.discoveryDisposition==='review'&&job.discoveryDisposition==='candidate'&&old.triage?.method!=='manual'){old.discoveryDisposition='candidate';old.discoverySignals=job.discoverySignals;delete old.triage;}
 old.possiblyClosed=false;if(old.absenceSignals)for(const signal of old.absenceSignals)signal.resolvedAt=old.lastSeenAt;
 // Enrich empty discovery fields without overwriting assessed/submitted records.
 for(const field of ['company','location','requisitionId','publishedAt'])if(!old[field]&&job[field])old[field]=job[field];
 indexCompany(index,old);
 return {duplicate:true,id:old.id};}
 const id=hash(key).slice(0,16),fp=fingerprintText(job.jd||'');const candidates=new Set([...(index.companies.get(companyKey(job))||[]),...(fp?index.fingerprinted:[])]),possible=[...candidates].filter(x=>(fp&&x.fingerprint&&similarity(fp,x.fingerprint)>=.92)||(job.company&&x.company===job.company&&x.title===job.title&&x.location===job.location)).map(x=>x.id);
 const created={...job,observations:compactObservations(job.observations||[]),id,key,fingerprint:fp,possibleDuplicates:possible,sources:[job.portal||job.url],createdAt:new Date().toISOString(),lastSeenAt:new Date().toISOString(),state:possible.length?'possible-duplicate':'discovered',dashboardSynced:false,submitted:false};store.jobs.push(created);index.urls.set(key,created);indexCompany(index,created);if(fp)index.fingerprinted.push(created);if(verified)index.verified.set(verified,created);return {id,possibleDuplicates:possible};}
export async function exportList(){
 const store=await read(path.join(home,'leads.json'),{jobs:[]});const escape=s=>String(s||'').replace(/\|/g,'/').replace(/\n/g,' ');
 await write(path.join(home,'list.md'),'# 自动发现岗位与流程阶段（历史申请以 Dashboard 数据库及成功凭证核对）\n\n待分拣：`triage --list-review`；消失复核：`triage --list-closed`；批量检查：`triage --run`。\n\n| ID | 公司 | 岗位 | 来源 | 搜索分拣 | 分拣结果 | 消失复核 | 状态 | 优先级 | URL |\n|---|---|---|---|---|---|---|---|---|---|\n'+store.jobs.map(x=>`| ${x.id} | ${escape(x.company)} | ${escape(x.title)} | ${escape(x.portal)} | ${x.discoveryDisposition||''} | ${x.triage?.status||(x.discoveryDisposition==='review'?'pending':'')} | ${x.possiblyClosed?'possibly_closed':x.liveness?.result==='expired'?'expired':''} | ${x.state} | ${x.priority||''} | ${x.url} |`).join('\n')+'\n');
}
export {normalizeUrl};
