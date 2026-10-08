import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {args,toolsRoot,root} from './runtime.mjs';
import {home,read,write} from './lib/core.mjs';
import {jobDirectory} from './lib/storage-paths.mjs';
import {gateDraft} from './lib/assessment-validation.mjs';
import {checkApplicationHistory} from './lib/application-history.mjs';
const a=args();if(a.help){console.log('batch [--stage assess|submit|reconcile] [--limit 10] [--ids FILE]\nbatch --stage assess --commit FILE [--limit 10] (array of {id,file})\nAssess packets include gate-draft.json with all 14 UNKNOWN checks. Review every fact before removing draft markers. Commits return every result and fail if any item fails. No new chats/browser sessions are created.');process.exit(0);}
const stage=a.stage||'assess',limit=Number(a.limit??10);
if(!['assess','submit','reconcile'].includes(stage)||!Number.isInteger(limit)||limit<1||limit>100)throw Error('Valid stage and --limit 1..100 required');
if(a.commit){
 if(stage!=='assess')throw Error('--commit is for assess');const entries=await read(path.resolve(root,a.commit));if(!Array.isArray(entries))throw Error('Commit expects [{id,file}]');
 const results=[];for(const entry of entries.slice(0,limit)){if(!entry.id||typeof entry.file!=='string')throw Error('Commit item needs id/file');const p=spawnSync(process.execPath,[path.join(toolsRoot,'pipeline.mjs'),'--id',entry.id,'--assessment',path.resolve(root,entry.file),'--defer-materials'],{encoding:'utf8',maxBuffer:2e6});results.push({id:entry.id,ok:p.status===0,...(p.status===0?{summary:p.stdout.trim().slice(-600)}:{error:(p.stderr||p.stdout).trim().slice(-800)})});}
 const file=path.join(home,'batches','commit-'+randomUUID()+'.json');await write(file,{results,remaining:Math.max(0,entries.length-limit)});console.log(JSON.stringify({file,results,remaining:Math.max(0,entries.length-limit)}));process.exit(results.some(r=>!r.ok)?1:0);
}
const store=await read(path.join(home,'leads.json'),{jobs:[]});
const ids=a.ids?await read(path.resolve(root,a.ids)):null;if(ids&&(!Array.isArray(ids)||ids.some(id=>!store.jobs.some(j=>j.id===id))))throw Error('IDs file must contain existing job IDs');
const histories=stage==='reconcile'?[]:await checkApplicationHistory(root,store.jobs,{ids:ids||store.jobs.map(j=>j.id)}),protectedIds=new Set(histories.filter(h=>h.disposition==='existing-application').map(h=>h.id));
const eligible=store.jobs.filter(j=>!protectedIds.has(j.id)&&(!ids||ids.includes(j.id))&&(stage==='assess'?['discovered','awaiting-agent','needs-verification'].includes(j.state)&&j.discoveryDisposition==='candidate'&&!j.possiblyClosed:stage==='submit'?j.state==='approved':['submission-unconfirmed','submitting'].includes(j.state)));
eligible.sort((x,y)=>stage==='submit'?new URL(x.url).hostname.localeCompare(new URL(y.url).hostname)||Number(y.priority||0)-Number(x.priority||0):String(x.lastSeenAt||'').localeCompare(String(y.lastSeenAt||'')));
const items=[],failures=[];
for(const job of eligible.slice(0,limit)){
  if(stage==='assess'){
    const p=spawnSync(process.execPath,[path.join(toolsRoot,'pipeline.mjs'),'--id',job.id],{encoding:'utf8',maxBuffer:2e6});
    if(p.status!==0){failures.push({id:job.id,reason:(p.stderr||p.stdout).slice(-500)});continue;}
  }
  const latest=(await read(path.join(home,'leads.json'))).jobs.find(j=>j.id===job.id),dir=await jobDirectory(root,home,latest);
  if(stage==='assess'&&latest.state!=='awaiting-agent'){failures.push({id:job.id,state:latest.state});continue;}
  const packet=dir?await read(path.join(dir,'agent-context.json'),null):null;
  const gateFile=stage==='assess'&&packet?path.join(dir,'gate-draft.json'):null;if(gateFile)await write(gateFile,gateDraft({contextHash:packet.contextHash,company:latest.company,role:latest.title}));
  items.push({id:job.id,state:latest.state,url:job.url,host:new URL(job.url).hostname,contextHash:latest.contextHash,gateDraft:gateFile,agentContext:packet?path.join(dir,'agent-context.json'):null,factsFile:packet?.factsFile,task:dir?path.join(dir,'agent-task.md'):null,directory:dir,approvalSnapshotId:latest.approvalSnapshot?.id});
}
const run=path.join(home,'batches',stage+'-'+randomUUID());await fs.mkdir(run,{recursive:true});
const idsFile=path.join(run,'ids.json');await write(idsFile,items.map(j=>j.id));
const manifest={version:2,stage,createdAt:new Date().toISOString(),items,failures,idsFile,executionPolicy:{company:`company --plan --ids "${idsFile}"`,executor:'apply --iab-script (once per session); use applicationExecutor, never rewrite field loops',receipts:`receipt --plan --ids "${idsFile}"`,evidence:'Prefer original connector emails; no full-page snapshots, screenshots or Base64 output'},factsFiles:[...new Set(items.map(j=>j.factsFile).filter(Boolean))],remaining:Math.max(0,eligible.length-limit)};
await write(path.join(run,'manifest.json'),manifest);
await fs.writeFile(path.join(run,'task.md'),`Read manifest.json and only the current stage workflow. Read each shared factsFile once. Process each item independently; save its evidence/state before continuing. Do not read leads.json, complete scan queues or full context.json into the model. For assess: gates first, full assessment only after PASS. For submit: use the IAB shared application executor and apply CLI; recheck the page and bind the permit before submission. For reconcile: verify receipts/platform status; never click Submit again. Continue the next bounded batch only after persisting this one. A fresh stage session can consume this packet without previous chat history; no session is automatically created.\n`);
console.log(JSON.stringify({stage,manifest:path.join(run,'manifest.json'),task:path.join(run,'task.md'),count:items.length,failures:failures.length,remaining:manifest.remaining}));
