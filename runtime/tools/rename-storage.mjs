import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {DatabaseSync,backup} from 'node:sqlite';
import {root,args} from './runtime.mjs';
import {home,read,write} from './lib/core.mjs';
import {storageName} from './lib/storage-paths.mjs';

const a=args(),jobsRoot=path.join(home,'jobs'),cvRoot=path.join(root,'个人资料/CV');
const audit=path.resolve(root,a.audit||'个人资料/audits/storage-rename');
const within=(base,file)=>file.startsWith(base+path.sep);
if(!within(root,audit))throw Error('Audit must stay inside workspace');
const leadsFile=path.join(home,'leads.json'),store=await read(leadsFile,{jobs:[]});
const entries=[],reserved=new Set();
async function plan(base,from,name,jobId){
 let to=path.join(base,name),n=1;
 while(reserved.has(to)||await fs.stat(to).then(()=>true,()=>false))to=path.join(base,`${name}__${String(++n).padStart(2,'0')}`);
 from=path.resolve(from);to=path.resolve(to);
 if(!within(base,from)||!within(base,to))throw Error('Rename escaped its intended root');
 reserved.add(to);entries.push({from:path.relative(root,from),to:path.relative(root,to),jobId});
}
for(const job of store.jobs){
 const from=path.join(jobsRoot,job.id);
 if((await fs.stat(from).catch(()=>null))?.isDirectory()){
  if(await fs.stat(path.join(from,'.lock')).then(()=>true,()=>false))throw Error('A job is locked; retry after its current run');
  await plan(jobsRoot,from,storageName({date:job.createdAt?.slice(0,10),company:job.company,role:job.title}),job.id);
 }
}
for(const item of await fs.readdir(cvRoot,{withFileTypes:true})){
 if(!item.isDirectory())continue;
 const job=store.jobs.find(job=>item.name.includes(`-${job.id}-`));if(!job)continue;
 const version=Number(item.name.match(/-v(\d+)$/)?.[1]||1);
 await plan(cvRoot,path.join(cvRoot,item.name),storageName({date:item.name.slice(0,10),company:job.company,role:job.title,version}),job.id);
}
const remap=value=>{
 if(typeof value!=='string'||!value)return value;
 const normalized=value.replaceAll('\\','/');
 for(const entry of entries){for(const prefix of [entry.from.replaceAll('\\','/'),path.resolve(root,entry.from).replaceAll('\\','/')])if(normalized===prefix||normalized.startsWith(prefix+'/'))return (prefix===entry.from.replaceAll('\\','/')?entry.to:path.resolve(root,entry.to)).replaceAll('\\','/')+normalized.slice(prefix.length);}
 return value;
};
async function hashes(dir,prefix=''){
 const values={};for(const item of await fs.readdir(dir,{withFileTypes:true})){const relative=path.join(prefix,item.name),file=path.join(dir,item.name);if(item.isDirectory())Object.assign(values,await hashes(file,relative));else if(item.isFile())values[relative]=createHash('sha256').update(await fs.readFile(file)).digest('hex');else throw Error('Migration does not follow filesystem links');}return values;
}
await fs.mkdir(audit,{recursive:true});
const manifest={createdAt:new Date().toISOString(),entries};await write(path.join(audit,'rename-plan.json'),manifest);
if(!a.apply){console.log(JSON.stringify({apply:false,count:entries.length,entries},null,2));process.exit(0);}
if(!entries.length){console.log('No cryptic directories remain; nothing changed');process.exit(0);}
const lock=await fs.open(path.join(home,'.lock'),'wx'),moved=[];
const mapFile=path.join(home,'storage-path-map.json'),previousMap=await read(mapFile,{version:1,entries:[]});
const before=new Map();let db,committed=false;
try{
 await fs.copyFile(leadsFile,path.join(audit,'leads-before.json'));
 await write(path.join(audit,'path-map-before.json'),previousMap);
 for(const entry of entries)before.set(entry.from,await hashes(path.resolve(root,entry.from)));
 await write(path.join(audit,'file-hashes-before.json'),Object.fromEntries(before));
 const dbFile=path.join(root,'个人资料/dashboard/applications.sqlite');
 if(await fs.stat(dbFile).then(()=>true,()=>false)){db=new DatabaseSync(dbFile);db.exec('PRAGMA busy_timeout=5000');await backup(db,path.join(audit,'applications-before.sqlite'));db.exec('BEGIN IMMEDIATE');}
 for(const entry of entries){await fs.rename(path.resolve(root,entry.from),path.resolve(root,entry.to));moved.push(entry);}
 for(const entry of entries){const after=await hashes(path.resolve(root,entry.to));if(JSON.stringify(before.get(entry.from))!==JSON.stringify(after))throw Error('File content changed during rename');}
 for(const job of store.jobs){const entry=entries.find(entry=>entry.jobId===job.id&&entry.from.startsWith(path.relative(root,jobsRoot)+path.sep));if(entry)job.directory=path.basename(entry.to);if(job.output)job.output=remap(job.output);}
 if(db)for(const row of db.prepare('SELECT * FROM applications').all()){
  const resume=remap(row.resume_path),letter=remap(row.letter_path);
  if(resume===row.resume_path&&letter===row.letter_path)continue;
  const now=new Date().toISOString();
  db.prepare('UPDATE applications SET resume_path=?,letter_path=?,version=version+1,updated_at=? WHERE id=?').run(resume,letter,now,row.id);
  const saved=db.prepare('SELECT * FROM applications WHERE id=?').get(row.id);
  db.prepare('INSERT INTO application_events VALUES (?,?,?,?,?,?)').run(randomUUID(),row.id,now,'material-path-renamed',JSON.stringify(row),JSON.stringify(saved));
 }
 await write(mapFile,{version:1,entries:[...previousMap.entries,...entries]});
 await write(leadsFile,store);
 db?.exec('COMMIT');committed=true;
 await write(path.join(audit,'rename-result.json'),{...manifest,verifiedUnchangedFiles:true,completedAt:new Date().toISOString()});
 console.log(JSON.stringify({renamed:entries.length,verifiedUnchangedFiles:true,audit},null,2));
}catch(error){
 if(!committed){try{db?.exec('ROLLBACK');}catch{}for(const entry of moved.reverse())await fs.rename(path.resolve(root,entry.to),path.resolve(root,entry.from));await fs.copyFile(path.join(audit,'leads-before.json'),leadsFile);await write(mapFile,previousMap);}
 throw error;
}finally{db?.close();await lock.close();await fs.unlink(path.join(home,'.lock'));}
