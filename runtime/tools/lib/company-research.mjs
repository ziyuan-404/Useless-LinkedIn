import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {acquireFileLock} from './file-lock.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex');
const nameKey=value=>String(value||'').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,' ').trim();
const domainOf=url=>new URL(url).hostname.toLowerCase().replace(/^www\./,'');
const forbidden=/(^|\.)(lever\.co|greenhouse\.io|ashbyhq\.com|hellowork\.com|linkedin\.com|welcometothejungle\.com|oui-emploi\.fr|google\.com)$/;
const read=async(file,fallback)=>{try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}};
async function write(file,value){await fs.mkdir(path.dirname(file),{recursive:true});const tmp=file+'.'+process.pid+'.tmp';await fs.writeFile(tmp,JSON.stringify(value,null,2));await fs.rename(tmp,file);}
export function companyKey(company,url){
 const u=new URL(url);if(!nameKey(company)||!['https:','http:'].includes(u.protocol)||u.username||u.password||forbidden.test(domainOf(url)))throw Error('An identified company and its independent official website are required');
 return sha(nameKey(company)+'\n'+domainOf(url)).slice(0,24);
}
export async function companyRecord(workspace,home,job,{now=Date.now(),maxAgeDays=30}={}){
 const base=path.join(home,'company-research'),index=await read(path.join(base,'index.json'),{companies:{}}),keys=index.companies[nameKey(job.company)]||[];
 if(keys.length!==1)return {status:keys.length?'identity-unresolved':'not-researched',company:job.company};
 const file=path.join(base,keys[0],'research.json'),record=await read(file,null);
 if(!record||nameKey(record.company)!==nameKey(job.company))return {status:'not-researched',company:job.company};
 try{
  for(const source of record.sources){
   const resolved=await fs.realpath(path.resolve(workspace,source.path)),realRoot=await fs.realpath(base);
   if(!resolved.startsWith(realRoot+path.sep)||sha(await fs.readFile(resolved))!==source.sha256)throw Error('Company source changed');
  }
 }catch{return {status:'source-invalid',company:job.company,file};}
 const oldest=Math.min(...record.sources.map(s=>Date.parse(s.observedAt)));
 const stale=record.sources.length>0&&(!Number.isFinite(oldest)||oldest>now+300000||now-oldest>maxAgeDays*86400000);
 return {...record,status:stale?'needs-update':record.status,file,sha256:sha(await fs.readFile(file))};
}
export async function collectCompany(workspace,home,company,urls,{fetchPage,parsePage,now=Date.now(),refresh=false}={}){
 if(!Array.isArray(urls)||!urls.length||urls.length>8)throw Error('Provide 1..8 observed official company URLs');
 const key=companyKey(company,urls[0]),domain=domainOf(urls[0]);
 for(const url of urls)if(companyKey(company,url)!==key)throw Error('Company sources must belong to the same verified website');
 const base=path.join(home,'company-research');await fs.mkdir(base,{recursive:true});const lock=await acquireFileLock(path.join(base,'cache.lock'));
 try{
 const existing=await companyRecord(workspace,home,{company},{now});
 if(!refresh&&existing.key===key&&['collected','researched'].includes(existing.status)&&urls.every(url=>existing.sources.some(s=>s.url===url)))return {...existing,reused:true};
 const dir=path.join(base,key),sources=[],failures=[];await fs.mkdir(dir,{recursive:true});
 for(const url of [...new Set(urls)]){
  try{
   const raw=await fetchPage(url);
   if(raw.status!==200||domainOf(raw.finalUrl||url)!==domain)throw Error('Official page is blocked, missing or redirected to another company');
   const parsed=await parsePage(raw.body),text=parsed.text?.trim();
   if(!text||text.length<100||/verify you are human|access denied|cloudflare challenge|captcha/i.test(text))throw Error('Company text is incomplete or blocked');
   const digest=sha(text),file=path.join(dir,'source-'+digest+'.txt');await fs.writeFile(file,text);
   sources.push({url,finalUrl:raw.finalUrl||url,observedAt:new Date(now).toISOString(),path:path.relative(workspace,file),sha256:digest});
  }catch(e){failures.push({url,reason:e.message});}
 }
 if(!sources.length){
  const prior=await read(path.join(dir,'research.json'),{}),file=path.join(dir,'research.json');await write(file,{...prior,version:1,key,company,domain,status:'collection-failed',sources:prior.sources||[],facts:prior.facts||[],inferences:prior.inferences||[],failures,updatedAt:new Date(now).toISOString()});
  const index=await read(path.join(base,'index.json'),{version:1,companies:{}});index.companies[nameKey(company)]=[...new Set([...(index.companies[nameKey(company)]||[]),key])];await write(path.join(base,'index.json'),index);
  return {company,key,status:'collection-failed',file,failures,reused:false};
 }
 const prior=await read(path.join(dir,'research.json'),null);
 const unchanged=prior?.status==='researched'&&prior.sources.length===sources.length&&prior.sources.every(s=>sources.some(n=>n.url===s.url&&n.sha256===s.sha256));
 const record={version:1,key,company,domain,status:unchanged?'researched':'collected',sources,failures,facts:unchanged?prior.facts:[],inferences:unchanged?prior.inferences:[],...(unchanged?{reviewedAt:prior.reviewedAt}:{}),updatedAt:new Date(now).toISOString()};
 const file=path.join(dir,'research.json');await write(file,record);
 const index=await read(path.join(base,'index.json'),{version:1,companies:{}});index.companies[nameKey(company)]=[...new Set([...(index.companies[nameKey(company)]||[]),key])];await write(path.join(base,'index.json'),index);
 return {...record,file,reused:false};
 }finally{await lock.close();}
}
export async function reviewCompany(workspace,home,job,review,{now=Date.now()}={}){
 const base=path.join(home,'company-research'),lock=await acquireFileLock(path.join(base,'cache.lock'));
 try{
 const record=await companyRecord(workspace,home,job,{now});
 if(!['collected','researched'].includes(record.status))throw Error('Fresh verified company sources required before review');
 if(review.sourceHash!==record.sha256||!Array.isArray(review.facts)||!review.facts.length||review.facts.length>12)throw Error('Review must bind the current sourceHash and provide 1..12 sourced facts');
 for(const fact of review.facts){
  const source=record.sources.find(s=>s.url===fact.sourceUrl);
  if(!source||typeof fact.text!=='string'||!fact.text.trim()||fact.text.length>1500||typeof fact.quote!=='string'||fact.quote.length<8||!(await fs.readFile(path.resolve(workspace,source.path),'utf8')).includes(fact.quote))throw Error('Company fact requires text and an exact quote from a verified source');
 }
 const inferences=review.inferences||[];if(!Array.isArray(inferences)||inferences.length>8||inferences.some(x=>typeof x!=='string'||!x.trim()||x.length>1500))throw Error('Invalid company inferences');
 const {file,sha256,status,reused,...basis}=record;
 await write(file,{...basis,status:'researched',facts:review.facts,inferences,reviewedAt:new Date(now).toISOString()});
 return companyRecord(workspace,home,job,{now});
 }finally{await lock.close();}
}
export function companyDisplay(record){
 const labels={'not-researched':'尚未研究','identity-unresolved':'公司官网身份待核实','collection-failed':'公司资料采集失败',collected:'已采集官方资料，待语义研究',researched:'已完成公司研究','needs-update':'公司研究待更新','source-invalid':'公司研究来源校验失败'};
 const lines=['公司：'+record.company,'研究状态：'+(labels[record.status]||record.status)];
 if(['researched','needs-update'].includes(record.status)){
  for(const fact of record.facts||[])lines.push('事实：'+fact.text+'\n来源：'+fact.sourceUrl);
  for(const inference of record.inferences||[])lines.push('推断：'+inference);
 }
 for(const source of record.sources||[])lines.push('核实日期：'+source.observedAt+'；'+source.url);
 return lines.join('\n');
}
export async function companyMaterialSources(workspace,home,job){
 const record=await companyRecord(workspace,home,job);
 return record.status==='researched'?record.sources.map(source=>path.resolve(workspace,source.path)):[];
}
