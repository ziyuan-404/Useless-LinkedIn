import fs from 'node:fs/promises';
import path from 'node:path';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {dependency} from '../runtime.mjs';
import {home,hash,read,write,publicUrl} from './core.mjs';
import {authenticated,lbaPosting} from './official-job-apis.mjs';
import {httpFailure} from './discovery-policy.mjs';

// Complete official exports are streamed to one replaceable NDJSON snapshot per
// source. Cursors contain a byte offset, never a signed URL or authentication key.
export async function lbaExportPage(source,task,{fetchPage}){
 const api=source.api||{},size=api.page_size??500;
 if(Object.keys(api.params||{}).length)throw Error('LBA export does not support search filters; use search mode for structured geographic/ROME filters');
 const directory=path.join(home,'official-feeds'),file=path.join(directory,hash(JSON.stringify([source.name,task.url,task.sourceSignature||source]))+'.ndjson'),metaFile=file+'.json',cycle=task.cycle||1;
 await fs.mkdir(directory,{recursive:true});let metadata=await read(metaFile,null);const snapshotExists=await fs.stat(file).then(()=>true,()=>false);
 if(!metadata||metadata.cycle!==cycle||!snapshotExists){
  if(task.cursor?.byteOffset)throw Error('Official export snapshot is missing; reset the task before resuming');
  const raw=await authenticated(source,task.url,fetchPage);let exported;try{exported=JSON.parse(raw.body);}catch{throw Error('Invalid LBA export metadata');}
  if(!exported.url||!Number.isFinite(Date.parse(exported.lastUpdate)))throw Error('LBA export metadata lacks URL/date');
  if(metadata&&snapshotExists&&metadata.lastUpdate===exported.lastUpdate&&!task.cursor?.byteOffset){metadata.cycle=cycle;await write(metaFile,metadata);return {jobs:[],rowCount:0,total:metadata.count,nextCursor:null,complete:true,reason:'official_export_unchanged',url:task.url,unchangedSnapshot:true,incrementalEligible:false};}
  const url=publicUrl(exported.url),allowed=api.export_allowed_hosts||['s3.rbx.io.cloud.ovh.net','s3.gra.io.cloud.ovh.net','s3.sbg.io.cloud.ovh.net'];
  if(!allowed.includes(new URL(url).hostname)||new URL(url).protocol!=='https:'&&!process.env.USELESS_LINKEDIN_TEST_LOCAL)throw Error('Official export storage host requires explicit approval in export_allowed_hosts');
  const maxBytes=api.max_export_bytes??512*1024*1024;
  if(!Number.isFinite(maxBytes)||maxBytes<=0)throw Error('max_export_bytes must be positive');
  const temporary=file+'.'+process.pid+'.tmp',handle=await fs.open(temporary,'w');let count=0,bytes=0,foundJobs=false,depth=0,jobsDepth=-1,buffer='';
  try{
   const response=await fetchPage(url,{responseMode:'stream',timeoutMs:api.export_timeout_ms??180000});httpFailure(response);
   if(!response.bodyStream)throw Error('Official export returned no stream');
   const {parser}=dependency('stream-json'),{pick}=dependency('stream-json/filters/pick.js'),{streamArray}=dependency('stream-json/streamers/stream-array.js');
   const decoder=parser.asStream();
   decoder.on('data',token=>{
    if(token.name==='keyValue'&&depth===1&&token.value==='jobs')jobsDepth=depth;
    if(token.name==='startArray'&&jobsDepth===depth){foundJobs=true;jobsDepth=-1;}
    if(token.name==='startArray'||token.name==='startObject')depth++;
    if(token.name==='endArray'||token.name==='endObject')depth--;
   });
   const limit=new Transform({transform(chunk,encoding,done){bytes+=chunk.length;done(bytes>maxBytes?Error('Official export exceeded configured byte budget'):null,chunk);}});
   const sink=new Transform({objectMode:true,transform({value},encoding,done){
    const job=lbaPosting(value);if(job){buffer+=JSON.stringify(job)+'\n';count++;}
    if(buffer.length>=1024*1024){const batch=buffer;buffer='';handle.write(batch).then(()=>done(),done);}else done();
   }});
   // The sink consumes objects without retaining them in a readable queue.
   sink.resume();await pipeline(Readable.fromWeb(response.bodyStream),limit,decoder,pick.asStream({filter:'jobs'}),streamArray.asStream(),sink);
   if(!foundJobs)throw Error('Official export lacks a jobs array');
   if(buffer)await handle.write(buffer);await handle.close();await fs.rename(temporary,file);
   metadata={cycle,count,bytes,lastUpdate:exported.lastUpdate};await write(metaFile,metadata);
  }catch(error){await handle.close().catch(()=>{});await fs.unlink(temporary).catch(()=>{});throw Object.assign(Error('Official export retrieval failed: '+(error.status?'HTTP '+error.status:error.code||error.name)),{status:error.status,code:error.code,cause:error});}
 }
 const offset=task.cursor?.byteOffset||0,handle=await fs.open(file,'r'),jobs=[];let position=offset,remainder=Buffer.alloc(0),done=false;
 try{
  while(jobs.length<size&&!done){
   const block=Buffer.alloc(64*1024),{bytesRead}=await handle.read(block,0,block.length,position+remainder.length);
   if(!bytesRead){if(remainder.length)throw Error('Truncated official export snapshot');done=true;break;}
   remainder=Buffer.concat([remainder,block.subarray(0,bytesRead)]);
   let newline;
   while(jobs.length<size&&(newline=remainder.indexOf(10))>=0){const line=remainder.subarray(0,newline);remainder=remainder.subarray(newline+1);position+=newline+1;jobs.push(JSON.parse(line.toString('utf8')));}
  }
 }finally{await handle.close();}
 const complete=position===(await fs.stat(file)).size,page=task.cursor?.page||0;
 return {jobs,rowCount:jobs.length,total:metadata.count,page,nextCursor:complete?null:{byteOffset:position,page:page+1},complete,reason:complete?'official_export_end':'next_export_batch',url:task.url,incrementalEligible:false};
}
