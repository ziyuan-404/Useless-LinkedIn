import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {companyRecord} from './company-research.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const writePacket=async(file,data)=>{const temp=file+'.'+randomUUID()+'.tmp';try{await fs.writeFile(temp,JSON.stringify(data,null,2));await fs.rename(temp,file);}finally{await fs.rm(temp,{force:true});}};
export function compactCapture(capture){
  const {url,finalUrl,title,company,jd,capturedAt,liveness,applyControls,layer}=capture;
  return {url,finalUrl,title,company,jd,capturedAt,liveness,applyControls,layer};
}
// A retrieval index, not another candidate profile. Original source files remain authoritative.
export function factPacket(sources){
  const common={},experiences=[],supplements=[];
  for(const [file,text] of Object.entries(sources)){
    if(file.includes('/experiences/')){
      if(path.basename(file).startsWith('_'))continue;
      experiences.push({path:file,sha256:hash(text),index:text.split(/\r?\n/).filter(line=>/^(# |标签:|适配方向:|类型:)/.test(line)).join('\n')});
    }else if(/\/(?:links|claim-map)\.md$/.test(file))supplements.push({path:file,sha256:hash(text),purpose:'Retrieve before relevant claims or contact/material generation; original source remains authoritative.'});
    else common[file]=text;
  }
  return {version:2,derived:true,instructions:'Read JD requirements first. Retrieve complete relevant experience and supplement files before making claims. This index is not qualification evidence.',common,experiences,supplements};
}
export async function writeAgentPacket({workspace=path.resolve(home,'../../..'),home,dir,context}){
  const shared=path.join(home,'fact-packets',hash(JSON.stringify(context.sources))+'.json');
  await fs.mkdir(path.dirname(shared),{recursive:true});
  await writePacket(shared,factPacket(context.sources));
  const file=path.join(dir,'agent-context.json');
  const company=await companyRecord(workspace,home,{company:context.captured.company});
  await writePacket(file,{id:context.id,contextHash:context.contextHash,captured:compactCapture(context.captured),factsFile:shared,companyResearch:{status:company.status,file:company.file,sourceHash:company.sha256,next:'company --plan --id '+context.id}});
  return {file,shared};
}
