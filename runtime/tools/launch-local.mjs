import {spawn} from 'node:child_process';
import path from 'node:path';
import {root,toolsRoot} from './runtime.mjs';
import {beginMotionSession} from './lib/motion-session.mjs';

const services=[
 {name:'Dashboard',port:8765,entry:'dashboard.mjs',args:['--serve']},
 {name:'材料编辑器',port:8766,entry:'editor.mjs',args:[]}
];
const managed=new Map();
let stopping=false,checking=false;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const address=service=>`http://127.0.0.1:${service.port}/`;

function openBrowser(service){
 const url=address(service);
 const command=process.platform==='win32'?'explorer.exe':process.platform==='darwin'?'open':'xdg-open';
 const child=spawn(command,[url],{detached:true,stdio:'ignore',windowsHide:true});
 child.on('error',error=>console.error(`${service.name} 页面未能自动打开：${error.message}。请在浏览器中打开 ${url}`));
 child.unref();
}

async function health(service){
 try{
  const response=await fetch(`${address(service)}api/health`,{signal:AbortSignal.timeout(1000)});
  if(!response.ok)return {occupied:true};
  const value=await response.json();
  return value?.ok===true&&typeof value.workspace==='string'
   ?{occupied:true,workspace:path.resolve(value.workspace)}:{occupied:true};
 }catch{return null;}
}

function spawnService(service){
 const child=spawn(process.execPath,[path.join(toolsRoot,service.entry),...service.args],{
  cwd:root,env:{...process.env,USELESS_LINKEDIN_WORKSPACE:root},stdio:'inherit',windowsHide:true
 });
 managed.set(service.port,child);
 child.on('exit',(code,signal)=>{
  if(managed.get(service.port)===child)managed.delete(service.port);
  if(!stopping)console.error(`${service.name} 已停止 (${signal||code})；正在检查并尝试恢复。`);
 });
 return child;
}

async function ensure(service,{quiet=false}={}){
 const current=await health(service);
 if(current?.workspace===root){
  if(!quiet)console.log(`${service.name} 已运行，复用 ${address(service)}`);
  return;
 }
 if(current?.occupied)throw Error(`${service.port} 端口被其他服务占用，无法启动 ${service.name}。`);
 const child=managed.get(service.port)||spawnService(service);
 for(let attempt=0;attempt<30;attempt++){
  await wait(200);
  const status=await health(service);
  if(status?.workspace===root){console.log(`${service.name} 已启动：${address(service)}`);return;}
  if(status?.occupied)throw Error(`${service.port} 端口被其他工作区或服务占用。`);
  if(child.exitCode!==null||child.signalCode!==null)throw Error(`${service.name} 启动失败，请查看上方错误。`);
 }
 throw Error(`${service.name} 未能在 6 秒内启动，请查看上方错误。`);
}

async function stop(){
 if(stopping)return;
 stopping=true;
 clearInterval(monitor);
 for(const child of managed.values())child.kill();
 console.log('本窗口启动的本地服务已停止。');
}

try{
 console.log(`工作区：${root}`);
 await beginMotionSession(root);
 for(const service of services)await ensure(service);
 openBrowser(services[0]);
 console.log('两个服务已就绪，正在浏览器中打开 Dashboard；材料编辑器可从看板进入。按 Ctrl+C 停止本窗口启动的服务。');
}catch(error){
 console.error(error.message);
 for(const child of managed.values())child.kill();
 process.exitCode=1;
}

const monitor=process.exitCode?null:setInterval(async()=>{
 if(checking||stopping)return;
 checking=true;
 try{for(const service of services)await ensure(service,{quiet:true});}
 catch(error){console.error(`服务检查失败：${error.message}`);}
 finally{checking=false;}
},5000);
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{void stop();});
