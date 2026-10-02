import {createGlass} from './motion.js';
// Reserve the space actually needed by every supported translation. The same
// labels therefore wrap identically without freezing the responsive page grid.
const selector = '[data-i18n],[data-layout-key],[data-field-key],.ui-control-value';
const controllers = new Set();
let transition = 0;
const frame = () => new Promise(resolve => requestAnimationFrame(resolve));

export function installLanguageLayout({variants, root=document} = {}) {
 const originals = new WeakMap();
 const widths = new Map(), heights = new Map();
 const probe = document.createElement('span');
 probe.className = 'language-measure'; probe.setAttribute('aria-hidden','true');
 document.body.append(probe);
 let scheduled = false, scheduledFrame=null,observer, reserving = false, viewportWidth = innerWidth;
 function reserve(scope=root) {
  if(reserving) return;
  if(scheduledFrame!=null){cancelAnimationFrame(scheduledFrame);scheduledFrame=null;scheduled=false;}
  reserving = true;
  const nodes = [...scope.querySelectorAll(selector)].filter(node =>
   !node.matches('option,title') && !node.closest('svg') && node.getClientRects().length);
  // Widths first: height measurement must use the final available text width.
  for(const node of nodes) {
   const texts = variants?.(node)?.map(String).filter(Boolean);
   if(!texts?.length) continue;
   let original = originals.get(node);
   if(!original) {
    const style = getComputedStyle(node);
    const flexLabel=node.children.length===0 && ['flex','inline-flex'].includes(getComputedStyle(node.parentElement).display);
    original = {inline:style.display==='inline' || (style.display==='inline-flex' && !node.querySelector('svg')) || node.tagName==='BUTTON' || flexLabel || node.matches('.library-fields > label,.ui-control-value'), flex:['flex','inline-flex'].includes(style.display), button:node.tagName==='BUTTON',minHeight:parseFloat(style.minHeight)||0};
    originals.set(node,original);
   }
   node.dataset.languageReserved = '';
   let style = getComputedStyle(node);
   // "normal" depends on the glyphs selected by font fallback. An explicit
   // common line box prevents CJK glyphs increasing a translated control.
   if(style.lineHeight==='normal') {
    node.style.lineHeight=`${parseFloat(style.fontSize)*1.45}px`;
    style=getComputedStyle(node);
   }
   const widthStyle={fontFamily:style.fontFamily,fontSize:style.fontSize,fontWeight:style.fontWeight,fontStyle:style.fontStyle,lineHeight:style.lineHeight,letterSpacing:style.letterSpacing,textTransform:style.textTransform,whiteSpace:'nowrap',width:'max-content',overflowWrap:'normal',wordBreak:'normal'};
   const widthKey=JSON.stringify([widthStyle,texts]);
   let width=widths.get(widthKey);
   if(width===undefined) {
    Object.assign(probe.style,widthStyle);
    width=0;for(const text of texts) { probe.textContent=text; width=Math.max(width,probe.getBoundingClientRect().width); }
    if(widths.size>1000)widths.clear();widths.set(widthKey,width);
   }
   if(original.inline && !node.matches('.badge,.receipt-note')) {
    node.classList.add('language-inline');
    if(original.flex)node.classList.add('language-flex');
    const extras = parseFloat(style.paddingLeft)+parseFloat(style.paddingRight)+parseFloat(style.borderLeftWidth)+parseFloat(style.borderRightWidth);
    node.style.setProperty('--language-width',`${Math.ceil(width+extras)}px`);
   }
  }
  for(const value of nodes.filter(node=>node.matches('.ui-control-value'))) {
   const button=value.parentElement, style=getComputedStyle(button);
   const textWidth=parseFloat(value.style.getPropertyValue('--language-width'));
   const icon=button.querySelector('.ui-control-icon');
   const width=Math.ceil(textWidth+(icon?.clientWidth||0)+parseFloat(style.columnGap||'0')+parseFloat(style.paddingLeft)+parseFloat(style.paddingRight)+parseFloat(style.borderLeftWidth)+parseFloat(style.borderRightWidth));
   const field=button.closest('.filter-control');
   if(field&&Number.isFinite(width)) {
    const caption=field.querySelector('[data-i18n]');
    field.style.setProperty('--language-control-width',`${Math.max(width,parseFloat(caption?.style.getPropertyValue('--language-width'))||0)}px`);
   }
  }
  for(const controls of scope.querySelectorAll('.controls:has(.ui-control)')) {
   const children=[...controls.children].filter(child=>!child.hidden);
   const gap=parseFloat(getComputedStyle(controls).columnGap)||0;
   const width=children.reduce((sum,child)=>sum+child.offsetWidth,0)+Math.max(0,children.length-1)*gap;
   controls.style.setProperty('--language-controls-width',`${Math.ceil(width)}px`);
  }
  for(const node of nodes) {
   const texts = variants?.(node)?.map(String).filter(Boolean);
   if(!texts?.length) continue;
   const style = getComputedStyle(node);
   const horizontal = parseFloat(style.paddingLeft)+parseFloat(style.paddingRight)+parseFloat(style.borderLeftWidth)+parseFloat(style.borderRightWidth);
   const vertical = parseFloat(style.paddingTop)+parseFloat(style.paddingBottom)+parseFloat(style.borderTopWidth)+parseFloat(style.borderBottomWidth);
   // A route transition scales main almost to zero. Its painted rectangle is
   // not its layout width: measuring that would freeze hundreds of wrapped lines.
   const width = Math.max(1,node.offsetWidth-horizontal);
   const heightStyle={fontFamily:style.fontFamily,fontSize:style.fontSize,fontWeight:style.fontWeight,fontStyle:style.fontStyle,lineHeight:style.lineHeight,letterSpacing:style.letterSpacing,textTransform:style.textTransform,whiteSpace:style.whiteSpace,width:`${width}px`,overflowWrap:style.overflowWrap,wordBreak:style.wordBreak};
   const heightKey=JSON.stringify([heightStyle,texts]);
   let height=heights.get(heightKey);
   if(height===undefined) {
    Object.assign(probe.style,heightStyle);
    height=0;for(const text of texts) {probe.textContent=text; height=Math.max(height,probe.getBoundingClientRect().height);}
    if(heights.size>1000)heights.clear();heights.set(heightKey,height);
   }
   node.style.setProperty('--language-height',`${Math.max(originals.get(node).minHeight,Math.ceil(height+vertical))}px`);
  }
  probe.textContent=''; reserving=false;
  if(scope===root)observer?.takeRecords?.();
 }
 function schedule() {
  if(scheduled) return;
  scheduled=true; scheduledFrame=requestAnimationFrame(()=>{scheduled=false;scheduledFrame=null;reserve();});
 }
 const decoration=node=>node===probe||probe.contains(node)||!!node.closest?.('.ui-selection-glow,.motion-veil,.motion-glow,.motion-source-label,.motion-source-paint,.save-particle-burst');
 observer=new MutationObserver(records=>{
  if(records.some(record=>!decoration(record.target)&&!(record.type==='childList'&&[...record.addedNodes,...record.removedNodes].length&&[...record.addedNodes,...record.removedNodes].every(decoration)))) schedule();
 });
 observer.observe(root===document?document.body:root,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['open','hidden']});
 window.addEventListener('resize',()=>{if(innerWidth!==viewportWidth){viewportWidth=innerWidth;schedule();}});
 document.fonts?.ready.then(schedule);
 const controller={reserve,schedule}; controllers.add(controller); reserve();
 return controller;
}

