import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {root,args} from './runtime.mjs';
const a=args();if(typeof a.file!=='string')throw Error('Use --file path.pdf');
const file=path.resolve(root,a.file),pool=JSON.parse(await fs.readFile(path.join(root,'.career-os/audits/resume-pool.json'),'utf8'));
const entry=pool.files.find(e=>path.resolve(root,e.path)===file);
if(!entry||entry.status!=='verified')throw Error('Resume not verified; use precision workflow. '+(entry?.issues||[]).join('; '));
const hash=createHash('sha256').update(await fs.readFile(file)).digest('hex');if(hash!==entry.sha256)throw Error('Resume changed since audit');console.log(file);
