import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {root,skillRoot,toolsRoot,dependency,pythonCommand} from '../runtime.mjs';
import {normalizeUrl} from '../../vendor/career-ops/url-key.mjs';
import {fingerprintText,similarity} from '../../vendor/career-ops/fingerprint-core.mjs';
import {classifyLiveness as upstreamLiveness} from '../../vendor/career-ops/liveness-core.mjs';
import {validateLead} from './schema.mjs';
export function classifyLiveness(input){if(/les candidatures ne sont plus accept[ée]es|n.accept[eé] plus de candidatures|offre (?:n.est plus|plus) disponible/i.test(input.bodyText||''))return {result:'expired',code:'fr_closed',reason:'French closed application banner'};return upstreamLiveness(input);}
export const home=path.resolve(root,process.env.USELESS_LINKEDIN_STATE_DIR||'.useless-linkedin/applications/automation');
if(!home.startsWith(root+path.sep))throw Error('State directory must remain within workspace');
export const hash=x=>createHash('sha256').update(x).digest('hex');
export async function write(file,obj){await fs.mkdir(path.dirname(file),{recursive:true});const tmp=file+`.${process.pid}.tmp`;await fs.writeFile(tmp,typeof obj==='string'?obj:JSON.stringify(obj,null,2));await fs.rename(tmp,file);}
export async function read(file,fallback){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
export function parse(text,mode='html'){const p=spawnSync(pythonCommand(),[path.join(toolsRoot,'lib/parse.py'),mode],{input:text,encoding:'utf8',maxBuffer:16*1024*1024});if(p.status!==0)throw Error(p.stderr);return JSON.parse(p.stdout);}
export async function config(file='.useless-linkedin/portals.yml'){const c=parse(await fs.readFile(path.resolve(root,file),'utf8'),'yaml');if(c.version!==1||!Array.isArray(c.portals))throw Error('Invalid portals.yml');return c;}
function privateAddress(address){
 const ip=address.replace(/^\[|\]$/g,'').toLowerCase();
 if(isIP(ip)===4){
  const [a,b]=ip.split('.').map(Number);
  return a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19)||a===192&&b===0||a===192&&b===88||a===192&&b===0;
 }
 if(isIP(ip)===6)return ip==='::'||ip==='::1'||/^f[cd]/.test(ip)||/^fe[89ab]/.test(ip)||ip.startsWith('ff')||ip.startsWith('::ffff:')&&privateAddress(ip.slice(7));
 return true;
}
export function publicUrl(url){
 const u=new URL(url);
 if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw Error('Only public HTTP URLs supported');
 const host=u.hostname.replace(/^\[|\]$/g,'').toLowerCase();
 if(!process.env.USELESS_LINKEDIN_TEST_LOCAL&&(host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal')||isIP(host)&&privateAddress(host)))throw Error('Private host refused');
 return u.href;
}
async function assertPublicUrl(url){
 const href=publicUrl(url),host=new URL(href).hostname.replace(/^\[|\]$/g,'');
 if(!process.env.USELESS_LINKEDIN_TEST_LOCAL){
  const addresses=isIP(host)?[{address:host}]:await lookup(host,{all:true,verbatim:true});
  if(!addresses.length||addresses.some(x=>privateAddress(x.address)))throw Error('Private DNS address refused');
 }
 return href;
}
export async function request(url,opts={}){
 let current=url;
 for(let redirects=0;redirects<=5;redirects++){
  current=await assertPublicUrl(current);
  const r=await fetch(current,{...opts,redirect:'manual',signal:AbortSignal.timeout(18000),headers:{'user-agent':'UselessLinkedIn/1.0 (public job discovery)',...opts.headers}});
  if([301,302,303,307,308].includes(r.status)){
   const location=r.headers.get('location');if(!location)throw Error('Redirect without location');
   current=new URL(location,current).href;await assertPublicUrl(current);continue;
  }
  const body=await r.text();if(body.length>8e6)throw Error('Response exceeds size limit');
  return {status:r.status,finalUrl:current,body};
 }
 throw Error('Too many redirects');
}
export async function browserPage(url){await assertPublicUrl(url);const {chromium}=dependency('playwright');const b=await chromium.launch({headless:true,...(process.env.USELESS_LINKEDIN_CHROME?{executablePath:process.env.USELESS_LINKEDIN_CHROME}:{})});try{const page=await b.newPage({serviceWorkers:'block'});await page.route('**/*',async route=>{try{await assertPublicUrl(route.request().url());await route.continue();}catch{await route.abort();}});const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:25000});await assertPublicUrl(page.url());await page.waitForTimeout(1500);return {status:response?.status()||0,finalUrl:page.url(),body:await page.content(),visibleText:await page.locator('body').innerText(),visibleLinks:await page.locator('a:visible,button[id^=sj_]:visible').evaluateAll(nodes=>nodes.map(n=>({url:/^sj_[0-9a-f]{16}$/.test(n.id)?'/viewjob?jk='+n.id.slice(3):n.getAttribute('href'),title:n.innerText}))),visibleControls:await page.locator('a:visible,button:visible').allTextContents()};}finally{await b.close();}}
function extract(raw,url,layer){const p=parse(raw.body);const j=p.jobs[0];let jd=raw.visibleText||p.text;if(j?.description)jd=parse(j.description).text;const title=j?.title||p.title;const company=j?.hiringOrganization?.name||'';const apply=(raw.visibleControls||p.links.filter(l=>l.url&&!/^(#|javascript:)/i.test(l.url)).map(l=>l.title)).filter(t=>/postuler|apply|candidater|envoyer.*candidature/i.test(t));
 let live=classifyLiveness({status:raw.status,requestedUrl:url,finalUrl:raw.finalUrl,bodyText:raw.visibleText||p.text,applyControls:apply});
 if(j?.validThrough&&Date.parse(j.validThrough)<Date.now())live={result:'expired',code:'validThrough',reason:j.validThrough};
 if(live.code==='insufficient_content'||/captcha|verify you are human|access denied|sign in to|connexion pour/i.test(p.text))live={result:'uncertain',code:'blocked_or_incomplete',reason:'Insufficient posting or access gate'};
 if(live.result==='active'&&jd.length<300)live={result:'uncertain',code:'incomplete_jd',reason:'Apply control without complete JD'};
 return {url,finalUrl:raw.finalUrl,layer,status:raw.status,title,company,jd,bodyText:raw.visibleText||p.text,links:p.links,structuredJob:j||null,liveness:live,capturedAt:new Date().toISOString()};}
export async function capture(url,{browser=true}={}){const attempts=[];let best;for(const [layer,fn] of [['HTTP',request],...(browser?[['Playwright',browserPage]]:[])]){try{const raw=await fn(url);const x=extract(raw,url,layer);attempts.push({layer,status:x.status,liveness:x.liveness});if(!best||x.jd.length>best.jd.length||x.liveness.result==='active')best=x;if(x.liveness.result==='active'||x.liveness.result==='expired')break;}catch(e){attempts.push({layer,error:e.message});}}
 return {...(best||{url,jd:'',liveness:{result:'uncertain',code:'fetch_failed',reason:'All fetch attempts failed'}}),attempts,searchNeeded:!best||best.liveness.result==='uncertain'};}
export async function transaction(fn){await fs.mkdir(home,{recursive:true});const lock=path.join(home,'.lock');const h=await fs.open(lock,'wx');try{const store=await read(path.join(home,'leads.json'),{version:1,jobs:[],scans:[]});if(store.version!==1||!Array.isArray(store.jobs)||!Array.isArray(store.scans))throw Error('Invalid lead store');const result=await fn(store);for(const job of store.jobs)await validateLead(job);await write(path.join(home,'leads.json'),store);return result;}finally{await h.close();await fs.unlink(lock);}}
export function add(store,job){const key=normalizeUrl(job.url);if(!key)throw Error('Invalid posting URL');const old=store.jobs.find(x=>x.key===key);if(old){old.lastSeenAt=new Date().toISOString();old.sources=[...new Set([...old.sources,job.portal||job.url])];return {duplicate:true,id:old.id};}
 const id=hash(key).slice(0,16),fp=fingerprintText(job.jd||'');const possible=store.jobs.filter(x=>(fp&&x.fingerprint&&similarity(fp,x.fingerprint)>=.92)||(job.company&&x.company===job.company&&x.title===job.title&&x.location===job.location)).map(x=>x.id);
 store.jobs.push({...job,id,key,fingerprint:fp,possibleDuplicates:possible,sources:[job.portal||job.url],createdAt:new Date().toISOString(),lastSeenAt:new Date().toISOString(),state:possible.length?'possible-duplicate':'discovered',dashboardSynced:false,submitted:false});return {id,possibleDuplicates:possible};}
export async function exportList(){const store=await read(path.join(home,'leads.json'),{jobs:[]});const escape=s=>String(s||'').replace(/\|/g,'/').replace(/\n/g,' ');await write(path.join(home,'list.md'),'# 自动发现岗位与流程阶段（机器状态；历史申请仍与 Excel 及成功凭证核对）\n\n| ID | 公司 | 岗位 | 来源 | 状态 | 优先级 | URL |\n|---|---|---|---|---|---|---|\n'+store.jobs.map(x=>`| ${x.id} | ${escape(x.company)} | ${escape(x.title)} | ${escape(x.portal)} | ${x.state} | ${x.priority||''} | ${x.url} |`).join('\n')+'\n');}
export {normalizeUrl};
