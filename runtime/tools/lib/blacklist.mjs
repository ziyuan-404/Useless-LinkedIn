import path from 'node:path';
import {root} from '../runtime.mjs';
import {read,normalizeUrl} from './core.mjs';
const companyKey=s=>String(s||'').normalize('NFKC').trim().toLocaleLowerCase();
export async function loadBlacklist(){
 const value=await read(path.join(root,'个人资料/operations/blacklist.json'),{version:1,entries:[]});
 if(value.version!==1||!Array.isArray(value.entries)||value.entries.some(x=>!x.reason?.trim()||!x.company&&!x.domain&&!x.url))throw Error('Invalid blacklist.json: each entry requires company/domain/url and reason');
 return value;
}
export function blacklistMatch(job,blacklist){
 let url;try{url=new URL(job.url);}catch{}
 return blacklist.entries.find(entry=>entry.enabled!==false&&(entry.company&&companyKey(entry.company)===companyKey(job.company)||entry.domain&&url&&(url.hostname===entry.domain.toLowerCase()||url.hostname.endsWith('.'+entry.domain.toLowerCase()))||entry.url&&normalizeUrl(entry.url)===normalizeUrl(job.url)))||null;
}
