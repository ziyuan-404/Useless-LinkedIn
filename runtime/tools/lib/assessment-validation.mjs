import fs from 'node:fs/promises';
import path from 'node:path';
import {resolveStoragePath} from './storage-paths.mjs';
import {root} from '../runtime.mjs';
import {validateAssessment,validateSchema} from './schema.mjs';

const keys=['contract','rhythm','location','remote','start','education','experience','technology','french','english','permit','salary','credentials','duplicate'];

export async function checkSources(items,allowed){
 for(const item of items){
  if(!Array.isArray(item.sources)||!item.sources.length)throw Error('Sources required');
  for(const source of item.sources){
   const file=await resolveStoragePath(root,source.path);
   if(!allowed.some(base=>file===base||file.startsWith(base+path.sep)))throw Error('Unsupported source');
   const text=await fs.readFile(file,'utf8');
   if(typeof source.quote!=='string'||source.quote.length<8||!text.includes(source.quote))throw Error('Source quote missing');
  }
 }
}

export async function validateDecision(result,{captured,dir,contextHash,allowModelDraft=false}){
 if(result.evaluation?.reviewRequired&&!allowModelDraft)throw Error('Standalone model assessment requires semantic/source review before pipeline adoption');
 if(result.assessmentType==='gate')await validateSchema('gate.schema.json',result);
 else await validateAssessment(result);
 if(result.contextHash!==contextHash)throw Error('Assessment is stale: JD or facts changed');
 if(!Array.isArray(result.ko?.items)||keys.some(key=>!result.ko.items.some(item=>item.key===key))||result.ko.items.length!==keys.length)throw Error('All 14 KO checks required');
 for(const item of result.ko.items){
  if(!['PASS','FAIL','UNKNOWN','NA'].includes(item.result)||typeof item.reason!=='string'||!item.reason.trim())throw Error('Invalid KO item');
  if(['contract','education','start','location','duplicate'].includes(item.key)&&item.result==='NA')throw Error('Essential KO cannot be not applicable');
  if(item.result==='FAIL'&&(!item.jdQuote||!captured.jd.includes(item.jdQuote)))throw Error('FAIL requires exact JD evidence');
 }
 const ko=result.ko.items.some(item=>item.result==='FAIL')?'FAIL':result.ko.items.some(item=>item.result==='UNKNOWN')?'MARGINAL':'PASS';
 if(result.assessmentType==='gate'&&ko==='PASS')throw Error('Passing jobs require a full assessment before materials');
 if(result.ko.status!==ko)throw Error('KO summary conflicts with checks');
 if(ko==='PASS'&&!['precision','bulk'].includes(result.decision.route)||ko==='FAIL'&&result.decision.route!=='skip'||ko==='MARGINAL'&&result.decision.route!=='needs-user')throw Error('Decision route conflicts with KO result');
 if(typeof result.company!=='string'||!result.company.trim()||typeof result.role!=='string'||!result.role.trim())throw Error('Company and role required');
 if(!Array.isArray(result.questions))throw Error('Questions array required');
 for(const question of result.questions){
  if(!['draft','needs-user'].includes(question.status)||!['common-draft','observed-form'].includes(question.source)||!question.question||typeof question.answer!=='string')throw Error('Invalid question draft');
  if(question.status==='draft')await checkSources([question],[path.join(root,'个人资料/profile'),path.join(dir,'jd.txt')]);
  if(question.source==='observed-form'&&!(captured.bodyText||'').includes(question.question))throw Error('Question was not observed');
 }
 return ko;
}
