import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {root,dependency,pythonCommand} from './runtime.mjs';
import {openDashboard} from './lib/dashboard-db.mjs';

const checks=[];
const check=(name,ok,detail='',required=true)=>checks.push({name,ok,detail,required});
check('Node >=24',Number(process.versions.node.split('.')[0])>=24,process.version);
try{
  const {chromium}=dependency('playwright');check('Playwright',true);
  const browser=process.env.USELESS_LINKEDIN_CHROME||chromium.executablePath();
  check('Chromium executable',await fs.stat(browser).then(()=>true,()=>false),browser);
}catch(e){check('Playwright',false,e.message);}
try{const db=openDashboard(root);const integrity=db.prepare('PRAGMA integrity_check').get().integrity_check;const count=db.prepare('SELECT count(*) n FROM applications').get().n;db.close();check('Dashboard database',integrity==='ok',`${count} records`);}catch(e){check('Dashboard database',false,e.message);}
try{
  const python=pythonCommand();
  const result=spawnSync(python,['-c','import openpyxl,pypdf,pypdfium2,PIL,yaml'],{encoding:'utf8'});
  check('Python libraries',result.status===0,result.status===0?python:result.stderr.trim());
}catch(e){check('Python libraries',false,e.message);}
const manifest=path.join(root,'00-个人资料/workspace.json');
try{
  const value=JSON.parse(await fs.readFile(manifest,'utf8'));
  check('Workspace schema',value.workspaceSchemaVersion===1,`version ${value.workspaceSchemaVersion}`);
}catch(e){check('Workspace schema',false,e.message);}
for(const [name,file] of [
  ['Portals config','00-个人资料/portals.yml'],
  ['Profile basics','00-个人资料/profile/basics.md'],
  ['Dashboard launcher','打开Dashboard.cmd'],
  ['Private gitignore','.gitignore']
])check(name,await fs.stat(path.join(root,file)).then(()=>true,()=>false));
const basics=await fs.readFile(path.join(root,'00-个人资料/profile/basics.md'),'utf8').catch(()=>null);
check('Profile identity',!!basics&&/^-\s*姓名[:：]\s*(?!待填写|你的姓名)\S+/m.test(basics));
const experiences=await fs.readdir(path.join(root,'00-个人资料/profile/experiences')).catch(()=>[]);
check('Experience records',experiences.some(name=>name.endsWith('.md')&&!name.startsWith('_')),`${experiences.length} files`);
const rules=await fs.readFile(path.join(root,'00-个人资料/operations/application-rules.md'),'utf8').catch(()=>'');
const rulesReady=!!rules&&!/- 目标岗位族：待确认|- 地点与远程偏好：待确认/.test(rules);
check('Application rules configured',rulesReady,rulesReady?'Target roles and location preferences configured':'Target roles and location preferences must be confirmed');
const strategy=await fs.readFile(path.join(root,'00-个人资料/operations/resume-strategy.md'),'utf8').catch(()=>'');
const strategyReady=!!strategy&&!/示例：软件开发|示例：数据方向/.test(strategy);
check('Resume strategy configured',strategyReady,strategyReady?'Routing rules configured; bulk PDFs still require review':'Replace example routing rows');
const pool=await fs.readFile(path.join(root,'00-个人资料/audits/resume-pool.json'),'utf8').then(JSON.parse,()=>({files:[]}));
check('Verified bulk resume',Array.isArray(pool.files)&&pool.files.some(x=>x.status==='verified'),'Audit and verify a current PDF before bulk routing',false);
console.log(JSON.stringify({workspace:root,checks},null,2));
if(checks.some(x=>x.required&&!x.ok))process.exitCode=2;
