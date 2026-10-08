import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {root,args} from './runtime.mjs';
import {validateAuthorization} from './lib/schema.mjs';

const a=args();
const actions=new Set(['prepare_materials','prefill_form','upload_files','submit','send_message']);
if (a.help) { console.log('authorization.mjs --check ACTION [--job-id ID] | --grant (--job-id ID | --workspace-scope) --actions ACTIONS --source TEXT [--expires-at ISO] | --revoke ID | --list'); process.exit(0); }
const file=path.join(root,'个人资料/operations/authorizations.json');
const ledger=JSON.parse(await fs.readFile(file,'utf8').catch(e=>{if(e.code==='ENOENT') return '{"version":1,"grants":[]}'; throw e;}));
await validateAuthorization(ledger);
const save=async()=>{await validateAuthorization(ledger);const temp=file+`.${process.pid}.tmp`;await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(temp,JSON.stringify(ledger,null,2));await fs.rename(temp,file);};
if(a.list){console.log(JSON.stringify(ledger.grants,null,2));process.exit(0);}
if(a.grant){
  if((typeof a['job-id']==='string')===Boolean(a['workspace-scope'])||typeof a.actions!=='string'||typeof a.source!=='string'||!a.source.trim())throw Error('Grant requires exactly one scope, actions, and explicit source evidence');
  const selected=a.actions.split(',').map(x=>x.trim());if(!selected.length||selected.some(x=>!actions.has(x)))throw Error('Unsupported action');
  if(a['expires-at']&&!Number.isFinite(Date.parse(a['expires-at'])))throw Error('Invalid expiration');
  if(selected.includes('submit')&&!a['workspace-scope']&&typeof a['approval-snapshot-id']!=='string')throw Error('Job submit grant requires --approval-snapshot-id from the reviewed materials');
  if(a['workspace-scope']&&a['approval-snapshot-id'])throw Error('Workspace grant cannot bind one approval snapshot');
  const grant={id:randomUUID(),source:a.source,recordedAt:new Date().toISOString(),scope:a['workspace-scope']?{kind:'workspace'}:{kind:'job',jobId:a['job-id']},actions:Object.fromEntries(selected.map(x=>[x,true])),...(a['approval-snapshot-id']?{approvalSnapshotId:a['approval-snapshot-id']}:{}) ,...(a['expires-at']?{expiresAt:a['expires-at']}:{})};
  ledger.grants.push(grant);await save();console.log(JSON.stringify(grant));process.exit(0);
}
if(a.revoke){const grant=ledger.grants.find(x=>x.id===a.revoke);if(!grant)throw Error('Unknown grant ID');grant.revokedAt=new Date().toISOString();await save();console.log(JSON.stringify({id:grant.id,revokedAt:grant.revokedAt}));process.exit(0);}
if (!actions.has(a.check)) throw Error('Use --check with a supported action');
const now=Date.now();
const ids=new Set();
const valid=ledger.grants.filter(g=>{
  if (ids.has(g.id)) throw Error('Duplicate authorization grant ID');
  ids.add(g.id);
  for (const [key,value] of Object.entries(g.actions)) if (!actions.has(key) || typeof value!=='boolean') throw Error('Invalid authorization action');
  if (Date.parse(g.recordedAt)>now || g.grantedAt && Date.parse(g.grantedAt)>now || g.revokedAt && Date.parse(g.revokedAt)<=now || g.expiresAt && Date.parse(g.expiresAt)<=now) return false;
  if (g.scope.kind==='job') return a['job-id']===g.scope.jobId;
  if (g.scope.kind==='workspace') return true;
  throw Error('Invalid authorization scope');
}).filter(g=>g.actions[a.check]===true&& (a.check!=='submit'||typeof a['approval-snapshot-id']==='string'&&(g.scope.kind==='workspace'||g.approvalSnapshotId===a['approval-snapshot-id'])));
const decision={authorized:valid.length>0,action:a.check,jobId:a['job-id']||null,grantIds:valid.map(g=>g.id),checkedAt:new Date().toISOString()};
console.log(JSON.stringify(decision));
if (!decision.authorized) process.exitCode=2;
