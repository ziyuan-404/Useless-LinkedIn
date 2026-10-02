import {request,parse} from './core.mjs';
import {inferCareerSource} from './discovery-sources.mjs';

export function postingIdentityMismatch(listed,captured){
 const tokens=s=>new Set(String(s||'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').split(' ').filter(x=>x.length>2&&!['alternance','stage','pour','avec','the','and','les','des','une','vous','hfm'].includes(x)));
 const left=tokens(listed.title),right=tokens(captured.title);
 const titleMismatch=left.size>=2&&right.size>=2&&![...left].some(x=>right.has(x));
 const listedCompany=tokens(listed.company),capturedCompany=tokens(captured.company);
 const companyMismatch=listedCompany.size&&capturedCompany.size&&![...listedCompany].some(x=>capturedCompany.has(x));
 return titleMismatch||Boolean(companyMismatch);
}

export function posting(link,portal={},base,{observedJob=false}={}){
 try{
  const url=new URL(link.url,base),hosts=portal.allowed_hosts;
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password||hosts&&!hosts.includes(url.hostname))return null;
  if(/\/recruteurs_lba\//.test(url.pathname)||link.kind==='predicted-recruiter'||link.source==='recruteurs_lba')return null;
  const known=/\/(?:jobs?|positions?|vacancies|offres?|emplois|requisitions?)\/[^/?#]+|[?&](?:jk|gh_jid|jobId|jobid|requisitionId)=|#\/job\//i.test(url.href);
  if(!observedJob&&!link.isJob&&/\/(?:jobs?|careers?)\/(?:search|locations?|categories?|teams?|departments?)(?:\/|$)/i.test(url.pathname))return null;
  if(!observedJob&&!link.isJob&&!(portal.job_pattern?new RegExp(portal.job_pattern).test(url.href):known))return null;
  if(/(^|\.)linkedin\.com$/.test(url.hostname))for(const key of ['trk','trackingId','refId'])url.searchParams.delete(key);
  if(url.hostname==='fr.indeed.com'&&url.searchParams.has('jk')){const id=url.searchParams.get('jk');url.pathname='/viewjob';url.search='';url.searchParams.set('jk',id);}
  for(const key of ['from','utm_source','utm_campaign','utm_medium'])url.searchParams.delete(key);
  url.hash=/^#\/(?:job|jobs|position)\//i.test(url.hash)?url.hash:'';
  const title=String(link.title||'').replace(/\s+/g,' ').trim();if(!title)return null;
  const metadata=Object.fromEntries(['location','jd','description','contract','requisitionId','publishedAt','sourceUrl','capturedAt','kind','source'].filter(k=>link[k]!==undefined).map(k=>[k,link[k]]));
  return {...metadata,url:url.href,title,company:typeof link.company==='string'?link.company:'',portal:portal.name,discoveryOnly:true,isJob:true};
 }catch{return null;}
}

// Listing success is determined by usable postings, not detail-page apply controls.
export async function listing(url,{portal,match,fetchPage=request}){
 const attempts=[];let best=[];
 for(const [layer,fn] of [['HTTP',fetchPage]]){
  try{
   const raw=await fn(url);let jobs=[];
   let nextUrls=[],blocked=false,careerSources=[];
   if(raw.status>=200&&raw.status<300){
    const p=parse(raw.body),links=[...(raw.visibleLinks||p.links),...p.jobs.map(j=>({url:j.url||j['@id'],title:j.title,company:j.hiringOrganization?.name}))];
    const structured=p.jobs.map(j=>({url:j.url||j['@id'],title:j.title,company:j.hiringOrganization?.name,location:j.jobLocation?.address?.addressLocality||'',requisitionId:String(j.identifier?.value||''),publishedAt:j.datePosted,isJob:true}));
    careerSources=p.links.flatMap(l=>{try{const entry=inferCareerSource(new URL(l.url,raw.finalUrl||url).href);return entry?[entry]:[];}catch{return [];}});
    jobs=[...new Map([...links,...structured].map(l=>posting(l,portal,raw.finalUrl||url)).filter(Boolean).filter(match||(()=>true)).map(j=>[j.url,j])).values()];
    blocked=/captcha|verify you are human|access denied|just a moment|enable javascript|sign in to|connexion pour/i.test(p.text)&&!jobs.length;
    nextUrls=p.links.filter(l=>/\bnext\b/.test(l.rel||'')||/^(?:next(?: page)?|suivant(?:e)?|page suivante|weiter|›|»|→)$/i.test((l.label||l.title||'').trim())).flatMap(l=>{try{const next=new URL(l.url,raw.finalUrl||url);return next.origin===new URL(raw.finalUrl||url).origin&&next.href!==url?[next.href]:[];}catch{return [];}});
   }
   attempts.push({layer,url,status:raw.status,usable:jobs.length,blocked});
   if(jobs.length>best.length)best=jobs;
   return {jobs:best,attempts,nextUrls:[...new Set(nextUrls)],careerSources,blocked,status:raw.status,finalUrl:raw.finalUrl||url};
  }catch(e){attempts.push({layer,url,error:e.message});}
 }
 return {jobs:best,attempts};
}
