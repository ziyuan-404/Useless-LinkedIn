import {springProgress,motion} from './motion-tokens.js';

// One segmented-control implementation for both workspace headers.
const installed = new WeakSet();
const workspaceSegments=new WeakMap();
export function moveWorkspaceSegment(group,view,animate=true){workspaceSegments.get(group)?.(view,animate);}
export function installSegments(root=document) {
 const navigation=[...root.querySelectorAll('.workspace-links')];
 for(const group of [...root.querySelectorAll('.language-switch'),...navigation]) {
  const workspace=navigation.includes(group);
  if(installed.has(group))continue;
  installed.add(group);
  const thumb=document.createElement('span');
  thumb.className='segment-thumb';thumb.setAttribute('aria-hidden','true');
  group.prepend(thumb);group.classList.add('ui-segment');
  if(workspace)group.classList.add('ui-workspace-segment');
  let animation=null,target=null,requested=null;
  const move=(button,animate=true)=>{
   if(!button)return;
   const groupBox=group.getBoundingClientRect(),box=button.getBoundingClientRect();
   const x=box.left-groupBox.left-group.clientLeft,width=box.width;
   const previous=target;target={button,x,width};
   thumb.style.top=`${box.top-groupBox.top-group.clientTop}px`;
   thumb.style.height=`${box.height}px`;
   if(previous?.button===button&&previous.x===x&&previous.width===width)return;
   const style=getComputedStyle(thumb),fromWidth=parseFloat(style.width)||width;
   const fromX=new DOMMatrixReadOnly(style.transform==='none'?undefined:style.transform).m41;
   animation?.cancel();
   thumb.style.transform=`translateX(${x}px)`;thumb.style.width=`${width}px`;
   if(!animate||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
   const frames=Array.from({length:49},(_,index)=>{
    const t=index/48,progress=.85*springProgress(t)+.15*(t===1?1:1-Math.exp(-9*t)*(Math.cos(9*t)+.85*Math.sin(9*t))),distance=x-fromX;
    const stretch=Math.min(width*.68,Math.abs(distance)*.8)*(t*(1-t)**3/(.25*.75**3));
    return {offset:t,transform:`translateX(${fromX+distance*progress+(distance>0?-stretch:0)}px)`,width:`${fromWidth+(width-fromWidth)*progress+stretch}px`};
   });
   animation=thumb.animate(frames,{duration:motion.segment,easing:'linear'});
   const running=animation;
   running.finished.then(()=>{if(animation===running)animation=null;},()=>{});
  };
  const tabs=workspace?[...group.querySelectorAll('.workspace-tab')]:[];
  const selected=()=>workspace?(group.dataset.activeView?tabs[group.dataset.activeView==='editor'?1:0]:group.querySelector('[aria-current="page"]')):group.querySelector('button[aria-pressed="true"]')||group.querySelector('button');
  if(workspace)workspaceSegments.set(group,(view,animate)=>{group.dataset.activeView=view;move(selected(),animate);});
  move(selected(),false);
  group.addEventListener('click',event=>{
   const button=workspace?null:event.target.closest('button');
   if(button&&!button.disabled&&group.contains(button)) {
    // Text fades before aria-pressed changes. Keep the clicked destination
    // during that interval so a layout observer cannot snap back to the old one.
    requested=button;move(button);
   }
  },true);
  new MutationObserver(()=>{
   const button=selected();
   if(requested&&button!==requested)return;
   requested=null;move(button);
  }).observe(group,{subtree:true,attributes:true,attributeFilter:workspace?['aria-current']:['aria-pressed']});
  const resize=new ResizeObserver(()=>move(requested||selected(),animation?.playState==='running'));
  resize.observe(group);
  for(const button of workspace?tabs:group.querySelectorAll('button'))resize.observe(button);
 }
 decorateChecks(root);
}

export function decorateChecks(root=document) {
 for(const input of root.querySelectorAll('input[type="checkbox"]:not(.ui-check-input)')) {
  input.classList.add('ui-check-input');
  const frame=document.createElement('span');frame.className='ui-check';
  input.before(frame);frame.append(input);
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 20 20');svg.setAttribute('aria-hidden','true');svg.classList.add('ui-check-mark');
  const path=document.createElementNS('http://www.w3.org/2000/svg','path');
  path.setAttribute('d','m4.8 10 3.4 3.4 7-7');path.setAttribute('pathLength','1');
  svg.append(path);frame.append(svg);
 }
}

// Dynamic record fields receive the same checkbox component automatically.
let checksObserved=false;
export function observeChecks() {
 if(checksObserved)return;checksObserved=true;
 decorateChecks();
 new MutationObserver(records=>{
  for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1)decorateChecks(node);
 }).observe(document.body,{childList:true,subtree:true});
}
