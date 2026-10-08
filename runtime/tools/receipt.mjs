import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {args,root,toolsRoot} from './runtime.mjs';
import {home,read,write,hash} from './lib/core.mjs';
import {jobDirectory} from './lib/storage-paths.mjs';
import {emailQuery,verifyEmailReceipt} from './lib/email-receipt.mjs';
const a=args();
if(a.help){console.log('receipt --id ID --plan | --plan --ids FILE | --id ID --email FILE|- [--sent --recipient EMAIL] [--commit]\nPrefer original connector emails. --email - reads one JSON line from stdin without shell interpolation or Base64 output. --commit reconciles, never re-submits.');process.exit(0);}
const store=await read(path.join(home,'leads.json'),{jobs:[]});
if(a.plan&&a.ids){
 const ids=await read(path.resolve(root,a.ids));if(!Array.isArray(ids)||ids.some(id=>!store.jobs.some(j=>j.id===id)))throw Error('IDs must identify existing leads');
 const items=[];for(const job of store.jobs.filter(j=>ids.includes(j.id))){
  const dir=await jobDirectory(root,home,job),attempt=await read(path.join(dir,'apply/attempt.json'),null),since=attempt?.issuedAt||[...(job.events||[])].reverse().find(e=>['submitting','submission-unconfirmed'].includes(e.to))?.at;
  if(since)items.push({id:job.id,query:emailQuery(job,since),since,command:`receipt --id ${job.id} --email - --commit`});
 }
 const file=path.join(home,'receipt-plans',hash(JSON.stringify(items))+'.json');await write(file,{items});console.log(JSON.stringify({plan:file,count:items.length}));process.exit(0);
}
const job=store.jobs.find(j=>j.id===a.id);if(!job)throw Error('Valid --id required');
const dir=await jobDirectory(root,home,job),attempt=await read(path.join(dir,'apply','attempt.json'),null);
const since=attempt?.issuedAt||[...(job.events||[])].reverse().find(e=>['submitting','submission-unconfirmed'].includes(e.to))?.at;
if(!since||!Number.isFinite(Date.parse(since)))throw Error('A persisted submission attempt is required before looking for a receipt');
if(a.plan){console.log(JSON.stringify({id:job.id,state:job.state,query:emailQuery(job,since),since,next:`Read the matching original email via the connector; save its structuredContent to a local JSON, then receipt --id ${job.id} --email FILE --commit. Do not open the Gmail UI or print attachments/Base64. No email yet means submission-unconfirmed; never submit again.`}));}
else if(a.email){
 if(!['submitting','submission-unconfirmed','submitted','followup-due'].includes(job.state))throw Error('Receipt reconciliation requires a submitted/unconfirmed attempt');
 if(a.sent){
  const capture=await read(path.join(dir,'capture.json'),{});
  if(typeof a.recipient!=='string'||!a.recipient.includes('@')||!(capture.bodyText||capture.jd||'').includes(a.recipient))throw Error('Recipient must occur in the actual employer JD/application route');
 }
 let input;if(a.email==='-'){
  const lines=createInterface({input:process.stdin,crlfDelay:Infinity});for await(const line of lines){input=JSON.parse(line);lines.close();process.stdin.destroy();break;}if(!input)throw Error('One original email JSON line required on stdin');
 }else input=await read(path.resolve(root,a.email));
 const artifact=verifyEmailReceipt(job,input,{since,sentRoute:!!a.sent,recipient:a.recipient});
 const file=path.join(dir,'apply','email-'+hash(JSON.stringify(artifact))+'.json');await write(file,artifact);
 const receipt=path.join(dir,'apply','email-receipt.json');await write(receipt,{kind:'confirmation-email',observedAt:artifact.observedAt,description:artifact.email.subject||'Original application confirmation email',artifactPath:path.relative(root,file)});
 if(a.commit&&!['submitted','followup-due'].includes(job.state)){
  const result=spawnSync(process.execPath,[path.join(toolsRoot,'state.mjs'),'--id',job.id,'--to','submitted','--receipt',receipt],{cwd:root,encoding:'utf8'});if(result.status!==0)throw Error(result.stderr||result.stdout);
  if(attempt)await write(path.join(dir,'apply','attempt.json'),{...attempt,status:'confirmed',reconciledAt:artifact.observedAt});
 }
 console.log(JSON.stringify({id:job.id,verified:true,committed:!!a.commit,artifact:file,receipt}));
}else throw Error('Choose --plan or --email FILE');
