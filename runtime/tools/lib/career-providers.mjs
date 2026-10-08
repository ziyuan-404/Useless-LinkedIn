import fs from 'node:fs/promises';
import path from 'node:path';
import {skillRoot} from '../runtime.mjs';
import {home,hash,read,write,publicUrl} from './core.mjs';
import {httpFailure} from './discovery-policy.mjs';
import {loadProviders,resolveProvider} from '../../vendor/career-ops/providers/_registry.mjs';
import {withProviderTransport} from '../../vendor/career-ops/providers/_http.mjs';
import {careerProviderIds} from '../../vendor/career-ops/provider-ids.mjs';

export {careerProviderIds};
let registry;
export async function careerProviders(){
 if(!registry){registry=await loadProviders(path.join(skillRoot,'runtime/vendor/career-ops/providers'));if(registry.size!==careerProviderIds.length)throw Error('Career provider inventory is incomplete; inspect import diagnostics');}
 return registry;
}
export function careerEntry(source){
 const options=source.career_ops||{};
 return {...source,...options,name:source.company||source.name,careers_url:options.careers_url||source.career_url||source.search_url,api:options.api||source.api_url,keywords:options.keywords||source.queries};
}
export async function detectCareerProvider(source){return resolveProvider(careerEntry(source),await careerProviders(),{skipIds:['local-parser']});}
export async function enrichCareerSources(config){
 for(const source of config.portals){
  if(source.provider||source.career_ops?.enabled===false||!source.career_url)continue;
  const hit=await detectCareerProvider(source);if(hit?.provider){source.provider=hit.provider.id;source.detectedProvider=true;}
 }
 return config;
}

// Upstream plugins expose a whole-board fetch. Persist every successful response
// so a budget interruption can replay earlier pages without another request.
export async function careerProviderPage(source,task,{fetchPage,directory=path.join(home,'provider-runs'),providers}={}){
 const inventory=providers||await careerProviders(),provider=inventory.get(source.provider);
 if(!provider)throw Error('Unknown career provider: '+source.provider);
 const runKey=hash(JSON.stringify([task.id||source.name,task.sourceSignature||source,task.cycle||1])),runDir=path.join(directory,runKey),responses=path.join(runDir,'responses');
 await fs.mkdir(responses,{recursive:true});
 let requests=0,replayed=0,failure=null;
 const observations=[];
 const transport=async(url,opts={})=>{
  publicUrl(url);if(opts.body&&typeof opts.body!=='string')throw Error('Provider request body must be text');
  const key=hash(JSON.stringify([url,opts.method||'GET',opts.body||'',opts.headers||{}])),file=path.join(responses,key+'.json');
  let raw=await read(file,null);const replayedResponse=!!raw;
  if(raw&&raw.sha256!==hash(JSON.stringify(raw.response)))raw=null;
  if(raw){raw=raw.response;replayed++;}
  else{
   try{
    const requestOptions={...opts,timeoutMs:Math.min(opts.timeoutMs||18000,60000)};delete requestOptions.onResponse;
    raw=await fetchPage(url,requestOptions);requests++;
    if(opts.redirect==='error'&&raw.finalUrl&&raw.finalUrl!==url)throw Error('Provider refused redirect');
    if(!(opts.redirect==='manual'&&raw.status>=300&&raw.status<400)){
     try{httpFailure(raw);}catch(error){Object.assign(error,{body:raw.body,location:raw.headers?.location});throw error;}
    }
    // Do not persist cookies, credentials or public API keys from headers.
    raw={status:raw.status,body:raw.body,finalUrl:raw.finalUrl||url,headers:Object.fromEntries(Object.entries(raw.headers||{}).filter(([key])=>!/(cookie|authorization|api.key)/i.test(key)))};
    await write(file,{sha256:hash(JSON.stringify(raw)),response:raw});
   }catch(error){failure=error;throw error;}
  }
  observations.push({url,status:raw.status,replayed:replayedResponse,bytes:Buffer.byteLength(raw.body)});
  const response=new Response([204,205,304].includes(raw.status)?null:raw.body,{status:raw.status,headers:raw.headers});Object.defineProperty(response,'url',{value:raw.finalUrl});opts.onResponse?.(response);return response;
 };
 const checkedText=async(u,o)=>{const response=await transport(u,o),body=await response.text();if(!response.ok){failure=Object.assign(Error('HTTP '+response.status),{status:response.status,body,location:response.headers.get('location'),retryAfter:response.headers.get('retry-after')});throw failure;}return body;};
 const ctx={transport:'http',fetchJson:async(u,o)=>JSON.parse(await checkedText(u,o)),fetchText:checkedText,fetchResponse:transport,
  ...(source.career_ops?.max_pages?{maxPages:source.career_ops.max_pages}:{}),
  sleep:async ms=>{if(ms>1000)throw Object.assign(Error('provider_delay_deferred'),{deferredUntil:new Date(Date.now()+ms).toISOString()});if(ms)await new Promise(r=>setTimeout(r,ms));}};
 let rows;
 try{rows=await withProviderTransport(transport,()=>provider.fetch(careerEntry(source),ctx));}
 catch(error){await write(path.join(runDir,'progress.json'),{provider:source.provider,requests,replayed,observations,failed:true,failureClass:error.budget?'budget':error.status||error.name});throw error;}
 if(!Array.isArray(rows))throw Error('Career provider must return posting array');
 const jobs=rows.map(row=>({...row,company:row.company||source.company||'',description:row.description||'',publishedAt:row.postedAt&&Number.isFinite(row.postedAt)?new Date(row.postedAt).toISOString():row.publishedAt,isJob:true}));
 // A plugin returning an array does not prove all pages were exhausted. Keep
 // paginated/filtered provider coverage unresolved unless explicitly verified.
 const complete=!failure&&!ctx.maxPages&&(source.provider_exhaustive===true||['greenhouse','lever','ashby'].includes(source.provider));
 await write(path.join(runDir,'progress.json'),{provider:source.provider,requests,replayed,observations,count:jobs.length,complete,partialReason:failure?.budget?'configured_request_budget':failure?.status||null});
 return {jobs,rowCount:rows.length,nextCursor:failure?{replay:true}:null,complete,reason:failure?'provider_partial_fetch':complete?'provider_exhausted':'provider_coverage_unverified',...(failure?{providerFailure:{message:failure.message,status:failure.status,budget:failure.budget,deferredUntil:failure.deferredUntil,blocked:failure.blocked,code:failure.code,retryAfter:failure.retryAfter}}:{}),url:task.url,page:0,incrementalEligible:false,providerRun:runDir};
}
