import path from 'node:path';
import fs from 'node:fs/promises';
import {args,root} from './runtime.mjs';
import {home,config,read,exportList,transaction} from './lib/core.mjs';
import {needsTriage,triageOne,triageFetcher} from './lib/discovery-triage.mjs';

const a=args();
if(a.help){console.log('triage [--list-review | --list-closed | --run] [--id ID] [--config FILE] [--max-requests N] [--decisions FILE] [--reopen] [--no-browser]\nDefault lists unresolved review/disappearance leads. --run reads complete JDs without candidate analysis. 0 requests = unlimited. Decisions: [{id,status:candidate|excluded,evidence,captureFile}].');process.exit(0);}
const c=await config(a.config),store=await read(path.join(home,'leads.json'),{jobs:[]});
if(a.id&&!store.jobs.some(j=>j.id===a.id))throw Error('Unknown lead id');
if(a.reopen){if(!a.id)throw Error('--reopen requires --id');await transaction(s=>{delete s.jobs.find(j=>j.id===a.id).triage;});}
const selected=store.jobs.filter(j=>(!a.id||j.id===a.id)&&(a['list-review']?j.discoveryDisposition==='review':a['list-closed']?j.possiblyClosed:needsTriage({...j,...(a.reopen?{triage:undefined}:{})},c,c.portals.find(s=>s.name===j.portal))));
const queue=selected.map(j=>({id:j.id,title:j.title,url:j.url,disposition:j.discoveryDisposition,possiblyClosed:!!j.possiblyClosed,triage:j.triage?.status||'pending',nextRetryAt:j.triage?.nextRetryAt}));
if(!a.run&&!a.decisions){await exportList();console.log(JSON.stringify({queue},null,2));process.exit(0);}
const maxRequests=Number(a['max-requests']??c.discovery?.triage_max_requests??40);if(!Number.isInteger(maxRequests)||maxRequests<0)throw Error('max-requests must be a nonnegative integer');
const network=triageFetcher(c,{maxRequests}),results=[];
if(a.decisions){
 const decisions=JSON.parse(await fs.readFile(path.resolve(root,a.decisions),'utf8'));if(!Array.isArray(decisions))throw Error('Decisions must be an array');
 for(const decision of decisions){const job=store.jobs.find(j=>j.id===decision.id);if(!job)throw Error('Unknown decision id');results.push(await triageOne(job,c,{decision}));}
}else for(const job of [...selected].sort((a,b)=>Number(!!b.possiblyClosed)-Number(!!a.possiblyClosed)||String(a.triage?.checkedAt||'').localeCompare(String(b.triage?.checkedAt||'')))){
 if(maxRequests&&network.requests>=maxRequests)break;
 results.push(await triageOne(job,c,{fetchPage:network.fetchPage,noBrowser:!!a['no-browser']}));
}
await exportList();console.log(JSON.stringify({requests:network.requests,results,remaining:queue.filter(j=>!results.some(r=>r.id===j.id&&['candidate','excluded','expired'].includes(r.status)))},null,2));
