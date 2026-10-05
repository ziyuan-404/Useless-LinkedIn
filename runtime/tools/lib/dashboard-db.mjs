import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';

export const fields=['id','date','company','role','match_level','jd','mode','resume_path','letter_path','applied','awaiting_interview','awaiting_result','status','job_url','requisition_id','liveness','duplicate_status','knockout','channel','next_action','followup_date','last_contact','notes'];
// Keep the 23-column legacy import contract unchanged.
export const extraFields=['company_info','role_analysis','submitted_at'];
const recordFields=[...fields,...extraFields];
export const labels=['记录 ID','日期','公司名称','申请职位','匹配度','完整 JD','投递模式','使用简历','动机信','已投递','等待面试','等待结果','执行状态','岗位链接','招聘编号','有效性','重复状态','Knock-out','投递渠道','下一步','跟进日期','最近联系','卡点/结果'];
export const dbPath=root=>path.join(root,'个人资料','dashboard','applications.sqlite');
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
 company_info TEXT NOT NULL DEFAULT '', role_analysis TEXT NOT NULL DEFAULT '', archived_at TEXT NOT NULL DEFAULT '',
 source_sheet TEXT, source_row INTEGER, submission_evidence TEXT NOT NULL DEFAULT '',
 submission_verified INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS application_events (
 event_id TEXT PRIMARY KEY, application_id TEXT NOT NULL REFERENCES applications(id),
 at TEXT NOT NULL, action TEXT NOT NULL, before_json TEXT, after_json TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS imports (
 source_sha256 TEXT PRIMARY KEY, source_path TEXT NOT NULL, imported_at TEXT NOT NULL,
 row_count INTEGER NOT NULL, url_count INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS application_sync (
 application_id TEXT PRIMARY KEY REFERENCES applications(id), fields_json TEXT NOT NULL,
 sources_json TEXT NOT NULL, issues_json TEXT NOT NULL, updated_at TEXT NOT NULL);`);
 const columns=new Set(db.prepare('PRAGMA table_info(applications)').all().map(column=>column.name));
 for(const name of [...extraFields,'archived_at'])if(!columns.has(name))db.exec(`ALTER TABLE applications ADD COLUMN ${name} TEXT NOT NULL DEFAULT ''`);
 return db;
}
export function cleanInput(input,{existing=false,preserve=false}={}){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('A record object is required');
 const allowed=new Set([...recordFields,'submission_evidence','submission_verified','version']);
 for(const k of Object.keys(input))if(!allowed.has(k))throw Error(`Unknown field: ${k}`);
 const out={};for(const k of recordFields)if(Object.hasOwn(input,k)){
   if(typeof input[k]!=='string')throw Error(`${k} must be text`);
   out[k]=preserve?input[k]:input[k].trim();if(out[k].length>100000)throw Error(`${k} is too long`);
 }
 if(!existing){for(const k of ['id','date','company','role'])if(!out[k])throw Error(`${k} is required`);}
 if(out.id&&!/^[\p{L}\p{N}_.:-]{2,100}$/u.test(out.id))throw Error('Invalid record ID');
 if(out.date&&!/^\d{4}-\d{2}-\d{2}$/.test(out.date))throw Error('Date must be YYYY-MM-DD');
 if(out.submitted_at){if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(out.submitted_at)||!Number.isFinite(Date.parse(out.submitted_at)))throw Error('Submission time must include a valid date, minute and timezone');out.submitted_at=new Date(out.submitted_at).toISOString();}
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
 const row=Object.fromEntries(recordFields.map(k=>[k,data[k]??(k==='applied'||k==='awaiting_interview'||k==='awaiting_result'?'☐':k==='status'?'待处理':'')]));
 row.submission_evidence=data.submission_evidence??'';if(!sourceSheet)validateRecord({...row,source_sheet:sourceSheet});
 const cols=[...recordFields,'source_sheet','source_row','submission_evidence','created_at','updated_at'];
 db.prepare(`INSERT INTO applications (${cols.join(',')}) VALUES (${cols.map(()=>'?').join(',')})`).run(...recordFields.map(k=>row[k]),sourceSheet,sourceRow,row.submission_evidence,now,now);
 db.prepare('INSERT INTO application_events VALUES (?,?,?,?,?,?)').run(randomUUID(),row.id,now,action,null,JSON.stringify(row));
 return db.prepare('SELECT * FROM applications WHERE id=?').get(row.id);
}
export function updateRecord(db,id,input,{transactional=true,action='updated'}={}){
 const old=db.prepare("SELECT * FROM applications WHERE id=? AND archived_at=''").get(id);if(!old)throw Error('Record not found');
 if(!Number.isInteger(input.version)||input.version!==old.version)throw Error('Record changed; reload before saving');
 const changes=cleanInput(input,{existing:true,preserve:true});if(changes.id&&changes.id!==id)throw Error('Record ID cannot change');delete changes.id;
 const next={...old,...changes};validateRecord(next);
 const keys=Object.keys(changes);if(!keys.length)return old;
 const now=new Date().toISOString();if(transactional)db.exec('BEGIN IMMEDIATE');try{
  db.prepare(`UPDATE applications SET ${keys.map(k=>`${k}=?`).join(',')},version=version+1,updated_at=? WHERE id=?`).run(...keys.map(k=>changes[k]),now,id);
  const saved=db.prepare('SELECT * FROM applications WHERE id=?').get(id);
  db.prepare('INSERT INTO application_events VALUES (?,?,?,?,?,?)').run(randomUUID(),id,now,action,JSON.stringify(old),JSON.stringify(saved));if(transactional)db.exec('COMMIT');return saved;
 }catch(e){if(transactional)db.exec('ROLLBACK');throw e;}
}
export function summary(db){
 const rows=db.prepare("SELECT status,submission_verified,followup_date,applied,awaiting_interview,awaiting_result,jd FROM applications WHERE archived_at=''").all();
 const today=localDate();
 const closed=new Set(['跳过','拒绝','撤回','失效']);
 return {total:rows.length,byStatus:Object.fromEntries([...new Set(rows.map(x=>x.status))].map(s=>[s,rows.filter(x=>x.status===s).length])),markedSubmitted:rows.filter(x=>x.status==='已提交').length,pendingVerification:rows.filter(x=>x.status==='已提交'&&x.submission_verified!==1).length,verifiedSubmitted:rows.filter(x=>x.submission_verified===1).length,waitingUser:rows.filter(x=>x.status==='待用户').length,awaitingInterview:rows.filter(x=>x.awaiting_interview==='☑').length,awaitingResult:rows.filter(x=>x.awaiting_result==='☑').length,missingJd:rows.filter(x=>x.jd.trim().length<300).length,followupDue:rows.filter(x=>x.followup_date&&x.followup_date<=today&&!closed.has(x.status)).length,stageConflicts:rows.filter(x=>[x.applied,x.awaiting_interview,x.awaiting_result].filter(v=>v==='☑').length>1).length};
}
export function setRecordArchived(db,id,input,archived=true){
 const old=db.prepare('SELECT * FROM applications WHERE id=?').get(id);if(!old)throw Error('Record not found');
 if(!Number.isInteger(input?.version)||input.version!==old.version)throw Error('Record changed; reload before saving');
 if(Boolean(old.archived_at)===archived)return old;
 const now=new Date().toISOString();db.exec('BEGIN IMMEDIATE');
 try{
  db.prepare('UPDATE applications SET archived_at=?,version=version+1,updated_at=? WHERE id=?').run(archived?now:'',now,id);
  const saved=db.prepare('SELECT * FROM applications WHERE id=?').get(id);
  db.prepare('INSERT INTO application_events VALUES (?,?,?,?,?,?)').run(randomUUID(),id,now,archived?'deleted':'restored',JSON.stringify(old),JSON.stringify(saved));
  db.exec('COMMIT');return saved;
 }catch(error){db.exec('ROLLBACK');throw error;}
}
export function localDate(date=new Date()){
 const local=new Date(date.getTime()-date.getTimezoneOffset()*60000);
 return local.toISOString().slice(0,10);
}
function followupFromReceipt(receipt){
 const day=Number.isFinite(Date.parse(receipt.observedAt))?localDate(new Date(receipt.observedAt)):null;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day||'')||!Number.isFinite(Date.parse(receipt.observedAt)))throw Error('Submission receipt needs a valid observedAt date');
 const [year,month,date]=day.split('-').map(Number);
 return new Date(Date.UTC(year,month-1,date+7)).toISOString().slice(0,10);
}
export function syncSubmittedLead(db,job,packet={}){
 if(job.state!=='submitted'||job.submitted!==true||!job.submissionEvidence)throw Error('Only a confirmed submitted lead can be synced');
 return syncDashboardLead(db,job,packet);
}
export function syncDashboardLead(db,job,{values={},sources={},issues=[],repair={}}={}){
 const confirmed=['submitted','followup-due'].includes(job.state)&&job.submitted===true;
 let followupDate,instant;
 if(confirmed){
 let receipt;try{receipt=JSON.parse(job.submissionEvidence);}catch{throw Error('Structured submission receipt required');}
 if(!['success-page','confirmation-email','platform-status'].includes(receipt.kind)||!/^[a-f0-9]{64}$/i.test(receipt.artifactSha256||''))throw Error('Structured submission receipt required');
 followupDate=followupFromReceipt(receipt);
 instant=receipt.submittedAt||receipt.observedAt;
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}.*(?:Z|[+-]\d{2}:\d{2})$/.test(instant)||!Number.isFinite(Date.parse(instant)))throw Error('Submission receipt time requires an explicit timezone');
 }
 const matchLevel=['高','中','低','延伸','无法评分'].includes(job.matchLevel)?job.matchLevel:'无法评分';
 const nextAction=date=>`等待回复；${date} 检查是否需要首次跟进`;
 db.exec('BEGIN IMMEDIATE');try{
 const idRow=db.prepare('SELECT * FROM applications WHERE id=?').get(job.id);
 if(idRow?.job_url&&idRow.job_url!==job.url)throw Error('Dashboard ID belongs to a different posting');
 const matches=db.prepare('SELECT * FROM applications WHERE job_url=? OR id=?').all(job.url,job.id);
 if(matches.length>1)throw Error('Multiple Dashboard records match this lead; resolve identity before syncing');
 const row=matches[0];
 if(row?.archived_at){db.exec('COMMIT');return row;}
 const stageStatus={discovered:'待处理','awaiting-agent':'待处理','needs-decision':'待用户','needs-verification':'受阻','duplicate-review':'待用户',rejected:'跳过',expired:'失效','generation-failed':'受阻','materials-pending-review':'材料已准备','review-required':'材料已准备',approved:'材料已准备',submitting:'投递中','submission-unconfirmed':'待确认提交结果','blocked-login':'受阻','blocked-captcha':'受阻'};
 const defaults={company:job.company||'待核实公司',role:job.title||'待核实岗位',job_url:job.url,jd:job.jd||'',mode:job.applicationMode||'',resume_path:job.output||'',...values};
 if(confirmed)Object.assign(defaults,{match_level:values.match_level||matchLevel,status:'已提交',submission_evidence:job.submissionEvidence,followup_date:followupDate,next_action:nextAction(row?.followup_date||followupDate)});
 else defaults.status=values.status||stageStatus[job.state]||'待处理';
 // Preserve date-only historical records when a later observation cannot establish their submission time.
 if(confirmed){const receipt=JSON.parse(job.submissionEvidence);if(receipt.submittedAt||!row||!row.source_sheet&&row.date===localDate(new Date(instant)))defaults.submitted_at=new Date(instant).toISOString();}
 const previous=db.prepare('SELECT * FROM application_sync WHERE application_id=?').get(row?.id||job.id);
 const owned=previous?JSON.parse(previous.fields_json):{};
 const nextOwned={...owned},conflicts=[];
 const changes={};
 for(const [key,value] of Object.entries(defaults)){
  if(!value)continue;
  if(!recordFields.includes(key)&&key!=='submission_evidence')throw Error(`Invalid sync field: ${key}`);
  if(!row||!row[key]||owned[key]===row[key]||repair[key]===row[key]&&!row.source_sheet){changes[key]=value;nextOwned[key]=value;}
  else if(row[key]!==value)conflicts.push({field:key,reason:'existing_value_preserved',severity:'info'});
 }
 // Receipt evidence can verify submission, but cannot reset an interview/result stage or a later human outcome.
 if(confirmed){changes.submission_evidence=job.submissionEvidence;nextOwned.submission_evidence=job.submissionEvidence;
  if(!row||!['拒绝','撤回','失效'].includes(row.status)){changes.status='已提交';nextOwned.status='已提交';}
  if(!row||![row.applied,row.awaiting_interview,row.awaiting_result].includes('☑')){changes.applied='☑';changes.awaiting_interview='☐';changes.awaiting_result='☐';}
 }else if(row?.submission_verified===1){delete changes.status;delete changes.next_action;delete changes.followup_date;}
 let saved;
 if(row){const changed=Object.fromEntries(Object.entries(changes).filter(([k,v])=>row[k]!==v));saved=Object.keys(changed).length?updateRecord(db,row.id,{version:row.version,...changed},{transactional:false}):row;}
 else saved=insertRecord(db,{id:job.id,date:localDate(new Date(instant||job.createdAt||Date.now())),...changes});
 const now=new Date().toISOString();
 if(confirmed&&(!row?.submission_verified||row.submission_evidence!==job.submissionEvidence)){
  db.prepare('UPDATE applications SET submission_verified=1,updated_at=? WHERE id=?').run(now,saved.id);
  db.prepare('INSERT INTO application_events VALUES (?,?,?,?,?,?)').run(randomUUID(),saved.id,now,'submission-receipt-verified',null,JSON.stringify({leadId:job.id,submissionEvidence:job.submissionEvidence}));
 }
 const sourceJson=JSON.stringify(sources),issuesJson=JSON.stringify([...issues,...conflicts.filter(c=>saved[c.field]!==defaults[c.field])]),fieldsJson=JSON.stringify(nextOwned);
 if(!previous||previous.fields_json!==fieldsJson||previous.sources_json!==sourceJson||previous.issues_json!==issuesJson){
  db.prepare('INSERT INTO application_sync VALUES (?,?,?,?,?) ON CONFLICT(application_id) DO UPDATE SET fields_json=excluded.fields_json,sources_json=excluded.sources_json,issues_json=excluded.issues_json,updated_at=excluded.updated_at').run(saved.id,fieldsJson,sourceJson,issuesJson,now);
 }
 db.exec('COMMIT');return db.prepare('SELECT * FROM applications WHERE id=?').get(saved.id);
 }catch(error){db.exec('ROLLBACK');throw error;}
}
