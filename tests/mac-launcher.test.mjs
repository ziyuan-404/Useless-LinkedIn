import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';

const skill=path.resolve(import.meta.dirname,'..');
const career=path.join(skill,'runtime/tools/useless-linkedin.mjs');

test('macOS workspace launcher starts both services and opens Dashboard',{
 skip:process.platform!=='darwin',timeout:30000
},async()=>{
 const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'career mac launcher '));
 const initialized=spawnSync(process.execPath,[career,'init','--workspace',workspace],{encoding:'utf8'});
 assert.equal(initialized.status,0,initialized.stderr);
 const launcher=path.join(workspace,'打开Dashboard.command');
 assert.ok((await fs.stat(launcher)).mode&0o111);
 const bin=path.join(workspace,'test-bin'),openLog=path.join(workspace,'opened-url.txt');
 await fs.mkdir(bin);
 await fs.writeFile(path.join(bin,'open'),'#!/bin/sh\nprintf "%s\\n" "$1" > "$USELESS_LINKEDIN_TEST_OPEN_LOG"\n',{mode:0o755});
 const child=spawn('/bin/bash',[launcher],{
  cwd:workspace,detached:true,stdio:['pipe','pipe','pipe'],
  env:{...process.env,PATH:`${bin}:/usr/bin:/bin`,USELESS_LINKEDIN_TEST_OPEN_LOG:openLog}
 });
 let output='';
 child.stdout.on('data',chunk=>{output+=chunk;});
 child.stderr.on('data',chunk=>{output+=chunk;});
 try{
  let ready=false;
  for(let attempt=0;attempt<150;attempt++){
   if(child.exitCode!==null)break;
   try{
    const [dashboard,editor]=await Promise.all([8765,8766].map(async port=>{
     const response=await fetch(`http://127.0.0.1:${port}/api/health`,{signal:AbortSignal.timeout(500)});
     return response.ok&&((await response.json()).workspace===workspace);
    }));
    if(dashboard&&editor&&(await fs.readFile(openLog,'utf8').catch(()=>''))==='http://127.0.0.1:8765/\n'){
     ready=true;break;
    }
   }catch{}
   await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.ok(ready,`macOS launcher did not start both services and open Dashboard:\n${output}`);
 }finally{
  child.stdin.end();
  try{process.kill(-child.pid,'SIGINT');}catch{}
  if(child.exitCode===null)await Promise.race([
   new Promise(resolve=>child.once('exit',resolve)),
   new Promise(resolve=>setTimeout(resolve,5000))
  ]);
 }
});
