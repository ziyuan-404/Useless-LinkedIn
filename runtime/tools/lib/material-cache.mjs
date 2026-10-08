import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {root,toolsRoot,dependency} from '../runtime.mjs';
import {home,read,write} from './core.mjs';
import {resolveStoragePath} from './storage-paths.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
async function tree(dir){const result=[];for(const e of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())result.push(...await tree(p));else if(e.isFile())result.push(p);else throw Error('Symlink material input requires review');}return result;}
export async function materialKey(options){
 const files=[...await tree(path.join(root,'个人资料/template')),...await tree(path.join(root,'个人资料/profile')),path.join(toolsRoot,'lib/material-generator.mjs'),path.join(toolsRoot,'pdf-qa.py')];
 const payload=JSON.parse(await fs.readFile(options.claims,'utf8'));
 for(const item of [...payload.cv,...payload.letter])for(const source of item.sources)files.push(await resolveStoragePath(root,source.path));
 const inputs=[];for(const file of [...new Set(files)].sort())inputs.push({file,sha256:sha(await fs.readFile(file))});
 return sha(JSON.stringify({company:options.company,role:options.role,date:options.date,payload,inputs,node:process.version,playwright:dependency('playwright/package.json').version,version:1}));
}
export async function cachedMaterial(key){
 const saved=await read(path.join(home,'material-cache',key+'.json'),null);if(!saved)return null;
 try{
  const output=await fs.realpath(saved.output),base=await fs.realpath(path.join(root,'个人资料/CV'));if(!output.startsWith(base+path.sep))return null;
  for(const file of saved.files){const target=await fs.realpath(path.join(output,file.path));if(!target.startsWith(output+path.sep)||sha(await fs.readFile(target))!==file.sha256)return null;}
  if(!saved.files.length)return null;
  return {...saved.result,reused:true,semanticReviewRequired:true};
 }catch(error){if(['ENOENT','ENOTDIR'].includes(error.code))return null;throw error;}
}
export async function cacheMaterial(key,result){
 const files=[];for(const file of await tree(result.output))files.push({path:path.relative(result.output,file),sha256:sha(await fs.readFile(file))});
 await write(path.join(home,'material-cache',key+'.json'),{output:result.output,result,files,createdAt:new Date().toISOString()});
}
