import {searchWttjPage} from './wttj-search.mjs';
import {renderSearchUrl} from './discovery-plan.mjs';
import {httpFailure} from './discovery-policy.mjs';
import {franceTravailPage,lbaPage} from './official-job-apis.mjs';
import {careerProviderIds,careerProviderPage} from './career-providers.mjs';

export function field(object,path){return path===''?object:String(path||'').split('.').reduce((value,key)=>value?.[key],object);}
const text=value=>typeof value==='string'?value:typeof value==='number'?String(value):'';
const employerUrl=value=>{try{return !/(^|\.)greenhouse\.io$/.test(new URL(value).hostname);}catch{return false;}};
export function inferCareerSource(raw){
 try{
  const url=new URL(raw),parts=url.pathname.split('/').filter(Boolean);
  if(['boards.greenhouse.io','job-boards.greenhouse.io','boards-api.greenhouse.io'].includes(url.hostname)){
   const token=parts[0]==='embed'?url.searchParams.get('for'):url.hostname==='boards-api.greenhouse.io'?parts[0]==='v1'&&parts[1]==='boards'?parts[2]:null:parts[0];
   if(token&&/^[a-z0-9_-]+$/i.test(token)&&token!=='embed')return {name:`Greenhouse: ${token}`,provider:'greenhouse',board_token:token,career_url:`https://job-boards.greenhouse.io/${token}`,listing_mode:'fallback',web_search:'fallback',enabled:true};
  }
  if(['jobs.lever.co','jobs.eu.lever.co'].includes(url.hostname)&&parts[0])return {name:`Lever: ${parts[0]}`,provider:'lever',site:parts[0],region:url.hostname.includes('.eu.')?'eu':'global',career_url:`${url.origin}/${parts[0]}`,enabled:true};
  if(url.hostname==='jobs.ashbyhq.com'&&parts[0])return {name:`Ashby: ${parts[0]}`,provider:'ashby',site:parts[0],career_url:`${url.origin}/${parts[0]}`,listing_mode:'fallback',web_search:'fallback',enabled:true};
  if(['jobs.smartrecruiters.com','careers.smartrecruiters.com'].includes(url.hostname)&&parts[0])return {name:`SmartRecruiters: ${parts[0]}`,provider:'smartrecruiters',career_url:`${url.origin}/${parts[0]}`,renderer:'auto',enabled:true};
  if(url.hostname==='apply.workable.com'&&parts[0]&&!['api','js','assets','static'].includes(parts[0]))return {name:`Workable: ${parts[0]}`,provider:'workable',career_url:`${url.origin}/${parts[0]}`,renderer:'auto',enabled:true};
  if(/\.myworkdayjobs\.com$/.test(url.hostname)&&parts[0]){
   const site=/^[a-z]{2}-[A-Z]{2}$/.test(parts[0])?parts[1]:parts[0];if(site&&!['wday','wdaystatic','assets','static','js','css'].includes(site))return {name:`Workday: ${url.hostname}/${site}`,provider:'workday',career_url:`${url.origin}/${/^[a-z]{2}-[A-Z]{2}$/.test(parts[0])?parts[0]+'/':''}${site}`,renderer:'auto',enabled:true};
  }
 }catch{}
 return null;
}
export async function readApiPage(source,task,{fetchPage,credentials}){
 const transport=fetchPage;fetchPage=(url,opts={})=>transport(url,{maxResponseBytes:source.api?.max_response_bytes??128*1024*1024,...opts});
 if(source.provider==='france-travail')return franceTravailPage(source,task,{fetchPage});
 if(source.provider==='la-bonne-alternance')return lbaPage(source,task,{fetchPage});
 if(careerProviderIds.includes(source.provider)&&!['wttj','greenhouse','lever','ashby'].includes(source.provider))return careerProviderPage(source,task,{fetchPage});
 if(source.career_ops?.enabled&&careerProviderIds.includes(source.provider))return careerProviderPage(source,task,{fetchPage});
 const cursor=task.cursor||{};
 if(source.provider==='wttj'){
  const result=await searchWttjPage(source,{query:task.query,page:cursor.page??0,credentials,
   fetchText:async(u,o)=>{const r=await fetchPage(u,o);httpFailure(r);return r.body;},
   fetchJson:async(u,o)=>{const r=await fetchPage(u,o);httpFailure(r);return JSON.parse(r.body);}});
  return {...result,nextCursor:result.nextPage===null?null:{page:result.nextPage},page:cursor.page??0};
 }
 const api=source.api||{},pagination=api.pagination||{};
 let url=cursor.url||task.url,offset=cursor.offset??pagination.start??0,page=cursor.page??pagination.start??1;
 if(source.provider==='lever'){
  const u=new URL(url);u.searchParams.set('skip',String(offset));u.searchParams.set('limit',String(api.page_size||100));url=u.href;
 }else if(pagination.mode==='page'||pagination.mode==='offset'){
  const u=new URL(url);u.searchParams.set(pagination.param||(pagination.mode==='page'?'page':'offset'),String(pagination.mode==='page'?page:offset));
  if(pagination.size_param)u.searchParams.set(pagination.size_param,String(api.page_size||100));url=u.href;
 }
 const token=source.api_token_env?process.env[source.api_token_env]:null;
 if(source.api_token_env&&!token)throw Error('API credential missing');
 if(token&&new URL(url).origin!==new URL(task.url).origin)throw Error('Authenticated pagination changed API origin');
 const raw=await fetchPage(url,{headers:token?{Authorization:`Bearer ${token}`}:{}});
 httpFailure(raw);
 const body=JSON.parse(raw.body),rows=field(body,api.rows_path??(Array.isArray(body)?'':'jobs'));
 if(!Array.isArray(rows))throw Error('API rows_path must point to an array');
 const fields=api.fields||{};
 const jobs=rows.flatMap(row=>{
  if(!row||typeof row!=='object'||Array.isArray(row))return [{url:'',title:'',isJob:true}];
  if(source.provider==='greenhouse')return row.internal_job_id===null?[]:[{url:row.absolute_url,title:row.title,company:source.company||'',location:row.location?.name||'',requisitionId:text(row.requisition_id||row.id),description:row.content||'',...(row.id&&source.board_token?{verifiedIdentity:`greenhouse:${source.board_token}:${row.id}`,identityEvidence:{url,capturedAt:new Date().toISOString(),evidence:'Public Job Board API row absolute_url and posting id'},employerOriginal:employerUrl(row.absolute_url)}:{}),isJob:true}];
  if(source.provider==='lever')return [{url:row.hostedUrl,title:row.text,company:source.company||'',location:row.categories?.location||'',contract:row.categories?.commitment||'',requisitionId:text(row.id),description:row.descriptionPlain||'',isJob:true}];
  if(source.provider==='ashby')return row.isListed===false?[]:[{url:row.jobUrl,title:row.title,company:source.company||'',location:row.location||'',contract:row.employmentType||'',requisitionId:text(row.id),description:row.descriptionPlain||row.descriptionHtml||'',publishedAt:row.publishedAt,isJob:true}];
  return [{...Object.fromEntries(['url','title','company','location','jd','description','contract','requisitionId','publishedAt'].map(key=>[key,text(field(row,fields[key]??key))])),kind:row.kind,source:row.source,isJob:true}];
 });
 let nextCursor=null,complete=false,reason='pagination_not_configured';
 if(['greenhouse','ashby'].includes(source.provider)||api.exhaustive===true){complete=true;reason='exhausted';}
 else if(source.provider==='lever'){
  if(!rows.length){complete=true;reason='exhausted';}else{nextCursor={offset:offset+rows.length};reason='next_page';}
 }else if(pagination.next_path){
  const next=field(body,pagination.next_path);
  if(next){nextCursor={url:new URL(next,raw.finalUrl||url).href};reason='next_page';}
  else if(next===null||next===''||next===false){complete=true;reason='exhausted';}
  else reason='pagination_metadata_missing';
 }else if(['page','offset'].includes(pagination.mode)){
  const total=field(body,pagination.total_path),seen=(cursor.seenRows||0)+rows.length;
  if(!rows.length||Number.isFinite(total)&&seen>=total){complete=true;reason='exhausted';}
  else{nextCursor={page:page+1,offset:offset+rows.length,seenRows:seen};reason='next_page';}
 }
 return {jobs,rowCount:rows.length,nextCursor,complete,reason,url,page,total:field(body,pagination.total_path)};
}

