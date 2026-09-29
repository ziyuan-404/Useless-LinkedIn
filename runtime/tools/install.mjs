import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {args,root,skillRoot,toolsRoot,pythonCommand,dependency} from './runtime.mjs';

const options=args();
if(typeof options.workspace!=='string'||Object.keys(options).some(key=>!['workspace','python'].includes(key))||options.python!==undefined&&typeof options.python!=='string'){
 throw Error('Use install --workspace PATH [--python PYTHON_EXECUTABLE]');
}
if(Number(process.versions.node.split('.')[0])<24)throw Error('Node.js 24 or newer is required; install it, then retry');

function run(command,argv,{cwd=skillRoot,env=process.env,quiet=false,acceptedStatuses=[0]}={}){
 const windowsNpm=process.platform==='win32'&&command==='npm.cmd';
 const result=spawnSync(windowsNpm?process.env.ComSpec||'cmd.exe':command,windowsNpm?['/d','/s','/c',command,...argv]:argv,{
  cwd,env,encoding:quiet?'utf8':undefined,stdio:quiet?'pipe':'inherit'
 });
 if(result.error||!acceptedStatuses.includes(result.status))throw Error(`${command} ${argv.join(' ')} failed: ${result.error?.message||result.stderr||result.status}`);
 return result.stdout;
}

const python=options.python||pythonCommand();
const version=run(python,['-c','import sys; print(".".join(map(str,sys.version_info[:3])))'],{quiet:true}).trim();
const [major,minor]=version.split('.').map(Number);
if(major!==3||minor<10)throw Error(`Python 3.10 or newer is required; found ${version}`);

const npm=process.platform==='win32'?'npm.cmd':'npm';
console.log('Installing locked Node dependencies…');
run(npm,['ci']);
console.log('Installing local PDF Chromium…');
run(npm,['exec','--','playwright','install','chromium']);
const {chromium}=dependency('playwright');
const browser=await chromium.launch({headless:true});
await browser.close();

const venv=path.join(skillRoot,'.venv');
const venvPython=path.join(venv,process.platform==='win32'?'Scripts/python.exe':'bin/python');
if(!(await fs.stat(venvPython).catch(()=>null))?.isFile()){
 console.log('Creating isolated Python environment…');
 run(python,['-m','venv',venv]);
}
console.log('Installing locked Python dependencies…');
run(venvPython,['-m','pip','install','--disable-pip-version-check','-r',path.join(skillRoot,'requirements.txt')]);

console.log('Initializing the separate personal workspace…');
const env={...process.env,USELESS_LINKEDIN_PYTHON:venvPython};
run(process.execPath,[path.join(toolsRoot,'init.mjs'),'--workspace',root],{env});
const doctor=JSON.parse(run(process.execPath,[path.join(toolsRoot,'doctor.mjs'),'--workspace',root],{env,quiet:true,acceptedStatuses:[0,2]}));
const infrastructure=['Node >=24','Playwright','Chromium executable','Offline editor controls','Dashboard database','Python libraries','Workspace schema','Portals config','Profile basics','Dashboard launcher','Private gitignore'];
const failed=infrastructure.filter(name=>!doctor.checks.find(check=>check.name===name)?.ok);
if(failed.length)throw Error(`Installation checks failed: ${failed.join(', ')}`);
console.log(JSON.stringify({installed:true,workspace:root,python:venvPython,launcher:path.join(root,process.platform==='darwin'?'打开Dashboard.command':'打开Dashboard.cmd'),profileSetupRequired:doctor.checks.some(check=>check.required&&!check.ok)},null,2));
