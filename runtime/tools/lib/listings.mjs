import {request,browserPage,parse} from './core.mjs';

export function posting(link,portal,base){
 try{
  const url=new URL(link.url,base),hosts=portal.allowed_hosts||[new URL(base).hostname];
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password||!hosts.includes(url.hostname))return null;
  if(!new RegExp(portal.job_pattern||'$a').test(url.href)||/\/recruteurs_lba\//.test(url.pathname))return null;
  if(url.hostname.endsWith('.linkedin.com'))url.search='';
  if(url.hostname==='fr.indeed.com'&&url.searchParams.has('jk')){const id=url.searchParams.get('jk');url.pathname='/viewjob';url.search='';url.searchParams.set('jk',id);}
  for(const key of ['from','utm_source','utm_campaign','utm_medium'])url.searchParams.delete(key);
  return {url:url.href,title:String(link.title||'').replace(/\s+/g,' ').trim(),company:link.company||'',portal:portal.name,discoveryOnly:true};
 }catch{return null;}
}

// Listing success is determined by usable postings, not detail-page apply controls.
export async function listing(url,{portal,match,browser=true,fetchPage=request,renderPage=browserPage}){
 portal={...portal,allowed_hosts:portal.allowed_hosts||[new URL(url).hostname]};
 const attempts=[];let best=[];
 for(const [layer,fn] of [['HTTP',fetchPage],...(browser?[['Playwright',renderPage]]:[])]){
  try{
   const raw=await fn(url);let jobs=[];
   if(raw.status>=200&&raw.status<300){
    const p=parse(raw.body),links=[...(raw.visibleLinks||p.links),...p.jobs.map(j=>({url:j.url||j['@id'],title:j.title,company:j.hiringOrganization?.name}))];
    jobs=[...new Map(links.map(l=>posting(l,portal,raw.finalUrl||url)).filter(Boolean).filter(match).map(j=>[j.url,j])).values()];
   }
   attempts.push({layer,url,status:raw.status,usable:jobs.length});
   if(jobs.length>best.length)best=jobs;
   if(jobs.length)break;
  }catch(e){attempts.push({layer,url,error:e.message});}
 }
 return {jobs:best,attempts};
}
