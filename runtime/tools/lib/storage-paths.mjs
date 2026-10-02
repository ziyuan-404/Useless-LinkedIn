import fs from 'node:fs/promises';
import path from 'node:path';

// IDs and content hashes stay in metadata; people see dates, companies and roles.
export function readablePart(value,fallback,limit){
 const clean=String(value||fallback).normalize('NFC').replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').replace(/\s+/g,' ').replace(/[. ]+$/g,'').trim();
 let part=clean||fallback;
 if(/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(part))part='_'+part;
 if(part.length>limit){const cut=part.slice(0,limit),space=cut.lastIndexOf(' ');part=(space>limit*.6?cut.slice(0,space):cut).replace(/[. ]+$/g,'');}
 if(part.lastIndexOf('(')>part.lastIndexOf(')'))part=part.slice(0,part.lastIndexOf('(')).trim();
 return part||fallback;
}
export function storageName({date,company,role,version}){
 return `${/^\d{4}-\d{2}-\d{2}$/.test(date||'')?date:new Date().toISOString().slice(0,10)}__${readablePart(company,'公司待核实',36)}__${readablePart(role,'岗位待核实',76)}${version?`__v${String(version).padStart(2,'0')}`:''}`;
}
export async function uniqueDirectory(base,name){
 let candidate=path.join(base,name),n=1;
 while(await fs.stat(candidate).then(()=>true,()=>false))candidate=path.join(base,`${name}__${String(++n).padStart(2,'0')}`);
 return candidate;
}
export async function resolveStoragePath(root,file){
 const original=path.resolve(root,file);
 const mapFile=path.resolve(root,process.env.USELESS_LINKEDIN_STATE_DIR||'个人资料/applications/automation','storage-path-map.json');
 let entries=[];try{entries=JSON.parse(await fs.readFile(mapFile,'utf8')).entries||[];}catch(e){if(e.code!=='ENOENT')throw e;}
 for(const entry of entries){const old=path.resolve(root,entry.from);if(original===old||original.startsWith(old+path.sep))return path.join(path.resolve(root,entry.to),path.relative(old,original));}
 return original;
}
export async function jobDirectory(root,home,job){
 if(job.directory){if(path.basename(job.directory)!==job.directory||job.directory.startsWith('.'))throw Error('Invalid job directory');return path.join(home,'jobs',job.directory);}
 const legacy=await resolveStoragePath(root,path.join(home,'jobs',job.id));
 if(await fs.stat(legacy).then(()=>true,()=>false))return legacy;
 return uniqueDirectory(path.join(home,'jobs'),storageName({date:job.createdAt?.slice(0,10),company:job.company,role:job.title}));
}
