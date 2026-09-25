import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {root,args,toolsRoot,pythonCommand} from './runtime.mjs';
import {fields,openDashboard,insertRecord,summary,dbPath,syncSubmittedLead} from './lib/dashboard-db.mjs';
import {home,read,transaction} from './lib/core.mjs';

const a=args();
if(a.help){console.log('dashboard --init | --import-xlsx PATH | --relocate-source PATH | --restore-source-text | --sync-submitted LEAD_ID | --verify | --serve [--port PORT]');process.exit(0);}
if(a.serve){await import('./dashboard-server.mjs');}
else if(a['import-xlsx']){
 const source=path.resolve(root,a['import-xlsx']);
 if(!source.startsWith(root+path.sep))throw Error('Source workbook must be inside workspace');
 const buffer=fs.readFileSync(source),hash=createHash('sha256').update(buffer).digest('hex');
 const p=spawnSync(pythonCommand(),[path.join(toolsRoot,'lib','import-dashboard.py'),source],{encoding:'utf8',maxBuffer:32e6,env:{...process.env,PYTHONIOENCODING:'utf-8'}});
 if(p.status!==0)throw Error(p.stderr||p.stdout);
 const records=JSON.parse(p.stdout);const ids=new Set();
 for(const r of records){if(r.values.length!==23||!r.values[0])throw Error(`Invalid row ${r.sheet}:${r.row}`);if(ids.has(r.values[0]))throw Error(`Duplicate ID ${r.values[0]}`);ids.add(r.values[0]);}
 const db=openDashboard(root);
 try{
  if(db.prepare('SELECT 1 FROM imports WHERE source_sha256=?').get(hash)){console.log(JSON.stringify({alreadyImported:true,rows:records.length,sha256:hash}));}
  else{
   if(db.prepare('SELECT count(*) n FROM applications').get().n)throw Error('Dashboard already contains records; import requires an empty database');
   db.exec('BEGIN IMMEDIATE');try{
    for(const r of records)insertRecord(db,Object.fromEntries(fields.map((key,i)=>[key,r.values[i]])),{sourceSheet:r.sheet,sourceRow:r.row,action:'imported-from-excel'});
    const urlCount=records.filter(r=>r.values[13]).length;
    db.prepare('INSERT INTO imports VALUES (?,?,?,?,?)').run(hash,source,new Date().toISOString(),records.length,urlCount);
    db.exec('COMMIT');console.log(JSON.stringify({imported:records.length,urlCount,sha256:hash,database:dbPath(root)}));
   }catch(e){db.exec('ROLLBACK');throw e;}
  }
 }finally{db.close();}
}else if(a['sync-submitted']){
 const leads=await read(path.join(home,'leads.json'),{jobs:[]});const job=leads.jobs.find(x=>x.id===a['sync-submitted']);if(!job)throw Error('Unknown lead ID');
 const receipt=JSON.parse(job.submissionEvidence||'null');if(!receipt?.artifactPath||!receipt?.artifactSha256)throw Error('Lead has no structured receipt');
 const artifact=path.resolve(root,receipt.artifactPath);if(!artifact.startsWith(root+path.sep))throw Error('Receipt artifact outside workspace');
 if(createHash('sha256').update(fs.readFileSync(artifact)).digest('hex')!==receipt.artifactSha256)throw Error('Receipt artifact changed');
 const db=openDashboard(root);let saved;try{saved=syncSubmittedLead(db,job);}finally{db.close();}
 await transaction(s=>{s.jobs.find(x=>x.id===job.id).dashboardSynced=true;});console.log(JSON.stringify({recordId:saved.id,submissionVerified:true}));
}else if(a['relocate-source']){
 const source=path.resolve(a['relocate-source']);const actualHash=createHash('sha256').update(fs.readFileSync(source)).digest('hex');
 const db=openDashboard(root);try{const imported=db.prepare('SELECT * FROM imports').all();if(imported.length!==1||imported[0].source_sha256!==actualHash)throw Error('Archive does not match the imported workbook');db.prepare('UPDATE imports SET source_path=? WHERE source_sha256=?').run(source,actualHash);console.log(JSON.stringify({archivedSource:source,sha256:actualHash}));}finally{db.close();}
}else if(a['restore-source-text']){
 const db=openDashboard(root);try{
  const imports=db.prepare('SELECT * FROM imports').all();if(imports.length!==1)throw Error('Exactly one import is required');
  const source=imports[0].source_path,actualHash=createHash('sha256').update(fs.readFileSync(source)).digest('hex');
  if(actualHash!==imports[0].source_sha256)throw Error('Source workbook hash changed');
  const p=spawnSync(pythonCommand(),[path.join(toolsRoot,'lib','import-dashboard.py'),source],{encoding:'utf8',maxBuffer:32e6,env:{...process.env,PYTHONIOENCODING:'utf-8'}});if(p.status!==0)throw Error(p.stderr||p.stdout);
  const original=JSON.parse(p.stdout);let fixed=0;db.exec('BEGIN IMMEDIATE');try{
   for(const x of original){const current=db.prepare('SELECT * FROM applications WHERE id=?').get(x.values[0]);if(!current)throw Error('Missing imported record');
    for(let i=0;i<fields.length;i++){const key=fields[i],value=x.values[i];if(current[key]===value)continue;
     if(current[key].trim()!==value.trim())throw Error(`Non-whitespace difference at ${x.sheet}:${x.row}:${key}`);
     db.prepare(`UPDATE applications SET ${key}=?,version=version+1,updated_at=? WHERE id=?`).run(value,new Date().toISOString(),current.id);
     db.prepare('INSERT INTO application_events VALUES (?,?,?,?,?,?)').run(randomUUID(),current.id,new Date().toISOString(),'source-whitespace-restored',JSON.stringify({field:key,before:current[key]}),JSON.stringify({field:key,after:value}));fixed++;
    }
   }
   db.exec('COMMIT');console.log(JSON.stringify({restoredFields:fixed}));
  }catch(e){db.exec('ROLLBACK');throw e;}
 }finally{db.close();}
}else if(a.verify){
 const db=openDashboard(root);try{
  const count=db.prepare('SELECT count(*) n FROM applications').get().n;
  const ids=db.prepare('SELECT count(DISTINCT id) n FROM applications').get().n;
  const urls=db.prepare("SELECT count(*) n FROM applications WHERE job_url<>''").get().n;
  const audit=db.prepare('PRAGMA integrity_check').get().integrity_check;
  const imports=db.prepare('SELECT * FROM imports').all();
  let sourceComparison=null;
  if(imports.length===1&&fs.existsSync(imports[0].source_path)){
   const source=imports[0].source_path,actualHash=createHash('sha256').update(fs.readFileSync(source)).digest('hex');
   const p=spawnSync(pythonCommand(),[path.join(toolsRoot,'lib','import-dashboard.py'),source],{encoding:'utf8',maxBuffer:32e6,env:{...process.env,PYTHONIOENCODING:'utf-8'}});
   if(p.status!==0)throw Error(p.stderr||p.stdout);
   const original=JSON.parse(p.stdout),byId=new Map(db.prepare('SELECT * FROM applications').all().map(x=>[x.id,x]));
   const edited=new Set(db.prepare("SELECT DISTINCT application_id FROM application_events WHERE action='updated'").all().map(x=>x.application_id));
   const mismatches=original.flatMap(x=>edited.has(x.values[0])?[]:fields.filter((key,i)=>byId.get(x.values[0])?.[key]!==x.values[i]).map(key=>`${x.sheet}:${x.row}:${key}`));
   sourceComparison={sha256Matches:actualHash===imports[0].source_sha256,rows:original.length,missingIds:original.filter(x=>!byId.has(x.values[0])).map(x=>x.values[0]),unmodifiedRowsCompared:original.filter(x=>!edited.has(x.values[0])).length,fieldMismatches:mismatches};
  }
  console.log(JSON.stringify({database:dbPath(root),count,uniqueIds:ids,urls,integrity:audit,imports,sourceComparison,summary:summary(db)},null,2));
  if(count!==ids||audit!=='ok'||imports.some(x=>x.row_count>count)||sourceComparison&&(sourceComparison.rows!==imports[0].row_count||!sourceComparison.sha256Matches||sourceComparison.missingIds.length||sourceComparison.fieldMismatches.length))process.exitCode=2;
 }finally{db.close();}
}else if(a.init){const db=openDashboard(root);db.close();console.log(dbPath(root));}
else throw Error('Use --init, --import-xlsx, --verify, or --serve');
