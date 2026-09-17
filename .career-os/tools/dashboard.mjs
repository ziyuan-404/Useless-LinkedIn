import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {root,args,dependency} from './runtime.mjs';
const a=args();
if(a.help){console.log('dashboard.mjs --patch patch.json [--apply] [--workbook path.xlsx]');process.exit(0);}
if(typeof a.patch!=='string')throw Error('Missing --patch');
const patch=JSON.parse(await fs.readFile(path.resolve(root,a.patch),'utf8'));
if(!Array.isArray(patch.changes)||!patch.changes.length)throw Error('changes array required');
const target=path.resolve(root,a.workbook || '求职Dashboard.xlsx');if(!target.startsWith(root+path.sep))throw Error('Workbook outside workspace');
const lock=target+'.career.lock';let handle;
try{
 handle=await fs.open(lock,'wx');await handle.writeFile(JSON.stringify({pid:process.pid,time:new Date().toISOString()}));
 if(await fs.stat(path.join(path.dirname(target),'~$'+path.basename(target))).then(()=>true,()=>false))throw Error('Excel has this workbook open; close it and retry');
 const hash=b=>createHash('sha256').update(b).digest('hex');const before=await fs.readFile(target),version=hash(before);
 const {FileBlob,SpreadsheetFile}=dependency('@oai/artifact-tool');
 const w=await SpreadsheetFile.importXlsx(await FileBlob.load(target));
 for(const change of patch.changes){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(change.sheet)||typeof change.id!=='string'||!change.cells)throw Error('Invalid change');
  const s=w.worksheets.getItem(change.sheet),ids=s.getRange('A2:A1000').values.flat();const matches=ids.map((v,i)=>v===change.id?i+2:null).filter(Boolean);if(matches.length!==1)throw Error(`ID must match exactly once: ${change.id}`);
  const row=matches[0];for(const [col,edit] of Object.entries(change.cells)){
   if(!/^[B-W]$/.test(col)||!Object.hasOwn(edit,'before')||!Object.hasOwn(edit,'after'))throw Error('Expected before/after for B-W columns');
   const cell=s.getRange(`${col}${row}`);if(JSON.stringify(cell.values[0][0]??'')!==JSON.stringify(edit.before??''))throw Error(`Stale value: ${col}${row}`);
   if(cell.formulas?.[0]?.[0])throw Error('Cannot replace formula');
   if(typeof edit.after==='string'&&/^[=+@]/.test(edit.after))throw Error('Formula-like value refused');
   cell.values=[[edit.after]];
  }
  const state=s.getRange(`J${row}:M${row}`).values[0];if(state.slice(0,3).filter(x=>x==='☑').length>1)throw Error('Conflicting application states');
  if((state[3]==='已提交'||state[0]==='☑')&&!change.submissionEvidence)throw Error('Submission evidence required');
 }
 console.log(JSON.stringify(patch));if(!a.apply){console.log('Preview only; workbook unchanged');process.exitCode=0;}
 else{
  w.recalculate();const errors=await w.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!|#SPILL!|#CALC!',options:{useRegex:true,maxResults:50}});
  for(const s of w.worksheets.items){const range=/^\d{4}-\d{2}-\d{2}$/.test(s.name)?'A1:W1000':'A1:W100';if(s.getRange(range).values.flat().some(v=>typeof v==='string'&&/^#(?:REF!|DIV\/0!|VALUE!|NAME\?|N\/A|NUM!|NULL!|SPILL!|CALC!)$/.test(v)))throw Error('Formula errors in '+s.name);}
  const dir=path.join(root,'.career-os/dashboard-backups');await fs.mkdir(dir,{recursive:true});const token=Date.now();
  const temp=path.join(dir,`${token}-candidate.xlsx`);await (await SpreadsheetFile.exportXlsx(w)).save(temp);
  const check=await SpreadsheetFile.importXlsx(await FileBlob.load(temp));
  for(const change of patch.changes){const s=check.worksheets.getItem(change.sheet),ids=s.getRange('A2:A1000').values.flat(),row=ids.indexOf(change.id)+2;for(const [col,edit] of Object.entries(change.cells))if(JSON.stringify(s.getRange(`${col}${row}`).values[0][0]??'')!==JSON.stringify(edit.after??''))throw Error('Export verification failed');}
  for(const change of patch.changes){const s=w.worksheets.getItem(change.sheet),row=s.getRange('A2:A1000').values.flat().indexOf(change.id)+2;const image=await w.render({sheetName:change.sheet,range:`J${row}:M${row}`,scale:1});await fs.writeFile(path.join(dir,`${token}-${change.sheet}-review.png`),new Uint8Array(await image.arrayBuffer()));}
  if(hash(await fs.readFile(target))!==version)throw Error('Workbook changed during update');
  await fs.writeFile(path.join(dir,`${token}-original.xlsx`),before,{flag:'wx'});
  await fs.rename(temp,target);console.log('Saved with backup; review rendered changes before next application');
 }
}finally{if(handle){await handle.close();await fs.unlink(lock);}}
