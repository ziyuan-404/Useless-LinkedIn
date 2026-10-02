import {revealPage,reducedMotion,createGlass} from './motion.js';
import {motion} from './motion-tokens.js';

// Both applications stay mounted. Switching never replaces the host document,
// so the outgoing and incoming motion share one uninterrupted paint surface.
const root=document.documentElement,stage=document.querySelector('.workspace-stage');
const initialUrl=new URL(location.href),validView=view=>['dashboard','editor'].includes(view);
const validLanguage=value=>['zh','en','fr'].includes(value);
let active=validView(initialUrl.searchParams.get('view'))?initialUrl.searchParams.get('view'):root.dataset.defaultView;
let language=validLanguage(initialUrl.searchParams.get('lang'))?initialUrl.searchParams.get('lang'):localStorage.getItem('ul-ui-language')||'zh';
if(!validLanguage(language))language='zh';
let busy=true,pending=null,requestSequence=0;
let languageRevision=0,languageGlass=null,languageAnimations=[];
const frames=new Map(),waiters=new Map(),ready=new Set();
const glass=document.querySelector('.workspace-transition-glass'),message=document.querySelector('.workspace-message');
const text={zh:{dashboard:'投递看板',editor:'材料编辑器',unavailable:'页面暂时未能载入，请重试。',retry:'重试'},en:{dashboard:'Application Dashboard',editor:'Material editor',unavailable:'This page could not load. Please try again.',retry:'Retry'},fr:{dashboard:'Tableau de candidatures',editor:'Éditeur de documents',unavailable:'La page n’a pas pu se charger. Réessayez.',retry:'Réessayer'}};
function labels(){root.lang=language;for(const [view,frame] of frames)frame.node.title=text[language][view];message.querySelector('p').textContent=text[language].unavailable;message.querySelector('button').textContent=text[language].retry;document.title=`${text[language][active]} · Useless LinkedIn`;}
function updateUrl(replace=false){const url=new URL(location.href);url.searchParams.set('view',active);url.searchParams.set('lang',language);history[replace?'replaceState':'pushState']({view:active,language},'',url);}
function send(view,type,details={}){const frame=frames.get(view);frame?.node.contentWindow?.postMessage({type,...details},frame.origin);}
function wait(view,type,requestId,timeout=15000){const key=`${view}:${type}:${requestId??''}`;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{waiters.delete(key);reject(Error(`${view} ${type} timed out`));},timeout);waiters.set(key,{resolve:data=>{clearTimeout(timer);waiters.delete(key);resolve(data);}});});}
function command(view,type,ack,details={},timeout){const requestId=++requestSequence;const done=wait(view,ack,requestId,timeout);send(view,type,{...details,requestId});return done;}
function waitReady(view){return ready.has(view)?Promise.resolve():wait(view,'workspace-ready',undefined);}
function showActive(view){for(const [name,frame] of frames){const selected=name===view;frame.node.dataset.active=String(selected);frame.node.setAttribute('aria-hidden',String(!selected));frame.node.inert=!selected;}}
function settle(){busy=false;stage.setAttribute('aria-busy','false');labels();const next=pending;pending=null;if(next&&next.view!==active)void navigate(next);}
function reportUnavailable(view){message.hidden=false;message.dataset.retryView=view;}
function stopLanguageGlass(){languageAnimations.forEach(animation=>animation.cancel());languageAnimations=[];languageGlass?.remove();languageGlass=null;}
function replayLanguage(origin){
 stopLanguageGlass();if(reducedMotion())return;
 const glass=createGlass(document.body,{x:(origin?.x??.78)*innerWidth,y:(origin?.y??.04)*innerHeight});
 languageGlass=glass;languageAnimations=glass.play(motion.intro);
 Promise.all(languageAnimations.map(animation=>animation.finished.catch(()=>{}))).then(()=>{if(languageGlass===glass)stopLanguageGlass();});
}
function syncLanguage(next,source,{intentId,origin,animate=false}={}){
 if(!validLanguage(next))return;
 const changed=next!==language;
 language=next;++languageRevision;localStorage.setItem('ul-ui-language',next);labels();updateUrl(true);
 for(const view of frames.keys())send(view,'workspace-language',{language,revision:languageRevision,intentId:view===source?intentId:undefined,animate:view===active});
 if(changed&&animate)replayLanguage(origin);
}
async function navigate({view,origin,historyNavigation=false}){
 if(!validView(view)||view===active)return;
 if(busy){pending={view,origin,historyNavigation};return;}
 const departing=active;
 stopLanguageGlass();
 busy=true;stage.setAttribute('aria-busy','true');message.hidden=true;
 let veil;
 try{
  // Do all loading while the current page remains intact. The transition starts
  // only when the already mounted destination confirms it can draw immediately.
  await waitReady(view);
  const transition={origin,view,language,contentCardTransition:true};
  const preparation=await command(view,'workspace-prepare','workspace-prepared',transition);
  glass.style.clipPath=`inset(${preparation.headerHeight||66}px 0 0)`;
  // The already loaded destination remains collapsed until the current
  // content has entered the clicked tab. Neither header is transformed.
  if(!reducedMotion())veil=glass.animate([{opacity:0},{opacity:.25,offset:.3},{opacity:.25,offset:.65},{opacity:0}],{duration:motion.routeOut+motion.popover+motion.routeIn,easing:motion.color,fill:'both'});
  const departure=await command(departing,'workspace-depart','workspace-departed',transition);
  if(departure.blocked){send(view,'workspace-visible',{language});updateUrl(true);return;}
  send(view,'workspace-header',{view:departing,title:departure.title||text[language][departing],animate:false});
  for(const name of [departing,view])send(name,'workspace-header',{view,title:preparation.title||text[language][view]});
  frames.get(departing).node.dataset.cardVisible='true';root.classList.add('workspace-switching');
  showActive(view);
  const outgoing=command(departing,'workspace-card-out','workspace-card-out-done',transition).then(()=>{frames.get(departing).node.dataset.cardVisible='false';send(departing,'workspace-visible',{language});});
  await Promise.all([outgoing,command(view,'workspace-enter','workspace-entered',transition)]);
  active=view;
  send(view,'workspace-visible',{language});
  if(!historyNavigation)updateUrl();
  else updateUrl(true);
  if(veil)await veil.finished.catch(()=>{});
 }catch{
  showActive(departing);send(departing,'workspace-visible',{language});
  reportUnavailable(view);updateUrl(true);
 }finally{for(const frame of frames.values())frame.node.dataset.cardVisible='false';root.classList.remove('workspace-switching');veil?.cancel();glass.style.clipPath='';settle();}
}
window.addEventListener('message',event=>{
 const entry=[...frames].find(([,frame])=>event.source===frame.node.contentWindow&&event.origin===frame.origin);
 if(!entry||!event.data||typeof event.data!=='object')return;
 const [view]=entry,data=event.data;
 if(data.type==='workspace-ready'){ready.add(view);waiters.get(`${view}:workspace-ready:`)?.resolve(data);send(view,'workspace-language',{language,revision:languageRevision,animate:false});}
 const key=`${view}:${data.type}:${data.requestId??''}`;waiters.get(key)?.resolve(data);
 // A navigation carries the rendered language, which can lag behind a click.
 // Only explicit user intents from the visible frame may change host language.
 if(data.type==='workspace-navigate'&&view===active)void navigate({view:data.view,origin:data.origin});
 if(data.type==='workspace-language-intent'&&view===active)syncLanguage(data.language,view,{intentId:data.intentId,origin:data.origin,animate:true});
});
window.addEventListener('popstate',()=>{const url=new URL(location.href);syncLanguage(url.searchParams.get('lang'));const view=url.searchParams.get('view')||root.dataset.defaultView;void navigate({view,historyNavigation:true});});
message.querySelector('button').addEventListener('click',()=>{
 const view=message.dataset.retryView;message.hidden=true;const frame=frames.get(view);ready.delete(view);
 frame.node.src=`${frame.origin}/app?lang=${language}&motion-embedded=1`;
 if(view!==active){void navigate({view});return;}
 busy=true;stage.setAttribute('aria-busy','true');
 void waitReady(view).then(()=>send(view,'workspace-visible',{language})).catch(()=>reportUnavailable(view)).finally(settle);
});
for(const view of ['dashboard','editor']){
 const node=document.querySelector(`#workspace-${view}`),port=root.dataset[`${view}Port`];
 const origin=`${location.protocol}//${location.hostname}:${port}`;
 const url=`${origin}/app?lang=${language}&motion-embedded=1`;
 frames.set(view,{node,origin,url});node.src=url;
}
labels();showActive(active);updateUrl(true);
try{
 const claim=fetch('/api/motion-session/claim',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(1500)}).then(async response=>response.ok?(await response.json()).playIntro:false).catch(()=>false);
 await waitReady(active);
 if(await claim)await revealPage();
 else root.classList.remove('motion-pending');
 send(active,'workspace-visible',{language});
}catch{root.classList.remove('motion-pending');reportUnavailable(active);send(active,'workspace-visible',{language});}
finally{settle();}
