import fs from 'node:fs/promises';
import path from 'node:path';
import {root,args} from './runtime.mjs';

const a=args();
const actions=new Set(['prepare_materials','prefill_form','upload_files','submit','send_message']);
if (a.help) { console.log('authorization.mjs --check ACTION [--job-id ID]'); process.exit(0); }
if (!actions.has(a.check)) throw Error('Use --check with a supported action');
const file=path.join(root,'.career-os/operations/authorizations.json');
const ledger=JSON.parse(await fs.readFile(file,'utf8').catch(e=>{if(e.code==='ENOENT') return '{"version":1,"grants":[]}'; throw e;}));
if (ledger.version!==1 || !Array.isArray(ledger.grants)) throw Error('Invalid authorization ledger');
const now=Date.now();
const ids=new Set();
const valid=ledger.grants.filter(g=>{
  if (!g.id || !g.source || !Number.isFinite(Date.parse(g.recordedAt)) || !g.scope || !g.actions || typeof g.actions!=='object') throw Error('Invalid authorization grant');
  if (ids.has(g.id)) throw Error('Duplicate authorization grant ID');
  ids.add(g.id);
  for (const key of ['grantedAt','expiresAt','revokedAt']) if (g[key]!==undefined && !Number.isFinite(Date.parse(g[key]))) throw Error(`Invalid ${key}`);
  for (const [key,value] of Object.entries(g.actions)) if (!actions.has(key) || typeof value!=='boolean') throw Error('Invalid authorization action');
  if (g.scope.kind==='job' && !g.scope.jobId) throw Error('Job authorization requires jobId');
  if (Date.parse(g.recordedAt)>now || g.grantedAt && Date.parse(g.grantedAt)>now || g.revokedAt && Date.parse(g.revokedAt)<=now || g.expiresAt && Date.parse(g.expiresAt)<=now) return false;
  if (g.scope.kind==='job') return a['job-id']===g.scope.jobId;
  if (g.scope.kind==='workspace') return true;
  throw Error('Invalid authorization scope');
}).filter(g=>g.actions[a.check]===true);
const decision={authorized:valid.length>0,action:a.check,jobId:a['job-id']||null,grantIds:valid.map(g=>g.id),checkedAt:new Date().toISOString()};
console.log(JSON.stringify(decision));
if (!decision.authorized) process.exitCode=2;
