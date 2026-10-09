import {publicUrl,parse,extract,normalizeUrl} from './core.mjs';
import {httpFailure} from './discovery-policy.mjs';
import {anySearchSuggestions} from './optional-web-search.mjs';
import {inferCareerSource} from './discovery-sources.mjs';
import {posting,listing} from './listings.mjs';

export function webBackend(config){
 const value=config.discovery?.web_backend||'auto';
 return value==='auto'?(config.discovery?.searxng?.api_url||process.env.SEARXNG_URL?'searxng':process.env.BRAVE_SEARCH_API_KEY?'brave':'agent'):value;
}
export async function searchPage(task,config,{fetchPage}){
 const backend=webBackend(config),settings=config.discovery?.[backend]||{},page=task.cursor?.searchPage??1;
 if(backend==='agent')throw Object.assign(Error('Configure SearXNG/Brave/AnySearch for automatic web discovery'),{credentialsMissing:true});
 if(backend==='anysearch')return {...await anySearchSuggestions(task,settings,{fetchPage}),page,nextPage:null,endEvidence:false,reason:'search_provider_window'};
 let url,headers={},trustedLocalOrigin;
 if(backend==='searxng'){
  if(!settings.api_url&&!process.env.SEARXNG_URL)throw Object.assign(Error('SearXNG endpoint missing'),{credentialsMissing:true});
  url=new URL(settings.api_url||process.env.SEARXNG_URL);
  if(settings.allow_loopback===true&&['127.0.0.1','localhost','[::1]'].includes(url.hostname))trustedLocalOrigin=url.origin;else publicUrl(url.href);
  url.searchParams.set('q',task.query);url.searchParams.set('format','json');url.searchParams.set('pageno',String(page));url.searchParams.set('language',settings.language||'fr');
  if(settings.engines)url.searchParams.set('engines',settings.engines);
 }else{
  const token=process.env[settings.api_token_env||'BRAVE_SEARCH_API_KEY'];
  if(!token)throw Object.assign(Error('Brave search credential missing'),{credentialsMissing:true});
  const count=settings.page_size??20;if(!Number.isInteger(count)||count<1||count>20)throw Error('Brave page_size must be 1..20');
  if(page>10)throw Error('Brave provider window reached');
  url=new URL(settings.api_url||'https://api.search.brave.com/res/v1/web/search');publicUrl(url.href);
  url.searchParams.set('q',task.query);url.searchParams.set('count',String(count));url.searchParams.set('offset',String(page-1));headers={'X-Subscription-Token':token};
 }
 const raw=await fetchPage(url.href,{headers,credentialHeaders:!!Object.keys(headers).length,trustedLocalOrigin,redirect:trustedLocalOrigin?'error':'follow'});httpFailure(raw);
 const data=JSON.parse(raw.body),rows=backend==='searxng'?data.results:data.web?.results;
 if(!Array.isArray(rows))throw Error('Search response is missing result array');
 const suggestions=[...new Map(rows.flatMap(row=>{try{const url=publicUrl(row.url);return [[normalizeUrl(url),{url,title:String(row.title||''),snippet:String(row.content||row.description||'')}]];}catch{return [];}})).values()];
 const endEvidence=backend==='brave'&&data.query?.more_results_available===false;
 const engineFailures=backend==='searxng'?(data.unresponsive_engines||[]):[];
 const nextPage=backend==='brave'?(data.query?.more_results_available===true&&page<10?page+1:null):suggestions.length?page+1:null;
 return {suggestions,page,nextPage,endEvidence,engineFailures,reason:endEvidence?'observed_search_end':nextPage?'next_search_page':engineFailures.length?'search_engine_failures':suggestions.length?'search_provider_window':'search_end_unverified',providerWindow:backend==='brave'?200:null};
}
export function searchDomainAllows(url,domain){const host=new URL(url).hostname;return !domain||host===domain||host.endsWith('.'+domain);}
export async function verifySearchResult(row,task,{fetchPage,noBrowser=false}){
 publicUrl(row.url);
 if(!searchDomainAllows(row.url,task.searchDomain))return {jobs:[],reason:'search_domain_mismatch'};
 const raw=await fetchPage(row.url);if([404,410].includes(raw.status))return {jobs:[],reason:'posting_unavailable'};httpFailure(raw);
 const finalUrl=publicUrl(raw.finalUrl||row.url),parsed=parse(raw.body),careerSources=[];
 const provider=inferCareerSource(finalUrl);if(provider)careerSources.push(provider);
 for(const item of parsed.embeds||[]){const source=inferCareerSource(new URL(item.url,finalUrl).href);if(source)careerSources.push(source);}
 if(task.searchDomain&&!searchDomainAllows(finalUrl,task.searchDomain)&&!provider)return {jobs:[],reason:'redirect_domain_mismatch'};
 const exact=parsed.jobs.filter(j=>j.title&&(!j.url||normalizeUrl(new URL(j.url,finalUrl).href)===normalizeUrl(finalUrl)));
 const structured=exact.length===1&&parsed.jobs.length===1?exact[0]:null;
 if(structured&&!(Date.parse(structured.validThrough||'')<Date.now())){
  const description=typeof structured.description==='string'?parse(structured.description).text:'';
  if(description)return {jobs:[{url:finalUrl,title:structured.title,company:structured.hiringOrganization?.name||'',description,contract:Array.isArray(structured.employmentType)?structured.employmentType.join(' '):structured.employmentType||'',location:structured.jobLocation?.address?.addressLocality||'',requisitionId:String(structured.identifier?.value||''),isJob:true,structured:true}],careerSources,reason:'verified_structured_posting'};
 }
 if(structured?.validThrough&&Date.parse(structured.validThrough)<Date.now())return {jobs:[],careerSources,reason:'expired_structured_posting'};
 const captured=extract(raw,finalUrl,'WebVerification'),candidate=posting({url:finalUrl,title:parsed.heading||parsed.title,company:captured.company,description:captured.jd},{name:task.portal},finalUrl);
 if(!parsed.jobs.length&&candidate&&captured.liveness.result==='active')return {jobs:[candidate],careerSources,reason:'verified_detail_page'};
 if(/captcha|verify you are human|access denied|just a moment/i.test(parsed.text))throw Object.assign(Error('search_detail_access_gate'),{blocked:true});
 if(!careerSources.length&&(/\/careers?(?:\/|$)|\/jobs?(?:\/|$)|recrutement/i.test(new URL(finalUrl).pathname)||parsed.jobs.length>1)){
  const result=await listing(finalUrl,{portal:{name:task.portal,renderer:'auto'},fetchPage:async()=>raw,noBrowser});
  careerSources.push(...result.careerSources);
  if(result.jobs.length||parsed.feeds.length)careerSources.push({name:'Career: '+new URL(finalUrl).host+new URL(finalUrl).pathname,career_url:finalUrl,career_extract:true,renderer:'auto',web_search:false,enabled:true});
 }
 return {jobs:[],careerSources,reason:careerSources.length?'registered_career_source':'unverified_search_result'};
}
