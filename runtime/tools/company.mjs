import path from 'node:path';
import {args,root} from './runtime.mjs';
import {home,read,write,config,request,parse} from './lib/core.mjs';
import {selectLeads} from './lib/work-packets.mjs';
import {createDiscoveryFetcher} from './lib/discovery-policy.mjs';
import {companyRecord,collectCompany,reviewCompany} from './lib/company-research.mjs';
import {syncDashboardStage} from './lib/dashboard-stage.mjs';
const a=args();
if(a.help){console.log('company --plan [--id ID | --ids FILE] | --id ID --collect --url URL [--urls FILE] [--refresh] | --id ID --review FILE\nModel-free official text collection, 30-day company cache and sourced semantic review. No page screenshots or HTML snapshots.');process.exit(0);}
const store=await read(path.join(home,'leads.json'),{jobs:[]}),ids=a.ids?await read(path.resolve(root,a.ids)):undefined;
const jobs=selectLeads(store.jobs,{id:a.id,ids,limit:100}).items;
if(!a.plan&&(!a.id||jobs.length!==1))throw Error('A valid --id is required');
if(a.plan){
 const groups=[];for(const job of jobs){if(groups.some(g=>g.company===job.company)){groups.find(g=>g.company===job.company).ids.push(job.id);continue;}
  const record=await companyRecord(root,home,job);groups.push({company:job.company,ids:[job.id],status:record.status,file:record.file,sourceHash:record.sha256,next:record.status==='researched'?'Reuse facts; tailor only the role-specific angle':record.status==='collected'?`company --id ${job.id} --review FILE`:`Identify official website once, then company --id ${job.id} --collect --url URL`});
 }
 const file=path.join(home,'company-research','plan.json');await write(file,{groups});console.log(JSON.stringify({plan:file,companies:groups.length,cached:groups.filter(g=>g.status==='researched').length}));
}else if(a.collect){
 const c=await config(a.config);let requests=0;
 const fetchPage=createDiscoveryFetcher({request,respectRobots:true,minIntervalMs:c.discovery?.min_interval_ms??500,beforeRequest:()=>{if(++requests>40)throw Error('Company collection request budget exhausted');}});
 const urls=a.urls?await read(path.resolve(root,a.urls)):[a.url];
 const record=await collectCompany(root,home,jobs[0].company,urls,{refresh:!!a.refresh,fetchPage,parsePage:body=>parse(body)});
 console.log(JSON.stringify({id:a.id,status:record.status,file:record.file,reused:record.reused,failures:record.failures,sourceHash:record.file?(await companyRecord(root,home,jobs[0])).sha256:undefined,next:record.status==='collected'?`company --id ${a.id} --review FILE`:undefined}));
}else if(a.review){
 const record=await reviewCompany(root,home,jobs[0],await read(path.resolve(root,a.review)));
 const sync=[];for(const job of store.jobs.filter(j=>j.company===jobs[0].company&&j.directory))sync.push(await syncDashboardStage(job.id));
 console.log(JSON.stringify({id:a.id,status:record.status,file:record.file,synchronized:sync.filter(r=>r.complete).length,incomplete:sync.filter(r=>!r.complete&&!r.error).length,errors:sync.filter(r=>r.error).length}));
}else throw Error('Choose --plan, --collect or --review');
