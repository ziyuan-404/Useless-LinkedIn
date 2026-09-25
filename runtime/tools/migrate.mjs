import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {root,skillRoot,args} from './runtime.mjs';

const a=args();
const workspace=a.workspace?path.resolve(a.workspace):root;
if(workspace===skillRoot||workspace.startsWith(skillRoot+path.sep))throw Error('Workspace must be separate from the Skill');
const dir=path.join(workspace,'00-个人资料');
const legacyDirs=['.career-os','.useless-linkedin'].map(name=>path.join(workspace,name));
const newExists=await fs.stat(dir).then(x=>x.isDirectory(),()=>false);
const presentLegacy=[];for(const candidate of legacyDirs)if(await fs.stat(candidate).then(x=>x.isDirectory(),()=>false))presentLegacy.push(candidate);
if((newExists&&presentLegacy.length)||presentLegacy.length>1)throw Error('Multiple workspace data directories exist; review them manually before migrating');
if(!newExists&&!presentLegacy.length)throw Error('Existing workspace required');
if(presentLegacy.length)await fs.rename(presentLegacy[0],dir);
for(const name of ['CV','海投简历']){
  const source=path.join(workspace,name),destination=path.join(dir,name);
  if(await fs.stat(source).then(x=>x.isDirectory(),()=>false)){
    if(await fs.stat(destination).then(()=>true,()=>false))throw Error(`Both old and new ${name} directories exist; review manually`);
    await fs.rename(source,destination);
  }
}
const file=path.join(dir,'workspace.json');
const current=await fs.readFile(file,'utf8').then(JSON.parse,e=>{if(e.code==='ENOENT')return null;throw e;});
if(current&&current.workspaceSchemaVersion!==1)throw Error('Unsupported workspace schema version; manual review required');
const result=spawnSync(process.execPath,[path.join(skillRoot,'runtime/tools/init.mjs'),'--workspace',workspace],{encoding:'utf8'});
if(result.status!==0)throw Error(result.stderr||result.stdout);
const workbook=path.join(workspace,'求职Dashboard.xlsx');
if(await fs.stat(workbook).then(x=>x.isFile(),()=>false)){
  const imported=spawnSync(process.execPath,[path.join(skillRoot,'runtime/tools/dashboard.mjs'),'--import-xlsx',workbook],{encoding:'utf8',env:{...process.env,USELESS_LINKEDIN_WORKSPACE:workspace}});
  if(imported.status!==0)throw Error('Historical Dashboard import failed: '+(imported.stderr||imported.stdout));
}
if(!current){
  const manifest=JSON.parse(await fs.readFile(file,'utf8'));
  manifest.initializedBy='legacy';manifest.lastMigratedAt=new Date().toISOString();
  await fs.writeFile(file,JSON.stringify(manifest,null,2)+'\n');
}
console.log(JSON.stringify({workspace,workspaceSchemaVersion:1,migrated:!current,renamedLegacyDirectory:presentLegacy.length>0}));
