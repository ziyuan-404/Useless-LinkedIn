import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {root,dependency,artifactTool,pythonCommand} from './runtime.mjs';

const checks=[];
const check=(name,ok,detail='')=>checks.push({name,ok,detail});
check('Node >=24',Number(process.versions.node.split('.')[0])>=24,process.version);
try{
  const {chromium}=dependency('playwright');check('Playwright',true);
  const browser=process.env.USELESS_LINKEDIN_CHROME||chromium.executablePath();
  check('Chromium executable',await fs.stat(browser).then(()=>true,()=>false),browser);
}catch(e){check('Playwright',false,e.message);}
try{await artifactTool();check('Dashboard artifact tool',true);}catch(e){check('Dashboard artifact tool',false,e.message);}
try{
  const python=pythonCommand();
  const result=spawnSync(python,['-c','import openpyxl,pypdf,pypdfium2,PIL,yaml'],{encoding:'utf8'});
  check('Python libraries',result.status===0,result.status===0?python:result.stderr.trim());
}catch(e){check('Python libraries',false,e.message);}
const manifest=path.join(root,'.useless-linkedin/workspace.json');
try{
  const value=JSON.parse(await fs.readFile(manifest,'utf8'));
  check('Workspace schema',value.workspaceSchemaVersion===1,`version ${value.workspaceSchemaVersion}`);
}catch(e){check('Workspace schema',false,e.message);}
for(const [name,file] of [
  ['Portals config','.useless-linkedin/portals.yml'],
  ['Profile basics','.useless-linkedin/profile/basics.md'],
  ['Dashboard','求职Dashboard.xlsx'],
  ['Private gitignore','.gitignore']
])check(name,await fs.stat(path.join(root,file)).then(()=>true,()=>false));
const basics=await fs.readFile(path.join(root,'.useless-linkedin/profile/basics.md'),'utf8').catch(()=>null);
check('Profile identity',!!basics&&/^-\s*姓名[:：]\s*(?!待填写|你的姓名)\S+/m.test(basics));
const experiences=await fs.readdir(path.join(root,'.useless-linkedin/profile/experiences')).catch(()=>[]);
check('Experience records',experiences.some(name=>name.endsWith('.md')&&!name.startsWith('_')),`${experiences.length} files`);
console.log(JSON.stringify({workspace:root,checks},null,2));
if(checks.some(x=>!x.ok))process.exitCode=2;
