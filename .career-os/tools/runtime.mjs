import {createRequire} from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export const skillRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export const toolsRoot=path.join(skillRoot,'.career-os','tools');
export function findWorkspace(start=process.cwd()){
  let dir=path.resolve(start);
  if(dir===skillRoot||dir.startsWith(skillRoot+path.sep))throw Error('Set CAREER_WORKSPACE or run career init --workspace PATH; the Skill directory is not a workspace');
  while(dir!==path.dirname(dir)){
    if(dir!==skillRoot && fs.existsSync(path.join(dir,'.career-os')))return dir;
    dir=path.dirname(dir);
  }
  throw Error('No career workspace found. Run career init --workspace PATH or set CAREER_WORKSPACE');
}
const setupCommand=process.argv.includes('init')||process.argv.includes('--help')||path.basename(process.argv[1]||'')==='check-architecture.mjs';
export const workspaceRoot=process.env.CAREER_WORKSPACE?path.resolve(process.env.CAREER_WORKSPACE):setupCommand?process.cwd():findWorkspace();
if(workspaceRoot===skillRoot&&!setupCommand)throw Error('Workspace must be separate from the installed Skill');
export const root=workspaceRoot;
const require=createRequire(import.meta.url);
export function dependency(name){try{return require(name);}catch{const base=process.env.CAREER_NODE_MODULES || path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');return require(path.join(base,name));}}
export function pythonCommand(){
  for(const command of [process.env.CAREER_PYTHON,process.platform==='win32'?'python':'python3','python',path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/python',process.platform==='win32'?'python.exe':'bin/python')].filter(Boolean)){
    const result=spawnSync(command,['--version'],{encoding:'utf8'});
    if(result.status===0)return command;
  }
  throw Error('Python not found; set CAREER_PYTHON');
}
export function args(argv=process.argv.slice(2)){const r={};for(let i=0;i<argv.length;i++){if(!argv[i].startsWith('--'))throw Error('Unexpected argument');r[argv[i].slice(2)]=argv[i+1]&&!argv[i+1].startsWith('--')?argv[++i]:true;}return r;}
export function slug(s){const v=s.normalize('NFKD').replace(/\p{M}/gu,'').replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,90);if(!v)throw Error('Empty filename');return v;}
