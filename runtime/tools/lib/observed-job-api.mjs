import {publicUrl} from './core.mjs';

// Learn only public GET endpoints with explicit JobPosting objects and observed
// pagination evidence. Opaque cookies, signed URLs and arbitrary XHR are never replayed.
export function observedJobApi(candidate,sourceUrl){
 try{
  const u=new URL(publicUrl(candidate.url)),origin=new URL(sourceUrl).origin;
  if(u.origin!==origin||candidate.method!=='GET'||candidate.authenticated)return null;
  if([...u.searchParams.keys()].some(k=>/token|key|auth|signature|session|credential/i.test(k)))return null;
  const data=JSON.parse(candidate.body);let rows,rowsPath;
  if(Array.isArray(data)){rows=data;rowsPath='';}else if(Array.isArray(data.jobs)){rows=data.jobs;rowsPath='jobs';}else return null;
  if(!rows.length||rows.some(j=>j?.['@type']!=='JobPosting'||typeof j.title!=='string'||typeof j.url!=='string'||typeof j.description!=='string'||new URL(publicUrl(j.url),sourceUrl).origin!==origin))return null;
  const api={rows_path:rowsPath,fields:{url:'url',title:'title',company:'hiringOrganization.name',description:'description',contract:'employmentType',location:'jobLocation.address.addressLocality',requisitionId:'identifier.value',publishedAt:'datePosted'}};
  if(!Array.isArray(data)&&Object.hasOwn(data,'next')&&(data.next===null||typeof data.next==='string'))api.pagination={next_path:'next'};
  else if(!Array.isArray(data)&&Number.isInteger(data.total)&&data.total===rows.length)api.exhaustive=true;
  return {api_url:u.href,api,observedAt:new Date().toISOString(),evidence:'Public anonymous GET response contains explicit JobPosting rows; pagination is only claimed when observed in the response.'};
 }catch{return null;}
}
