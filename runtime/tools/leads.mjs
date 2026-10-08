import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {args,root,toolsRoot} from './runtime.mjs';
import {home,read,write} from './lib/core.mjs';
import {selectLeads} from './lib/work-packets.mjs';
import {checkApplicationHistory} from './lib/application-history.mjs';
const a=args();if(a.help){console.log('leads [--id ID | --ids FILE | --query TEXT | --state STATE] [--limit 10] [--offset N] [--check-history] [--sync-submitted]\nReturns bounded cards; selected records use items in the saved file. History checks all selected IDs locally; exact existing attempts are protected, fuzzy matches remain unresolved.');process.exit(0);}
const store=await read(path.join(home,'leads.json'),{jobs:[]});
const ids=a.ids?await read(path.resolve(root,a.ids)):undefined;
const page=selectLeads(store.jobs,{id:a.id,ids,query:a.query,state:a.state,limit:Number(a.limit??10),offset:Number(a.offset??0)});
const cards=page.items.map(j=>({id:j.id,company:j.company,title:j.title,url:j.url,state:j.state,triage:j.triage?.status,output:j.output,submitted:!!j.submitted}));
const results=[];
const history=a['check-history']?await checkApplicationHistory(root,store.jobs,{ids:ids??(a.id?[a.id]:page.items.map(j=>j.id))}):[];
if(a['sync-submitted'])for(const job of page.items){
 if(!job.submitted||job.state!=='submitted'){results.push({id:job.id,skipped:'not_submitted'});continue;}
 const p=spawnSync(process.execPath,[path.join(toolsRoot,'dashboard.mjs'),'--sync-submitted',job.id],{encoding:'utf8'});results.push({id:job.id,ok:p.status===0,...(p.status!==0?{error:(p.stderr||p.stdout).slice(-400)}:{})});
}
const file=path.join(home,'queries',`leads-${Date.now()}-${process.pid}.json`);await write(file,{...page,results,history});
console.log(JSON.stringify({file,cards,...(history.length?{history:history.filter(h=>cards.some(c=>c.id===h.id)),historyCounts:history.reduce((r,h)=>(r[h.disposition]=(r[h.disposition]||0)+1,r),{})}:{}),...(results.length?{results}:{}),total:page.total,remaining:page.remaining,nextOffset:page.nextOffset}));
