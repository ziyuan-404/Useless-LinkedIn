import {storageName,uniqueDirectory,resolveStoragePath} from './storage-paths.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {root,toolsRoot,args,slug,dependency,pythonCommand} from '../runtime.mjs';
import {materialKey,cachedMaterial,cacheMaterial} from './material-cache.mjs';
import {home} from './core.mjs';
import {companyMaterialSources} from './company-research.mjs';
export async function generateApplication(a,{sharedBrowser}={}){
for(const k of ['company','role','claims'])if(typeof a[k]!=='string')throw Error(`Missing --${k}`);
const basics=await fs.readFile(path.join(root,'个人资料/profile/basics.md'),'utf8');const candidateName=basics.match(/^-\s*姓名[:：]\s*(.+)$/m)?.[1]?.trim();if(!candidateName||/待填写|to complete/i.test(candidateName))throw Error('Configure a confirmed candidate name in the local profile');
const payload=JSON.parse(await fs.readFile(await resolveStoragePath(root,a.claims),'utf8'));
const companySources=await companyMaterialSources(root,home,{company:a.company});
for(const [kind,allowed] of [['cv',['.subtitle','.profil-text','.contact-details','.lang-bullets','.skill-bullets','.profil-header-target','.availability','.item-title','.item-date','.item-sub','.item-loc','.item-bullets','.course-list']],['letter',['.subject','.letter','.personal-info']]]){
 if(!Array.isArray(payload[kind])||!payload[kind].length)throw Error(`${kind} replacements required`);
 for(const item of payload[kind]){
  if(!allowed.includes(item.selector)||typeof item.text!=='string'||!item.text.trim()||!Array.isArray(item.sources)||!item.sources.length)throw Error(`Invalid ${kind} replacement`);
  if(item.index!==undefined&&(!Number.isInteger(item.index)||item.index<0))throw Error('Invalid replacement index');
  for(const source of item.sources){const p=await fs.realpath(await resolveStoragePath(root,source.path)),profile=await fs.realpath(path.join(root,'个人资料/profile'));const isFact=p.startsWith(profile+path.sep),isJd=p.startsWith(path.join(home,'jobs')+path.sep)&&path.basename(p)==='jd.txt';if(!isFact&&!(kind==='letter'&&(isJd||companySources.includes(p))))throw Error('Material sources must be candidate facts, a letter JD or reviewed company research');const text=await fs.readFile(p,'utf8');if(typeof source.quote!=='string'||source.quote.length<8||!text.includes(source.quote))throw Error(`Source quote missing: ${source.path}`);}
 }
 if(new Set(payload[kind].map(x=>JSON.stringify([x.selector,x.index??0]))).size!==payload[kind].length)throw Error('Duplicate replacement');
}
for(const [kind,selector] of [['cv','.subtitle'],['cv','.profil-text'],['cv','.contact-details'],['cv','.lang-bullets'],['letter','.subject'],['letter','.letter'],['letter','.personal-info']])if(!payload[kind].some(x=>x.selector===selector))throw Error(`Required ${selector}`);
if(a['validate-only'])return {validated:true,semanticReviewRequired:true};
const date=a.date || new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Paris'});if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('Invalid date');
const key=a.reuse&&!a.output?await materialKey({...a,date,claims:await resolveStoragePath(root,a.claims)}):null;
if(key){const cached=await cachedMaterial(key);if(cached)return cached;}
const finalOut=a.output?path.resolve(root,a.output):await uniqueDirectory(path.join(root,'个人资料/CV'),storageName({date,company:a.company,role:a.role}));
if(!finalOut.startsWith(path.join(root,'个人资料/CV')+path.sep))throw Error('Output must be a new directory under CV');
if(await fs.stat(finalOut).then(()=>true,()=>false))throw Error('Application directory already exists');
const out=path.join(root,'个人资料/CV',`.building-${process.pid}-${Date.now()}`);
const {chromium}=dependency('playwright');
const executable=process.env.USELESS_LINKEDIN_CHROME;
const browser=sharedBrowser||await chromium.launch({headless:true,...(executable?{executablePath:executable}:{})});
try{
 await fs.mkdir(out);await fs.mkdir(path.join(out,'work'));await fs.copyFile(path.join(root,'个人资料/template/portrait.png'),path.join(out,'portrait.png'));
 const expectedFiles={};
 for(const [kind,template,name] of [['cv','resume','CV'],['letter','motivation-letter','Lettre']]){
  const page=await browser.newPage({viewport:{width:794,height:1123},deviceScaleFactor:1.5});
  const html=path.join(out,`${template}.html`);await fs.copyFile(path.join(root,'个人资料/template',`${template}.html`),html);
  await page.route('https://**/*',r=>r.abort());await page.goto(pathToFileURL(html).href);
  await page.evaluate(({candidateName,kind})=>{document.querySelector('.header h1').textContent=candidateName;if(kind==='letter')document.querySelector('.signature').textContent=candidateName;const portrait=document.querySelector('.sidebar img');if(portrait&&portrait.naturalWidth<=1)portrait.remove();},{candidateName,kind});
  await page.evaluate(({items,title,candidateName})=>{
   document.title=title;
   const fillLegacyContact=text=>{
    const sidebar=document.querySelector('.sidebar');const availability=sidebar?.querySelector('.availability');
    const nodes=[...(sidebar?.querySelectorAll('.contact-item')??[])].filter(node=>node!==availability);
    const values=new Map(text.split('\n').map(line=>{const split=line.indexOf(':');return split<0?[line.trim().toLowerCase(),'']:[line.slice(0,split).trim().toLowerCase(),line.slice(split+1).trim()];}));
    const specs=[{keys:['téléphone','telephone','phone'],label:'Téléphone'},{keys:['email','e-mail'],label:'Email'},{keys:['github'],label:'GitHub',link:true},{keys:['linkedin'],label:'LinkedIn',link:true},{keys:['adresse','address'],label:'Adresse'}];
    for(let i=0;i<specs.length;i++){
     const node=nodes[i];if(!node)continue;const spec=specs[i];const value=spec.keys.map(key=>values.get(key)).find(Boolean)??'';
     const strong=node.querySelector('strong');if(strong)strong.textContent=spec.label;
     const anchor=node.querySelector('a');const span=node.querySelector('span');
     if(anchor){anchor.textContent=value;anchor.href=/^https?:\/\//i.test(value)?value:`https://${value}`;}else if(span)span.textContent=value;else node.textContent=`${spec.label} : ${value}`;
    }
   };
   for(const item of items){
    const nodes=document.querySelectorAll(item.selector);
    if(item.selector==='.contact-details'&&!nodes.length){fillLegacyContact(item.text);continue;}
    if(nodes.length>1&&!Number.isInteger(item.index))throw Error(`index required for ${item.selector}`);
    const el=nodes[item.index??0];if(!el)throw Error(`Selector not found ${item.selector}`);
    if(['.letter','.lang-bullets','.skill-bullets','.item-bullets'].includes(item.selector)){const lines=item.text.split('\n').map(t=>t.trim()).filter(Boolean);if(item.selector==='.letter'&&lines.at(-1)?.localeCompare(candidateName,undefined,{sensitivity:'base'})===0)lines.pop();el.replaceChildren(...lines.map(t=>{const n=document.createElement(item.selector==='.letter'?'p':'li');n.textContent=t;return n;}));}
    else {el.textContent=item.text;if(['.contact-details','.personal-info','.profil-header-target','.course-list','.availability'].includes(item.selector))el.style.whiteSpace='pre-line';}
   }
  },{items:payload[kind],title:`${candidateName} - ${a.company} - ${a.role}`,candidateName});
  if(kind==='cv'){
   const experienceDir=path.join(root,'个人资料/profile/experiences');
   const confirmedDates=new Map();
   for(const file of (await fs.readdir(experienceDir)).filter(x=>x.endsWith('.md'))){
    const source=await fs.readFile(path.join(experienceDir,file),'utf8');
    const m=source.match(/^时间:\s*(\d{4})-(\d{2})[—–-](\d{4})-(\d{2})\s*$/m);
    if(m)confirmedDates.set(file,m[1]===m[3]?`${m[2]}-${m[4]}/${m[1]}`:`${m[2]}/${m[1]}-${m[4]}/${m[3]}`);
   }
   for(let i=0;i<2;i++){
    const override=payload.cv.find(x=>x.selector==='.item-date'&&x.index===i);
    if(!override)throw Error(`Experience date ${i} requires an explicit sourced replacement`);
    const matching=[...confirmedDates].filter(([file,date])=>date===override.text&&override.sources.some(s=>path.basename(s.path)===file));
    if(!matching.length)throw Error(`Experience date ${i} conflicts with the current profile`);
   }
  }
  const text=await page.locator('body').innerText();
  const lines=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const placeholders=new Set(['Candidate','candidate@example.com','Availability to confirm','Languages to confirm','Skills to confirm','Target role','Contract to confirm','Profile to complete using confirmed facts','Organization','Location','Date','School','Courses to confirm','Application subject','Contact information to complete','Replace with sourced application text.']);
  const staleLine=lines.find(line=>placeholders.has(line)||/^Experience [1-4]$/.test(line));
  if(/VERSION DE TEST|\{\{/.test(text)||staleLine)throw Error(`Stale template content${staleLine?`: ${staleLine}`:''}`);
  await fs.writeFile(html,await page.content());await page.emulateMedia({media:'print'});await page.evaluate(()=>document.fonts.ready);
  const geometry=await page.evaluate(()=>{
   const containers=[...document.querySelectorAll('.page,.main,.sidebar,.letter')];
   const overflow=containers.some(e=>e.scrollHeight>e.clientHeight+2||e.scrollWidth>e.clientWidth+2);
   const body=document.querySelector('.page');const bounds=body?.getBoundingClientRect();
   const outside=[...document.querySelectorAll('.item-bullets li,.profil-text,.letter p,.subject,.personal-info')].filter(e=>{const r=e.getBoundingClientRect();return bounds&&(r.bottom>bounds.bottom+2||r.right>bounds.right+2||r.left<bounds.left-2);}).map(e=>e.className||e.tagName);
   return {overflow,outside};
  });if(geometry.overflow||geometry.outside.length)throw Error('Text overflow detected');
  await fs.writeFile(path.join(out,'work',kind+'-layout.json'),JSON.stringify(geometry));
  await fs.writeFile(path.join(out,'work',kind+'-expected.txt'),text);
  const pdf=path.join(out,`${slug(candidateName)}-${name}-${slug(a.company)}-${slug(a.role)}.pdf`);
  expectedFiles[path.basename(pdf)]=kind;
  await page.pdf({path:pdf,format:'A4',printBackground:true,preferCSSPageSize:true});await page.screenshot({path:path.join(out,'work',`${template}.png`),fullPage:true});await page.close();
 }
 await fs.writeFile(path.join(out,'work/expected-files.json'),JSON.stringify(expectedFiles));
 const baseline={identityEducationLanguages:'个人资料/profile/basics.md',links:'个人资料/profile/links.md'};
 for(const file of (await fs.readdir(path.join(root,'个人资料/profile/experiences'))).filter(x=>x.endsWith('.md')))baseline[`experience:${file}`]=`个人资料/profile/experiences/${file}`;
 const snapshots={};for(const [key,file] of Object.entries(baseline))snapshots[key]={path:file,sha256:createHash('sha256').update(await fs.readFile(path.join(root,file))).digest('hex')};
 await fs.writeFile(path.join(out,'work/claim-map.json'),JSON.stringify({replacements:payload,inheritedTemplateSources:snapshots,templateSha256:createHash('sha256').update(await fs.readFile(path.join(root,'个人资料/template/resume.html'))).digest('hex'),reviewRequired:'Check every inherited statement against these sources; file hashes are provenance, not semantic proof'},null,2));
 const result=spawnSync(pythonCommand(),[path.join(toolsRoot,'pdf-qa.py'),out],{encoding:'utf8'});if(result.status!==0)throw Error(result.stderr||result.stdout);
 await fs.rename(out,finalOut);
 const generated={output:finalOut,qa:JSON.parse(result.stdout),review:path.join(finalOut,'work/review.json'),preview:path.join(finalOut,'work/review.png'),semanticReviewRequired:true,reused:false};
 if(key)await cacheMaterial(key,generated);
 return generated;
}catch(error){
 if(await fs.stat(out).then(()=>true,()=>false)){
  const failedDir=path.join(root,'个人资料/archive/generation-failed');
  await fs.mkdir(failedDir,{recursive:true});
  const failedPath=path.join(failedDir,`${path.basename(finalOut)}-${process.pid}-${Date.now()}`);
  await fs.rename(out,failedPath);
  console.error(`Partial generation saved for review: ${failedPath}`);
 }
 throw error;
}finally{if(!sharedBrowser)await browser.close();}
}
