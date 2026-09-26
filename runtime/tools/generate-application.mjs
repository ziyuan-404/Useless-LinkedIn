import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {root,toolsRoot,args,slug,dependency,pythonCommand} from './runtime.mjs';
const a=args();
if(a.help){console.log('generate-application.mjs --company COMPANY --role ROLE --claims payload.json [--date YYYY-MM-DD] [--validate-only]');process.exit(0);}
for(const k of ['company','role','claims'])if(typeof a[k]!=='string')throw Error(`Missing --${k}`);
const basics=await fs.readFile(path.join(root,'00-个人资料/profile/basics.md'),'utf8');const candidateName=basics.match(/^-\s*姓名[:：]\s*(.+)$/m)?.[1]?.trim();if(!candidateName||/待填写|to complete/i.test(candidateName))throw Error('Configure a confirmed candidate name in the local profile');
const payload=JSON.parse(await fs.readFile(path.resolve(root,a.claims),'utf8'));
for(const [kind,allowed] of [['cv',['.subtitle','.profil-text','.skill-bullets','.profil-header-target','.availability','.item-title','.item-date','.item-sub','.item-loc','.item-bullets','.course-list']],['letter',['.subject','.letter','.personal-info']]]){
 if(!Array.isArray(payload[kind])||!payload[kind].length)throw Error(`${kind} replacements required`);
 for(const item of payload[kind]){
  if(!allowed.includes(item.selector)||typeof item.text!=='string'||!item.text.trim()||!Array.isArray(item.sources)||!item.sources.length)throw Error(`Invalid ${kind} replacement`);
  for(const source of item.sources){const p=path.resolve(root,source.path);if(!p.startsWith(path.join(root,'00-个人资料')+path.sep))throw Error('Source outside 00-个人资料');const text=await fs.readFile(p,'utf8');if(typeof source.quote!=='string'||source.quote.length<8||!text.includes(source.quote))throw Error(`Source quote missing: ${source.path}`);}
 }
}
for(const [kind,selector] of [['cv','.subtitle'],['cv','.profil-text'],['letter','.subject'],['letter','.letter']])if(!payload[kind].some(x=>x.selector===selector))throw Error(`Required ${selector}`);
if(a['validate-only']){console.log('Sources valid; semantic review still required');process.exit(0);}
const date=a.date || new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Paris'});if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('Invalid date');
const finalOut=a.output?path.resolve(root,a.output):path.join(root,'00-个人资料/CV',`${date}-${slug(a.company)}-${slug(a.role)}`);
if(!finalOut.startsWith(path.join(root,'00-个人资料/CV')+path.sep))throw Error('Output must be a new directory under CV');
if(await fs.stat(finalOut).then(()=>true,()=>false))throw Error('Application directory already exists');
const out=path.join(root,'00-个人资料/CV',`.building-${process.pid}-${Date.now()}`);
const {chromium}=dependency('playwright');
const executable=process.env.USELESS_LINKEDIN_CHROME;
const browser=await chromium.launch({headless:true,...(executable?{executablePath:executable}:{})});
try{
 await fs.mkdir(out);await fs.mkdir(path.join(out,'work'));await fs.copyFile(path.join(root,'00-个人资料/template/portrait.png'),path.join(out,'portrait.png'));
 for(const [kind,template,name] of [['cv','resume','CV'],['letter','motivation-letter','Lettre']]){
  const page=await browser.newPage({viewport:{width:794,height:1123},deviceScaleFactor:1.5});
  const html=path.join(out,`${template}.html`);await fs.copyFile(path.join(root,'00-个人资料/template',`${template}.html`),html);
  await page.route('https://**/*',r=>r.abort());await page.goto(pathToFileURL(html).href);
  await page.evaluate(({items,title,candidateName})=>{document.title=title;for(const item of items){const nodes=document.querySelectorAll(item.selector);if(nodes.length>1&&!Number.isInteger(item.index))throw Error(`index required for ${item.selector}`);const el=nodes[item.index??0];if(!el)throw Error(`Selector not found ${item.selector}`);if(['.letter','.skill-bullets','.item-bullets'].includes(item.selector)){const lines=item.text.split('\n').map(t=>t.trim()).filter(Boolean);if(item.selector==='.letter'&&lines.at(-1)?.localeCompare(candidateName,undefined,{sensitivity:'base'})===0)lines.pop();el.replaceChildren(...lines.map(t=>{const n=document.createElement(item.selector==='.letter'?'p':'li');n.textContent=t;return n;}));}else {el.textContent=item.text;if(['.personal-info','.profil-header-target','.course-list','.availability'].includes(item.selector))el.style.whiteSpace='pre-line';}}},{items:payload[kind],title:`${candidateName} - ${a.company} - ${a.role}`,candidateName});
  if(kind==='cv'){
   const experienceDir=path.join(root,'00-个人资料/profile/experiences');
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
  const text=await page.locator('body').innerText();if(/VERSION DE TEST|\{\{/.test(text))throw Error('Stale template content');
  await fs.writeFile(html,await page.content());await page.emulateMedia({media:'print'});await page.evaluate(()=>document.fonts.ready);
  const clipped=await page.evaluate(()=>[...document.querySelectorAll('.page,.main,.sidebar')].some(e=>e.scrollHeight>e.clientHeight+2));if(clipped)throw Error('Text overflow detected');
  const pdf=path.join(out,`${slug(candidateName)}-${name}-${slug(a.company)}-${slug(a.role)}.pdf`);
  await page.pdf({path:pdf,format:'A4',printBackground:true,preferCSSPageSize:true});await page.screenshot({path:path.join(out,'work',`${template}.png`),fullPage:true});await page.close();
 }
 const baseline={identityEducationLanguages:'00-个人资料/profile/basics.md',links:'00-个人资料/profile/links.md'};
 for(const file of (await fs.readdir(path.join(root,'00-个人资料/profile/experiences'))).filter(x=>x.endsWith('.md')))baseline[`experience:${file}`]=`00-个人资料/profile/experiences/${file}`;
 const snapshots={};for(const [key,file] of Object.entries(baseline))snapshots[key]={path:file,sha256:createHash('sha256').update(await fs.readFile(path.join(root,file))).digest('hex')};
 await fs.writeFile(path.join(out,'work/claim-map.json'),JSON.stringify({replacements:payload,inheritedTemplateSources:snapshots,templateSha256:createHash('sha256').update(await fs.readFile(path.join(root,'00-个人资料/template/resume.html'))).digest('hex'),reviewRequired:'Check every inherited statement against these sources; file hashes are provenance, not semantic proof'},null,2));
 const result=spawnSync(pythonCommand(),[path.join(toolsRoot,'pdf-qa.py'),out],{encoding:'utf8'});if(result.status!==0)throw Error(result.stderr||result.stdout);
 await fs.rename(out,finalOut);
 console.log(result.stdout);console.log(finalOut);
}catch(error){
 if(await fs.stat(out).then(()=>true,()=>false)){
  const failedDir=path.join(root,'00-个人资料/archive/generation-failed');
  await fs.mkdir(failedDir,{recursive:true});
  const failedPath=path.join(failedDir,`${path.basename(finalOut)}-${process.pid}-${Date.now()}`);
  await fs.rename(out,failedPath);
  console.error(`Partial generation saved for review: ${failedPath}`);
 }
 throw error;
}finally{await browser.close();}
