import path from 'node:path';
import {read,write,hash} from './core.mjs';

// Revalidate each page. An unchanged first page is never evidence about later pages.
export function conditionalFetcher(fetchPage,{directory,enabled=true,fullRefreshHours=168}={}){
 return async(url,opts={},source={})=>{
  if(!enabled||source.incremental?.conditional===false||(opts.method||'GET').toUpperCase()!=='GET')return fetchPage(url,{...opts,httpClient:source.http_client||opts.httpClient},source);
  const file=path.join(directory,hash(JSON.stringify([url,source.name||'',opts.headers||{}]))+'.json');
  const cached=await read(file,null),fresh=cached&&Date.now()-Date.parse(cached.savedAt)<fullRefreshHours*3600000;
  const headers={...opts.headers};
  if(fresh){if(cached.response.headers?.etag)headers['if-none-match']=cached.response.headers.etag;else if(cached.response.headers?.['last-modified'])headers['if-modified-since']=cached.response.headers['last-modified'];}
  const response=await fetchPage(url,{...opts,headers,httpClient:source.http_client||opts.httpClient},source);
  if(response.status===304){
   if(!fresh||!headers['if-none-match']&&!headers['if-modified-since'])throw Error('Unexpected 304 without a validated cached page');
   return {...cached.response,headers:{...cached.response.headers,...response.headers},revalidated:true};
  }
  if(response.status===200&&(response.headers?.etag||response.headers?.['last-modified']))await write(file,{savedAt:new Date().toISOString(),response});
  return response;
 };
}
