import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

export const digest=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
export function selectLeads(jobs,{id,ids,query,state,limit=10,offset=0}={}){
 if(!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(offset)||offset<0)throw Error('limit 1..100 and nonnegative offset required');
 if(id&&!jobs.some(j=>j.id===id)||ids&&(!Array.isArray(ids)||ids.some(x=>!jobs.some(j=>j.id===x))))throw Error('Unknown lead ID');
 const terms=String(query||'').normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
 const selected=jobs.filter(j=>(!id||j.id===id)&&(!ids||ids.includes(j.id))&&(!state||j.state===state)&&terms.every(term=>[j.company,j.title,j.url].join(' ').normalize('NFKC').toLocaleLowerCase().includes(term)));
 return {items:selected.slice(offset,offset+limit),total:selected.length,remaining:Math.max(0,selected.length-offset-limit),nextOffset:offset+limit<selected.length?offset+limit:null};
}
export async function verifiedCapture(workspace,job,dir,{now=Date.now(),maxAgeHours=24}={}){
 const candidates=[...(job.triage?.captureFile?[{file:path.resolve(workspace,job.triage.captureFile),hash:job.triage.captureHash}]:[]),...(dir?[{file:path.join(dir,'capture.json')}]:[])];
 for(const candidate of candidates){
  try{
   const file=await fs.realpath(candidate.file),base=await fs.realpath(workspace);if(!file.startsWith(base+path.sep))continue;
   const capture=JSON.parse(await fs.readFile(file,'utf8'));
   if(candidate.hash&&digest(capture)!==candidate.hash)continue;
   if(capture.url!==job.url||typeof capture.jd!=='string'||capture.jd.length<300||!Number.isFinite(Date.parse(capture.capturedAt))||Math.abs(now-Date.parse(capture.capturedAt))>maxAgeHours*3600000)continue;
   if(job.contextHash&&job.jd&&job.jd!==capture.jd)continue;
   return {capture,file,sha256:digest(capture)};
  }catch(error){if(!['ENOENT','ENOTDIR'].includes(error.code)&&!(error instanceof SyntaxError))throw error;}
 }
 return null;
}
// Exact JD excerpts for retrieval only. Never classify candidate eligibility from these patterns.
export function requirementHints(jd){
 const patterns={contract:/\b(?:alternance|apprentissage|stage|internship|work.study|\d+\s*(?:mois|months?|ans?))\b/i,education:/bac\s*\+\s*\d|bachelor|master|ing[ée]nieur|dipl[oô]me/i,start:/\b(?:20\d{2}|septembre|rentr[ée]e|start date|d[ée]but)\b/i,rhythm:/rythme|rhythm|\d+\s*(?:semaines?|weeks?|jours?|days?)\b/i,schoolRoute:/notre (?:[ée]cole|formation)|inscription.{0,40}formation|pr[ée]parer.{0,80}(?:notre|nos|sa) formation|admission.{0,40}[ée]cole|partenaire.{0,40}formation/i};
 const lines=jd.split(/\r?\n|(?<=[.!?])\s+/).map(x=>x.trim()).filter(Boolean);
 return Object.fromEntries(Object.entries(patterns).map(([key,re])=>[key,[...new Set(lines.filter(x=>re.test(x)))].slice(0,4).map(line=>{const at=line.search(re);return {quote:line.slice(Math.max(0,at-100),Math.max(0,at-100)+500),reviewRequired:true};})]));
}
export function materialPreflight(job,verified,{decision,now=Date.now()}={}){
 const reasons=[];const c=verified?.capture;
 if(job.submitted||job.historyMatch&&!job.duplicateResolution)reasons.push('existing_application');
 if(job.possiblyClosed||job.state==='expired')reasons.push('closed_or_disappearance_unresolved');
 if(job.possibleDuplicates?.length&&!job.duplicateResolution)reasons.push('duplicate_unresolved');
 if(!c||Math.abs(now-Date.parse(c.capturedAt))>86400000)reasons.push('fresh_full_posting_required');
 else {
  if(c.liveness?.result!=='active')reasons.push('posting_not_verified_active');
  const controls=c.applyControls||c.links?.map(x=>x.title).filter(x=>/postuler|apply|candidater|je postule/i.test(x))||[];
  if(!controls.some(x=>typeof x==='string'&&(c.bodyText||c.jd).includes(x)))reasons.push('application_entry_unverified');
  const schoolQuotes=requirementHints(c.jd).schoolRoute;
  const review=decision?.schoolRouteReview;
  if(schoolQuotes.length&&!(review?.reason?.trim().length>=20&&typeof review.jdQuote==='string'&&review.jdQuote.length>=8&&c.jd.includes(review.jdQuote)&&Array.isArray(review.sources)&&review.sources.length))reasons.push('school_route_requires_review');
 }
 return {ready:reasons.length===0,reasons,captureFile:verified?.file,captureHash:verified?.sha256,checkedAt:new Date(now).toISOString(),qualification:'Not a KO PASS; semantic assessment and sourced claims remain required.'};
}
export function composePayload(base,tailoring){
 const result={};for(const kind of ['cv','letter']){
  const items=new Map();for(const source of [base,tailoring]){if(!Array.isArray(source[kind]))throw Error('cv and letter arrays required');const seen=new Set();for(const item of source[kind]){const key=JSON.stringify([item.selector,item.index??0]);if(seen.has(key))throw Error('Duplicate replacement in recipe');seen.add(key);items.set(key,item);}}
  result[kind]=[...items.values()];
 }return result;
}
