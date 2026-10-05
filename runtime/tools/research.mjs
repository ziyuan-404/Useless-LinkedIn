import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {args,root,toolsRoot} from './runtime.mjs';
import {home,read,write} from './lib/core.mjs';
import {jobDirectory} from './lib/storage-paths.mjs';
import {selectLeads,verifiedCapture,requirementHints} from './lib/work-packets.mjs';
const a=args();if(a.help){console.log('research [--run | --screen-only] [--config FILE] [--ids FILE] [--limit 10] [--offset N] [--max-requests 40] [--triage-requests 40] [--no-browser]\nLocal scan + complete-JD triage, then bounded screening packets. No candidate KO or applications are automatically approved.');process.exit(0);}
const flags=[...(a.config?['--config',a.config]:[]),...(a['no-browser']?['--no-browser']:[])];const stages=[];
function run(tool,options){const p=spawnSync(process.execPath,[path.join(toolsRoot,tool+'.mjs'),...options],{encoding:'utf8',maxBuffer:2e6});if(p.status!==0)throw Error(tool+': '+(p.stderr||p.stdout).slice(-1000));stages.push({tool,result:JSON.parse(p.stdout)});}
// Existing network budgets, robots, retries, pagination and journals remain authoritative.
if(a.run)run('scan',[...flags,'--summary','--zero-token','--max-requests',String(a['max-requests']??40),...(a.concurrency?['--concurrency',String(a.concurrency)]:[])]);
if(a.run||a['screen-only'])run('triage',[...flags,'--run','--include-candidates','--reuse-unresolved','--summary','--max-requests',String(a['triage-requests']??40),...(a.ids?['--ids',a.ids]:[]),...(a['retry-agent']?['--retry-agent']:[])]);
const store=await read(path.join(home,'leads.json'),{jobs:[]}),ids=a.ids?await read(path.resolve(root,a.ids)):undefined;
const unresolved=store.jobs.filter(j=>!j.submitted&&!j.historyMatch&&!['submitted','rejected','expired','approved','materials-pending-review','review-required'].includes(j.state)&&j.triage?.status!=='excluded');
const page=selectLeads(ids?store.jobs:unresolved,{ids,limit:Number(a.limit??10),offset:Number(a.offset??0)}),runDir=path.join(home,'research',randomUUID()),cards=[];
for(const job of page.items){
 const dir=await jobDirectory(root,home,job),verified=await verifiedCapture(root,job,dir);
 const jdFile=verified?path.join(runDir,job.id+'-jd.txt'):null;if(jdFile)await write(jdFile,verified.capture.jd);
 cards.push({id:job.id,company:job.company,title:job.title,url:job.url,disposition:job.discoveryDisposition,state:job.state,triage:job.triage?.status||'pending',nextRetryAt:job.triage?.nextRetryAt,liveness:verified?.capture.liveness||job.liveness,fullJd:jdFile,captureFile:verified?.file,captureHash:verified?.sha256,hints:verified?requirementHints(verified.capture.jd):{},next:job.state==='expired'?'Closed posting; retain evidence and do not generate materials.':verified?.capture.liveness?.result==='active'?'Read fullJd; then batch assess and all 14 KO checks.':'Verify blocked/unknown source; do not exclude or fabricate PASS.'});
}
const queues=await read(path.join(home,'search-queue.json'),[]),counts={total:store.jobs.length,candidate:store.jobs.filter(j=>j.discoveryDisposition==='candidate').length,excluded:store.jobs.filter(j=>j.triage?.status==='excluded').length,closed:store.jobs.filter(j=>j.state==='expired').length,unresolved:unresolved.length};
const manifest=path.join(runDir,'manifest.json');await write(manifest,{version:1,createdAt:new Date().toISOString(),stages,counts,coverage:queues.reduce((r,t)=>(r[t.status]=(r[t.status]||0)+1,r),{}),cards,remaining:page.remaining,nextOffset:page.nextOffset,instructions:'Hints are exact excerpts for retrieval only, never eligibility evidence. Read complete JD before KO; unknown conditions remain unknown. Complete original captures and queues are retained on disk. No chat context is automatically cleared.'});
console.log(JSON.stringify({manifest,counts,count:cards.length,remaining:page.remaining,nextOffset:page.nextOffset,stages:stages.map(x=>x.result)}));