export function listingNext(source,task,result){
 const pagination=source.pagination||{},cursor=task.cursor||{},page=cursor.page??pagination.start??1,offset=cursor.offset??pagination.start??0;
 const observedNext=result.nextUrls||[];
 if(observedNext.length)return {nextCursor:{urls:observedNext,page:page+1,followedNext:true},complete:false,reason:'next_page'};
 if(result.paginationComplete===true&&result.completionEvidence)return {nextCursor:null,complete:true,reason:'observed_end',evidence:result.completionEvidence};
 if(cursor.followedNext&&result.jobs.length&&!result.dynamic&&pagination.end_on_no_next!==false)return {nextCursor:null,complete:true,reason:'observed_next_chain_end',evidence:'Static postings at the terminal page of an observed next-link chain; no further next link.'};
 if(pagination.mode==='page'||pagination.mode==='offset'){
  if(result.jobs.length){
   const nextPage=page+1,nextOffset=offset+(pagination.page_size||result.jobs.length),template=pagination.url_template||source.search_url;
   if(!template)throw Error('Listing pagination requires url_template or search_url');
   let url=renderSearchUrl(template,{...task,page:nextPage,offset:nextOffset});
   if(!/\{(?:page|offset)\}/.test(template)){const u=new URL(url);u.searchParams.set(pagination.param||(pagination.mode==='page'?'page':'start'),String(pagination.mode==='page'?nextPage:nextOffset));url=u.href;}
   return {nextCursor:{urls:[url],page:nextPage,offset:nextOffset},complete:false,reason:'next_page'};
  }
  // Empty HTML can be a shell or a challenge. Only explicit evidence ends a crawl.
  return {nextCursor:null,complete:false,reason:'empty_listing_needs_verification'};
 }
 if(source.exhaustive_listing===true)return {nextCursor:null,complete:true,reason:'configured_static_listing'};
 return {nextCursor:null,complete:false,reason:result.jobs.length?'pagination_unverified':'no_usable_public_listing'};
}
