// Shared motion for the Dashboard and material editor. No candidate data is stored here.
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
import {genieFrames} from './workspace-genie.js';
import {cardFrames,cardViewport} from './workspace-card.js';
import {followAnchor} from './anchor-motion.js';
import {motion,springProgress,geometryFrames} from './motion-tokens.js';
import {installControls} from './controls.js';
import {installSegments,observeChecks,moveWorkspaceSegment} from './segmented.js';
const ease = motion.ease;
let introSerial = 0, introAnimations = [], introNodes = [];
let introDone = Promise.resolve();
const dialogs = new WeakMap(), baselineStyles = new WeakMap();
const embedded = window.parent!==window && new URL(location.href).searchParams.get('motion-embedded')==='1';
let workspaceCanLeave=()=>true;
const settled = animation => animation.finished.catch(() => {});
export const reducedMotion = () => reduce.matches;
export const afterEntrance = () => introDone;

// Samples of an underdamped spring, with an exact resting endpoint.
function springFrames(from, to, duration = .64) {
 return Array.from({length: 49}, (_, i) => {
  const progress = springProgress(i / 48);
  return {offset: i / 48, transform: `translate(${from.x * (1-progress)}px,${from.y * (1-progress)}px) scale(${from.sx+(to-from.sx)*progress},${from.sy+(to-from.sy)*progress})`, opacity: Math.min(1,.12+progress*1.3)};
 });
}
// Route-only critically damped response. Other surface springs keep their curve.
function routeFrames(from) {
 const response=t=>1-(1+9*t)*Math.exp(-9*t),end=response(1);
 return Array.from({length:61},(_,i)=>{
  const p=response(i/60)/end;
  return {offset:i/60,transform:`translate(${from.x*(1-p)}px,${from.y*(1-p)}px) scale(${from.sx+(1-from.sx)*p},${from.sy+(1-from.sy)*p})`,opacity:Math.min(1,.1+p*1.06)};
 });
}
function sourceGeometry(target, source) {
 const end = target.getBoundingClientRect();
 const start = source?.isConnected ? source.getBoundingClientRect() : source;
 if (!start || !start.width || !end.width) return {x:0,y:18,sx:.96,sy:.96};
 return {x:start.left+start.width/2-end.left-end.width/2,y:start.top+start.height/2-end.top-end.height/2,sx:Math.max(.02,start.width/end.width),sy:Math.max(.02,start.height/end.height)};
}
function cancelIntro() {
 introAnimations.forEach(animation => animation.cancel()); introAnimations = [];
 introNodes.forEach(node => node.remove()); introNodes = [];
 document.documentElement.classList.remove('motion-pending','motion-entering','motion-language');
}
export function revealPage({origin, update} = {}) {
 const serial = ++introSerial;
 cancelIntro();
 const work = (async () => {
  const x = origin?.x ?? innerWidth * .5, y = origin?.y ?? innerHeight * .38;
  if (reduce.matches) { await update?.(); return; }
  const glass=createGlass(document.body,{x,y});
  introNodes=glass.nodes;
  document.documentElement.classList.add('motion-entering');
  if(update)document.documentElement.classList.add('motion-language');
  try {
   // The veil conceals label updates while the language segment stays visible.
   await update?.();
   if (serial !== introSerial) return;
   document.documentElement.classList.remove('motion-pending');
   introAnimations.push(...glass.play(motion.intro));
   for (const node of document.querySelectorAll(update?'body > main':'body > main, body > .topbar')) introAnimations.push(node.animate([
    {opacity:0,transform:'translateY(12px) scale(.975)'}, {opacity:1,transform:'translateY(0) scale(1)'}
   ],{duration:2100,delay:320,easing:ease,fill:'both'}));
   await Promise.all(introAnimations.map(settled));
  } finally { if (serial === introSerial) cancelIntro(); }
 })();
 introDone = work.catch(() => { if (serial === introSerial) cancelIntro(); });
 return introDone;
}
export async function initMotion() {
 installControls(); installSegments(); observeChecks();
 if(embedded){document.documentElement.classList.remove('motion-pending');installDisclosures();return installWorkspaceMotion();}
 let playIntro = false;
 try {
  const response = await fetch('/api/motion-session/claim',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(1500)});
  if(response.ok) playIntro = (await response.json()).playIntro;
 } catch { /* Fail open: motion must never prevent access to records. */ }
 const url = new URL(location.href), entry = url.searchParams.get('motion-origin');
 let origin;
 if(entry) {
  const [x,y] = entry.split(',').map(Number);
  if(Number.isFinite(x)&&Number.isFinite(y)&&x>=0&&x<=1&&y>=0&&y<=1) origin={x:x*innerWidth,y:y*innerHeight};
  url.searchParams.delete('motion-origin'); history.replaceState(history.state,'',url);
 }
 if(playIntro) await revealPage();
 else if(origin) await revealSurface(document.querySelector('main'),{left:origin.x,top:origin.y,width:60,height:36});
 document.documentElement.classList.remove('motion-pending');
 installDisclosures();

}
function surfaceSnapshot(node) {
 const rect=node.getBoundingClientRect(),style=getComputedStyle(node);
 // Gradients reset background-color to transparent. Keep an opaque base while
 // fading their paint so the expanding surface never dissolves into the page.
 let backgroundColor=style.backgroundColor;
 if(backgroundColor==='rgba(0, 0, 0, 0)'||backgroundColor==='transparent') {
  backgroundColor=style.backgroundImage.match(/rgba?\([^)]*\)/)?.[0]||'rgb(255, 255, 255)';
 }
 return {left:rect.left,top:rect.top,width:rect.width,height:rect.height,
  backgroundColor,backgroundImage:style.backgroundImage,
  borderRadius:style.borderRadius,borderColor:style.borderColor,boxShadow:style.boxShadow,
  padding:style.padding,borderWidth:parseFloat(style.borderLeftWidth)||0,
  color:style.color,font:style.font};
}
function stopSurface(state) {state.followCleanup?.();state.followCleanup=null;state.animations?.forEach(animation=>animation.cancel());state.animations=[];state.glass?.remove();state.glass=null;}
// A closing shell follows the live button while its original spring advances.
// Moving the wrapper uses only a compositor transform; geometry is never restarted.
function followClosingSource(dialog,state,end){
 return followAnchor(dialog,state.source,end,{active:()=>state.closing&&dialog.open,progress:()=>springProgress(Math.min(1,(state.shape?.currentTime||0)/motion.close))});
}
function resolveSource(state) {
 if(state.source&&!state.source.isConnected&&state.source.dataset.recordId) {
  state.source=[...document.querySelectorAll('[data-record-id]')].find(node=>node.dataset.recordId===state.source.dataset.recordId)||state.source;
 }
 if(state.source?.isConnected)state.source.classList.add('motion-source-hidden');
 return state.source?.isConnected?surfaceSnapshot(state.source):state.original;
}
function wrapSurface(dialog,state) {
 if(state.content)return;
 const active=document.activeElement,content=document.createElement('div');
 content.className='motion-dialog-content';
 content.style.width=`${state.target.width-2*state.target.borderWidth}px`;
 content.style.height=`${state.target.height-2*state.target.borderWidth}px`;
 content.style.padding=state.target.padding;
 content.append(...dialog.childNodes);dialog.append(content);state.content=content;
 const label=document.createElement('div');label.className='motion-source-label';label.setAttribute('aria-hidden','true');
 label.style.font=state.original.font;label.style.color=state.original.color;
 if(state.source?.textContent.trim()){
  const replica=document.createElement('div');
  Object.assign(replica.style,{position:'relative',width:`${state.original.width}px`,height:`${state.original.height}px`,flex:'none'});
  // Retain each icon/text slot rather than collapsing the button into one string.
  for(const child of state.source.children){
   const box=child.getBoundingClientRect(),clone=child.cloneNode(true);
   clone.removeAttribute('id');clone.removeAttribute('data-i18n');clone.removeAttribute('data-language-reserved');
   clone.classList.remove('language-inline','language-flex');
   const childStyle=getComputedStyle(child),sourceBox=state.source.getBoundingClientRect();
   clone.removeAttribute('data-layout-key');
   Object.assign(clone.style,{position:'absolute',margin:'0',left:`${box.left-sourceBox.left}px`,top:`${box.top-sourceBox.top}px`,width:`${box.width}px`,height:`${box.height}px`,minWidth:'0',minHeight:'0',display:childStyle.display,font:childStyle.font,lineHeight:childStyle.lineHeight,textAlign:childStyle.textAlign,alignItems:childStyle.alignItems,justifyContent:childStyle.justifyContent,color:childStyle.color});
   replica.append(clone);
  }
  if(!replica.children.length){replica.textContent=state.source.textContent.trim();Object.assign(replica.style,{display:'flex',alignItems:'center',justifyContent:'center'});}
  label.append(replica);
 }
 else if(state.source?.querySelector('svg')){const icon=state.source.querySelector('svg').cloneNode(true);icon.style.width='20px';icon.style.height='20px';label.append(icon);}
 dialog.append(label);state.label=label;
 const paint=document.createElement('div');paint.className='motion-source-paint';paint.setAttribute('aria-hidden','true');
 paint.style.backgroundImage=state.original.backgroundImage;dialog.prepend(paint);state.paint=paint;
 Object.assign(dialog.style,{position:'fixed',margin:'0',inset:'auto',padding:'0',maxWidth:'none',maxHeight:'none',minWidth:'0',minHeight:'0',transform:'none',overflow:'hidden'});
 dialog.classList.add('motion-morphing');
 if(active&&dialog.contains(active))active.focus({preventScroll:true});
}
function unwrapSurface(dialog,state) {
 if(state.content){state.content.replaceWith(...state.content.childNodes);state.content=null;}
 state.label?.remove();state.paint?.remove();state.label=null;state.paint=null;
 dialog.classList.remove('motion-morphing');
 if(state.savedStyle===null)dialog.removeAttribute('style');else dialog.setAttribute('style',state.savedStyle);
}
function expandSurface(dialog,state,start,{reversing=false}={}) {
 const serial=++state.serial;state.closing=false;dialog.dataset.motionState='opening';
 const contentOpacity=state.content?getComputedStyle(state.content).opacity:'0';
 const labelOpacity=state.label?getComputedStyle(state.label).opacity:'1';
 const paintOpacity=state.paint?getComputedStyle(state.paint).opacity:'1';
 stopSurface(state);wrapSurface(dialog,state);
 const duration=reversing?motion.close:motion.surface;
 state.shape=dialog.animate(geometryFrames(start,state.target),{duration,fill:'both'});
 const surfaceGlass=createGlass(dialog,{surface:true,x:state.target.width*.5,y:state.target.height*.38});
 state.glass=surfaceGlass;
 state.animations=[state.shape,...surfaceGlass.play(duration),
  dialog.animate([{backgroundColor:start.backgroundColor,borderRadius:start.borderRadius,borderColor:start.borderColor,boxShadow:start.boxShadow},
   {backgroundColor:state.target.backgroundColor,borderRadius:state.target.borderRadius,borderColor:state.target.borderColor,boxShadow:state.target.boxShadow}],{duration:motion.paint,easing:motion.color,fill:'both'}),
  state.paint.animate([{opacity:reversing?paintOpacity:1},{opacity:0}],{duration:motion.paint,easing:motion.color,fill:'both'}),
  state.label.animate([{opacity:reversing?labelOpacity:1},{opacity:0,offset:.34},{opacity:0}],{duration,fill:'both'}),
  state.content.animate([{opacity:reversing?contentOpacity:0},{opacity:reversing?contentOpacity:0,offset:.48},{opacity:1,offset:.9},{opacity:1}],{duration,easing:'ease-out',fill:'both'})
 ];
 Promise.all(state.animations.map(settled)).then(()=>{
  if(state.serial!==serial||state.closing)return;
  stopSurface(state);unwrapSurface(dialog,state);dialog.dataset.motionState='open';
 });
}
export function openDialog(dialog,source) {
 let state=dialogs.get(dialog);
 if(state?.closing){expandSurface(dialog,state,surfaceSnapshot(dialog),{reversing:true});return;}
 if(dialog.open)return;
 // Each opening measures the authored layout, never a previous animated shell.
 if(!baselineStyles.has(dialog))baselineStyles.set(dialog,dialog.getAttribute('style'));
 if(state){stopSurface(state);unwrapSurface(dialog,state);state.source?.classList.remove('motion-source-hidden');}
 const baseline=baselineStyles.get(dialog);
 if(baseline===null)dialog.removeAttribute('style');else dialog.setAttribute('style',baseline);
 const original=source?.isConnected?surfaceSnapshot(source):null;
 dialog.showModal();
 const target=surfaceSnapshot(dialog);
 state={source,original:original||{...target,top:target.top+18,width:target.width*.96,height:target.height*.96},target,savedStyle:baseline,serial:0,closing:false};
 dialogs.set(dialog,state);
 if(!dialog.dataset.motionCleanup){dialog.dataset.motionCleanup='true';dialog.addEventListener('close',()=>{const current=dialogs.get(dialog);if(!current||dialog.open)return;++current.serial;stopSurface(current);unwrapSurface(dialog,current);current.source?.classList.remove('motion-source-hidden');current.closing=false;dialog.dataset.motionState='closed';});}
 if(reduce.matches){dialog.dataset.motionState='open';return;}
 source?.classList.add('motion-source-hidden');
 expandSurface(dialog,state,state.original);
}
export async function closeDialog(dialog) {
 const state=dialogs.get(dialog);
 if(!dialog.open||state?.closing)return;
 if(!state){dialog.close();return;}
 document.dispatchEvent(new CustomEvent('motion-surface-close',{detail:{dialog}}));
 state.closing=true;const serial=++state.serial;
 const start=surfaceSnapshot(dialog),end=resolveSource(state);
 const contentOpacity=state.content?getComputedStyle(state.content).opacity:'1';
 const labelOpacity=state.label?getComputedStyle(state.label).opacity:'0';
 const paintOpacity=state.paint?getComputedStyle(state.paint).opacity:'0';
 stopSurface(state);dialog.dataset.motionState='closing';
 if(!reduce.matches){
  state.original=end;wrapSurface(dialog,state);state.label.style.color=end.color;state.label.style.font=end.font;
  state.paint.style.backgroundImage=end.backgroundImage;
  const duration=motion.close;
  state.shape=dialog.animate(geometryFrames(start,end),{duration,fill:'both'});
  state.animations=[state.shape,
   dialog.animate([{backgroundColor:start.backgroundColor,borderRadius:start.borderRadius,borderColor:start.borderColor,boxShadow:start.boxShadow}, {backgroundColor:end.backgroundColor,borderRadius:end.borderRadius,borderColor:end.borderColor,boxShadow:end.boxShadow}],{duration,easing:motion.color,fill:'both'}),
   state.content.animate([{opacity:contentOpacity},{opacity:0,offset:.48},{opacity:0}],{duration,fill:'both'}),
   state.label.animate([{opacity:labelOpacity},{opacity:labelOpacity,offset:.55},{opacity:1}],{duration,fill:'both'}),
   state.paint.animate([{opacity:paintOpacity},{opacity:1}],{duration,easing:motion.color,fill:'both'})];
  const stopFollowing=followClosingSource(dialog,state,end);state.followCleanup=stopFollowing;
  try{await Promise.all(state.animations.map(settled));}finally{stopFollowing();if(state.followCleanup===stopFollowing)state.followCleanup=null;}
 }
 if(state.serial!==serial)return;
 // The opaque shell becomes the original button in the same frame; no fade-out gap.
 dialog.close();stopSurface(state);unwrapSurface(dialog,state);
 state.source?.classList.remove('motion-source-hidden');dialog.dataset.motionState='closed';state.closing=false;
 if(state.source?.isConnected)state.source.focus({preventScroll:true});
}
export async function revealSurface(target, source) {
 if(!target||reduce.matches)return;
 target.getAnimations().forEach(animation=>animation.cancel());
 const animation=target.animate(springFrames(sourceGeometry(target,source),1),{duration:640,fill:'both'});
 await settled(animation);animation.cancel();
}
export function animateTrend(chart) {
 chart.dataset.motion='ready';
 const counter=chart.closest('.trend')?.querySelector('[data-trend-count]');
 if(counter){
  counter.getAnimations({subtree:true}).forEach(animation=>animation.cancel());
  const number=counter.querySelector('.trend-number');number.replaceChildren();
  for(const digit of counter.dataset.trendCount){
   const cell=document.createElement('span'),roll=document.createElement('span');cell.className='trend-digit';roll.className='trend-roll';
   const steps=10+Number(digit);for(let i=0;i<=steps;i++){const row=document.createElement('span');row.textContent=String(i%10);roll.append(row);}cell.append(roll);number.append(cell);
   roll.style.transform=`translateY(-${steps}em)`;
   if(!reduce.matches)roll.animate([{transform:'translateY(0)'},{transform:`translateY(-${steps}em)`}],{duration:1050,easing:ease});
  }
 }
 const line=chart.querySelector('.trend-line');if(!line||reduce.matches)return;
 const length=line.getTotalLength();
 line.animate([{strokeDasharray:`${length} ${length}`,strokeDashoffset:length,opacity:0},{strokeDasharray:`${length} ${length}`,strokeDashoffset:0,opacity:1}],{duration:1050,easing:ease});
 chart.querySelector('.trend-area')?.animate([{opacity:0},{opacity:1}],{duration:1000,delay:180,fill:'backwards',easing:ease});
 chart.querySelectorAll('.trend-point').forEach((point,i)=>point.animate([{opacity:0},{opacity:1}],{duration:300,delay:250+i*25,fill:'backwards'}));
}
export function wirePageLink(link, {canLeave=()=>true} = {}) {
 if(embedded)workspaceCanLeave=canLeave;
 link.removeAttribute('target'); link.removeAttribute('rel');
 const arrow=link.querySelector('[aria-hidden="true"]');if(arrow)arrow.textContent=link.id==='dashboard-link'?'←':'→';
 link.addEventListener('click',async event=>{
  if(event.button||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
  if(embedded){event.preventDefault();if(!canLeave())return;const box=link.getBoundingClientRect();window.parent.postMessage({type:'workspace-navigate',view:link.id==='dashboard-link'?'dashboard':'editor',origin:{x:(box.left+box.width/2)/innerWidth,y:(box.top+box.height/2)/innerHeight},language:document.documentElement.lang.split('-')[0]},'*');return;}
  if(!canLeave()){event.preventDefault();return;}
  if(reduce.matches)return;
  event.preventDefault();
  const box=link.getBoundingClientRect(),url=new URL(link.href);
  url.searchParams.set('motion-origin',`${((box.left+box.width/2)/innerWidth).toFixed(4)},${((box.top+box.height/2)/innerHeight).toFixed(4)}`);
  const main=document.querySelector('main'),end=sourceGeometry(main,box);
  const animation=main.animate([{opacity:1,transform:'none'},{opacity:0,transform:`translate(${end.x}px,${end.y}px) scale(${end.sx},${end.sy})`}],{duration:motion.routeOut,easing:ease});
  await settled(animation);location.assign(url);
 });
}
function installDisclosures() {
 document.querySelectorAll('details').forEach(details=>{
  const summary=details.querySelector('summary');if(!summary)return;
  summary.addEventListener('click',async event=>{
   if(reduce.matches)return;
   event.preventDefault();
   const content=[...details.children].filter(node=>node!==summary);
   if(details.open) {
    await Promise.all(content.map(node=>settled(node.animate([{opacity:1,transform:'scaleY(1)'},{opacity:0,transform:'scaleY(.9)'}],{duration:180,easing:ease}))));details.open=false;
   } else {details.open=true;content.forEach(node=>node.animate([{opacity:0,transform:'translateY(-8px) scale(.96)'},{opacity:1,transform:'none'}],{duration:430,easing:'cubic-bezier(.22,1.3,.36,1)'}));}
  });
 });
}
reduce.addEventListener('change',()=>{if(reduce.matches) {++introSerial;cancelIntro();for(const animation of document.getAnimations())try{animation.finish();}catch{animation.cancel();}}});

export function bindDialogDismiss(dialog,{canDismiss=()=>true,onDismiss=()=>closeDialog(dialog)}={}) {
 let beganOutside=false;
 const outside=event=>{const r=dialog.getBoundingClientRect();return event.target===dialog&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom);};
 dialog.addEventListener('pointerdown',event=>{beganOutside=outside(event);});
 dialog.addEventListener('click',event=>{if(beganOutside&&outside(event)&&canDismiss()&&!document.querySelector(':popover-open'))onDismiss();beganOutside=false;});
}

