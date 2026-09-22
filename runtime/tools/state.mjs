import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {toolsRoot,args} from './runtime.mjs';
import {transaction,exportList} from './lib/core.mjs';
import {assertTransition,leadStates} from './lib/state-machine.mjs';
import {currentSnapshot,snapshotMatches} from './lib/approval.mjs';
import {home,read} from './lib/core.mjs';

const a=args();
if (a.help) { console.log('state.mjs --id ID --to STATE [--evidence TEXT] [--reason TEXT] | --list-states'); process.exit(0); }
if (a['list-states']) { console.log(JSON.stringify(leadStates)); process.exit(0); }
if (!a.id || !leadStates.includes(a.to)) throw Error('Valid --id and --to required');
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
if (a.to==='submitted') { values.submitted=true; values.submissionEvidence=a.evidence; }
await transaction(s=>{
  const j=s.jobs.find(x=>x.id===a.id);if (!j) throw Error('Unknown job ID');
  assertTransition(j.state,a.to,values);
  j.events=[...(j.events||[]),{at:new Date().toISOString(),from:j.state,to:a.to,evidence:a.evidence||null,authorizationGrantIds}];
  Object.assign(j,values);
});
await exportList();
const rebuild=spawnSync(process.execPath,[path.join(toolsRoot,'tracker.mjs'),'--rebuild'],{encoding:'utf8'});
if (rebuild.status!==0) throw Error('Tracker rebuild failed: '+rebuild.stderr);
console.log(JSON.stringify({id:a.id,state:a.to}));
