import fs from 'node:fs/promises';
import path from 'node:path';
import {skillRoot,args} from './runtime.mjs';
import {openDashboard} from './lib/dashboard-db.mjs';

const a=args();
if(a.help){console.log('useless-linkedin init --workspace PATH');process.exit(0);}
if(typeof a.workspace!=='string')throw Error('Use init --workspace PATH');
const workspace=path.resolve(a.workspace);
if(workspace===skillRoot||workspace.startsWith(skillRoot+path.sep))throw Error('Workspace must be separate from the Skill');
const dataDirectory='个人资料';
const ignoreBlock=`# BEGIN Useless LinkedIn private workspace\n${dataDirectory}/profile/\n${dataDirectory}/applications/\n${dataDirectory}/audits/\n${dataDirectory}/archive/\n${dataDirectory}/dashboard/\n${dataDirectory}/operations/authorizations.json\n个人资料/CV/\n个人资料/海投简历/\n# END Useless LinkedIn private workspace\n`;
const seeds=[
  ['workspace-template/个人资料/operations','个人资料/operations'],
  ['workspace-template/个人资料/template','个人资料/template'],
  ['workspace-template/个人资料/portals.yml','个人资料/portals.yml']
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
for(const dir of ['个人资料/profile/experiences','个人资料/applications/automation','个人资料/audits','个人资料/archive','个人资料/CV','个人资料/海投简历'])await fs.mkdir(path.join(workspace,dir),{recursive:true});
for(const name of ['basics.md','preferences.md','links.md','claim-map.md']){
  const file=path.join(workspace,'个人资料/profile',name);
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
const cmdPath=value=>value.replaceAll('%','%%');
const launcherText=`@echo off\r\nsetlocal\r\nchcp 65001 >nul\r\ncd /d "%~dp0"\r\nset "USELESS_LINKEDIN_WORKSPACE=%~dp0"\r\nset "NODE_EXE=${cmdPath(process.execPath)}"\r\nif not exist "%NODE_EXE%" (\r\n  where node >nul 2>nul\r\n  if errorlevel 1 (\r\n    echo Node.js was not found. Install Node.js 24 or newer, then retry.\r\n    pause\r\n    exit /b 1\r\n  )\r\n  set "NODE_EXE=node"\r\n)\r\n"%NODE_EXE%" "${cmdPath(path.join(skillRoot,'runtime','tools','launch-local.mjs'))}"\r\necho.\r\necho Local services stopped. Press any key to close this window.\r\npause >nul\r\n`;
try{await fs.writeFile(launcher,launcherText,{flag:'wx'});created.push('打开Dashboard.cmd');}catch(e){if(e.code!=='EEXIST')throw e;}
if(process.platform==='darwin'){
 const macLauncher=path.join(workspace,'打开Dashboard.command');
 const shellQuote=value=>`'${value.replaceAll("'","'\\''")}'`;
 const macLauncherText=[
  '#!/bin/bash',
  'cd "$(dirname "$0")" || exit 1',
  'export USELESS_LINKEDIN_WORKSPACE="$PWD"',
  'export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin"',
  `NODE_BIN=${shellQuote(process.execPath)}`,
  'if [ ! -x "$NODE_BIN" ]; then NODE_BIN="$(command -v node || true)"; fi',
  'if [ -z "$NODE_BIN" ]; then',
  '  echo "Node.js was not found. Install Node.js 24 or newer, then retry."',
  '  read -r -p "Press Return to close this window..." _',
  '  exit 1',
  'fi',
  "if ! \"$NODE_BIN\" -e 'process.exit(Number(process.versions.node.split(\".\")[0]) >= 24 ? 0 : 1)' >/dev/null 2>&1; then",
  '  echo "Node.js 24 or newer is required."',
  '  read -r -p "Press Return to close this window..." _',
  '  exit 1',
  'fi',
  `"$NODE_BIN" ${shellQuote(path.join(skillRoot,'runtime','tools','launch-local.mjs'))}`,
  'status=$?',
  'echo',
  'echo "Local services stopped. Press Return to close this window."',
  'read -r _',
  'exit "$status"'
 ].join('\n')+'\n';
 try{
  await fs.writeFile(macLauncher,macLauncherText,{flag:'wx',mode:0o755});
  await fs.chmod(macLauncher,0o755);
  created.push('打开Dashboard.command');
 }catch(e){if(e.code!=='EEXIST')throw e;}
}
const manifestFile=path.join(workspace,dataDirectory,'workspace.json');
try{
  await fs.writeFile(manifestFile,JSON.stringify({workspaceSchemaVersion:1,initializedBy:'0.3.0',createdAt:new Date().toISOString()},null,2)+'\n',{flag:'wx'});
  created.push(`${dataDirectory}/workspace.json`);
}catch(e){if(e.code!=='EEXIST')throw e;}
console.log(JSON.stringify({workspace,created},null,2));
