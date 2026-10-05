import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {jobDirectory,resolveStoragePath} from './storage-paths.mjs';
import {openDashboard,syncDashboardLead,dbPath} from './dashboard-db.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex');
const text=value=>typeof value==='string'?value.trim():'';
const levels=new Set(['高','中','低','延伸','无法评分']);
async function optionalJson(file){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function inside(workspace,file){
 const resolved=await resolveStoragePath(workspace,file);
 const realRoot=await fs.realpath(workspace),real=await fs.realpath(resolved);
 if(!real.startsWith(realRoot+path.sep))throw Error('Sync source outside workspace');
 return real;
}
export async function dashboardPacket(workspace,home,job){
 const dir=await jobDirectory(workspace,home,job),values={},sources={},issues=[],repair={};
 const put=(key,value,source)=>{if(text(value)){values[key]=value;sources[key]=source;}};
 const context=await optionalJson(path.join(dir,'context.json'));
 const assessment=await optionalJson(path.join(dir,'assessment.json'));
 const contextValid=context?.contextHash&&context.contextHash===job.contextHash&&(!context.url||context.url===job.url);
 if(context&&!contextValid)issues.push({field:'jd',reason:'context_identity_or_hash_mismatch'});
 let jdFile;try{jdFile=await fs.readFile(path.join(dir,'jd.txt'),'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
 if(contextValid&&typeof context.captured?.jd==='string'&&jdFile===context.captured.jd){
  put('jd',jdFile,{path:path.join(dir,'jd.txt'),sha256:sha(jdFile)});
 }else if(job.jd?.length>=300&&!context){put('jd',job.jd,{leadId:job.id,field:'jd',sha256:sha(job.jd)});}
 else if(job.jd?.length>=300&&contextValid&&job.jd===context.captured?.jd)put('jd',job.jd,{path:path.join(dir,'context.json'),sha256:sha(job.jd)});
 else {values.jd='';issues.push({field:'jd',reason:jdFile?'jd_sources_disagree':'full_jd_source_missing'});}
 let validAssessment=assessment&&contextValid&&(!assessment.contextHash||assessment.contextHash===job.contextHash);
 if(validAssessment&&job.approvalSnapshot?.assessmentHash)validAssessment=sha(await fs.readFile(path.join(dir,'assessment.json')))===job.approvalSnapshot.assessmentHash;
 if(assessment&&!validAssessment)issues.push({field:'role_analysis',reason:'assessment_changed_or_context_mismatch'});
 const assessmentSource={path:path.join(dir,'assessment.json'),contextHash:job.contextHash};
 if(validAssessment){
  const ko=typeof assessment.ko==='string'?assessment.ko:assessment.ko?.status||assessment.ko?.result;
  put('knockout',ko,assessmentSource);
  const reasons=['A','B','C','D','E','F','G'].flatMap(k=>text(assessment.sections?.[k]?.reason)?[`${k}: ${assessment.sections[k].reason}`]:[]);
  if(!reasons.length&&text(assessment.reason))reasons.push(assessment.reason);
  if(!reasons.length&&Array.isArray(assessment.ko?.items))reasons.push(...assessment.ko.items.map(item=>`${item.key}: ${item.result} — ${item.reason}`));
  if(!reasons.length&&text(job.matchReview?.reason))reasons.push(job.matchReview.reason);
  if(assessment.decision?.gaps?.length)reasons.push('缺口 / 待核实：\n'+assessment.decision.gaps.map(g=>'- '+g).join('\n'));
  put('role_analysis',reasons.join('\n\n'),assessmentSource);
  put('mode',job.applicationMode||(['precision','bulk'].includes(assessment.decision?.route)?assessment.decision.route:''),assessmentSource);
  if(levels.has(job.matchLevel))put('match_level',job.matchLevel,job.matchReview?{leadId:job.id,field:'matchReview'}:assessmentSource);
  else if(levels.has(assessment.matchLevel))put('match_level',assessment.matchLevel,assessmentSource);
  put('notes',[assessment.userOverride?.instruction?'用户指定投递：'+assessment.userOverride.instruction:'',assessment.reason,assessment.decision?.gaps?.length?'未决项：'+assessment.decision.gaps.join('；'):''].filter(Boolean).join('\n'),assessmentSource);
 }
 if(!values.knockout&&text(job.ko))put('knockout',job.ko,{leadId:job.id,field:'ko'});
 if(!values.mode&&job.applicationMode)put('mode',job.applicationMode,{leadId:job.id,field:'applicationMode'});
 if(!values.match_level&&levels.has(job.matchLevel))put('match_level',job.matchLevel,{leadId:job.id,field:'matchReview'});
 if(!values.match_level)issues.push({field:'match_level',reason:'reviewed_match_level_missing',severity:'info'});
 const capture=contextValid?context.captured:null;
 const live=job.liveness||capture?.liveness;
 put('liveness',live?.result?[live.result,live.reason,capture?.capturedAt?'采集于 '+capture.capturedAt:''].filter(Boolean).join('；'):'',{path:path.join(dir,'context.json'),leadId:job.id,field:'liveness'});
 put('requisition_id',job.requisitionId||capture?.structuredJob?.identifier?.value||capture?.structuredJob?.identifier,{leadId:job.id,field:'requisitionId'});
 if(!values.requisition_id)issues.push({field:'requisition_id',reason:'not_in_source',severity:'info'});
 issues.push({field:'last_contact',reason:'no_confirmed_contact_event',severity:'info'});
 const duplicates=job.possibleDuplicates||[];
 put('duplicate_status',duplicates.length?'候选重复项待复核：'+duplicates.join(', '):job.historyMatch&&job.historyEvidence?.recordId!==job.id?'历史申请命中，需复核':job.historyMatch?'历史命中当前申请自身；候选重复项为 0':'候选重复项为 0；不代表已核验提交',{leadId:job.id,field:'possibleDuplicates/historyEvidence'});
 let receipt;
 const confirmed=['submitted','followup-due'].includes(job.state)&&job.submitted===true;
 if(confirmed){
  receipt=JSON.parse(job.submissionEvidence||'null');
  if(!receipt?.artifactPath||!receipt.artifactSha256)throw Error('Lead has no structured receipt');
  const artifact=await inside(workspace,receipt.artifactPath);
  if(sha(await fs.readFile(artifact))!==receipt.artifactSha256)throw Error('Receipt artifact changed');
  sources.submission_evidence={path:artifact,sha256:receipt.artifactSha256};
 }
 put('channel',receipt?.kind==='confirmation-email'?'邮件（确认邮件凭证）':job.portal,{leadId:job.id,field:'portal',receiptKind:receipt?.kind});
 put('company_info',job.company?`公司：${job.company}\n岗位来源：${job.url}${capture?.capturedAt?'\n采集时间：'+capture.capturedAt:''}\n尚未提供独立公司研究。`:'',{leadId:job.id,field:'company/url'});
 issues.push({field:'company_info',reason:'independent_company_research_not_provided',severity:'info'});
 // Paths come from the reviewed manifest, never an arbitrary first PDF in a folder.
 const candidates=[];
 for(const material of job.approvalSnapshot?.materials||[]){
  try{const file=await inside(workspace,material.path);if(sha(await fs.readFile(file))!==material.sha256)throw Error('Material changed after review');candidates.push({file,sha256:material.sha256,source:'approvalSnapshot'});}
  catch(error){issues.push({field:'materials',reason:error.message,path:material.path});}
 }
 if(!confirmed&&!job.approvalSnapshot&&job.output){
  try{const output=await inside(workspace,job.output),stat=await fs.stat(output);const files=stat.isDirectory()?(await fs.readdir(output)).filter(n=>/\.pdf$/i.test(n)).map(n=>path.join(output,n)):[output];
   for(const file of files)candidates.push({file:await inside(workspace,file),sha256:sha(await fs.readFile(file)),source:'prepared-output'});
  }catch(error){issues.push({field:'materials',reason:error.message});}
 }
 const materialType=file=>/lettre|cover[-_ ]?letter|motivation/i.test(path.basename(file))?'letter_path':/\bcv\b|resume|résumé/i.test(path.basename(file))?'resume_path':null;
 const selectedFile=job.output?await resolveStoragePath(workspace,job.output):null;
 for(const field of ['resume_path','letter_path']){
  const matches=candidates.filter(m=>materialType(m.file)===field||field==='resume_path'&&!materialType(m.file)&&candidates.length===1&&m.file===selectedFile);
  if(matches.length===1){put(field,matches[0].file,matches[0]);
   if(field==='resume_path'&&job.output){const output=await resolveStoragePath(workspace,job.output);if(path.dirname(matches[0].file)===output)repair.resume_path=job.output;}
  }else {values[field]='';issues.push({field,reason:matches.length?'ambiguous_materials':field==='letter_path'&&candidates.length?'not_in_reviewed_material_manifest':'reviewed_material_missing',severity:field==='letter_path'&&candidates.length?'info':'warning'});}
 }
 if(!confirmed){
  const result=await optionalJson(path.join(dir,'apply','last-result.json'));
  if(result&&result.jobId!==job.id)throw Error('Application result belongs to a different lead');
  const blocker=['blocked','needs-agent','needs-replan','validation-failed','error'].includes(result?.status)?`申请执行 ${result.status}：${result.reason||result.error||'检查本次执行结果'}`:null;
  if(blocker){values.status='受阻';put('notes',blocker,{path:path.join(dir,'apply','last-result.json')});}
  put('next_action',blocker||({'materials-pending-review':'核对材料事实和 PDF 视觉效果','review-required':'完成材料审阅',approved:'执行投递并保存成功凭证',submitting:'核对本次申请执行结果','submission-unconfirmed':'核实提交结果，避免重复投递','blocked-login':'完成登录后继续','blocked-captcha':'完成验证码后继续'}[job.state])||assessment?.decision?.nextAction||job.reason||'完成岗位核实与评估',{leadId:job.id,state:job.state});
 }
 return {values,sources,issues,repair};
}
export async function synchronizeDashboard(workspace,home,job,{db,dryRun=false}={}){
 const packet=await dashboardPacket(workspace,home,job);
 let ownedDb=!db;
 if(dryRun){
  const source=db||new DatabaseSync(dbPath(workspace),{readOnly:true}),copy=new DatabaseSync(':memory:');
  try{for(const name of ['applications','application_events','application_sync']){
   const schema=source.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(name);
   if(!schema){copy.exec('CREATE TABLE application_sync (application_id TEXT PRIMARY KEY,fields_json TEXT NOT NULL,sources_json TEXT NOT NULL,issues_json TEXT NOT NULL,updated_at TEXT NOT NULL)');continue;}
   copy.exec(schema.sql);const rows=source.prepare(`SELECT * FROM ${name}`).all();
   if(rows.length){const keys=Object.keys(rows[0]),insert=copy.prepare(`INSERT INTO ${name} (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`);for(const row of rows)insert.run(...keys.map(k=>row[k]));}
  }}finally{if(!db)source.close();}
  db=copy;ownedDb=true;
 }else db??=openDashboard(workspace);
 try{
  const before=db.prepare('SELECT * FROM applications WHERE id=? OR job_url=?').get(job.id,job.url);
  // Legacy directory values can have been normalized or moved since the first sync.
  if(before?.resume_path&&packet.values.resume_path){try{const old=await resolveStoragePath(workspace,before.resume_path);if((await fs.stat(old)).isDirectory()&&path.dirname(packet.values.resume_path)===old)packet.repair.resume_path=before.resume_path;}catch{}}
  const saved=syncDashboardLead(db,job,packet);
  const required=['jd','match_level','knockout','liveness','duplicate_status','channel'];
  if(['materials-pending-review','review-required','approved','submitting','submission-unconfirmed','submitted','followup-due'].includes(job.state))required.push('mode','resume_path','company_info','role_analysis');
  if(['submitted','followup-due'].includes(job.state))required.push('next_action','followup_date');
  const missing=required.filter(k=>!text(saved[k])||k==='jd'&&saved[k].length<300||k==='match_level'&&saved[k]==='无法评分');
  if(saved.resume_path&&required.includes('resume_path')){try{if(!/\.pdf$/i.test(saved.resume_path)||!(await fs.stat(await inside(workspace,saved.resume_path))).isFile())missing.push('resume_path');}catch{missing.push('resume_path');}}
  const state=db.prepare('SELECT issues_json FROM application_sync WHERE application_id=?').get(saved.id||job.id);
  const reportIssues=state?JSON.parse(state.issues_json):packet.issues;
  return {id:job.id,recordId:saved.id||job.id,dryRun,changed:!before||saved.version!==before.version,version:saved.version,submissionVerified:saved.submission_verified===1,archived:!!saved.archived_at,missing,issues:reportIssues,complete:missing.length===0&&!reportIssues.some(i=>i.severity!=='info'&&i.reason!=='existing_value_preserved')};
 }finally{if(ownedDb)db.close();}
}
