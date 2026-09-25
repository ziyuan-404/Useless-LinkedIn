import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {root,args,pythonCommand} from './runtime.mjs';

const [command,...rest]=process.argv.slice(2);
const a=args(rest);
const registry=path.join(root,'00-个人资料/audits/resume-pool.json');
const pool=JSON.parse(await fs.readFile(registry,'utf8').catch(e=>{if(e.code==='ENOENT')return '{"version":1,"files":[]}';throw e;}));
if(pool.version!==1||!Array.isArray(pool.files))throw Error('Invalid resume pool');
const sha=async file=>createHash('sha256').update(await fs.readFile(file)).digest('hex');
const save=async()=>{await fs.mkdir(path.dirname(registry),{recursive:true});await fs.writeFile(registry,JSON.stringify(pool,null,2));};
if(command==='list')console.log(JSON.stringify(pool.files,null,2));
else if(command==='add'){
  const file=path.resolve(root,a.file||'');
  if(!file.startsWith(path.join(root,'00-个人资料/海投简历')+path.sep)||path.extname(file).toLowerCase()!=='.pdf')throw Error('PDF must be in workspace 海投简历/');
  if(!a.family)throw Error('Use --family FAMILY');
  const id=createHash('sha256').update(path.relative(root,file)).digest('hex').slice(0,12);
  if(pool.files.some(x=>x.id===id))throw Error('Resume already registered');
  pool.files.push({id,path:path.relative(root,file),family:a.family,status:'pending-audit',sha256:await sha(file),addedAt:new Date().toISOString()});await save();console.log(JSON.stringify({id}));
}else if(command==='audit'||command==='verify'){
  const entry=pool.files.find(x=>x.id===a.id);if(!entry)throw Error('Unknown resume ID');
  const file=path.resolve(root,entry.path),current=await sha(file);
  if(command==='audit'){
    const script='import json,sys;from pypdf import PdfReader;r=PdfReader(sys.argv[1]);t=" ".join(p.extract_text() or "" for p in r.pages);print(json.dumps({"pages":len(r.pages),"textLength":len(t),"placeholder":any(x in t.lower() for x in ("待填写","lorem ipsum","{{"))}))';
    const check=spawnSync(pythonCommand(),['-c',script,file],{encoding:'utf8'});
    if(check.status!==0)throw Error(check.stderr||check.stdout);
    const result=JSON.parse(check.stdout),issues=[];
    if(current!==entry.sha256)issues.push('PDF changed since registration');
    if((await fs.stat(file)).size>=3000000)issues.push('PDF exceeds 3 MB');
    if(result.pages<1||result.textLength<100)issues.push('PDF has insufficient extractable text');
    if(result.placeholder)issues.push('PDF contains template placeholders');
    entry.audit={...result,issues,sha256:current,at:new Date().toISOString()};entry.status=issues.length?'needs-review':'audited';await save();
    console.log(JSON.stringify({id:entry.id,...entry.audit,status:entry.status,reviewRequired:'Check facts, layout, and role-family suitability'}));
  }else{if(!a.evidence||current!==entry.sha256||entry.status!=='audited'||entry.audit?.issues.length)throw Error('Clean PDF audit, review evidence, and unchanged file required');entry.status='verified';entry.reviewEvidence=a.evidence;entry.verifiedAt=new Date().toISOString();await save();console.log(JSON.stringify({id:entry.id,status:entry.status}));}
}else if(command==='select'){
  if([a.id,a.family,a.file].filter(Boolean).length!==1)throw Error('Select exactly one of --id, --family, or --file');
  let candidates=pool.files.filter(x=>x.status==='verified'&&(a.id?x.id===a.id:a.family?x.family===a.family:path.resolve(root,x.path)===path.resolve(root,a.file)));
  if(a.family&&candidates.length>1){
    const active=candidates.filter(x=>x.active===true);
    if(active.length!==1)throw Error('Ambiguous resume family: mark exactly one verified resume active');
    candidates=active;
  }
  if(candidates.length!==1)throw Error('Exactly one verified resume required');
  const entry=candidates[0];if(await sha(path.resolve(root,entry.path))!==entry.sha256)throw Error('Verified unchanged resume required');console.log(path.resolve(root,entry.path));
}else if(command==='activate'){
  const entry=pool.files.find(x=>x.id===a.id&&x.status==='verified');if(!entry)throw Error('Verified resume ID required');
  for(const other of pool.files)if(other.family===entry.family)other.active=other.id===entry.id;
  await save();console.log(JSON.stringify({id:entry.id,family:entry.family,active:true}));
}else throw Error('Use resume list | add --file PDF --family FAMILY | audit --id ID | verify --id ID --evidence TEXT | activate --id ID | select --id ID/--family FAMILY/--file PDF');
