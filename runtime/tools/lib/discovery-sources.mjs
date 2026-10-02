import {searchWttjPage} from './wttj-search.mjs';
import {renderSearchUrl} from './discovery-plan.mjs';

export function field(object,path){return path===''?object:String(path||'').split('.').reduce((value,key)=>value?.[key],object);}
const text=value=>typeof value==='string'?value:typeof value==='number'?String(value):'';
export function inferCareerSource(raw){
 try{
  const url=new URL(raw),parts=url.pathname.split('/').filter(Boolean);
  if(['boards.greenhouse.io','job-boards.greenhouse.io'].includes(url.hostname)&&parts[0])return {name:`Greenhouse: ${parts[0]}`,provider:'greenhouse',board_token:parts[0],career_url:`${url.origin}/${parts[0]}`,enabled:true};
  if(['jobs.lever.co','jobs.eu.lever.co'].includes(url.hostname)&&parts[0])return {name:`Lever: ${parts[0]}`,provider:'lever',site:parts[0],region:url.hostname.includes('.eu.')?'eu':'global',career_url:`${url.origin}/${parts[0]}`,enabled:true};
 }catch{}
 return null;
}
export async function readApiPage(source,task,{fetchPage,credentials}){
 const cursor=task.cursor||{};
 if(source.provider==='wttj'){
  const result=await searchWttjPage(source,{query:task.query,page:cursor.page??0,credentials,
   fetchText:async(u,o)=>{const r=await fetchPage(u,o);if(r.status!==200)throw Error(`HTTP ${r.status}`);return r.body;},
   fetchJson:async(u,o)=>{const r=await fetchPage(u,o);if(r.status!==200)throw Error(`HTTP ${r.status}`);return JSON.parse(r.body);}});
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
 if(raw.status!==200)throw Error(`HTTP ${raw.status}`);
 const body=JSON.parse(raw.body),rows=field(body,api.rows_path??(Array.isArray(body)?'':'jobs'));
 if(!Array.isArray(rows))throw Error('API rows_path must point to an array');
 const fields=api.fields||{};
 const jobs=rows.flatMap(row=>{
  if(source.provider==='greenhouse')return row.internal_job_id===null?[]:[{url:row.absolute_url,title:row.title,company:source.company||'',location:row.location?.name||'',requisitionId:text(row.requisition_id||row.id),description:row.content||'',isJob:true}];
  if(source.provider==='lever')return [{url:row.hostedUrl,title:row.text,company:source.company||'',location:row.categories?.location||'',contract:row.categories?.commitment||'',requisitionId:text(row.id),description:row.descriptionPlain||'',isJob:true}];
  return [{...Object.fromEntries(['url','title','company','location','jd','description','contract','requisitionId','publishedAt'].map(key=>[key,text(field(row,fields[key]??key))])),kind:row.kind,source:row.source,isJob:true}];
 });
 let nextCursor=null,complete=false,reason='pagination_not_configured';
 if(source.provider==='greenhouse'||api.exhaustive===true){complete=true;reason='exhausted';}
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
 if(observedNext.length)return {nextCursor:{urls:observedNext,page:page+1},complete:false,reason:'next_page'};
 if(result.paginationComplete===true&&result.completionEvidence)return {nextCursor:null,complete:true,reason:'observed_end',evidence:result.completionEvidence};
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