export function createGlass(parent,{surface=false,x,y}={}) {
 const veil=document.createElement('div'),glow=document.createElement('div');
 veil.className='motion-veil'+(surface?' motion-surface-veil':'');
 glow.className='motion-glow'+(surface?' motion-surface-glow':'');
 for(const node of [veil,glow]){node.setAttribute('aria-hidden','true');node.style.setProperty('--reveal-x',`${x}px`);node.style.setProperty('--reveal-y',`${y}px`);parent.append(node);}
 return {nodes:[veil,glow],remove:()=>{veil.remove();glow.remove();},play(duration){
  const width=surface?parent.getBoundingClientRect().width:innerWidth,height=surface?parent.getBoundingClientRect().height:innerHeight;
  // A morph starts at a small button, but its reveal covers the eventual surface.
  const radius=Math.hypot(Math.max(x,width-x),Math.max(y,height-y))+310;
  return [veil,glow].map(node=>node.animate([
   {'--reveal-radius':'0px',opacity:surface?.62:1,...(node===veil?{backdropFilter:'blur(42px) saturate(1.35) brightness(1.055)'}:{})},
   {'--reveal-radius':`${radius*.22}px`,opacity:surface?.55:.96,offset:.3,...(node===veil?{backdropFilter:'blur(28px) saturate(1.25) brightness(1.04)'}:{})},
   {'--reveal-radius':`${radius}px`,opacity:0,...(node===veil?{backdropFilter:'blur(0px) saturate(1) brightness(1)'}:{})}
  ],{duration,easing:motion.color,fill:'both'}));
 }};
}
export function notifyPageReady(){
 if(embedded)window.parent.postMessage({type:'workspace-ready',language:document.documentElement.lang.split('-')[0],title:document.title},'*');
}
let workspaceMotionInstalled=false;
function installWorkspaceMotion(){
 if(workspaceMotionInstalled)return introDone;workspaceMotionInstalled=true;
 let visible;introDone=new Promise(resolve=>{visible=resolve;});
 let animation=null,surfaceAnimation=null,cardSurface=null,prepared=null,sequence=0,cardGeometry=null,headerAnimation=null,headerSerial=0,ownTitle=null;
 const main=document.querySelector('main');
 const send=(type,data,extra={})=>window.parent.postMessage({type,requestId:data.requestId,...extra},'*');
 const cleanupGenie=()=>{for(const key of ['transform-origin','clip-path','will-change'])main.style.removeProperty(key);};
 const prepareGenie=()=>{
  const box=main.getBoundingClientRect(),header=document.querySelector('.topbar').getBoundingClientRect();
  const crop=Math.max(0,header.bottom-box.top),height=Math.max(1,Math.min(innerHeight-header.bottom,box.height-crop));
  // Each page belongs to its own tab: the outgoing page enters its current
  // tab, and the incoming page emerges from its own current tab.
  const target=document.querySelector('.workspace-tab[aria-current="page"]').getBoundingClientRect();
  main.style.transformOrigin='0 0';main.style.willChange='transform,opacity';
  main.style.clipPath=`inset(${crop}px 0 ${Math.max(0,box.height-crop-height)}px 0 round 18px)`;
  return {width:box.width,height,crop,target:{left:target.left-box.left,top:target.top-box.top,width:target.width,height:target.height}};
 };
 const prepareCard=data=>{
  cleanupGenie();main.style.removeProperty('transform');
  const box=main.getBoundingClientRect(),header=document.querySelector('.topbar').getBoundingClientRect();
  const {left,top,width,height,crop,bottom}=cardViewport(box,header.bottom,innerHeight);
  main.style.transformOrigin=`50% ${crop+height/2}px`;main.style.willChange='transform';
  surfaceAnimation?.cancel();cardSurface?.remove();
  // A long page's own shadow is clipped away. Paint the same card surface
  // behind its visible slice, without moving or duplicating page content.
  cardSurface=document.createElement('div');cardSurface.className='workspace-card-surface';cardSurface.setAttribute('aria-hidden','true');
  Object.assign(cardSurface.style,{left:`${left}px`,top:`${top}px`,width:`${width}px`,height:`${height}px`});
  main.before(cardSurface);
  document.documentElement.classList.add('workspace-content-card');
  return cardGeometry={width:innerWidth,direction:data.view==='editor'?1:-1,crop,bottom};
 };
 const framesFor=phase=>cardFrames(phase,cardGeometry).map(({borderRadius,...frame})=>({...frame,clipPath:`inset(${cardGeometry.crop}px 0 ${cardGeometry.bottom}px 0 round ${borderRadius})`}));
 const animateCard=(phase,duration)=>{
  const previous=animation,previousSurface=surfaceAnimation,options={duration,easing:'linear',fill:'both'};
  animation=main.animate(framesFor(phase),options);surfaceAnimation=cardSurface.animate(cardFrames(phase,cardGeometry),options);
  if(animation.startTime!==null)surfaceAnimation.startTime=animation.startTime;previous?.cancel();previousSurface?.cancel();
 };
 const playCard=async(phase,duration)=>{animateCard(phase,duration);await settled(animation);};
 const header=data=>{
  const context=document.querySelector('.brand-context'),group=document.querySelector('.workspace-links');
  if(ownTitle===null)ownTitle=context.textContent;
  moveWorkspaceSegment(group,data.view,data.animate!==false);
  const token=++headerSerial;context.getAnimations().forEach(item=>item.cancel());
  if(data.animate===false||reduce.matches){context.textContent=data.title;return;}
  const direction=data.view==='editor'?1:-1;
  headerAnimation=context.animate([{opacity:1,transform:'translateX(0)'},{opacity:0,transform:`translateX(${-direction*14}px)`}],{duration:180,easing:ease,fill:'both'});
  settled(headerAnimation).then(()=>{if(token!==headerSerial)return;context.textContent=data.title;headerAnimation.cancel();headerAnimation=context.animate([{opacity:0,transform:`translateX(${direction*14}px)`},{opacity:1,transform:'translateX(0)'}],{duration:310,easing:ease});});
 };
 const resetCard=()=>{surfaceAnimation?.cancel();surfaceAnimation=null;cardSurface?.remove();cardSurface=null;document.documentElement.classList.remove('workspace-content-card');main.style.removeProperty('transform');};
 const source=data=>({left:(data.origin?.x??.5)*innerWidth,top:(data.origin?.y??.04)*innerHeight,width:80,height:36});
 window.addEventListener('message',async event=>{
  if(event.source!==window.parent||!/^http:\/\/(127\.0\.0\.1|localhost):876[56]$/.test(event.origin))return;
  const data=event.data||{};
  if(data.type==='workspace-header'){header(data);return;}
  if(data.type==='workspace-visible'){++headerSerial;headerAnimation?.cancel();if(ownTitle!==null){document.querySelector('.brand-context').textContent=ownTitle;ownTitle=null;}moveWorkspaceSegment(document.querySelector('.workspace-links'),document.querySelector('#dashboard-link')?'editor':'dashboard',false);resetCard();++sequence;animation?.cancel();animation=null;prepared=null;cleanupGenie();main.classList.remove('motion-route-prepared');visible();return;}
  if(data.type==='workspace-prepare'){
   ++sequence;animation?.cancel();prepared=data;
   if(data.contentCardTransition){prepareCard(data);if(!reduce.matches){animateCard('in',motion.popover);animation.pause();animation.currentTime=0;surfaceAnimation.pause();surfaceAnimation.currentTime=0;}send('workspace-prepared',data,{headerHeight:Math.max(0,document.querySelector('.topbar').getBoundingClientRect().bottom),title:document.querySelector('.brand-context').textContent});return;}
   if(data.genieTransition){const geometry=prepareGenie(data);if(!reduce.matches){animation=main.animate(genieFrames(geometry,true),{duration:motion.routeIn,easing:'linear',fill:'both'});animation.pause();animation.currentTime=0;}send('workspace-prepared',data,{headerHeight:document.querySelector('.topbar').getBoundingClientRect().bottom});return;}
   if(data.cardTransition){animation=null;main.classList.remove('motion-route-prepared');send('workspace-prepared',data);return;}
   const geometry=sourceGeometry(main,source(data));
   animation=main.animate(routeFrames(geometry),{duration:motion.routeIn,fill:'both'});
   animation.pause();animation.currentTime=0;
   main.classList.add('motion-route-prepared');send('workspace-prepared',data);
  }else if(data.type==='workspace-depart'){
   if(!workspaceCanLeave()){send('workspace-departed',data,{blocked:true});return;}
   const token=++sequence;animation?.cancel();main.classList.remove('motion-route-prepared');
   const geometry=sourceGeometry(main,source(data));
   if(data.contentCardTransition){prepareCard(data);if(!reduce.matches)await playCard('shrink',motion.routeOut);if(token===sequence)send('workspace-departed',data,{title:document.querySelector('.brand-context').textContent});return;}
   if(data.genieTransition&&!reduce.matches){animation=main.animate(genieFrames(prepareGenie(data)),{duration:motion.routeOut,easing:'linear',fill:'both'});await settled(animation);}
   if(!reduce.matches&&!data.cardTransition&&!data.genieTransition){animation=main.animate([{opacity:1,transform:'none'},{opacity:.1,transform:`translate(${geometry.x}px,${geometry.y}px) scale(${geometry.sx},${geometry.sy})`}],{duration:motion.routeOut,easing:'cubic-bezier(.42,0,.58,1)',fill:'both'});await settled(animation);}
   if(token===sequence)send('workspace-departed',data);
  }else if(data.type==='workspace-card-out'){const token=++sequence;if(!reduce.matches)await playCard('out',motion.popover);if(token===sequence)send('workspace-card-out-done',data);
  }else if(data.type==='workspace-enter'){
   const token=++sequence;main.classList.remove('motion-route-prepared');
   if(data.contentCardTransition){if(!reduce.matches){animation.play();surfaceAnimation.play();if(animation.startTime!==null)surfaceAnimation.startTime=animation.startTime;await settled(animation);await playCard('expand',motion.routeIn);}if(token===sequence){animation?.cancel();animation=null;prepared=null;cleanupGenie();resetCard();send('workspace-entered',data);visible();}return;}
   if(data.genieTransition&&!reduce.matches){if(!animation){animation=main.animate(genieFrames(prepareGenie(data),true),{duration:motion.routeIn,easing:'linear',fill:'both'});}else animation.play();await settled(animation);}
   if(!reduce.matches&&!data.cardTransition&&!data.genieTransition){
    if(!animation||prepared?.requestId!==data.requestId){animation?.cancel();animation=main.animate(routeFrames(sourceGeometry(main,source(data))),{duration:motion.routeIn,fill:'both'});}
    else animation.play();
    // The host supplies glass blur once. Blurring the entire document again
    // would rasterize the canvas/table twice on every animation frame.
    await settled(animation);
   }
   if(token===sequence){animation?.cancel();animation=null;prepared=null;cleanupGenie();send('workspace-entered',data);visible();}
  }
 });
 return introDone;
}
