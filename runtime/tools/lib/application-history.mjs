import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {normalizeUrl} from './job-signals.mjs';
import {resolveStoragePath} from './storage-paths.mjs';

const protectedStates=new Set(['submitted','followup-due','known-application','submitting','submission-unconfirmed','blocked-login','blocked-captcha']);
const norm=value=>String(value||'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
export async function historyRecords(workspace){
 const file=path.join(workspace,'个人资料/dashboard/applications.sqlite');
 if(!await fs.stat(file).then(()=>true,error=>{if(error.code==='ENOENT')return false;throw error;}))return [];
 const {DatabaseSync}=await import('node:sqlite'),db=new DatabaseSync(file,{readOnly:true});
 try{return db.prepare('SELECT id,job_url,company,role,requisition_id,applied,awaiting_interview,awaiting_result,submission_verified,submission_evidence,archived_at FROM applications').all();}finally{db.close();}
}
async function receiptHash(workspace,value){
 try{
  const receipt=typeof value==='string'?JSON.parse(value):value;
  if(!receipt?.artifactPath||!receipt.artifactSha256)return 'missing';
  const base=await fs.realpath(workspace),file=await fs.realpath(await resolveStoragePath(workspace,receipt.artifactPath));
  if(!file.startsWith(base+path.sep))return 'outside-workspace';
  return createHash('sha256').update(await fs.readFile(file)).digest('hex')===receipt.artifactSha256?'hash-valid':'hash-mismatch';
 }catch{return 'unavailable';}
}
// Read-only identity and receipt consistency. Never marks a job submitted or merges fuzzy matches.
export async function checkApplicationHistory(workspace,jobs,{rows,ids}={}){
 rows??=await historyRecords(workspace);
 const histories=[...jobs.filter(j=>j.submitted||j.historyMatch&&!j.duplicateResolution||protectedStates.has(j.state)).map(j=>({id:j.id,url:j.url,aliases:j.urlAliases||[],company:j.company,title:j.title,requisition:j.requisitionId,receipt:j.submissionEvidence,confirmed:!!j.submitted&&['submitted','followup-due'].includes(j.state),state:j.state})),...rows.filter(r=>r.submission_verified===1||[r.applied,r.awaiting_interview,r.awaiting_result].includes('☑')).map(r=>({id:r.id,url:r.job_url,aliases:[],company:r.company,title:r.role,requisition:r.requisition_id,receipt:r.submission_evidence,confirmed:r.submission_verified===1,state:'dashboard-history'}))];
 const byUrl=new Map(),byId=new Map(),byTitle=new Map(),byRequisition=new Map();
 const add=(index,key,item)=>{if(key){if(!index.has(key))index.set(key,[]);index.get(key).push(item);}};
 for(const h of histories){add(byId,h.id,h);for(const url of [h.url,...h.aliases])add(byUrl,normalizeUrl(url),h);if(norm(h.company)&&norm(h.title))add(byTitle,norm(h.company)+'|'+norm(h.title),h);if(h.requisition&&norm(h.company))add(byRequisition,norm(h.company)+'|'+norm(h.requisition),h);}
 const checks=[];
 for(const job of jobs.filter(j=>!ids||ids.includes(j.id))){
  const exact=[...(byId.get(job.id)||[]),...[job.url,...(job.urlAliases||[])].flatMap(url=>byUrl.get(normalizeUrl(url))||[]),...(job.requisitionId?byRequisition.get(norm(job.company)+'|'+norm(job.requisitionId))||[]:[])];
  const matches=[...new Map(exact.map(h=>[h.id+'|'+h.state,h])).values()];
  const suspected=(byTitle.get(norm(job.company)+'|'+norm(job.title))||[]).filter(h=>h.id!==job.id);
  if(matches.length){
   const receipts=await Promise.all(matches.map(async h=>({id:h.id,state:h.state,confirmed:h.confirmed,artifact:await receiptHash(workspace,h.receipt)})));
   checks.push({id:job.id,disposition:'existing-application',receiptStatus:receipts.every(r=>r.confirmed&&r.artifact==='hash-valid')?'consistent':'needs-reconciliation',matches:receipts,action:'Do not resubmit. Reconcile only missing/inconsistent receipts; a hash check alone never proves submission.'});
  }else checks.push({id:job.id,disposition:suspected.length||job.possibleDuplicates?.length?'possible-duplicate':'new',matches:[...new Set([...suspected.map(h=>h.id),...(job.possibleDuplicates||[])])],action:suspected.length?'Verify distinct requisition/team/location; title similarity cannot merge applications.':undefined});
 }
 return checks;
}
