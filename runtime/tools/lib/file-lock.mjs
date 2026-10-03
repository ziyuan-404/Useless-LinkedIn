import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';

export async function acquireFileLock(file,{legacyStaleMs=3600000}={}){
 for(let attempt=0;attempt<3;attempt++){
  const token=randomUUID();
  try{
   const handle=await fs.open(file,'wx');await handle.writeFile(JSON.stringify({pid:process.pid,token,startedAt:new Date().toISOString()}));
   return {async close(){await handle.close();const current=await fs.readFile(file,'utf8').catch(e=>{if(e.code==='ENOENT')return '';throw e;});if(current&&JSON.parse(current).token===token)await fs.unlink(file);}};
  }catch(error){
   if(error.code!=='EEXIST')throw error;
   let contents,stat;try{contents=await fs.readFile(file,'utf8');stat=await fs.stat(file);}catch(e){if(e.code==='ENOENT')continue;throw e;}
   let owner;try{owner=JSON.parse(contents);}catch{}
   if(Number.isInteger(owner?.pid)&&owner.pid>0){
    try{process.kill(owner.pid,0);throw Error(`Another operation is already running (PID ${owner.pid})`);}catch(e){if(e.code!=='ESRCH')throw e;}
   }else if(Date.now()-stat.mtimeMs<legacyStaleMs)throw Error('Lock has no valid owner and is recent; wait for the owner to finish');
   // Re-check ownership before removing a dead/expired legacy lock.
   if(await fs.readFile(file,'utf8').catch(()=>null)===contents)await fs.unlink(file).catch(e=>{if(e.code!=='ENOENT')throw e;});
  }
 }
 throw Error('Could not acquire file lock');
}
