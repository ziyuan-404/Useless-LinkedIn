import fs from 'node:fs/promises';
import path from 'node:path';
import {skillRoot,args} from './runtime.mjs';

const a=args();
if(a.help){console.log('career init --workspace PATH');process.exit(0);}
if(typeof a.workspace!=='string')throw Error('Use init --workspace PATH');
const workspace=path.resolve(a.workspace);
if(workspace===skillRoot||workspace.startsWith(skillRoot+path.sep))throw Error('Workspace must be separate from the Skill');
const seeds=[
  ['workspace-template/.career-os/operations','.career-os/operations'],
  ['workspace-template/.career-os/template','.career-os/template'],
  ['workspace-template/.career-os/portals.yml','.career-os/portals.yml'],
  ['assets/dashboard-template.xlsx','求职Dashboard.xlsx']
];
const created=[];
async function copyMissing(source,destination){
  const stat=await fs.stat(source);
  if(stat.isDirectory()){
    await fs.mkdir(destination,{recursive:true});
    for(const name of await fs.readdir(source))await copyMissing(path.join(source,name),path.join(destination,name));
  }else{
    await fs.mkdir(path.dirname(destination),{recursive:true});
    try{await fs.copyFile(source,destination,fs.constants.COPYFILE_EXCL);created.push(path.relative(workspace,destination));}
    catch(e){if(e.code!=='EEXIST')throw e;}
  }
}
for(const [source,destination] of seeds)await copyMissing(path.join(skillRoot,source),path.join(workspace,destination));
for(const dir of ['.career-os/profile/experiences','.career-os/applications/automation','.career-os/audits','CV','海投简历'])await fs.mkdir(path.join(workspace,dir),{recursive:true});
for(const name of ['basics.md','preferences.md','links.md','claim-map.md']){
  const file=path.join(workspace,'.career-os/profile',name);
  try{await fs.writeFile(file,`# ${name.replace('.md','')}\n\n待填写。\n`,{flag:'wx'});created.push(path.relative(workspace,file));}
  catch(e){if(e.code!=='EEXIST')throw e;}
}
console.log(JSON.stringify({workspace,created},null,2));
