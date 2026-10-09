import fs from 'node:fs/promises';
import path from 'node:path';
import {root} from '../runtime.mjs';
import {parse,publicUrl} from './core.mjs';
import {inferCareerSource} from './discovery-sources.mjs';

export async function companySources(config){
 const file=path.resolve(root,config.discovery?.companies_file||'个人资料/companies.yml');
 if(!file.startsWith(root+path.sep))throw Error('Company registry must remain within workspace');
 let data;try{data=parse(await fs.readFile(file,'utf8'),'yaml');}catch(error){if(error.code==='ENOENT')return [];throw error;}
 if(data?.version!==1||!Array.isArray(data.companies))throw Error('companies.yml requires version: 1 and companies array');
 return data.companies.filter(c=>c.enabled!==false).map(c=>{
  if(typeof c.name!=='string'||!c.name.trim()||typeof c.career_url!=='string')throw Error('Company requires name and career_url');
  publicUrl(c.career_url);const detected=inferCareerSource(c.career_url)||{};
  return {...detected,...c,name:'Company: '+c.name,company:c.name,renderer:c.renderer||'auto',web_search:false,listing_mode:(c.provider||detected.provider)?'fallback':undefined,career_extract:true,enabled:true};
 });
}
