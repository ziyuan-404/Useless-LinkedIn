import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

export const normalizeQuestion=text=>String(text).normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[\s\u00a0]+/g,' ').replace(/[?？*:：]+$/g,'').trim();
const digest=text=>createHash('sha256').update(text).digest('hex');
export async function validateAnswer(record,workspace){
  if(record.status!=='confirmed'||!Array.isArray(record.questions)||!record.questions.length||record.questions.some(q=>typeof q!=='string'||!q.trim())||!['string','boolean'].includes(typeof record.answer))throw Error('Answer requires confirmed status, exact question aliases and a string/boolean answer');
  if(!record.sources?.length)throw Error('Answer requires fact sources');
  const verified=[];
  for(const source of record.sources){
    const file=path.resolve(workspace,source.path);
    const profile=path.join(workspace,'个人资料/profile')+path.sep;
    const bank=path.join(workspace,'个人资料/operations/answer-bank.md');
    if(!file.startsWith(profile)&&file!==bank)throw Error('Answer source must be profile or the confirmed answer bank');
    const real=await fs.realpath(file),root=await fs.realpath(workspace);
    if(!real.startsWith(root+path.sep))throw Error('Answer source escapes workspace');
    const text=await fs.readFile(file,'utf8');
    if(typeof source.quote!=='string'||source.quote.length<8||!text.includes(source.quote)||source.sha256&&source.sha256!==digest(text))throw Error('Answer source changed or quote is missing');
    verified.push({...source,sha256:digest(text)});
  }
  return {...record,sources:verified};
}
export async function loadAnswers(workspace,questions=[]){
  const registry=path.join(workspace,'个人资料/operations/form-answers.json');
  const saved=await fs.readFile(registry,'utf8').then(JSON.parse,e=>{if(e.code==='ENOENT')return {answers:[]};throw e;});
  if(!Array.isArray(saved.answers))throw Error('Invalid form answer registry');
  const records=[...saved.answers,...questions.filter(q=>q.status==='draft').map(q=>({questions:[q.question],answer:q.answer,status:'confirmed',sources:q.sources}))];
  const basics=path.join(workspace,'个人资料/profile/basics.md');
  const text=await fs.readFile(basics,'utf8');
  const aliases=[[/^(?:邮箱|电子邮箱|Email|E-mail)$/i,['Email','E-mail','Email address','Adresse e-mail','Adresse email']],[/^(?:电话|手机|Téléphone|Phone)$/i,['Phone','Phone number','Téléphone','Numéro de téléphone']],[/^(?:姓名|Full name)$/i,['Full name','Your name','Nom complet']],[/^(?:名字|Prénom|First name)$/i,['First name','Prénom']],[/^(?:姓氏|Nom de famille|Last name)$/i,['Last name','Surname','Nom','Nom de famille']]];
  for(const line of text.split(/\r?\n/)){
    const match=line.match(/^\s*-\s*([^:：]+)[:：]\s*(.+)$/);if(!match)continue;
    for(const [key,questions] of aliases)if(key.test(match[1].trim())&&!/待确认|待填写/.test(match[2]))records.push({questions,answer:match[2].trim(),status:'confirmed',sources:[{path:'个人资料/profile/basics.md',quote:line}]});
  }
  const valid=[],stale=[];
  for(const r of records){try{valid.push(await validateAnswer(r,workspace));}catch(e){stale.push({questions:r.questions,reason:e.message});}}
  return {records:valid,stale,version:digest(JSON.stringify(valid))};
}
export function answerFor(field,records){
  const matches=records.filter(r=>r.questions.some(q=>normalizeQuestion(q)===normalizeQuestion(field.label)));
  if(!matches.length)return {status:'unknown'};
  if(new Set(matches.map(r=>JSON.stringify(r.answer))).size!==1)return {status:'conflict'};
  const chosen=matches[0];
  if(field.type==='select'||field.type==='radio'){
    const choices=(field.options||[]).filter(o=>!o.disabled&&normalizeQuestion(o.label)===normalizeQuestion(chosen.answer));
    if(choices.length!==1)return {status:'option-mismatch'};
    return {status:'matched',value:choices[0].value,label:choices[0].label,sources:chosen.sources};
  }
  if(field.type==='checkbox'&&typeof chosen.answer!=='boolean'||field.type!=='checkbox'&&typeof chosen.answer!=='string')return {status:'type-mismatch'};
  return {status:'matched',value:chosen.answer,sources:chosen.sources};
}
