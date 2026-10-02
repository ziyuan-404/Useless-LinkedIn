import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {root,args,dependency} from './runtime.mjs';
import {resolveStoragePath} from './lib/storage-paths.mjs';
import {motionSession,claimMotionIntro} from './lib/motion-session.mjs';

const a=args();
const port=Number(a.port||8766);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Port must be 1024–65535');
const cvRoot=path.join(root,'个人资料','CV');
const uiRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../editor');
const interactFile=path.resolve(uiRoot,'../../node_modules/interactjs/dist/interact.min.js');
const kinds={cv:'resume.html',letter:'motivation-letter.html'};
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png'};
const sha=buffer=>createHash('sha256').update(buffer).digest('hex');
const validId=id=>typeof id==='string'&&id.length>0&&id.length<180&&!id.startsWith('.')&&!/[\\/]/.test(id)&&id!=='.'&&id!=='..';
function projectDir(id){if(!validId(id))throw Error('Invalid project');return path.join(cvRoot,id);}
async function documentFile(id,kind){if(!kinds[kind])throw Error('Invalid document type');const file=path.join(await resolveStoragePath(root,projectDir(id)),kinds[kind]);if(!(await fs.stat(file).catch(()=>null))?.isFile())throw Error('Document not found');return file;}
function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));}
function error(res,e){json(res,/not found/i.test(e.message)?404:400,{error:e.message});}
async function readJson(req){let bytes=0,chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>3500000)throw Error('Document too large');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
function openBrowser(){const url=`http://127.0.0.1:${port}/`;const cmd=process.platform==='win32'?'explorer.exe':process.platform==='darwin'?'open':'xdg-open';const child=spawn(cmd,[url],{detached:true,stdio:'ignore'});child.on('error',e=>console.error(e.message));child.unref();}
async function projects(){
 const rows=[];
 let leads=[];
 try{const store=JSON.parse(await fs.readFile(path.join(root,'个人资料','applications','automation','leads.json'),'utf8'));if(Array.isArray(store.jobs))leads=store.jobs;}catch{}
 for(const entry of await fs.readdir(cvRoot,{withFileTypes:true}).catch(()=>[])){
  if(!entry.isDirectory()||!validId(entry.name))continue;
  const dir=projectDir(entry.name),available=[];
  for(const [kind,name] of Object.entries(kinds))if((await fs.stat(path.join(dir,name)).catch(()=>null))?.isFile())available.push(kind);
  if(!available.length)continue;
  const lead=leads.find(job=>job.output&&path.basename(job.output)===entry.name||job.id&&entry.name.includes(`-${job.id}-`));
  const label=lead?`${entry.name.slice(0,10)} · ${lead.company||'未知公司'} — ${lead.title||'未知岗位'}`:entry.name;
  rows.push({id:entry.name,label,kinds:available,modifiedAt:(await fs.stat(dir)).mtime.toISOString()});
 }
 return rows.sort((x,y)=>y.modifiedAt.localeCompare(x.modifiedAt));
}
async function renderAndSave(id,kind,html){
 const source=await documentFile(id,kind),dir=path.dirname(source);
 if(typeof html!=='string'||html.length<100||html.length>3000000||!/<html[\s>]/i.test(html)||!/<body[\s>]/i.test(html)||/<script\b|<iframe\b|javascript\s*:/i.test(html))throw Error('Invalid edited HTML');
 const outputNames=(await fs.readdir(dir)).filter(x=>x.toLowerCase().endsWith('.pdf'));
 const marker=kind==='cv'?'-CV-':'-Lettre-';
 const name=outputNames.find(x=>x.includes(marker));
 if(!name)throw Error('Original PDF not found');
 const pdf=path.join(dir,name),work=path.join(dir,'work');await fs.mkdir(work,{recursive:true});
 const tag=randomUUID(),preview=path.join(dir,`.editor-preview-${tag}.html`),pdfTemp=path.join(work,`.editor-${tag}.pdf`),imageTemp=path.join(work,`.editor-${tag}.png`);
 await fs.writeFile(preview,html,'utf8');
 let browser;
 try{
  const {chromium}=dependency('playwright');browser=await chromium.launch({headless:true,...(process.env.USELESS_LINKEDIN_CHROME?{executablePath:process.env.USELESS_LINKEDIN_CHROME}:{})});
  const page=await browser.newPage({viewport:{width:794,height:1123},deviceScaleFactor:1.5});
  await page.route('**/*',route=>{
   const url=route.request().url();
   if(url.startsWith('data:'))return route.continue();
   if(url.startsWith('file:')){
    try{
     const relative=path.relative(dir,fileURLToPath(url));
     if(relative!==''&&relative!=='..'&&!relative.startsWith(`..${path.sep}`)&&!path.isAbsolute(relative))return route.continue();
    }catch{}
   }
   return route.abort();
  });
  await page.goto(pathToFileURL(preview).href,{waitUntil:'load'});await page.evaluate(()=>document.fonts.ready);
  const overflow=await page.evaluate(()=>[...document.querySelectorAll('.page,.main,.sidebar')].some(el=>el.scrollHeight>el.clientHeight+2));
  if(overflow)throw Error('Page content overflows; adjust the layout before saving');
  await page.emulateMedia({media:'print'});await page.pdf({path:pdfTemp,format:'A4',printBackground:true,preferCSSPageSize:true});await page.screenshot({path:imageTemp,fullPage:true});await page.close();
  const history=path.join(work,'editor-history',new Date().toISOString().replace(/[:.]/g,'-')+'-'+tag.slice(0,8));await fs.mkdir(history,{recursive:true});
  await fs.copyFile(source,path.join(history,path.basename(source)));await fs.copyFile(pdf,path.join(history,name));
  await fs.copyFile(preview,source);await fs.copyFile(pdfTemp,pdf);await fs.copyFile(imageTemp,path.join(work,`${kind}-editor-preview.png`));
  const result={project:id,kind,pdf:name,pdfPath:pdf,pdfSha256:sha(await fs.readFile(pdf)),history:path.relative(root,history),review:'pending-visual-review',savedAt:new Date().toISOString()};
  await fs.writeFile(path.join(work,`${kind}-editor-review.json`),JSON.stringify(result,null,2));return result;
 }finally{await browser?.close();await Promise.all([preview,pdfTemp,imageTemp].map(file=>fs.rm(file,{force:true}).catch(()=>{})));}
}

