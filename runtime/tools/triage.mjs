import path from 'node:path';
import fs from 'node:fs/promises';
import {args,root} from './runtime.mjs';
import {home,config,read,exportList,transaction} from './lib/core.mjs';
import {needsTriage,triageOne,triageFetcher,triageRulesHash} from './lib/discovery-triage.mjs';
import {verifiedCapture} from './lib/work-packets.mjs';
import {jobDirectory} from './lib/storage-paths.mjs';

const a=args();
if(a.help){console.log('triage [--list-review | --list-closed | --run] [--id ID] [--config FILE] [--max-requests N] [--decisions FILE | --captures FILE] [--reopen] [--no-browser]\nDefault lists unresolved review/disappearance leads. --captures accepts [{id,captureFile}] with current full JD/observed controls or explicit closure; no network. Decisions: [{id,status:candidate|excluded,evidence,captureFile}].');process.exit(0);}
const c=await config(a.config),store=await read(path.join(home,'leads.json'),{jobs:[]});
const ids=a.ids?await read(path.resolve(root,a.ids)):null;if(ids&&(!Array.isArray(ids)||ids.some(id=>!store.jobs.some(j=>j.id===id))))throw Error('IDs file must contain existing job IDs');
if(a.id&&!store.jobs.some(j=>j.id===a.id))throw Error('Unknown lead id');
if(a.reopen){if(!a.id)throw Error('--reopen requires --id');await transaction(s=>{delete s.jobs.find(j=>j.id===a.id).triage;});}
const selected=[];
for(const j of store.jobs){
 if(a.id&&j.id!==a.id||ids&&!ids.includes(j.id))continue;
 if(a['reuse-unresolved']&&!a['retry-agent']&&!a.reopen&&['blocked','needs-agent'].includes(j.triage?.status)&&Number.isFinite(Date.parse(j.triage.checkedAt))&&Date.now()-Date.parse(j.triage.checkedAt)<86400000)continue;
 let include=a['list-review']?j.discoveryDisposition==='review':a['list-closed']?j.possiblyClosed:needsTriage({...j,...(a.reopen?{triage:undefined}:{})},c,c.portals.find(s=>s.name===j.portal));
 if(a['include-candidates']&&j.discoveryDisposition==='candidate'&&!j.submitted&&!j.historyMatch&&!j.assessment&&!['expired','rejected','approved','materials-pending-review','review-required'].includes(j.state)&&(!(await verifiedCapture(root,j,j.directory?await jobDirectory(root,home,j):undefined))||j.triage?.rulesHash!==triageRulesHash(c,c.portals.find(s=>s.name===j.portal)||{})||a['retry-agent']&&['blocked','needs-agent'].includes(j.triage?.status)))include=true;
 if(include)selected.push(j);
}
const queue=selected.map(j=>({id:j.id,title:j.title,url:j.url,disposition:j.discoveryDisposition,possiblyClosed:!!j.possiblyClosed,triage:j.triage?.status||'pending',nextRetryAt:j.triage?.nextRetryAt}));
async function emit(result){if(a.summary){const file=path.join(home,'triage-result.json');await fs.mkdir(home,{recursive:true});await fs.writeFile(file,JSON.stringify(result,null,2));console.log(JSON.stringify({file,requests:result.requests||0,queue:result.queue?.length,results:result.results?.length,remaining:result.remaining?.length}));}else console.log(JSON.stringify(result,null,2));}
if(!a.run&&!a.decisions&&!a.captures){await exportList();await emit({queue});process.exit(0);}
const maxRequests=Number(a['max-requests']??c.discovery?.triage_max_requests??40);if(!Number.isInteger(maxRequests)||maxRequests<0)throw Error('max-requests must be a nonnegative integer');
const network=triageFetcher(c,{maxRequests}),results=[];
if(a.decisions||a.captures){
 const decisions=JSON.parse(await fs.readFile(path.resolve(root,a.decisions||a.captures),'utf8'));if(!Array.isArray(decisions))throw Error('Decisions must be an array');
 for(const decision of decisions){const job=store.jobs.find(j=>j.id===decision.id);if(!job)throw Error('Unknown decision id');if(job.submitted||job.historyMatch||['submitting','submission-unconfirmed'].includes(job.state))throw Error('Existing application requires reconciliation, not discovery overwrite');results.push(await triageOne(job,c,a.decisions?{decision}:{observedCapture:decision}));}
}else for(const job of [...selected].sort((a,b)=>Number(!!b.possiblyClosed)-Number(!!a.possiblyClosed)||(ids?ids.indexOf(a.id)-ids.indexOf(b.id):0)||String(a.triage?.checkedAt||'').localeCompare(String(b.triage?.checkedAt||'')))){
 if(maxRequests&&network.requests>=maxRequests)break;
 results.push(await triageOne(job,c,{fetchPage:network.fetchPage,noBrowser:!!a['no-browser'],forceFetch:!!a['retry-agent']||!!a.reopen}));
}
await exportList();await emit({requests:network.requests,results,remaining:queue.filter(j=>!results.some(r=>r.id===j.id&&['candidate','excluded','expired'].includes(r.status)))});
