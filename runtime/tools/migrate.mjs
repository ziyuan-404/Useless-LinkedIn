import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {root,skillRoot,args} from './runtime.mjs';

const a=args();
const workspace=a.workspace?path.resolve(a.workspace):root;
if(workspace===skillRoot||workspace.startsWith(skillRoot+path.sep))throw Error('Workspace must be separate from the Skill');
const dir=path.join(workspace,'.useless-linkedin');
const old=path.join(workspace,'.career-os');
const newExists=await fs.stat(dir).then(x=>x.isDirectory(),()=>false);
const oldExists=await fs.stat(old).then(x=>x.isDirectory(),()=>false);
if(newExists&&oldExists)throw Error('Both old and new workspace directories exist; review them manually before migrating');
if(!newExists&&!oldExists)throw Error('Existing workspace required');
if(oldExists)await fs.rename(old,dir);
const file=path.join(dir,'workspace.json');
const current=await fs.readFile(file,'utf8').then(JSON.parse,e=>{if(e.code==='ENOENT')return null;throw e;});
if(current&&current.workspaceSchemaVersion!==1)throw Error('Unsupported workspace schema version; manual review required');
const result=spawnSync(process.execPath,[path.join(skillRoot,'runtime/tools/init.mjs'),'--workspace',workspace],{encoding:'utf8'});
if(result.status!==0)throw Error(result.stderr||result.stdout);
if(!current){
  const manifest=JSON.parse(await fs.readFile(file,'utf8'));
  manifest.initializedBy='legacy';manifest.lastMigratedAt=new Date().toISOString();
  await fs.writeFile(file,JSON.stringify(manifest,null,2)+'\n');
}
console.log(JSON.stringify({workspace,workspaceSchemaVersion:1,migrated:!current,renamedLegacyDirectory:oldExists}));
