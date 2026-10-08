import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

const directory=workspace=>path.join(workspace,'个人资料','dashboard','.runtime');
const stateFile=workspace=>path.join(directory(workspace),'motion-session.json');
const claimFile=(workspace,launchId)=>path.join(directory(workspace),`intro-${launchId}`);
const alive=pid=>{try{process.kill(pid,0);return true;}catch{return false;}};
const valid=value=>value&&/^[\da-f-]{36}$/i.test(value.launchId)&&Number.isInteger(value.ownerPid)&&alive(value.ownerPid);

async function read(workspace){
 try{return JSON.parse(await fs.readFile(stateFile(workspace),'utf8'));}catch{return null;}
}

async function withLock(workspace,action){
 const dir=directory(workspace),lock=path.join(dir,'motion-session.lock');
 await fs.mkdir(dir,{recursive:true});
 for(let attempt=0;attempt<100;attempt++){
  try{await fs.mkdir(lock);}
  catch(error){
   if(error.code!=='EEXIST')throw error;
   // Recover a lock left behind by an interrupted process.
   const stat=await fs.stat(lock).catch(()=>null);
   const owner=await fs.readFile(path.join(lock,'owner'),'utf8').then(Number,()=>null);
   if(stat&&(owner&&!alive(owner)||!owner&&Date.now()-stat.mtimeMs>1000))await fs.rm(lock,{recursive:true,force:true});
   await new Promise(resolve=>setTimeout(resolve,20));continue;
  }
  try{await fs.writeFile(path.join(lock,'owner'),String(process.pid));return await action();}
  finally{await fs.rm(lock,{recursive:true,force:true});}
 }
 throw Error('Local motion session is busy');
}

async function write(workspace){
 const previous=await read(workspace);
 const session={launchId:randomUUID(),ownerPid:process.pid};
 const temporary=`${stateFile(workspace)}.${session.launchId}.tmp`;
 await fs.writeFile(temporary,JSON.stringify(session));
 await fs.rename(temporary,stateFile(workspace));
 if(previous&&/^[\da-f-]{36}$/i.test(previous.launchId))await fs.rm(claimFile(workspace,previous.launchId),{force:true});
 return session;
}

// Each launcher invocation starts one shared session, including when it reuses
// already-running services. Service restarts read the same launch identity.
export async function beginMotionSession(workspace){return withLock(workspace,()=>write(workspace));}

async function current(workspace){
 const session=await read(workspace);
 if(valid(session))return session;
 return withLock(workspace,async()=>{
  const latest=await read(workspace);
  return valid(latest)?latest:write(workspace);
 });
}

export async function motionSession(workspace){
 const {launchId}=await current(workspace);
 const introPlayed=await fs.access(claimFile(workspace,launchId)).then(()=>true,()=>false);
 return {launchId,introPlayed};
}

// Exclusive creation makes the first page claim atomic across both services,
// multiple tabs, and concurrent requests. Label changes do not claim an intro.
export async function claimMotionIntro(workspace){
 const {launchId}=await current(workspace);
 try{await fs.writeFile(claimFile(workspace,launchId),'',{flag:'wx'});return {launchId,playIntro:true};}
 catch(error){if(error.code!=='EEXIST')throw error;return {launchId,playIntro:false};}
}
