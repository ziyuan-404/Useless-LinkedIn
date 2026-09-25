import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';

export const fields=['id','date','company','role','match_level','jd','mode','resume_path','letter_path','applied','awaiting_interview','awaiting_result','status','job_url','requisition_id','liveness','duplicate_status','knockout','channel','next_action','followup_date','last_contact','notes'];
export const labels=['记录 ID','日期','公司名称','申请职位','匹配度','完整 JD','投递模式','使用简历','动机信','已投递','等待面试','等待结果','执行状态','岗位链接','招聘编号','有效性','重复状态','Knock-out','投递渠道','下一步','跟进日期','最近联系','卡点/结果'];
export const dbPath=root=>path.join(root,'00-个人资料','dashboard','applications.sqlite');
export function openDashboard(root){
 const file=dbPath(root);fs.mkdirSync(path.dirname(file),{recursive:true});
 const db=new DatabaseSync(file);db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');
 db.exec(`CREATE TABLE IF NOT EXISTS applications (
 id TEXT PRIMARY KEY, date TEXT NOT NULL, company TEXT NOT NULL, role TEXT NOT NULL,
 match_level TEXT NOT NULL DEFAULT '', jd TEXT NOT NULL DEFAULT '', mode TEXT NOT NULL DEFAULT '',
 resume_path TEXT NOT NULL DEFAULT '', letter_path TEXT NOT NULL DEFAULT '',
 applied TEXT NOT NULL DEFAULT '☐', awaiting_interview TEXT NOT NULL DEFAULT '☐', awaiting_result TEXT NOT NULL DEFAULT '☐',
 status TEXT NOT NULL DEFAULT '待处理', job_url TEXT NOT NULL DEFAULT '', requisition_id TEXT NOT NULL DEFAULT '',
 liveness TEXT NOT NULL DEFAULT '', duplicate_status TEXT NOT NULL DEFAULT '', knockout TEXT NOT NULL DEFAULT '',
 channel TEXT NOT NULL DEFAULT '', next_action TEXT NOT NULL DEFAULT '', followup_date TEXT NOT NULL DEFAULT '',
 last_contact TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
 source_sheet TEXT, source_row INTEGER, submission_evidence TEXT NOT NULL DEFAULT '',
 submission_verified INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS application_events (
 event_id TEXT PRIMARY KEY, application_id TEXT NOT NULL REFERENCES applications(id),
 at TEXT NOT NULL, action TEXT NOT NULL, before_json TEXT, after_json TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS imports (
 source_sha256 TEXT PRIMARY KEY, source_path TEXT NOT NULL, imported_at TEXT NOT NULL,
 row_count INTEGER NOT NULL, url_count INTEGER NOT NULL);`);
 return db;
}
export function cleanInput(input,{existing=false,preserve=false}={}){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('A record object is required');
 const allowed=new Set([...fields,'submission_evidence','submission_verified','version']);
 for(const k of Object.keys(input))if(!allowed.has(k))throw Error(`Unknown field: ${k}`);
 const out={};for(const k of fields)if(Object.hasOwn(input,k)){
   if(typeof input[k]!=='string')throw Error(`${k} must be text`);
   out[k]=preserve?input[k]:input[k].trim();if(out[k].length>100000)throw Error(`${k} is too long`);
 }
 if(!existing){for(const k of ['id','date','company','role'])if(!out[k])throw Error(`${k} is required`);}
 if(out.id&&!/^[\p{L}\p{N}_.:-]{2,100}$/u.test(out.id))throw Error('Invalid record ID');
 if(out.date&&!/^\d{4}-\d{2}-\d{2}$/.test(out.date))throw Error('Date must be YYYY-MM-DD');
 if(out.job_url&&!/^https?:\/\//i.test(out.job_url))throw Error('Job URL must be HTTP(S)');
 for(const k of ['applied','awaiting_interview','awaiting_result'])if(out[k]&&!['☐','☑'].includes(out[k]))throw Error(`${k} must be ☐ or ☑`);
 if(Object.hasOwn(input,'submission_evidence')){
   if(typeof input.submission_evidence!=='string')throw Error('Submission evidence must be text');
   out.submission_evidence=input.submission_evidence.trim();
 }
 if(Object.hasOwn(input,'submission_verified'))throw Error('Verification is set only by the verification workflow');
 return out;
}
export function validateRecord(row){
 const checked=['applied','awaiting_interview','awaiting_result'].filter(k=>row[k]==='☑');
 if(checked.length>1)throw Error('Only one application stage may be checked');
 if((row.status==='已提交'||row.applied==='☑')&&!row.submission_evidence&&!row.source_sheet)throw Error('New submitted records require success evidence');
 if(row.status==='已提交'&&checked.length===0)throw Error('Submitted status requires one current stage');
}
export function insertRecord(db,input,{sourceSheet=null,sourceRow=null,action='created'}={}){
 const data=cleanInput(input,{preserve:Boolean(sourceSheet)});const now=new Date().toISOString();
 const row=Object.fromEntries(fields.map(k=>[k,data[k]??(k==='applied'||k==='awaiting_interview'||k==='awaiting_result'?'☐':k==='status'?'待处理':'')]));
 row.submission_evidence=data.submission_evidence??'';if(!sourceSheet)validateRecord({...row,source_sheet:sourceSheet});
 const cols=[...fields,'source_sheet','source_row','submission_evidence','created_at','updated_at'];
 db.prepare(`INSERT INTO applications (${cols.join(',')}) VALUES (${cols.map(()=>'?').join(',')})`).run(...fields.map(k=>row[k]),sourceSheet,sourceRow,row.submission_evidence,now,now);
 db.prepare('INSERT INTO application_events VALUES (?,?,?,?,?,?)').run(randomUUID(),row.id,now,action,null,JSON.stringify(row));
 return db.prepare('SELECT * FROM applications WHERE id=?').get(row.id);
}
export function updateRecord(db,id,input){
 const old=db.prepare('SELECT * FROM applications WHERE id=?').get(id);if(!old)throw Error('Record not found');
 if(!Number.isInteger(input.version)||input.version!==old.version)throw Error('Record changed; reload before saving');
 const changes=cleanInput(input,{existing:true,preserve:true});if(changes.id&&changes.id!==id)throw Error('Record ID cannot change');delete changes.id;
 const next={...old,...changes};validateRecord(next);
 const keys=Object.keys(changes);if(!keys.length)return old;
 const now=new Date().toISOString();db.exec('BEGIN IMMEDIATE');try{
  db.prepare(`UPDATE applications SET ${keys.map(k=>`${k}=?`).join(',')},version=version+1,updated_at=? WHERE id=?`).run(...keys.map(k=>changes[k]),now,id);
  const saved=db.prepare('SELECT * FROM applications WHERE id=?').get(id);
  db.prepare('INSERT INTO application_events VALUES (?,?,?,?,?,?)').run(randomUUID(),id,now,'updated',JSON.stringify(old),JSON.stringify(saved));db.exec('COMMIT');return saved;
 }catch(e){db.exec('ROLLBACK');throw e;}
}
export function summary(db){
 const rows=db.prepare('SELECT status,submission_verified,followup_date,applied,awaiting_interview,awaiting_result,jd FROM applications').all();
 const today=localDate();
 const closed=new Set(['跳过','拒绝','撤回','失效']);
 return {total:rows.length,byStatus:Object.fromEntries([...new Set(rows.map(x=>x.status))].map(s=>[s,rows.filter(x=>x.status===s).length])),markedSubmitted:rows.filter(x=>x.status==='已提交').length,pendingVerification:rows.filter(x=>x.status==='已提交'&&x.submission_verified!==1).length,verifiedSubmitted:rows.filter(x=>x.submission_verified===1).length,waitingUser:rows.filter(x=>x.status==='待用户').length,awaitingInterview:rows.filter(x=>x.awaiting_interview==='☑').length,awaitingResult:rows.filter(x=>x.awaiting_result==='☑').length,missingJd:rows.filter(x=>x.jd.trim().length<300).length,followupDue:rows.filter(x=>x.followup_date&&x.followup_date<=today&&!closed.has(x.status)).length,stageConflicts:rows.filter(x=>[x.applied,x.awaiting_interview,x.awaiting_result].filter(v=>v==='☑').length>1).length};
}
export function localDate(date=new Date()){
 const local=new Date(date.getTime()-date.getTimezoneOffset()*60000);
 return local.toISOString().slice(0,10);
}
export function syncSubmittedLead(db,job){
 if(job.state!=='submitted'||job.submitted!==true||!job.submissionEvidence)throw Error('Only a confirmed submitted lead can be synced');
 let receipt;try{receipt=JSON.parse(job.submissionEvidence);}catch{throw Error('Structured submission receipt required');}
 if(!['success-page','confirmation-email','platform-status'].includes(receipt.kind)||!/^[a-f0-9]{64}$/i.test(receipt.artifactSha256||''))throw Error('Structured submission receipt required');
 const row=db.prepare('SELECT * FROM applications WHERE job_url=? OR id=? ORDER BY CASE WHEN job_url=? THEN 0 ELSE 1 END LIMIT 1').get(job.url,job.id,job.url);
 if(row?.submission_verified===1&&row.submission_evidence===job.submissionEvidence)return row;
 let saved;
 if(row){
  if(row.job_url&&row.job_url!==job.url)throw Error('Dashboard ID belongs to a different posting');
  saved=updateRecord(db,row.id,{version:row.version,status:'已提交',applied:'☑',awaiting_interview:'☐',awaiting_result:'☐',job_url:job.url,submission_evidence:job.submissionEvidence});
 }else{
  saved=insertRecord(db,{id:job.id,date:new Date().toISOString().slice(0,10),company:job.company||'待核实公司',role:job.title||'待核实岗位',jd:job.jd||'',mode:job.applicationMode||'',resume_path:job.output||'',status:'已提交',applied:'☑',job_url:job.url,submission_evidence:job.submissionEvidence});
 }
 const now=new Date().toISOString();db.prepare('UPDATE applications SET submission_verified=1,updated_at=? WHERE id=?').run(now,saved.id);
 db.prepare('INSERT INTO application_events VALUES (?,?,?,?,?,?)').run(randomUUID(),saved.id,now,'submission-receipt-verified',null,JSON.stringify({leadId:job.id,submissionEvidence:job.submissionEvidence}));
 return db.prepare('SELECT * FROM applications WHERE id=?').get(saved.id);
}