const server=http.createServer(async(req,res)=>{try{
 const host=req.headers.host||'';if(host!==`127.0.0.1:${port}`&&host!==`localhost:${port}`){json(res,403,{error:'Local access only'});return;}
 const url=new URL(req.url,`http://127.0.0.1:${port}`);
 if(req.method==='GET'&&url.pathname==='/api/health'){json(res,200,{ok:true,workspace:root,...await motionSession(root)});return;}
 if(req.method==='GET'&&url.pathname==='/api/motion-session'){json(res,200,await motionSession(root));return;}
 if(req.method==='POST'&&url.pathname==='/api/motion-session/claim'){
  if(![`http://127.0.0.1:${port}`,`http://localhost:${port}`].includes(req.headers.origin)){json(res,403,{error:'Invalid origin'});return;}
  if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')){json(res,415,{error:'JSON required'});return;}
  await readJson(req);json(res,200,await claimMotionIntro(root));return;
 }
 if(req.method==='GET'&&url.pathname==='/api/projects'){json(res,200,await projects());return;}
 if(req.method==='POST'&&url.pathname==='/api/save'){
  if(![`http://127.0.0.1:${port}`,`http://localhost:${port}`].includes(req.headers.origin)){json(res,403,{error:'Invalid origin'});return;}
  if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')){json(res,415,{error:'JSON required'});return;}
  const input=await readJson(req);json(res,200,await renderAndSave(input.project,input.kind,input.html));return;
 }
 const doc=url.pathname.match(/^\/document\/([^/]+)\/(cv|letter|portrait\.png)$/);
 if(req.method==='GET'&&doc){const id=decodeURIComponent(doc[1]);if(doc[2]==='portrait.png'){const data=await fs.readFile(path.join(await resolveStoragePath(root,projectDir(id)),'portrait.png'));res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'no-store'});res.end(data);return;}
  const file=await documentFile(id,doc[2]);const html=await fs.readFile(file,'utf8');const extra='<link data-editor-runtime rel="stylesheet" href="/frame-editor.css"><script data-editor-runtime src="/interact.min.js"></script><script data-editor-runtime src="/frame-editor.js"></script>';
  res.writeHead(200,{'Content-Type':mime['.html'],'Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'none'"});res.end(html.replace(/<\/body>/i,extra+'</body>'));return;
 }
 const staticFiles={'/app':'index.html','/editor.css':'editor.css','/editor.js':'editor.js','/frame-editor.js':'frame-editor.js','/frame-editor.css':'frame-editor.css'};
 const shared=['/','/workspace.html','/workspace.js','/workspace.css','/workspace-card.js','/workspace-genie.js','/anchor-motion.js','/language-layout.js','/language-layout.css','/motion.js','/motion.css','/motion-tokens.js','/motion-boot.js','/controls.js','/controls.css','/segmented.js','/segmented.css'].includes(url.pathname);
 const file=shared?path.join(uiRoot,'../shared',url.pathname==='/'?'workspace.html':url.pathname.slice(1)):url.pathname==='/interact.min.js'?interactFile:staticFiles[url.pathname]?path.join(uiRoot,staticFiles[url.pathname]):null;
 if(req.method!=='GET'||!file){json(res,404,{error:'Not found'});return;}
 let data=await fs.readFile(file);if(path.basename(file)==='workspace.html')data=data.toString('utf8').replace('__DEFAULT_VIEW__','editor').replace('__DASHBOARD_PORT__','8765').replace('__EDITOR_PORT__',String(port));res.writeHead(200,{'Content-Type':mime[path.extname(file)],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-src 'self' http://127.0.0.1:8765 http://127.0.0.1:8766 http://localhost:8765 http://localhost:8766; connect-src 'self'; base-uri 'none'; form-action 'self'"});res.end(data);
}catch(e){error(res,e);}});
server.on('error',async e=>{if(e.code==='EADDRINUSE'&&a.open){try{const r=await fetch(`http://127.0.0.1:${port}/api/health`,{signal:AbortSignal.timeout(1500)});const h=await r.json();if(r.ok&&h.workspace===root){openBrowser();return;}}catch{}}console.error(e.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>{console.log(`Useless-LinkedIn editor: http://127.0.0.1:${port}/`);if(a.open)openBrowser();});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
