import fs from 'node:fs/promises';
import path from 'node:path';
import {skillRoot,args} from './runtime.mjs';

const a=args();
if(a.help){console.log('useless-linkedin init --workspace PATH');process.exit(0);}
if(typeof a.workspace!=='string')throw Error('Use init --workspace PATH');
const workspace=path.resolve(a.workspace);
if(workspace===skillRoot||workspace.startsWith(skillRoot+path.sep))throw Error('Workspace must be separate from the Skill');
const dataDirectory='.useless-linkedin';
const ignoreBlock=`# BEGIN Useless LinkedIn private workspace\n${dataDirectory}/profile/\n${dataDirectory}/applications/\n${dataDirectory}/audits/\n${dataDirectory}/archive/\n${dataDirectory}/operations/authorizations.json\n${dataDirectory}/dashboard-backups/\nCV/\n海投简历/\n求职Dashboard.xlsx\n# END Useless LinkedIn private workspace\n`;
const seeds=[
  ['workspace-template/.useless-linkedin/operations','.useless-linkedin/operations'],
  ['workspace-template/.useless-linkedin/template','.useless-linkedin/template'],
  ['workspace-template/.useless-linkedin/portals.yml','.useless-linkedin/portals.yml'],
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
for(const dir of ['.useless-linkedin/profile/experiences','.useless-linkedin/applications/automation','.useless-linkedin/audits','.useless-linkedin/archive','CV','海投简历'])await fs.mkdir(path.join(workspace,dir),{recursive:true});
for(const name of ['basics.md','preferences.md','links.md','claim-map.md']){
  const file=path.join(workspace,'.useless-linkedin/profile',name);
  try{await fs.writeFile(file,`# ${name.replace('.md','')}\n\n待填写。\n`,{flag:'wx'});created.push(path.relative(workspace,file));}
  catch(e){if(e.code!=='EEXIST')throw e;}
}
const ignoreFile=path.join(workspace,'.gitignore');
const ignore=await fs.readFile(ignoreFile,'utf8').catch(e=>{if(e.code==='ENOENT')return '';throw e;});
if(!ignore.includes('# BEGIN Useless LinkedIn private workspace')){
  await fs.appendFile(ignoreFile,(ignore&&!ignore.endsWith('\n')?'\n':'')+ignoreBlock);
  created.push('.gitignore');
}
const manifestFile=path.join(workspace,dataDirectory,'workspace.json');
try{
  await fs.writeFile(manifestFile,JSON.stringify({workspaceSchemaVersion:1,initializedBy:'0.3.0',createdAt:new Date().toISOString()},null,2)+'\n',{flag:'wx'});
  created.push(`${dataDirectory}/workspace.json`);
}catch(e){if(e.code!=='EEXIST')throw e;}
console.log(JSON.stringify({workspace,created},null,2));
