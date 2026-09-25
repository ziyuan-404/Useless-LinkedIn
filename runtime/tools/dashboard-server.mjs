import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {root,args} from './runtime.mjs';
import {openDashboard,insertRecord,updateRecord,summary,localDate} from './lib/dashboard-db.mjs';

const a=args();const port=Number(a.port||8765);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Port must be 1024–65535');
const db=openDashboard(root);const publicDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dashboard');
const companyKey=value=>String(value??'').normalize('NFD').replace(/\p{M}/gu,'').trim().toUpperCase();
db.function('company_key',companyKey);
db.function('company_initial',value=>{const first=companyKey(value).charAt(0);return /^[A-Z]$/.test(first)?first:'#';});
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
function send(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));}
function fail(res,error){const message=error instanceof Error?error.message:String(error);send(res,/not found/i.test(message)?404:/changed/i.test(message)?409:400,{error:message});}
async function body(req){let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>250000)throw Error('Request too large');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
function openBrowser(){const url=`http://127.0.0.1:${port}/`;const command=process.platform==='win32'?'explorer.exe':process.platform==='darwin'?'open':'xdg-open';const child=spawn(command,[url],{detached:true,stdio:'ignore'});child.on('error',e=>console.error('Could not open browser:',e.message));child.unref();}
const server=http.createServer(async(req,res)=>{
 try{
  const host=req.headers.host||'';if(!new RegExp(`^(127\\.0\\.0\\.1|localhost):${port}$`,'i').test(host)){send(res,403,{error:'Local access only'});return;}
  const url=new URL(req.url,`http://127.0.0.1:${port}`);
  if(req.method==='GET'&&url.pathname==='/api/health'){send(res,200,{ok:true,workspace:root});return;}
  if(req.method==='GET'&&url.pathname==='/api/summary'){send(res,200,summary(db));return;}
  if(req.method==='GET'&&url.pathname==='/api/applications'){
   const query=(url.searchParams.get('q')||'').slice(0,200),status=(url.searchParams.get('status')||'').slice(0,100),initial=url.searchParams.get('initial')||'',sort=url.searchParams.get('sort')||'date-desc',focus=url.searchParams.get('focus')||'';
   const order={'date-desc':'date DESC, company_key(company) ASC, id ASC','date-asc':'date ASC, company_key(company) ASC, id ASC','company-asc':'company_key(company) ASC, date DESC, id ASC','company-desc':'company_key(company) DESC, date DESC, id ASC'}[sort];
   if(!order||initial&&!/^[A-Z#]$/.test(initial)||!['','due','waiting','verify','missing-jd','conflicts'].includes(focus))throw Error('Invalid filter or sort');
   let sql='SELECT * FROM applications WHERE 1=1',params=[];
   if(query){sql+=' AND (id LIKE ? OR company LIKE ? OR role LIKE ? OR job_url LIKE ?)';params.push(...Array(4).fill(`%${query}%`));}
   if(status){sql+=' AND status=?';params.push(status);}
   if(initial){sql+=' AND company_initial(company)=?';params.push(initial);}
   if(focus==='due'){sql+=" AND followup_date<>'' AND followup_date<=? AND status NOT IN ('跳过','拒绝','撤回','失效')";params.push(localDate());}
   if(focus==='waiting')sql+=" AND status='待用户'";
   if(focus==='verify')sql+=" AND status='已提交' AND submission_verified=0";
   if(focus==='missing-jd')sql+=' AND length(trim(jd))<300';
   if(focus==='conflicts')sql+=" AND (CASE WHEN applied='☑' THEN 1 ELSE 0 END)+(CASE WHEN awaiting_interview='☑' THEN 1 ELSE 0 END)+(CASE WHEN awaiting_result='☑' THEN 1 ELSE 0 END)>1";
   sql+=` ORDER BY ${order} LIMIT 1000`;send(res,200,db.prepare(sql).all(...params));return;
  }
  const item=url.pathname.match(/^\/api\/applications\/([^/]+)$/);
  if(req.method==='GET'&&item){const row=db.prepare('SELECT * FROM applications WHERE id=?').get(decodeURIComponent(item[1]));if(!row)throw Error('Record not found');send(res,200,row);return;}
  const events=url.pathname.match(/^\/api\/applications\/([^/]+)\/events$/);
  if(req.method==='GET'&&events){send(res,200,db.prepare('SELECT * FROM application_events WHERE application_id=? ORDER BY at DESC').all(decodeURIComponent(events[1])));return;}
  if(['POST','PATCH'].includes(req.method)){
   if(req.headers.origin!==`http://127.0.0.1:${port}`&&req.headers.origin!==`http://localhost:${port}`){send(res,403,{error:'Invalid origin'});return;}
   if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')){send(res,415,{error:'JSON required'});return;}
   const value=await body(req);
   if(req.method==='POST'&&url.pathname==='/api/applications'){send(res,201,insertRecord(db,value));return;}
   if(req.method==='PATCH'&&item){send(res,200,updateRecord(db,decodeURIComponent(item[1]),value));return;}
  }
  if(req.method!=='GET'){send(res,405,{error:'Method not allowed'});return;}
  const name=url.pathname==='/'?'index.html':url.pathname.slice(1);
  if(!['index.html','dashboard.js','dashboard.css','dashboard-layout.css'].includes(name)){send(res,404,{error:'Not found'});return;}
  const file=path.join(publicDir,name),data=await fs.readFile(file);
  res.writeHead(200,{'Content-Type':mime[path.extname(file)],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; connect-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'"});res.end(data);
 }catch(e){fail(res,e);}
});
server.on('error',async e=>{
 if(e.code==='EADDRINUSE'&&a.open){
  try{const response=await fetch(`http://127.0.0.1:${port}/api/health`,{signal:AbortSignal.timeout(1500)});const health=await response.json();if(response.ok&&health.workspace===root){db.close();openBrowser();return;}}catch{}
 }
 console.error(e.message);db.close();process.exitCode=1;
});
server.listen(port,'127.0.0.1',()=>{console.log(`Useless-Linkedin Dashboard: http://127.0.0.1:${port}/`);if(a.open)openBrowser();});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{db.close();process.exit(0);}));