let desiredLanguage='',intentSequence=0,pendingIntent=0,receivedRevision=-1;
let languageGlass=null,languageAnimations=[];
const embedded=window.parent!==window&&new URL(location.href).searchParams.get('motion-embedded')==='1';
function stopLanguageGlass(){languageAnimations.forEach(animation=>animation.cancel());languageAnimations=[];languageGlass?.remove();languageGlass=null;}
// Labels change under the shared glass. Geometry and the segment stay in place.
// A host update is an acknowledgement, never a fresh user intent.
export async function changeLabels(update,{language,remote=false,revision,intentId,animate=true}={}) {
 if(remote&&embedded){
  if(Number.isFinite(revision)&&revision<receivedRevision)return false;
  if(pendingIntent&&intentId!==pendingIntent)return false;
  if(Number.isFinite(revision))receivedRevision=revision;
  if(intentId===pendingIntent)pendingIntent=0;
  if(language&&language===desiredLanguage)return true;
 }
 const serial=++transition,reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 desiredLanguage=language||desiredLanguage;
 let origin;
 const button=language&&document.querySelector(`.language-switch button[data-language="${language}"],.language-switch button[data-lang="${language}"]`);
 if(button){const rect=button.getBoundingClientRect();origin={x:(rect.left+rect.width/2)/innerWidth,y:(rect.top+rect.height/2)/innerHeight};}
 if(!remote&&embedded){pendingIntent=++intentSequence;window.parent.postMessage({type:'workspace-language-intent',language,intentId:pendingIntent,origin},'*');}
 if(!embedded&&!reduced&&animate){
  stopLanguageGlass();const glass=createGlass(document.body,{x:(origin?.x??.78)*innerWidth,y:(origin?.y??.04)*innerHeight});languageGlass=glass;languageAnimations=glass.play(2500);
  Promise.all(languageAnimations.map(animation=>animation.finished.catch(()=>{}))).then(()=>{if(languageGlass===glass)stopLanguageGlass();});
 }
 document.documentElement.classList.toggle('language-changing',!reduced&&animate);
 if(!reduced&&animate)await new Promise(resolve=>setTimeout(resolve,90));
 if(serial!==transition)return false;
 await update();
 if(serial!==transition)return false;
 for(const controller of controllers)controller.reserve();
 await frame();
 if(serial===transition)document.documentElement.classList.remove('language-changing');
 return true;
}
