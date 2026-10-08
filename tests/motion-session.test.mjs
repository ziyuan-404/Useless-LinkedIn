import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {beginMotionSession} from '../runtime/tools/lib/motion-session.mjs';

const skill=path.resolve(import.meta.dirname,'..');
async function freePort(){
 const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;
}

test('motion introduction is claimed once across services and resets with a new launcher session',async()=>{
 const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'career-motion-'));
 const first=await beginMotionSession(workspace);
 const children=[],bases=[];
 try{
  for(const entry of ['dashboard-server.mjs','editor-server.mjs']){
   const port=await freePort(),base=`http://127.0.0.1:${port}`;
   const child=spawn(process.execPath,[path.join(skill,'runtime/tools',entry),'--port',String(port)],{
    cwd:workspace,env:{...process.env,USELESS_LINKEDIN_WORKSPACE:workspace},stdio:'ignore'
   });children.push(child);bases.push(base);
   let ready=false;
   for(let attempt=0;attempt<100;attempt++){
    if(child.exitCode!==null)throw Error(`${entry} exited before becoming ready`);
    try{ready=(await fetch(base+'/api/health')).ok;if(ready)break;}catch{}
    await new Promise(resolve=>setTimeout(resolve,50));
   }
   assert.ok(ready,`${entry} did not start`);
  }
  const read=base=>fetch(base+'/api/motion-session').then(response=>response.json());
  const claim=(base,origin=base)=>fetch(base+'/api/motion-session/claim',{
   method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'
  });
  for(const base of bases){
   // Both frontends load the same controls and timings, including nested imports.
   for(const asset of ['motion.js','motion.css','motion-tokens.js','motion-boot.js','controls.js','controls.css','segmented.js','segmented.css']) {
    const response=await fetch(`${base}/${asset}`);
    assert.equal(response.status,200,`${base}/${asset}`);
    assert.match(response.headers.get('content-type'),asset.endsWith('.css')?/text\/css/:/javascript/);
   }
   assert.deepEqual(await read(base),{launchId:first.launchId,introPlayed:false});
   assert.equal((await claim(base,'https://outside.example')).status,403);
  }
  const claims=await Promise.all(Array.from({length:12},(_,index)=>claim(bases[index%2]).then(response=>response.json())));
  assert.equal(claims.filter(result=>result.playIntro).length,1);
  assert.ok(claims.every(result=>result.launchId===first.launchId));
  for(const base of bases)assert.deepEqual(await read(base),{launchId:first.launchId,introPlayed:true});
  assert.equal((await (await claim(bases[0])).json()).playIntro,false);

  // A new CMD launch resets both reused services without restarting either.
  const second=await beginMotionSession(workspace);assert.notEqual(second.launchId,first.launchId);
  for(const base of bases){
   assert.deepEqual(await read(base),{launchId:second.launchId,introPlayed:false});
   assert.equal((await (await fetch(base+'/api/health')).json()).launchId,second.launchId);
  }
  assert.equal((await (await claim(bases[1])).json()).playIntro,true);
  assert.equal((await (await claim(bases[0])).json()).playIntro,false);
 }finally{
  await Promise.all(children.map(child=>new Promise(resolve=>{
   if(child.exitCode!==null){resolve();return;}child.once('exit',resolve);child.kill();
  })));
  await fs.rm(workspace,{recursive:true,force:true});
 }
});
