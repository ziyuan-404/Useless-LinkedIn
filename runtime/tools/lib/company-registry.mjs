import fs from 'node:fs/promises';
import path from 'node:path';
import {root} from '../runtime.mjs';
import {parse,publicUrl,normalizeUrl} from './core.mjs';
import {inferCareerSource} from './discovery-sources.mjs';

export async function companySources(config,{registered=[]}={}){
 const file=path.resolve(root,config.discovery?.companies_file||'个人资料/companies.yml');
 if(!file.startsWith(root+path.sep))throw Error('Company registry must remain within workspace');
 let data;try{data=parse(await fs.readFile(file,'utf8'),'yaml');}catch(error){if(error.code==='ENOENT')return [];throw error;}
 if(data?.version!==1||!Array.isArray(data.companies))throw Error('companies.yml requires version: 1 and companies array');
 return data.companies.flatMap(company=>{
  const {boards,...base}=company;
  if(boards!==undefined&&(!Array.isArray(boards)||!boards.length||boards.some(b=>!b||typeof b.career_url!=='string')))throw Error('Company boards must contain explicit career_url entries');
  // Board identities/routes belong to each board, not to the group defaults.
  const defaults=boards?Object.fromEntries(Object.entries(base).filter(([key])=>!['career_url','search_url','search_urls','api_url','api','board_token','site','region'].includes(key))):base;
  return (boards?boards.map(b=>({...defaults,...inferCareerSource(b.career_url),...b,name:company.name,board_label:b.label||b.board_token||b.site||inferCareerSource(b.career_url)?.name||b.career_url})): [base]).flatMap(c=>{
  if(c.enabled===false&&!c.career_url)return [];
  if(typeof c.name!=='string'||!c.name.trim()||typeof c.career_url!=='string')throw Error('Company requires name and career_url');
  publicUrl(c.career_url);const detected=inferCareerSource(c.career_url)||{};
  // Reuse the existing source name/queue when a curated company is the same
  // board previously discovered from a posting. Explicit portal config still
  // overrides these entries in scan's normal source merge.
  const existing=registered.find(s=>s.career_url&&(normalizeUrl(s.career_url)===normalizeUrl(c.career_url)||detected.name&&inferCareerSource(s.career_url)?.name===detected.name));
  if(c.enabled===false&&!existing)return [];
  return [{...detected,...c,name:existing?.name||'Company: '+c.name+(boards?' / '+c.board_label:''),company:company.name,renderer:c.renderer||'auto',web_search:false,listing_mode:(c.provider||detected.provider)?'fallback':undefined,career_extract:true,enabled:company.enabled!==false&&c.enabled!==false}];
  });
 });
}
