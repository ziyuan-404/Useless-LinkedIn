import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {normalizeUrl,postingIdentityMismatch} from './job-signals.mjs';

export const identityUrls=job=>[...new Set([job.url,...(job.urlAliases||[])].map(normalizeUrl).filter(Boolean))];
export function linkedPosting(jobs,url){return jobs.find(j=>identityUrls(j).includes(normalizeUrl(url)));}
export async function validatePostingLink(workspace,jobs,item){
 const file=await fs.realpath(path.resolve(workspace,item.evidenceFile||'')),base=await fs.realpath(workspace);
 if(!file.startsWith(base+path.sep))throw Error('Identity evidence must be inside workspace');
 const bytes=await fs.readFile(file),e=JSON.parse(bytes.toString('utf8'));
 const from=normalizeUrl(item.fromUrl||e.fromUrl),to=normalizeUrl(item.toUrl||e.toUrl);
 if(e.kind!=='posting-route'||!from||!to||from===to||normalizeUrl(e.fromUrl)!==from||normalizeUrl(e.toUrl)!==to||normalizeUrl(e.observedHref)!==to||!['apply-link','redirect'].includes(e.action)||!Number.isFinite(Date.parse(e.capturedAt))||Math.abs(Date.now()-Date.parse(e.capturedAt))>86400000)throw Error('Identity requires a recent observed posting link/redirect, exact source and target URLs');
 const source=linkedPosting(jobs,from),target=linkedPosting(jobs,to);
 if(!source||!target)throw Error('Import both posting URLs before linking; titles cannot establish identity');
 if(postingIdentityMismatch(source,target))throw Error('Observed target conflicts with the source posting title/company; verify the route before linking');
 if(source.requisitionId&&target.requisitionId&&source.requisitionId!==target.requisitionId)throw Error('Conflicting requisition IDs cannot be linked');
 return {fromUrl:from,toUrl:to,sourceId:source.id,targetId:target.id,evidenceFile:path.relative(workspace,file),evidenceSha256:createHash('sha256').update(bytes).digest('hex'),capturedAt:e.capturedAt,action:e.action};
}
// Add proven aliases without copying submission state, receipts or candidate decisions.
export function applyPostingLinks(jobs,links){
 for(const link of links){
  const urls=new Set([link.fromUrl,link.toUrl]);let members=[];let changed=true;
  while(changed){changed=false;for(const j of jobs)if(identityUrls(j).some(u=>urls.has(u))){if(!members.includes(j))members.push(j);for(const u of identityUrls(j))if(!urls.has(u)){urls.add(u);changed=true;}}}
  for(const j of members){j.urlAliases=[...urls].filter(u=>u!==normalizeUrl(j.url));j.postingLinks=[...(j.postingLinks||[]).filter(e=>!(e.fromUrl===link.fromUrl&&e.toUrl===link.toUrl)),link];}
 }
 return links.length;
}
