import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {root,args,slug,dependency} from './runtime.mjs';
const a=args();
if(a.help){console.log('generate-application.mjs --company COMPANY --role ROLE --claims payload.json [--date YYYY-MM-DD] [--validate-only]');process.exit(0);}
for(const k of ['company','role','claims'])if(typeof a[k]!=='string')throw Error(`Missing --${k}`);
const basics=await fs.readFile(path.join(root,'.career-os/profile/basics.md'),'utf8');const candidateName=basics.match(/^-\s*姓名[:：]\s*(.+)$/m)?.[1]?.trim();if(!candidateName||/待填写|to complete/i.test(candidateName))throw Error('Configure a confirmed candidate name in the local profile');
const payload=JSON.parse(await fs.readFile(path.resolve(root,a.claims),'utf8'));
for(const [kind,allowed] of [['cv',['.subtitle','.profil-text','.skill-bullets','.profil-header-target','.availability','.item-title','.item-date','.item-sub','.item-loc','.item-bullets','.course-list']],['letter',['.subject','.letter','.personal-info']]]){
 if(!Array.isArray(payload[kind])||!payload[kind].length)throw Error(`${kind} replacements required`);
 for(const item of payload[kind]){
  if(!allowed.includes(item.selector)||typeof item.text!=='string'||!item.text.trim()||!Array.isArray(item.sources)||!item.sources.length)throw Error(`Invalid ${kind} replacement`);
  for(const source of item.sources){const p=path.resolve(root,source.path);if(!p.startsWith(path.join(root,'.career-os')+path.sep))throw Error('Source outside .career-os');const text=await fs.readFile(p,'utf8');if(typeof source.quote!=='string'||source.quote.length<8||!text.includes(source.quote))throw Error(`Source quote missing: ${source.path}`);}
 }
}
for(const [kind,selector] of [['cv','.subtitle'],['cv','.profil-text'],['letter','.subject'],['letter','.letter']])if(!payload[kind].some(x=>x.selector===selector))throw Error(`Required ${selector}`);
if(a['validate-only']){console.log('Sources valid; semantic review still required');process.exit(0);}
const date=a.date || new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Paris'});if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('Invalid date');
const out=a.output?path.resolve(root,a.output):path.join(root,'CV',`${date}-${slug(a.company)}-${slug(a.role)}`);
if(!out.startsWith(path.join(root,'CV')+path.sep))throw Error('Output must be a new directory under CV');
if(await fs.stat(out).then(()=>true,()=>false))throw Error('Application directory already exists');
const {chromium}=dependency('playwright');
const installedChrome=path.join(process.env.PROGRAMFILES || 'C:/Program Files','Google/Chrome/Application/chrome.exe');
const executable=process.env.CAREER_CHROME || (await fs.stat(installedChrome).then(()=>installedChrome,()=>null));
const browser=await chromium.launch({headless:true,...(executable?{executablePath:executable}:{})});
try{
 await fs.mkdir(out);await fs.mkdir(path.join(out,'work'));await fs.copyFile(path.join(root,'.career-os/template/portrait.png'),path.join(out,'portrait.png'));
 for(const [kind,template,name] of [['cv','resume','CV'],['letter','motivation-letter','Lettre']]){
  const page=await browser.newPage({viewport:{width:794,height:1123},deviceScaleFactor:1.5});
  const html=path.join(out,`${template}.html`);await fs.copyFile(path.join(root,'.career-os/template',`${template}.html`),html);
  await page.route('https://**/*',r=>r.abort());await page.goto(pathToFileURL(html).href);
  await page.evaluate(({items,title})=>{document.title=title;for(const item of items){const nodes=document.querySelectorAll(item.selector);if(nodes.length>1&&!Number.isInteger(item.index))throw Error(`index required for ${item.selector}`);const el=nodes[item.index??0];if(!el)throw Error(`Selector not found ${item.selector}`);if(['.letter','.skill-bullets','.item-bullets'].includes(item.selector)){el.replaceChildren(...item.text.split('\n').filter(Boolean).map(t=>{const n=document.createElement(item.selector==='.letter'?'p':'li');n.textContent=t;return n;}));}else {el.textContent=item.text;if(['.personal-info','.profil-header-target','.course-list','.availability'].includes(item.selector))el.style.whiteSpace='pre-line';}}},{items:payload[kind],title:`${candidateName} - ${a.company} - ${a.role}`});
  if(kind==='cv'){
   const dates=[];for(const file of ['experience-1.md','experience-2.md']){
    const source=await fs.readFile(path.join(root,'.career-os/profile/experiences',file),'utf8');const m=source.match(/^时间:\s*(\d{4})-(\d{2})[—–-](\d{4})-(\d{2})\s*$/m);if(!m)throw Error(`Confirmed dates missing: ${file}`);
    dates.push(m[1]===m[3]?`${m[2]}-${m[4]}/${m[1]}`:`${m[2]}/${m[1]}-${m[4]}/${m[3]}`);
   }
   for(let i=0;i<dates.length;i++){const override=payload.cv.find(x=>x.selector==='.item-date'&&(x.index??0)===i);if(override&&override.text!==dates[i])throw Error('Internship date override conflicts with current facts');}
   await page.evaluate(dates=>{const nodes=document.querySelectorAll('.item-date');dates.forEach((text,i)=>{if(!nodes[i])throw Error('Internship date element missing');nodes[i].textContent=text;});},dates);
  }
  const text=await page.locator('body').innerText();if(/VERSION DE TEST|\{\{/.test(text))throw Error('Stale template content');
  await fs.writeFile(html,await page.content());await page.emulateMedia({media:'print'});await page.evaluate(()=>document.fonts.ready);
  const clipped=await page.evaluate(()=>[...document.querySelectorAll('.page,.main,.sidebar')].some(e=>e.scrollHeight>e.clientHeight+2));if(clipped)throw Error('Text overflow detected');
  const pdf=path.join(out,`${slug(candidateName)}-${name}-${slug(a.company)}-${slug(a.role)}.pdf`);
  await page.pdf({path:pdf,format:'A4',printBackground:true,preferCSSPageSize:true});await page.screenshot({path:path.join(out,'work',`${template}.png`),fullPage:true});await page.close();
 }
 const baseline={identityEducationLanguages:'.career-os/profile/basics.md',links:'.career-os/profile/links.md',experience1:'.career-os/profile/experiences/experience-1.md',experience2:'.career-os/profile/experiences/experience-2.md',project1:'.career-os/profile/experiences/project-1.md',project2:'.career-os/profile/experiences/project-2.md'};
 const snapshots={};for(const [key,file] of Object.entries(baseline))snapshots[key]={path:file,sha256:createHash('sha256').update(await fs.readFile(path.join(root,file))).digest('hex')};
 await fs.writeFile(path.join(out,'work/claim-map.json'),JSON.stringify({replacements:payload,inheritedTemplateSources:snapshots,templateSha256:createHash('sha256').update(await fs.readFile(path.join(root,'.career-os/template/resume.html'))).digest('hex'),reviewRequired:'Check every inherited statement against these sources; file hashes are provenance, not semantic proof'},null,2));
 const python=process.env.CAREER_PYTHON || path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
 const result=spawnSync(python,[path.join(root,'.career-os/tools/pdf-qa.py'),out],{encoding:'utf8'});if(result.status!==0)throw Error(result.stderr||result.stdout);
 console.log(result.stdout);console.log(out);
}finally{await browser.close();}
