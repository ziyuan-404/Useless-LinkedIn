import path from 'node:path';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {toolsRoot,args,root} from './runtime.mjs';
import {transaction,exportList} from './lib/core.mjs';
import {assertTransition,leadStates} from './lib/state-machine.mjs';
import {currentSnapshot,snapshotMatches} from './lib/approval.mjs';
import {home,read} from './lib/core.mjs';
import {openDashboard,syncSubmittedLead} from './lib/dashboard-db.mjs';

const a=args();
if (a.help) { console.log('state.mjs --id ID --to STATE [--evidence TEXT] [--receipt FILE for submitted] [--reason TEXT] | --list-states'); process.exit(0); }
if (a['list-states']) { console.log(JSON.stringify(leadStates)); process.exit(0); }
if (!a.id || !leadStates.includes(a.to)) throw Error('Valid --id and --to required');
let submissionEvidence;
if(a.to==='submitted'){
  if(a.evidence||typeof a.receipt!=='string')throw Error('Submitted requires --receipt FILE, not free-form --evidence');
  const receiptPath=path.resolve(root,a.receipt);if(!receiptPath.startsWith(root+path.sep))throw Error('Receipt must be inside workspace');
  const receipt=JSON.parse(await fs.readFile(receiptPath,'utf8'));
  if(!['success-page','confirmation-email','platform-status'].includes(receipt.kind)||!receipt.observedAt||!Number.isFinite(Date.parse(receipt.observedAt))||!receipt.description?.trim()||typeof receipt.artifactPath!=='string')throw Error('Receipt needs kind, observedAt, description and artifactPath');
  if(Date.parse(receipt.observedAt)>Date.now()+300000)throw Error('Receipt observation time is in the future');
  const artifact=path.resolve(root,receipt.artifactPath);if(!artifact.startsWith(root+path.sep))throw Error('Receipt artifact must be inside workspace');
  const stat=await fs.stat(artifact);if(!stat.isFile()||stat.size<100)throw Error('Receipt artifact must be a nonempty saved file');
  if(!/\.(png|jpe?g|pdf|html?|eml)$/i.test(artifact))throw Error('Receipt artifact format must be PNG, JPEG, PDF, HTML or EML');
  const artifactSha256=createHash('sha256').update(await fs.readFile(artifact)).digest('hex');
  submissionEvidence=JSON.stringify({kind:receipt.kind,observedAt:receipt.observedAt,description:receipt.description.trim(),artifactPath:path.relative(root,artifact),artifactSha256,sourceUrl:receipt.sourceUrl||''});
}
const store=await read(path.join(home,'leads.json'),{jobs:[]});
const job=store.jobs.find(x=>x.id===a.id);if(!job)throw Error('Unknown job ID');
let authorizationGrantIds=[];
if(['submitting','submitted'].includes(a.to)&&!await snapshotMatches(job)){
  await transaction(s=>{const j=s.jobs.find(x=>x.id===a.id);if(j.state==='approved'){
    j.events=[...(j.events||[]),{at:new Date().toISOString(),from:j.state,to:'review-required',reason:'approval_snapshot_changed'}];
    j.state='review-required';delete j.approvalSnapshot;
  }else if(j.state==='submitting'||j.state==='submission-unconfirmed'){
    j.events=[...(j.events||[]),{at:new Date().toISOString(),from:j.state,to:'review-required',reason:'approval_snapshot_changed'}];
    j.state='review-required';delete j.approvalSnapshot;
  }});
  await exportList();
  throw Error('Approved materials changed; review is required again');
}
if (['submitting','submitted'].includes(a.to)) {
  const action='submit';
  const check=spawnSync(process.execPath,[path.join(toolsRoot,'authorization.mjs'),'--check',action,'--job-id',a.id,'--approval-snapshot-id',job.approvalSnapshot?.id||''],{encoding:'utf8'});
  if (check.status!==0) throw Error(`Submission authorization missing: ${check.stdout||check.stderr}`);
  authorizationGrantIds=JSON.parse(check.stdout).grantIds;
}
const values={state:a.to};
if (a.to==='needs-decision') values.reason=a.reason;
if (a.to==='approved') values.reviewEvidence=a.evidence;
if (a.to==='approved') values.approvalSnapshot=await currentSnapshot(job,a.evidence);
if (a.to==='submitted') { values.submitted=true; values.submissionEvidence=submissionEvidence;values.dashboardSynced=false; }
await transaction(s=>{
  const j=s.jobs.find(x=>x.id===a.id);if (!j) throw Error('Unknown job ID');
  assertTransition(j.state,a.to,values);
  j.events=[...(j.events||[]),{at:new Date().toISOString(),from:j.state,to:a.to,evidence:a.to==='submitted'?submissionEvidence:a.evidence||null,authorizationGrantIds}];
  Object.assign(j,values);
});
if(a.to==='submitted'){
  const db=openDashboard(root);try{syncSubmittedLead(db,{...job,...values});}finally{db.close();}
  await transaction(s=>{s.jobs.find(x=>x.id===a.id).dashboardSynced=true;});
}
await exportList();
const rebuild=spawnSync(process.execPath,[path.join(toolsRoot,'tracker.mjs'),'--rebuild'],{encoding:'utf8'});
if (rebuild.status!==0) throw Error('Tracker rebuild failed: '+rebuild.stderr);
console.log(JSON.stringify({id:a.id,state:a.to}));
