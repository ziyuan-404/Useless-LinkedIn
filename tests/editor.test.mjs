import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';

const skill=path.resolve(import.meta.dirname,'..');
async function freePort(){const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;}

test('offline editor saves HTML and PDF with a recoverable previous version',async()=>{
 const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'career-editor-'));
 const dir=path.join(workspace,'个人资料/CV','fixture-role');await fs.mkdir(dir,{recursive:true});
 const original='<!doctype html><html><head><title>Fixture</title><style>body{width:210mm;height:297mm;margin:0}.page{width:210mm;height:297mm}</style></head><body><main class="page"><p>Original controlled text</p></main></body></html>';
 await fs.writeFile(path.join(dir,'resume.html'),original);
 await fs.writeFile(path.join(dir,'Fixture-CV-Role.pdf'),Buffer.alloc(200,1));
 const port=await freePort(),base=`http://127.0.0.1:${port}`;
 const server=spawn(process.execPath,[path.join(skill,'runtime/tools/editor.mjs'),'--port',String(port)],{cwd:workspace,env:{...process.env,USELESS_LINKEDIN_WORKSPACE:workspace},stdio:'ignore'});
 try{
  let ready=false;for(let i=0;i<40;i++){if(server.exitCode!==null)throw Error('Editor exited before becoming ready');try{const response=await fetch(base+'/api/health');if(response.ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
  assert.ok(ready,'Editor did not start');
  const projects=await (await fetch(base+'/api/projects')).json();assert.deepEqual(projects.map(x=>x.id),['fixture-role']);
  const rendered=await (await fetch(base+'/document/fixture-role/cv')).text();assert.match(rendered,/frame-editor\.js/);
  const save=async html=>fetch(base+'/api/save',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({project:'fixture-role',kind:'cv',html})});
  assert.equal((await fetch(base+'/api/save',{method:'POST',headers:{Origin:'http://evil.invalid','Content-Type':'application/json'},body:JSON.stringify({project:'fixture-role',kind:'cv',html:original})})).status,403);
  assert.equal((await save(original.replace('Original controlled text','<script>alert(1)</script>'))).status,400);
  const result=await save(original.replace('Original controlled text','Updated controlled text'));
  const saved=await result.json();assert.equal(result.status,200,JSON.stringify(saved));assert.equal(saved.review,'pending-visual-review');
  assert.match(await fs.readFile(path.join(dir,'resume.html'),'utf8'),/Updated controlled text/);
  assert.ok((await fs.stat(path.join(dir,'Fixture-CV-Role.pdf'))).size>1000);
  assert.equal(await fs.readFile(path.join(workspace,saved.history,'resume.html'),'utf8'),original);
  assert.ok((await fs.stat(path.join(dir,'work/cv-editor-preview.png'))).size>1000);
 }finally{server.kill();}
});
