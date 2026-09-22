import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {root} from '../runtime.mjs';
import {home} from './core.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex');
const inside=file=>file.startsWith(root+path.sep);
async function digest(file){
  if(!inside(file))throw Error('Approval material must stay inside workspace');
  return {path:path.relative(root,file).replaceAll('\\','/'),sha256:sha(await fs.readFile(file))};
}
export async function currentSnapshot(job,reviewEvidence){
  if(!job.output)throw Error('No application material to review');
  const output=path.resolve(root,job.output);
  const stat=await fs.stat(output);
  const materialFiles=stat.isDirectory()
    ?(await fs.readdir(output)).filter(name=>name.toLowerCase().endsWith('.pdf')).map(name=>path.join(output,name))
    :[output];
  if(!materialFiles.length)throw Error('No PDF material found');
  const materials=await Promise.all(materialFiles.sort().map(digest));
  const dir=path.join(home,'jobs',job.id);
  const context=JSON.parse(await fs.readFile(path.join(dir,'context.json'),'utf8'));
  const sources={};
  for(const file of Object.keys(context.sources||{})){
    const absolute=path.resolve(root,file);
    if(!inside(absolute))throw Error('Context source must stay inside workspace');
    sources[file]=await fs.readFile(absolute,'utf8');
  }
  const contextHash=sha(JSON.stringify({jd:context.captured?.jd,sources}));
  if(contextHash!==job.contextHash||contextHash!==context.contextHash||await fs.readFile(path.join(dir,'jd.txt'),'utf8')!==context.captured?.jd)throw Error('JD or candidate facts changed since assessment');
  const assessment=await digest(path.join(dir,'assessment.json'));
  const answers=await digest(path.join(dir,'questions.json'));
  const basis={contextHash:job.contextHash,assessmentHash:assessment.sha256,materials,answersHash:answers.sha256};
  if(!basis.contextHash)throw Error('Approval requires current context hash');
  return {id:sha(JSON.stringify(basis)),...basis,reviewedAt:new Date().toISOString(),reviewEvidence};
}
export async function snapshotMatches(job){
  if(!job.approvalSnapshot)return false;
  try{return (await currentSnapshot(job,job.approvalSnapshot.reviewEvidence)).id===job.approvalSnapshot.id;}
  catch{return false;}
}
