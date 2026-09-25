import fs from 'node:fs/promises';
import path from 'node:path';
import {skillRoot,args} from './runtime.mjs';
import {openDashboard} from './lib/dashboard-db.mjs';

const a=args();
if(a.help){console.log('useless-linkedin init --workspace PATH');process.exit(0);}
if(typeof a.workspace!=='string')throw Error('Use init --workspace PATH');
const workspace=path.resolve(a.workspace);
if(workspace===skillRoot||workspace.startsWith(skillRoot+path.sep))throw Error('Workspace must be separate from the Skill');
const dataDirectory='00-个人资料';
const ignoreBlock=`# BEGIN Useless LinkedIn private workspace\n${dataDirectory}/profile/\n${dataDirectory}/applications/\n${dataDirectory}/audits/\n${dataDirectory}/archive/\n${dataDirectory}/dashboard/\n${dataDirectory}/operations/authorizations.json\n00-个人资料/CV/\n00-个人资料/海投简历/\n# END Useless LinkedIn private workspace\n`;
const seeds=[
  ['workspace-template/00-个人资料/operations','00-个人资料/operations'],
  ['workspace-template/00-个人资料/template','00-个人资料/template'],
  ['workspace-template/00-个人资料/portals.yml','00-个人资料/portals.yml']
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
for(const dir of ['00-个人资料/profile/experiences','00-个人资料/applications/automation','00-个人资料/audits','00-个人资料/archive','00-个人资料/CV','00-个人资料/海投简历'])await fs.mkdir(path.join(workspace,dir),{recursive:true});
for(const name of ['basics.md','preferences.md','links.md','claim-map.md']){
  const file=path.join(workspace,'00-个人资料/profile',name);
  try{await fs.writeFile(file,`# ${name.replace('.md','')}\n\n待填写。\n`,{flag:'wx'});created.push(path.relative(workspace,file));}
  catch(e){if(e.code!=='EEXIST')throw e;}
}
const ignoreFile=path.join(workspace,'.gitignore');
const ignore=await fs.readFile(ignoreFile,'utf8').catch(e=>{if(e.code==='ENOENT')return '';throw e;});
if(!ignore.includes('# BEGIN Useless LinkedIn private workspace')){
  await fs.appendFile(ignoreFile,(ignore&&!ignore.endsWith('\n')?'\n':'')+ignoreBlock);
  created.push('.gitignore');
}
else if(!ignore.includes(`${dataDirectory}/dashboard/`)){
  await fs.appendFile(ignoreFile,`\n${dataDirectory}/dashboard/\n`);
  created.push('.gitignore dashboard rule');
}
const dashboardDb=openDashboard(workspace);dashboardDb.close();
const launcher=path.join(workspace,'打开Dashboard.cmd');
const launcherText=`@echo off\r\nset "USELESS_LINKEDIN_WORKSPACE=%~dp0"\r\nnode "${path.join(skillRoot,'runtime','tools','dashboard.mjs')}" --serve --open\r\nif errorlevel 1 pause\r\n`;
try{await fs.writeFile(launcher,launcherText,{flag:'wx'});created.push('打开Dashboard.cmd');}catch(e){if(e.code!=='EEXIST')throw e;}
const manifestFile=path.join(workspace,dataDirectory,'workspace.json');
try{
  await fs.writeFile(manifestFile,JSON.stringify({workspaceSchemaVersion:1,initializedBy:'0.3.0',createdAt:new Date().toISOString()},null,2)+'\n',{flag:'wx'});
  created.push(`${dataDirectory}/workspace.json`);
}catch(e){if(e.code!=='EEXIST')throw e;}
console.log(JSON.stringify({workspace,created},null,2));
