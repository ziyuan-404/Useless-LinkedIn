import { geometryFrames, motion, springProgress } from './motion-tokens.js';
import {followAnchor} from './anchor-motion.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
// Called only after the save response succeeds. The layer never intercepts input.
export function celebrateSave(button,origin={x:.5,y:.5}) {
 if(reduced.matches||!button?.isConnected)return;
 const box=button.getBoundingClientRect(),layer=document.createElement('div');
 layer.className='save-particle-burst';layer.setAttribute('aria-hidden','true');
 layer.style.left=`${box.left+box.width*origin.x}px`;layer.style.top=`${box.top+box.height*origin.y}px`;
 document.body.append(layer);
 // A native dialog sits above z-index layers. Put success particles in the
 // same browser top layer so both save buttons receive visible feedback.
 if(button.closest('dialog[open]')&&layer.showPopover){layer.popover='manual';layer.showPopover();}
 const animations=[];
 for(let i=0;i<18;i++){
  const dot=document.createElement('i'),angle=2*Math.PI*i/18,distance=56+(i%4)*14,duration=760+(i%3)*45;
  layer.append(dot);
  animations.push(dot.animate([{transform:'translate(-50%,-50%) scale(.8)'},{transform:`translate(calc(-50% + ${Math.cos(angle)*distance}px),calc(-50% + ${Math.sin(angle)*distance+10}px)) scale(.4)`}],{duration,easing:'cubic-bezier(.16,1,.3,1)'}));
  animations.push(dot.animate([{opacity:0},{opacity:1,offset:.08},{opacity:.9,offset:.58},{opacity:0}],{duration,easing:'linear'}));
 }
 void Promise.all(animations.map(animation=>animation.finished.catch(()=>{}))).finally(()=>layer.remove());
}
const adapted = new WeakMap();
const states = new Set();
let current, installed = false, nextId = 0;
const icons = {
 chevron: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 7.5 5 5 5-5"/></svg>',
 check: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4.5 10 3.5 3.5 7.5-7.5"/></svg>',
 calendar: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3.5" y="5" width="13" height="12" rx="2"/><path d="M6.5 3v4m7-4v4M4 9h12"/></svg>'
};
const copy = {
 zh: {selected:'当前选择', empty:'请选择', date:'选择日期', today:'今天', clear:'清除', previous:'上个月', next:'下个月'},
 en: {selected:'Selected', empty:'Choose an option', date:'Choose a date', today:'Today', clear:'Clear', previous:'Previous month', next:'Next month'},
 fr: {selected:'Sélection actuelle', empty:'Choisir une option', date:'Choisir une date', today:"Aujourd’hui", clear:'Effacer', previous:'Mois précédent', next:'Mois suivant'}
};
const language = () => document.documentElement.lang.split('-')[0] in copy ? document.documentElement.lang.split('-')[0] : 'fr';
const words = () => copy[language()];
const locale = () => ({zh:'zh-CN',en:'en-GB',fr:'fr-FR'})[language()];
const node = (tag, className, text) => { const el = document.createElement(tag); if(className) el.className=className; if(text!=null) el.textContent=text; return el; };
const iso = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const parse = value => /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(+value.slice(0,4),+value.slice(5,7)-1,+value.slice(8,10)) : null;
const dateText = value => value ? new Intl.DateTimeFormat(locale(),{year:'numeric',month:'2-digit',day:'2-digit'}).format(parse(value)) : words().date;
const selectedText = state => state.color ? state.native.value.toUpperCase() : state.date ? dateText(state.native.value) : state.native.selectedOptions[0]?.textContent || words().empty;
const rect = el => { const r=el.getBoundingClientRect(); return {left:r.left,top:r.top,width:r.width,height:r.height}; };
const layoutAnimations = new WeakMap();
// FLIP only the displaced surfaces: the flex/grid layout remains responsive,
// and a second choice continues from the currently rendered position.
export function animateLayoutChange(elements,update) {
 const nodes=[...new Set(elements)].filter(element=>element?.isConnected);
 const before=new Map(nodes.map(element=>[element,rect(element)]));
 for(const element of nodes) { layoutAnimations.get(element)?.cancel();layoutAnimations.delete(element); }
 update();
 if(reduced.matches) return;
 const moves=nodes.map(element=>({element,start:before.get(element),end:rect(element)}));
 for(const {element,start,end} of moves) {
  const x=start.left-end.left,y=start.top-end.top;
  if(Math.abs(x)<.5 && Math.abs(y)<.5)continue;
  const animation=element.animate([{transform:`translate(${x}px,${y}px)`},{transform:'translate(0px,0px)'}],{duration:motion.popover,easing:motion.ease});
  layoutAnimations.set(element,animation);
  animation.finished.catch(()=>{}).then(()=>{if(layoutAnimations.get(element)===animation)layoutAnimations.delete(element);});
 }
}
export function showSelectionGlow(element,event) {
 if(reduced.matches || !element)return;
 const box=element.getBoundingClientRect(),pointer=event?.detail>0;
 const x=pointer?Math.max(0,Math.min(box.width,event.clientX-box.left)):box.width/2;
 const y=pointer?Math.max(0,Math.min(box.height,event.clientY-box.top)):box.height/2;
 const diameter=Math.hypot(Math.max(x,box.width-x),Math.max(y,box.height-y))*2;
 element.querySelector('.ui-selection-glow')?.remove();
 const glow=node('span','ui-selection-glow');glow.setAttribute('aria-hidden','true');
 Object.assign(glow.style,{width:`${diameter}px`,height:`${diameter}px`,left:`${x}px`,top:`${y}px`});element.append(glow);
 const animation=glow.animate([{transform:'translate(-50%,-50%) scale(.02)',opacity:.95},{transform:'translate(-50%,-50%) scale(1)',opacity:.55,offset:.65},{transform:'translate(-50%,-50%) scale(1.06)',opacity:0}],{duration:motion.popover+160,easing:motion.ease});
 animation.finished.catch(()=>{}).then(()=>glow.remove());
}
function cancelAnimations(state) {state.followCleanup?.();state.followCleanup=null;state.animations?.forEach(animation=>animation.cancel()); state.animations=[]; }
function refresh(state) {
 if(!state.native.isConnected) { if(current===state) close(state,false); states.delete(state); return; }
 state.label.textContent=selectedText(state);
 if(state.color)state.button.style.setProperty('--control-color',state.native.value);
 state.cachedValue=state.native.value;
 state.button.disabled=state.native.disabled;
 state.button.setAttribute('aria-required',String(state.native.required));
 if(state.date) state.popup.setAttribute('aria-label',words().date);
 const labelled=state.native.getAttribute('aria-labelledby');
 if(labelled) state.button.setAttribute('aria-labelledby',labelled);
 else {
  const label=state.native.labels?.[0];
  if(label && !label.id) label.id=`ui-control-label-${++nextId}`;
  if(label) state.button.setAttribute('aria-labelledby',label.id);
  else state.button.setAttribute('aria-label',state.native.getAttribute('aria-label') || (state.date ? words().date : words().empty));
 }
 if(current===state && !state.closing) {if(state.color)syncColor(state);else render(state);}
}
export function refreshControls(root=document){for(const state of states)if(root.contains(state.native))refresh(state);}
const colorWords={zh:['色相','饱和度','亮度','十六进制颜色'],en:['Hue','Saturation','Brightness','Hex color'],fr:['Teinte','Saturation','Luminosité','Couleur hexadécimale']};
function rgbToHsv(hex){const [r,g,b]=hex.match(/\w\w/g).map(x=>parseInt(x,16)/255),v=Math.max(r,g,b),min=Math.min(r,g,b),d=v-min;let h=0;if(d)h=v===r?((g-b)/d+6)%6:v===g?(b-r)/d+2:(r-g)/d+4;return[h*60,v?d/v:0,v];}
function hsvToHex([h,s,v]){const c=v*s,x=c*(1-Math.abs(h/60%2-1)),m=v-c;const rgb=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];return '#'+rgb.map(n=>Math.round((n+m)*255).toString(16).padStart(2,'0')).join('');}
function syncColor(state){
 if(!state.colorInputs)return;
 // Hue and saturation remain editable at black/grey, where RGB alone cannot
 // represent them. Moving brightness later uses the user's retained hue.
 const hsv=state.hsv&&state.lastColor===state.native.value?state.hsv:rgbToHsv(state.native.value);
 state.hsv=hsv;state.lastColor=state.native.value;
 state.colorInputs.forEach((input,i)=>input.value=String(i?hsv[i]*100:hsv[i]));
 state.hex.value=state.native.value.toUpperCase();
 state.header?.querySelector('.ui-selected-value')?.replaceChildren(selectedText(state));
 state.popup.style.setProperty('--control-color',state.native.value);
 if(state.plane){state.plane.style.backgroundColor=hsvToHex([hsv[0],1,1]);state.marker.style.left=`${hsv[1]*100}%`;state.marker.style.top=`${(1-hsv[2])*100}%`;state.plane.setAttribute('aria-valuetext',`${colorWords[language()][1]} ${Math.round(hsv[1]*100)}%, ${colorWords[language()][2]} ${Math.round(hsv[2]*100)}%`);}
}
function renderColor(state){
 const palette=node('div','ui-color-palette');
 const swatches=node('div','ui-color-swatches');
 for(const value of ['#172334','#ffffff','#2368b8','#4a9677','#c24151','#e4aa40','#805ac2','#333333']){const button=node('button','ui-color-swatch');button.type='button';button.style.backgroundColor=value;button.setAttribute('aria-label',value.toUpperCase());button.addEventListener('click',()=>commit(state,value));swatches.append(button);}
 palette.append(swatches);state.colorInputs=[];
 const plane=node('div','ui-color-plane'),marker=node('span','ui-color-marker');state.plane=plane;state.marker=marker;plane.tabIndex=0;plane.setAttribute('role','slider');plane.setAttribute('aria-label',`${colorWords[language()][1]} / ${colorWords[language()][2]}`);marker.setAttribute('aria-hidden','true');plane.append(marker);palette.append(plane);
 const paint=hsv=>{state.hsv=hsv;state.native.value=hsvToHex(hsv);state.lastColor=state.native.value;state.native.dispatchEvent(new Event('input',{bubbles:true}));state.native.dispatchEvent(new Event('change',{bubbles:true}));refresh(state);};
 const point=event=>{const r=plane.getBoundingClientRect();paint([state.hsv[0],Math.max(0,Math.min(1,(event.clientX-r.left)/r.width)),1-Math.max(0,Math.min(1,(event.clientY-r.top)/r.height))]);};
 plane.addEventListener('pointerdown',event=>{event.preventDefault();plane.focus({preventScroll:true});plane.setPointerCapture(event.pointerId);point(event);});
 plane.addEventListener('pointermove',event=>{if(plane.hasPointerCapture(event.pointerId))point(event);});
 plane.addEventListener('keydown',event=>{const direction={ArrowLeft:[1,-1],ArrowRight:[1,1],ArrowUp:[2,1],ArrowDown:[2,-1]}[event.key];if(!direction)return;event.preventDefault();const hsv=[...state.hsv];hsv[direction[0]]=Math.max(0,Math.min(1,hsv[direction[0]]+direction[1]*(event.shiftKey?.1:.01)));paint(hsv);});
 colorWords[language()].slice(0,3).forEach((caption,i)=>{const label=node('label','ui-color-channel'),input=node('input');label.append(node('span','',caption));input.type='range';input.min='0';input.max=i?'100':'359';input.step='1';input.setAttribute('aria-label',caption);state.colorInputs.push(input);input.addEventListener('input',()=>{const hsv=state.colorInputs.map((field,index)=>Number(field.value)/(index?100:1));state.hsv=hsv;state.native.value=hsvToHex(hsv);state.lastColor=state.native.value;state.native.dispatchEvent(new Event('input',{bubbles:true}));state.native.dispatchEvent(new Event('change',{bubbles:true}));refresh(state);});label.append(input);palette.append(label);});
 const label=node('label','ui-color-hex'),hex=node('input');hex.type='text';hex.maxLength=7;hex.spellcheck=false;hex.setAttribute('aria-label',colorWords[language()][3]);label.append(node('span','',colorWords[language()][3]),hex);state.hex=hex;
 hex.addEventListener('change',()=>{if(/^#[0-9a-f]{6}$/i.test(hex.value)){state.native.value=hex.value;state.native.dispatchEvent(new Event('input',{bubbles:true}));state.native.dispatchEvent(new Event('change',{bubbles:true}));hex.removeAttribute('aria-invalid');}else hex.setAttribute('aria-invalid','true');});palette.append(label);return palette;
}
function commit(state,value) {
 state.native.value=value;
 state.native.dispatchEvent(new Event('input',{bubbles:true}));
 state.native.dispatchEvent(new Event('change',{bubbles:true}));
 refresh(state); close(state);
}
function renderSelect(state) {
 const list=node('div','ui-option-list'); list.setAttribute('role','listbox');
 list.id=state.listId; list.setAttribute('aria-label',state.button.getAttribute('aria-label') || words().empty);
 let index=0;
 for(const option of state.native.options) {
  if(option.hidden || option.closest('optgroup')?.hidden) {index++;continue;}
  const item=node('button','ui-option'); item.type='button'; item.setAttribute('role','option');
  item.setAttribute('aria-selected',String(option.selected)); item.disabled=option.disabled || !!option.closest('optgroup')?.disabled;
  item.dataset.index=String(index++); item.tabIndex=option.selected ? 0 : -1;
  item.append(node('span','ui-option-text',option.textContent));
  const tick=node('span','ui-option-tick'); tick.innerHTML=icons.check; item.append(tick);
  item.addEventListener('click',()=>commit(state,option.value)); list.append(item);
 }
 list.addEventListener('keydown',event=>{
  const options=[...list.querySelectorAll('button:not(:disabled)')]; const at=options.indexOf(document.activeElement);
  let next;
  if(event.key==='ArrowDown') next=(at+1)%options.length;
  else if(event.key==='ArrowUp') next=(at-1+options.length)%options.length;
  else if(event.key==='Home') next=0;
  else if(event.key==='End') next=options.length-1;
  else if(event.key.length===1 && !event.ctrlKey && !event.metaKey && event.key!==' ') {
   state.typed=(performance.now()-(state.typedAt||0)>700 ? '' : state.typed||'')+event.key.toLocaleLowerCase(locale()); state.typedAt=performance.now();
   next=options.findIndex(option=>option.textContent.trim().toLocaleLowerCase(locale()).startsWith(state.typed));
  }
  if(next!=null && next>=0 && options[next]) { event.preventDefault(); options.forEach(option=>option.tabIndex=-1); options[next].tabIndex=0; options[next].focus({preventScroll:true}); options[next].scrollIntoView({block:'nearest'}); }
 });
 return list;
}
function renderCalendar(state) {
 const calendar=node('div','ui-calendar');
 const month=state.month || new Date(); state.month=new Date(month.getFullYear(),month.getMonth(),1);
 const heading=node('div','ui-calendar-heading');
 for(const direction of [-1,1]) {
  const button=node('button',direction<0 ? 'ui-month previous' : 'ui-month next'); button.type='button'; button.innerHTML=icons.chevron;
  button.setAttribute('aria-label',direction<0 ? words().previous : words().next);
  button.addEventListener('click',()=>{state.month=new Date(state.month.getFullYear(),state.month.getMonth()+direction,1); render(state);});
  if(direction<0) heading.append(button);
  else {heading.append(node('strong','',new Intl.DateTimeFormat(locale(),{year:'numeric',month:'long'}).format(state.month))); heading.append(button);}
 }
 calendar.append(heading);
 const grid=node('div','ui-calendar-grid'); grid.setAttribute('role','grid');
 for(let day=0;day<7;day++) grid.append(node('span','ui-weekday',new Intl.DateTimeFormat(locale(),{weekday:'narrow'}).format(new Date(2024,0,1+day))));
 const offset=(state.month.getDay()+6)%7;
 const start=new Date(state.month.getFullYear(),state.month.getMonth(),1-offset);
 const focus=state.focusDate || state.native.value || iso(new Date());
 for(let day=0;day<42;day++) {
  const date=new Date(start.getFullYear(),start.getMonth(),start.getDate()+day), value=iso(date);
  const cell=node('button','ui-day',date.getDate()); cell.type='button'; cell.dataset.date=value; cell.setAttribute('role','gridcell');
  cell.setAttribute('aria-label',new Intl.DateTimeFormat(locale(),{dateStyle:'full'}).format(date));
  cell.setAttribute('aria-selected',String(value===state.native.value));
  if(value===iso(new Date())) cell.setAttribute('aria-current','date');
  if(date.getMonth()!==state.month.getMonth()) cell.classList.add('outside-month');
  cell.disabled=!!((state.native.min && value<state.native.min)||(state.native.max && value>state.native.max));
  cell.tabIndex=value===focus ? 0 : -1; cell.addEventListener('click',()=>commit(state,value)); grid.append(cell);
 }
 if(!grid.querySelector('button[tabindex="0"]:not(:disabled)')) {const first=grid.querySelector('button:not(:disabled):not(.outside-month)'); if(first) first.tabIndex=0;}
 grid.addEventListener('keydown',event=>{
  const focused=event.target.closest('[data-date]'); if(!focused) return;
  const date=parse(focused.dataset.date); let next;
  const offsets={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7};
  if(event.key in offsets) next=new Date(date.getFullYear(),date.getMonth(),date.getDate()+offsets[event.key]);
  else if(event.key==='PageUp' || event.key==='PageDown') next=new Date(date.getFullYear(),date.getMonth()+(event.key==='PageUp'?-1:1),1);
  else if(event.key==='Home') next=new Date(date.getFullYear(),date.getMonth(),date.getDate()-(date.getDay()+6)%7);
  else if(event.key==='End') next=new Date(date.getFullYear(),date.getMonth(),date.getDate()+6-(date.getDay()+6)%7);
  if(next) {event.preventDefault();const value=iso(next);if((state.native.min && value<state.native.min)||(state.native.max && value>state.native.max)) return;state.focusDate=value;state.month=new Date(next.getFullYear(),next.getMonth(),1);render(state);state.popup.querySelector(`[data-date="${value}"]`)?.focus({preventScroll:true});}
 });
 calendar.append(grid);
 const actions=node('div','ui-calendar-actions'); const today=node('button','',words().today); today.type='button';
 const todayValue=iso(new Date()); today.disabled=!!((state.native.min && todayValue<state.native.min)||(state.native.max && todayValue>state.native.max));
 today.addEventListener('click',()=>commit(state,todayValue));actions.append(today);
 if(!state.native.required) {const clear=node('button','',words().clear);clear.type='button';clear.addEventListener('click',()=>commit(state,''));actions.append(clear);}
 calendar.append(actions); return calendar;
}
function render(state) {
 state.popup.replaceChildren();
 const header=node('div','ui-choice-selected'); header.setAttribute('aria-hidden','true');
 header.append(node('span','ui-selected-value',selectedText(state)));
 const icon=node('span','ui-choice-icon'); icon.innerHTML=state.date ? icons.calendar : icons.chevron;header.append(icon);
 const content=node('div','ui-choice-content');content.append(state.color ? renderColor(state) : state.date ? renderCalendar(state) : renderSelect(state));
 state.popup.append(header,content); state.content=content; state.header=header;
 if(state.color)syncColor(state);
}
async function open(state) {
 if(state.native.disabled || current===state) return;
 if(current) await close(current,false);
 refresh(state); state.closing=false; state.serial=(state.serial||0)+1;
 state.month=parse(state.native.value) || new Date();state.focusDate=state.native.value;
 render(state); current=state; const popup=state.popup;
 const start=rect(state.button),scrolls=[];
 for(let ancestor=state.button.parentElement;ancestor;ancestor=ancestor.parentElement)scrolls.push([ancestor,ancestor.scrollTop,ancestor.scrollLeft]);
 const restoreScroll=()=>scrolls.forEach(([element,top,left])=>{element.scrollTop=top;element.scrollLeft=left;});
 popup.style.cssText=''; popup.hidden=false;
 (state.native.closest('dialog') || document.body).append(popup);
 popup.showPopover();restoreScroll();
 popup.dataset.motionState='opening';
 const viewportWidth=document.documentElement.clientWidth;
 const preferredWidth=Number(state.native.dataset.popupWidth)||0;
 const width=Math.min(state.date||state.color ? Math.max(302,start.width) : Math.max(230,start.width,preferredWidth),viewportWidth-24);
 popup.style.width=`${width}px`; popup.style.maxHeight=`${Math.max(100,innerHeight-24)}px`;
 popup.style.setProperty('--choice-selected-height',`${state.header.getBoundingClientRect().height}px`);
 const popupStyle=getComputedStyle(popup);
 const height=Math.min(Math.ceil(popup.scrollHeight+parseFloat(popupStyle.borderTopWidth)+parseFloat(popupStyle.borderBottomWidth)),innerHeight-24);
 const below=innerHeight-start.top, above=start.top+start.height;
 const top=below>=height+12 || below>=above ? Math.min(start.top,innerHeight-height-12) : Math.max(12,start.top+start.height-height);
 const end={left:Math.min(Math.max(12,start.left),viewportWidth-width-12),top:Math.max(12,top),width,height};
 Object.assign(popup.style,{left:`${end.left}px`,top:`${end.top}px`,height:`${end.height}px`});
 state.button.setAttribute('aria-expanded','true');state.button.classList.add('ui-control-open');
 if(!reduced.matches) {
  const computed=getComputedStyle(state.button), serial=state.serial;
  state.animations=[popup.animate(geometryFrames(start,end),{duration:motion.popover,fill:'both'}),popup.animate([{backgroundColor:computed.backgroundColor,borderRadius:computed.borderRadius,boxShadow:'0 0 0 #17233400'},{backgroundColor:'#fff',borderRadius:'14px',boxShadow:'0 16px 54px #17233430'}],{duration:motion.popover,easing:motion.color,fill:'both'}),state.header.animate([{color:computed.color},{color:'#2368b8'}],{duration:motion.popover,easing:motion.color,fill:'both'}),state.content.animate([{opacity:0,offset:0},{opacity:0,offset:.32},{opacity:1,offset:1}],{duration:motion.popover,easing:motion.ease,fill:'both'})];
  if(!state.date) state.animations.push(state.header.querySelector('.ui-choice-icon').animate([{transform:'rotate(0deg)'},{transform:'rotate(180deg)'}],{duration:motion.popover,easing:motion.ease,fill:'both'}));
  await Promise.all(state.animations.map(animation=>animation.finished.catch(()=>{})));
  if(state.serial!==serial || state.closing) return;cancelAnimations(state);
 }
 state.popup.dataset.motionState='open';
 const focusable=popup.querySelector('[aria-selected="true"]:not(:disabled)') || popup.querySelector('[tabindex="0"]:not(:disabled)') || popup.querySelector('button:not(:disabled)');
 focusable?.focus({preventScroll:true});restoreScroll();
}
async function close(state,focus=true) {
 if(!state || state.closing || current!==state) return;
 state.closing=true;const serial=++state.serial; const start=rect(state.popup), end=rect(state.button);
 state.popup.dataset.motionState='closing';
 const opacity=getComputedStyle(state.content).opacity;cancelAnimations(state);
 if(!reduced.matches && state.button.isConnected) {
  const computed=getComputedStyle(state.button);
  // Keep the expanded wrapping label until it fades, while an exact collapsed
  // control takes over. It must not reflow into two lines at the final narrow width.
  let collapsed;
  if(state.native.dataset.popupWrap==='true'){
   collapsed=state.button.cloneNode(true);collapsed.removeAttribute('id');collapsed.removeAttribute('aria-labelledby');collapsed.setAttribute('aria-hidden','true');collapsed.tabIndex=-1;collapsed.classList.remove('ui-control-open');
   const border=parseFloat(getComputedStyle(state.popup).borderLeftWidth)||0;
   Object.assign(collapsed.style,{position:'absolute',left:'0',top:'0',width:`${end.width-border*2}px`,height:`${end.height-border*2}px`,minHeight:'0',border:'0',margin:'0',font:computed.font,color:computed.color,pointerEvents:'none',boxShadow:'none'});
   const value=state.header.querySelector('.ui-selected-value');if(value)value.style.width=`${value.getBoundingClientRect().width}px`;
   state.header.style.height=`${state.header.getBoundingClientRect().height}px`;
   state.popup.append(collapsed);state.collapsed=collapsed;
  }
  state.animations=[state.popup.animate(geometryFrames(start,end),{duration:motion.close,fill:'both'}),state.popup.animate([{backgroundColor:'#fff',borderRadius:'14px'},{backgroundColor:computed.backgroundColor,borderRadius:computed.borderRadius}],{duration:motion.close,easing:motion.color,fill:'both'}),state.header.animate([{color:getComputedStyle(state.header).color},{color:computed.color}],{duration:motion.close,easing:motion.color,fill:'both'}),state.content.animate([{opacity},{opacity:0,offset:.55},{opacity:0}],{duration:motion.close,fill:'both'})];
  if(!state.date) state.animations.push(state.header.querySelector('.ui-choice-icon').animate([{transform:getComputedStyle(state.header.querySelector('.ui-choice-icon')).transform},{transform:'rotate(0deg)'}],{duration:motion.close,easing:motion.ease,fill:'both'}));
  if(collapsed)state.animations.push(state.header.animate([{opacity:1},{opacity:0,offset:.6},{opacity:0}],{duration:motion.close,fill:'both'}),collapsed.animate([{opacity:0},{opacity:0,offset:.35},{opacity:1,offset:.9},{opacity:1}],{duration:motion.close,fill:'both'}));
  state.followCleanup=followAnchor(state.popup,state.button,end,{active:()=>state.closing,progress:()=>springProgress(Math.min(1,(state.animations[0]?.currentTime||0)/motion.close))});
  await Promise.all(state.animations.map(animation=>animation.finished.catch(()=>{})));
 }
 if(state.serial!==serial) return;
 if(state.popup.isConnected && state.popup.matches(':popover-open')) state.popup.hidePopover();state.popup.hidden=true;cancelAnimations(state);state.button.classList.remove('ui-control-open');state.button.setAttribute('aria-expanded','false');state.popup.dataset.motionState='closed';
 state.collapsed?.remove();state.collapsed=null;
 if(current===state) current=null;state.closing=false;if(focus && state.button.isConnected) state.button.focus({preventScroll:true});
}
function adapt(native) {
 if(adapted.has(native) || native.multiple || (native.tagName==='SELECT' && native.size>1)) return;
 const button=node('button','ui-control');button.type='button';const date=native.type==='date',color=native.type==='color';if(color)button.classList.add('ui-color-control');
 const label=node('span','ui-control-value');const icon=node('span','ui-control-icon');icon.innerHTML=date ? icons.calendar : icons.chevron;button.append(label,icon);
 const popup=node('div',`ui-choice-popup${date?' ui-date-popup':''}${native.dataset.popupWrap==='true'?' ui-choice-wrap':''}`);popup.popover='manual';popup.hidden=true;
 popup.id=`ui-choice-${++nextId}`;button.setAttribute('role','combobox');button.setAttribute('aria-readonly','true');button.setAttribute('aria-controls',date ? popup.id : `${popup.id}-list`);button.setAttribute('aria-haspopup',date?'dialog':'listbox');button.setAttribute('aria-expanded','false');
 if(date||color) {popup.setAttribute('role','dialog');popup.setAttribute('aria-label',color?(native.labels?.[0]?.textContent||'Color'):words().date);button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls',popup.id);}
 native.classList.add('ui-native-control');native.tabIndex=-1;native.setAttribute('aria-hidden','true');native.insertAdjacentElement('afterend',button);(native.closest('dialog') || document.body).append(popup);
 const state={native,button,label,popup,date,color,listId:`${popup.id}-list`,animations:[]};adapted.set(native,state);states.add(state);
 button.addEventListener('click',event=>{event.preventDefault();current===state ? close(state) : open(state);});
 button.addEventListener('keydown',event=>{if(['ArrowDown','ArrowUp','Enter',' '].includes(event.key) && current!==state){event.preventDefault();open(state);}});
 native.addEventListener('change',()=>refresh(state));native.addEventListener('invalid',event=>{event.preventDefault();button.setAttribute('aria-invalid','true');button.focus();});native.addEventListener('input',()=>button.removeAttribute('aria-invalid'));
 native.addEventListener('focus',()=>button.focus({preventScroll:true}));
 popup.addEventListener('pointerdown',event=>event.stopPropagation());popup.addEventListener('click',event=>event.stopPropagation());
 popup.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(state);}
  else if(event.key==='Tab') {
   event.preventDefault();
   const scope=native.closest('dialog')||document;
   const targets=[...scope.querySelectorAll('a[href],button,input,select,textarea,[tabindex]')].filter(el=>el===button||(!el.closest('.ui-choice-popup')&&!el.disabled&&el.tabIndex>=0&&el.getBoundingClientRect().width>0&&getComputedStyle(el).visibility!=='hidden'&&!el.classList.contains('ui-native-control')));
   const next=targets[targets.indexOf(button)+(event.shiftKey?-1:1)]||button;
   close(state,false).then(()=>next.focus());
  }
 });
 refresh(state);
}
export function installControls() {
 if(installed) return;installed=true;
 const scan=root=>{if(root instanceof Element && root.matches('select,input[type="date"],input[type="color"]')) adapt(root);root.querySelectorAll?.('select,input[type="date"],input[type="color"]').forEach(adapt);};
 scan(document);
 new MutationObserver(records=>{
  const refreshSet=new Set();
  for(const record of records) {
   if(record.type==='childList') {record.addedNodes.forEach(scan);const select=record.target.closest?.('select');if(select && adapted.has(select)) refreshSet.add(adapted.get(select));}
   else if(record.target===document.documentElement) states.forEach(state=>refreshSet.add(state));
   else {const native=record.target.closest?.('select,input[type="date"],input[type="color"]');if(native && adapted.has(native)) refreshSet.add(adapted.get(native));}
  }
  refreshSet.forEach(refresh);states.forEach(state=>{if(!state.native.isConnected){state.popup.remove();states.delete(state);if(current===state){cancelAnimations(state);current=null;}}});
 }).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['lang','disabled','required','value','selected','min','max','aria-labelledby','aria-label']});
 document.addEventListener('pointerdown',event=>{if(current && !current.popup.contains(event.target) && !current.button.contains(event.target)) close(current,false);},true);
 document.addEventListener('keydown',event=>{if(event.key==='Escape' && current){event.preventDefault();event.stopImmediatePropagation();close(current);}},true);
 addEventListener('resize',()=>{if(current)close(current,false);});
 document.addEventListener('scroll',event=>{if(current && !current.popup.contains(event.target))close(current,false);},true);
 document.addEventListener('reset',event=>queueMicrotask(()=>states.forEach(state=>{if(state.native.form===event.target)refresh(state);})),true);
 const syncValues=()=>queueMicrotask(()=>states.forEach(state=>{if(state.cachedValue!==state.native.value) refresh(state);}));
 document.addEventListener('click',syncValues);document.addEventListener('change',syncValues);
 document.addEventListener('motion-surface-close',event=>{
  const state=current;if(!state || !event.detail?.dialog?.contains(state.native)) return;
  state.serial++;cancelAnimations(state);
  if(state.popup.matches(':popover-open')) state.popup.hidePopover();state.popup.hidden=true;
  state.button.classList.remove('ui-control-open');state.button.setAttribute('aria-expanded','false');state.closing=false;current=null;
 });
}
