import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {args,toolsRoot,root} from './runtime.mjs';
import {home,read,write} from './lib/core.mjs';
import {jobDirectory} from './lib/storage-paths.mjs';
const a=args();if(a.help){console.log('batch [--stage assess|submit|reconcile] [--limit 10] [--ids FILE]\nPersist bounded work packets; stdout only contains counts and paths. No new chats or browser sessions are created.');process.exit(0);}
const stage=a.stage||'assess',limit=Number(a.limit??10);
if(!['assess','submit','reconcile'].includes(stage)||!Number.isInteger(limit)||limit<1||limit>100)throw Error('Valid stage and --limit 1..100 required');
const store=await read(path.join(home,'leads.json'),{jobs:[]});
const ids=a.ids?await read(path.resolve(root,a.ids)):null;if(ids&&(!Array.isArray(ids)||ids.some(id=>!store.jobs.some(j=>j.id===id))))throw Error('IDs file must contain existing job IDs');
const eligible=store.jobs.filter(j=>(!ids||ids.includes(j.id))&&(stage==='assess'?['discovered','awaiting-agent','needs-verification'].includes(j.state)&&j.discoveryDisposition==='candidate'&&!j.possiblyClosed:stage==='submit'?j.state==='approved':['submission-unconfirmed','submitting'].includes(j.state)));
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
  items.push({id:job.id,state:latest.state,url:job.url,host:new URL(job.url).hostname,contextHash:latest.contextHash,agentContext:packet?path.join(dir,'agent-context.json'):null,factsFile:packet?.factsFile,task:dir?path.join(dir,'agent-task.md'):null,directory:dir,approvalSnapshotId:latest.approvalSnapshot?.id});
}
const run=path.join(home,'batches',stage+'-'+randomUUID());await fs.mkdir(run,{recursive:true});
const manifest={version:1,stage,createdAt:new Date().toISOString(),items,failures,factsFiles:[...new Set(items.map(j=>j.factsFile).filter(Boolean))],remaining:Math.max(0,eligible.length-limit)};
await write(path.join(run,'manifest.json'),manifest);
await fs.writeFile(path.join(run,'task.md'),`Read manifest.json and only the current stage workflow. Read each shared factsFile once. Process each item independently; save its evidence/state before continuing. Do not read leads.json, complete scan queues or full context.json into the model. For assess: gates first, full assessment only after PASS. For submit: use the IAB shared application executor and apply CLI; recheck the page and bind the permit before submission. For reconcile: verify receipts/platform status; never click Submit again. Continue the next bounded batch only after persisting this one. A fresh stage session can consume this packet without previous chat history; no session is automatically created.\n`);
console.log(JSON.stringify({stage,manifest:path.join(run,'manifest.json'),task:path.join(run,'task.md'),count:items.length,failures:failures.length,remaining:manifest.remaining}));
