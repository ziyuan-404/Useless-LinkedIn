import {publicUrl} from './core.mjs';
import {httpFailure} from './discovery-policy.mjs';

export async function anySearchSuggestions(task,settings,{fetchPage}){
 const url=settings.api_url||'https://api.anysearch.com/v1/search',token=settings.api_token_env?process.env[settings.api_token_env]:null;
 if(settings.api_token_env&&!token)throw Object.assign(Error('API credentials missing: '+settings.api_token_env),{credentialsMissing:true});
 publicUrl(url);if(new URL(url).protocol!=='https:'&&!process.env.USELESS_LINKEDIN_TEST_LOCAL)throw Error('AnySearch requires HTTPS');
 const raw=await fetchPage(url,{method:'POST',credentialHeaders:!!token,headers:{'content-type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({query:task.query,max_results:10,language:settings.language||'fr',zone:settings.zone||'intl',...(settings.tag?{tag:settings.tag}:{}),...(settings.params?{params:settings.params}:{})})});
 httpFailure(raw);let body;try{body=JSON.parse(raw.body);}catch{throw Error('Invalid AnySearch response');}
 if(body.code!==0)throw Error('AnySearch returned a non-success business code');
 if(!Array.isArray(body.data?.results))throw Error('AnySearch results must be an array');
 const suggestions=body.data.results.flatMap(row=>{try{return [{url:publicUrl(row.url),title:String(row.title||''),snippet:String(row.snippet||row.content||'')}];}catch{return [];}});
 return {suggestions,received:body.data.results.length,reason:'web_results_need_verification',providerWindow:10};
}
