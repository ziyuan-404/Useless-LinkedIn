import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {root,args,slug} from './runtime.mjs';
import {fingerprintText,similarity} from '../vendor/career-ops/fingerprint-core.mjs';
const command=process.argv[2],a=args(process.argv.slice(3));
if(['scan','pipeline','tracker'].includes(command)){const p=spawnSync(process.execPath,[path.join(root,'.career-os/tools',`${command}.mjs`),...process.argv.slice(3)],{stdio:'inherit'});process.exit(p.status??1);}
if(command!=='intake'){console.log('career.mjs intake --company COMPANY --role ROLE --jd FILE --url URL');process.exit(command==='--help'?0:1);}
for(const k of ['company','role','jd','url'])if(typeof a[k]!=='string')throw Error(`Missing --${k}`);
if(!['http:','https:'].includes(new URL(a.url).protocol))throw Error('Invalid URL');
const jd=await fs.readFile(path.resolve(root,a.jd),'utf8');if(jd.trim().length<100)throw Error('Full JD required');
const dir=path.join(root,'.career-os/applications/intake');await fs.mkdir(dir,{recursive:true});
const fingerprint=fingerprintText(jd),duplicates=[];
for(const f of await fs.readdir(dir)){if(!f.endsWith('.json'))continue;const old=JSON.parse(await fs.readFile(path.join(dir,f),'utf8'));if(old.url===a.url||(old.company===a.company&&old.role===a.role)||(fingerprint&&old.fingerprint&&similarity(fingerprint,old.fingerprint)>=0.92))duplicates.push(f);}
const record={company:a.company,role:a.role,url:a.url,capturedAt:new Date().toISOString(),jd,fingerprint,possibleDuplicates:duplicates,status:'pending-assessment',ko:'UNKNOWN',dashboardSynced:false};
const file=path.join(dir,`${Date.now()}-${slug(a.company)}-${slug(a.role)}.json`);await fs.writeFile(file,JSON.stringify(record,null,2),{flag:'wx'});console.log(JSON.stringify({file,duplicates}));
