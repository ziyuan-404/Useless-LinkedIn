import {parse,publicUrl,normalizeUrl,extract} from './core.mjs';
import {listing,posting} from './listings.mjs';
import {httpFailure} from './discovery-policy.mjs';
import {inferCareerSource} from './discovery-sources.mjs';

const careerRoute=/\/(?:jobs?|careers?|positions?|vacancies|offres?|emplois|requisitions?)(?:\/|[._-])/i;
export async function careerPage(source,task,{fetchPage,noBrowser=false,beforeNavigation,sitemapHints=()=>[]}){
 const state=task.cursor||{},queue=[...(state.careerQueue||[{url:task.url,kind:'index'}])],item=queue.shift(),visited=new Set(state.visited||[]);
 const origin=new URL(task.url).origin,allowed=url=>new URL(url).origin===origin||(source.allowed_hosts||[]).includes(new URL(url).hostname);
 const add=(url,kind,lastmod)=>{try{url=publicUrl(new URL(url,item.url).href);if(allowed(url)&&!visited.has(url)&&!queue.some(x=>x.url===url))queue.push({url,kind,lastmod});}catch{/* Untrusted discovery references are ignored. */}};
 const documents={...(task.careerDocuments||{})};let jobs=[],careerSources=[],complete=false,reason='career_discovery_partial',skippedKeys=[],observedApi;
 const known=documents[item.url],lastFull=Date.parse(task.lastFullScanAt||''),fullDue=!Number.isFinite(lastFull)||Date.now()-lastFull>=(source.incremental?.full_refresh_hours??168)*3600000;
 if(item.lastmod&&known?.lastmod===item.lastmod&&task.refreshing&&!fullDue){skippedKeys=known.keys||[];state.skipped=true;reason='sitemap_lastmod_unchanged';}
 else{
  const raw=await fetchPage(item.url);
  if([404,410].includes(raw.status)&&item.kind!=='index'){
   // A removed detail or optional map needs verification, never fake full coverage.
   if(item.kind==='detail')state.unverified=true;
  }else{
   httpFailure(raw);
   if(item.kind==='sitemap'||item.kind==='feed'){
    const xml=parse(raw.body,'xml');if(!['urlset','sitemapindex','rss','feed','RDF'].includes(xml.kind))throw Error('Unsupported career XML document');
    for(const entry of xml.entries){if(entry.kind==='sitemap'||(source.job_pattern?new RegExp(source.job_pattern).test(entry.url):careerRoute.test(entry.url)))add(entry.url,entry.kind,entry.lastmod);}
    state.xmlObserved=true;
   }else if(item.kind==='detail'){
    const p=parse(raw.body),matching=p.jobs.filter(j=>j.title&&(!j.url||normalizeUrl(new URL(j.url,item.url).href)===normalizeUrl(raw.finalUrl||item.url)));
    const j=matching.length===1&&p.jobs.length===1?matching[0]:null;
    if(j&&!(Date.parse(j.validThrough||'')<Date.now()))jobs=[{url:raw.finalUrl||item.url,title:j.title,company:j.hiringOrganization?.name||source.company||'',description:parse(j.description||'').text,contract:Array.isArray(j.employmentType)?j.employmentType.join(' '):j.employmentType||'',location:j.jobLocation?.address?.addressLocality||'',isJob:true,structured:true}];
    else if(!j){const capture=extract(raw,item.url,'CareerDetail'),row=posting({url:raw.finalUrl||item.url,title:p.heading||p.title,description:capture.jd,company:source.company||capture.company},source,item.url);if(row&&capture.liveness.result==='active')jobs=[row];else state.unverified=true;}
    if(/captcha|verify you are human|access denied|just a moment/i.test(p.text))throw Object.assign(Error('career_detail_access_gate'),{blocked:true});
   }else{
    const result=await listing(item.url,{portal:source,fetchPage:async()=>raw,noBrowser,beforeNavigation});
    if(result.blocked)throw Object.assign(Error('career_listing_access_gate'),{blocked:true});
    jobs=result.jobs;careerSources=result.careerSources;observedApi=result.observedApi;
    const redirected=inferCareerSource(raw.finalUrl||item.url);if(redirected)careerSources.push(redirected);
    for(const url of result.nextUrls)add(url,'index');
    for(const url of result.feeds||[])add(url,'feed');
    if(!state.mapsQueued){
     for(const url of source.sitemap_urls||[...sitemapHints(),new URL('/sitemap.xml',task.url).href])add(url,'sitemap');
     state.mapsQueued=true;
    }
    state.dynamic=state.dynamic||result.dynamic;
    if(source.exhaustive_listing===true)state.explicitEnd=true;
    if(careerSources.length&&!jobs.length&&!result.nextUrls.length){queue.length=0;state.delegated=true;}
   }
  }
 }
 visited.add(item.url);
 if(jobs.length)documents[item.url]={lastmod:item.lastmod,keys:jobs.map(j=>normalizeUrl(j.url))};
 task.careerDocuments=documents;
 // XML may enumerate its own snapshot; an incomplete dynamic page or unverified detail remains unresolved.
 complete=!queue.length&&!state.unverified&&(state.explicitEnd||state.xmlObserved&&!state.dynamic||state.delegated);
 if(!queue.length)reason=complete?'observed_career_snapshot_end':state.unverified?'career_details_unverified':'career_end_unverified';
 return {jobs,careerSources,observedApi,skippedKeys,status:200,complete,nextCursor:queue.length?{...state,careerQueue:queue,visited:[...visited]}:null,reason,url:item.url,finalUrl:item.url,pageKey:item.url,incrementalEligible:false,incrementalSnapshot:!!state.skipped};
}
