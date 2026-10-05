import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {args,root,toolsRoot} from './runtime.mjs';
import {home,read,write} from './lib/core.mjs';
import {selectLeads} from './lib/work-packets.mjs';
const a=args();if(a.help){console.log('leads [--id ID | --ids FILE | --query TEXT | --state STATE] [--limit 10] [--offset N] [--sync-submitted]\nReturns bounded cards; complete selected records are saved to file. Literal query terms, no regex or full-store dumps.');process.exit(0);}
const store=await read(path.join(home,'leads.json'),{jobs:[]});
const ids=a.ids?await read(path.resolve(root,a.ids)):undefined;
const page=selectLeads(store.jobs,{id:a.id,ids,query:a.query,state:a.state,limit:Number(a.limit??10),offset:Number(a.offset??0)});
const cards=page.items.map(j=>({id:j.id,company:j.company,title:j.title,url:j.url,state:j.state,triage:j.triage?.status,output:j.output,submitted:!!j.submitted}));
const results=[];
if(a['sync-submitted'])for(const job of page.items){
 if(!job.submitted||job.state!=='submitted'){results.push({id:job.id,skipped:'not_submitted'});continue;}
 const p=spawnSync(process.execPath,[path.join(toolsRoot,'dashboard.mjs'),'--sync-submitted',job.id],{encoding:'utf8'});results.push({id:job.id,ok:p.status===0,...(p.status!==0?{error:(p.stderr||p.stdout).slice(-400)}:{})});
}
const file=path.join(home,'queries',`leads-${Date.now()}-${process.pid}.json`);await write(file,{...page,results});
console.log(JSON.stringify({file,cards,...(results.length?{results}:{}),total:page.total,remaining:page.remaining,nextOffset:page.nextOffset}));
