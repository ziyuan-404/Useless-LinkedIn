import {request,parse} from './core.mjs';
import {inferCareerSource} from './discovery-sources.mjs';
import {normalizeUrl} from './job-signals.mjs';
import {observedJobApi} from './observed-job-api.mjs';
export {postingIdentityMismatch} from './job-signals.mjs';
export const actionTitle=value=>/^(?:voir (?:l['’]offre|le poste|plus)|view (?:job|details)|read more|learn more|apply(?: now)?|postuler|candidater|en savoir plus|details|détails|next|suivant(?:e)?)\s*[›»→.!]*$/i.test(String(value||'').trim());
export function mergePostingLinks(rows){
 const jobs=new Map();
 for(const row of rows){
  const key=normalizeUrl(row.url),old=jobs.get(key);
  const score=j=>(actionTitle(j.title)?-100:0)+(j.title?.split(/\s+/).length||0)+((j.company||j.requisitionId)?10:0)+(j.structured?20:0);
  if(!old)jobs.set(key,row);
  else{const preferred=score(row)>score(old)?row:old,other=preferred===row?old:row;jobs.set(key,{...other,...Object.fromEntries(Object.entries(preferred).filter(([,v])=>v!==undefined&&v!==''))});}
 }
 return [...jobs.values()].filter(j=>!actionTitle(j.title));
}


export function posting(link,portal={},base,{observedJob=false}={}){
 try{
  if(typeof link.url!=='string'||!link.url.trim())return null;
  const url=new URL(link.url,base),hosts=portal.allowed_hosts||(!observedJob?[new URL(base).hostname]:null);
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password||hosts&&!hosts.includes(url.hostname))return null;
  if(/\/recruteurs_lba\//.test(url.pathname)||link.kind==='predicted-recruiter'||link.source==='recruteurs_lba')return null;
  // Unknown routes need a job identifier, a substantial role slug, or observed card/JSON-LD evidence.
  const known=/\/(?:jobs?|positions?|vacancies|offres?|emplois|requisitions?)\/(?:\d+|[a-z0-9_-]*\d[a-z0-9_-]*|[^/?#]+-[^/?#]+)(?:\/|$)|[?&](?:jk|gh_jid|jobId|jobid|requisitionId)=|#\/job\//i.test(url.href);
  if(!observedJob&&!link.isJob&&/\/(?:jobs?|careers?)\/(?:search|locations?|categories?|teams?|departments?|remote|hybrid|onsite|all|engineering|marketing|sales|internships?)(?:\/|$)/i.test(url.pathname))return null;
  if(!observedJob&&!link.isJob&&!(portal.job_pattern?new RegExp(portal.job_pattern).test(url.href):known))return null;
  if(/(^|\.)linkedin\.com$/.test(url.hostname))for(const key of ['trk','trackingId','refId'])url.searchParams.delete(key);
  if(url.hostname==='fr.indeed.com'&&url.searchParams.has('jk')){const id=url.searchParams.get('jk');url.pathname='/viewjob';url.search='';url.searchParams.set('jk',id);}
  for(const key of ['from','utm_source','utm_campaign','utm_medium'])url.searchParams.delete(key);
  url.hash=/^#\/(?:job|jobs|position)\//i.test(url.hash)?url.hash:'';
  const title=String(link.title||'').replace(/\s+/g,' ').trim();if(!title)return null;
  const metadata=Object.fromEntries(['location','jd','description','contract','requisitionId','publishedAt','updatedAt','sourceUrl','capturedAt','kind','source','structured','verifiedIdentity','identityEvidence','employerOriginal'].filter(k=>link[k]!==undefined).map(k=>[k,link[k]]));
  return {...metadata,url:url.href,title,company:typeof link.company==='string'?link.company:'',portal:portal.name,discoveryOnly:true,isJob:true};
 }catch{return null;}
}

// Listing success is determined by usable postings, not detail-page apply controls.
export async function listing(url,{portal={},match,fetchPage=request,noBrowser=false,renderPage,beforeNavigation}){
 const attempts=[];let best=[];
 for(const [layer,fn] of [['HTTP',fetchPage]]){
  try{
   let raw=await fn(url);let jobs=[];
   const shell=raw.status===200&&/(?:__NEXT_DATA__|<div[^>]+id=["'](?:root|app)["'])/i.test(raw.body)&&!parse(raw.body).jobs.length;
   if(!noBrowser&&raw.status>=200&&raw.status<300&&(portal.renderer==='playwright'||portal.renderer==='auto'&&shell)){
    const renderer=renderPage||(await import('./rendered-listing.mjs')).renderListing;
    raw=await renderer(raw.finalUrl||url,{beforeNavigation,maxWaitMs:portal.browser_timeout_ms??12000,settleMs:portal.browser_settle_ms??600});
   }
   let nextUrls=[],blocked=false,careerSources=[];
   if(raw.status>=200&&raw.status<300){
    const p=parse(raw.body),links=[...(raw.visibleLinks||p.links)];
    const structured=p.jobs.filter(j=>!j.validThrough||!(Date.parse(j.validThrough)<Date.now())).map(j=>({url:j.url||j['@id'],title:j.title,company:j.hiringOrganization?.name,description:typeof j.description==='string'?parse(j.description).text:'',contract:Array.isArray(j.employmentType)?j.employmentType.join(' '):j.employmentType||'',location:j.jobLocation?.address?.addressLocality||'',requisitionId:String(j.identifier?.value||''),publishedAt:j.datePosted,isJob:true}));
    careerSources=[{url:raw.finalUrl||url},...p.links,...(p.embeds||[])].flatMap(l=>{try{const entry=inferCareerSource(new URL(l.url,raw.finalUrl||url).href);return entry?[entry]:[];}catch{return [];}});
    jobs=mergePostingLinks([...links,...structured.map(j=>({...j,structured:true}))].map(l=>posting(l,portal,raw.finalUrl||url)).filter(Boolean).filter(match||(()=>true)));
    blocked=/captcha|verify you are human|access denied|just a moment|enable javascript|sign in to|connexion pour/i.test(p.text)&&!jobs.length;
    nextUrls=p.links.filter(l=>/\bnext\b/.test(l.rel||'')||/^(?:next(?: page)?|suivant(?:e)?|page suivante|weiter|›|»|→)$/i.test((l.label||l.title||'').trim())).flatMap(l=>{try{const next=new URL(l.url,raw.finalUrl||url);return next.origin===new URL(raw.finalUrl||url).origin&&next.href!==url?[next.href]:[];}catch{return [];}});
   }
   attempts.push({layer,url,status:raw.status,usable:jobs.length,blocked});
   if(jobs.length>best.length)best=jobs;
   const dynamic=/load more|charger plus|afficher plus|infinite.?scroll|__NEXT_DATA__|<div[^>]+id=["'](?:root|app)["']/i.test(raw.body);
   const observedApi=(raw.observedResponses||[]).map(r=>observedJobApi(r,raw.finalUrl||url)).find(Boolean);
   return {jobs:best,attempts,nextUrls:[...new Set(nextUrls)],careerSources,blocked,dynamic,rendered:raw.rendered,status:raw.status,headers:raw.headers,finalUrl:raw.finalUrl||url,feeds:parse(raw.body).feeds,observedApi};
  }catch(e){e.attempts=attempts;throw e;}
 }
 return {jobs:best,attempts};
}
