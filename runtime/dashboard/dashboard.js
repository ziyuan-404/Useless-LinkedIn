import {language,t,displayStatus,displayMatch,setLanguage,locale,translate,translatedStatus,translatedMatch} from './dashboard-i18n.js';
import {initMotion,afterEntrance,openDialog,closeDialog,animateTrend,wirePageLink,bindDialogDismiss,notifyPageReady} from '/motion.js';
import {installLanguageLayout,changeLabels} from '/language-layout.js';
import {animateLayoutChange,showSelectionGlow,celebrateSave} from '/controls.js';
import {motion} from '/motion-tokens.js';
import {localMinute,recordDate,submissionFields} from './dashboard-datetime.js';
const motionReady=initMotion();
let selected=null,selectedEvents=null,focus='',page=1,refreshSerial=0,dialogRevision=0,lastTrendSignature='';
let cachedDashboard=null;
const supportedLanguages=['zh','en','fr'];
const embeddedLanguageHost=window.parent!==window&&new URL(location.href).searchParams.get('motion-embedded')==='1';
let requestedLanguage=language;
let trendReplayTimer,scrollSerial=0;
let retainedNaturalEnd=0;
function releaseFilterViewport(){$('main').style.minHeight='';retainedNaturalEnd=0;}
function retainFilterViewport(){
 if(scrollY<=0)return()=>{};
 const main=$('main');main.style.minHeight=`${main.offsetHeight}px`;
 return()=>{let end=$('.pagination').offsetHeight;for(let node=$('.pagination');node;node=node.offsetParent)end+=node.offsetTop;retainedNaturalEnd=end+parseFloat(getComputedStyle(main).paddingBottom);main.style.minHeight=`${Math.max(retainedNaturalEnd,scrollY+innerHeight)-main.offsetTop}px`;};
}
window.addEventListener('scroll',()=>{if(retainedNaturalEnd&&scrollY<=Math.max(0,retainedNaturalEnd-innerHeight))releaseFilterViewport();},{passive:true});
window.addEventListener('resize',releaseFilterViewport);
function replayLanguageTrend(){
 clearTimeout(trendReplayTimer);const chart=$('#trend-chart');
 if(matchMedia('(prefers-reduced-motion: reduce)').matches){animateTrend(chart);return;}
 chart.dataset.motion='pending';trendReplayTimer=setTimeout(()=>animateTrend(chart),motion.intro-90);
}
function smoothScrollTo(node){
 const token=++scrollSerial,from=scrollY,header=$('.topbar'),inset=getComputedStyle(header).position==='sticky'?header.offsetHeight+16:16;
 const to=Math.max(0,Math.min(document.documentElement.scrollHeight-innerHeight,from+node.getBoundingClientRect().top-inset));
 if(matchMedia('(prefers-reduced-motion: reduce)').matches){scrollTo({top:to,behavior:'instant'});return;}
 const begin=performance.now(),duration=620;
 const bezier=(t,a,b)=>3*(1-t)**2*t*a+3*(1-t)*t*t*b+t**3;
 const step=now=>{if(token!==scrollSerial)return;const t=Math.min(1,(now-begin)/duration);let lo=0,hi=1;for(let i=0;i<12;i++){const mid=(lo+hi)/2;if(bezier(mid,.22,.36)<t)lo=mid;else hi=mid;}const p=t===1?1:bezier((lo+hi)/2,1,1);scrollTo({top:from+(to-from)*p,behavior:'instant'});if(t<1)requestAnimationFrame(step);};
 requestAnimationFrame(step);
}
for(const type of ['wheel','touchstart'])window.addEventListener(type,()=>++scrollSerial,{passive:true});
const languageLayout=installLanguageLayout({variants:node=>{
 const key=node.dataset.layoutKey||node.dataset.i18n;
 if(node.matches('.ui-control-value')){const native=node.parentElement.previousElementSibling;if(native?.tagName==='SELECT'){const option=native.selectedOptions[0];if(option?.dataset.i18n)return supportedLanguages.map(lang=>translate(lang,option.dataset.i18n));if(native.id==='status'||native.name==='status'){const suffix=option?.textContent.match(/\s(\(\d+\))$/)?.[0]||'';return supportedLanguages.map(lang=>native.value?translatedStatus(lang,native.value)+suffix:translate(lang,'allStatuses'));}if(native.id==='initial')return supportedLanguages.map(lang=>native.value==='#'?translate(lang,'otherInitial'):native.value||translate(lang,'allInitials'));if(native.id==='page-size')return supportedLanguages.map(lang=>translate(lang,'perPageOption',{n:native.value}));return [node.textContent];}if(native?.type==='date')return supportedLanguages.map(lang=>native.value?new Intl.DateTimeFormat({zh:'zh-CN',en:'en-GB',fr:'fr-FR'}[lang],{year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(native.value+'T12:00:00')):({zh:'选择日期',en:'Choose a date',fr:'Choisir une date'})[lang]);return [];}
 if(node.id==='dialog-title')return selected?[`${selected.company} · ${selected.role}`]:supportedLanguages.map(lang=>translate(lang,'newRecord'));
 if(node.id==='source'){const conflict=selected&&[selected.applied,selected.awaiting_interview,selected.awaiting_result].filter(value=>value==='☑').length>1;return supportedLanguages.map(lang=>translate(lang,!selected?'newSource':selected.source_sheet?'legacySource':'editSource',{sheet:selected?.source_sheet,row:selected?.source_row,conflict:conflict?translate(lang,'conflictHint'):''}));}
 if(node.dataset.layoutStatus)return supportedLanguages.map(lang=>translatedStatus(lang,node.dataset.layoutStatus));
 if(node.dataset.layoutMatch)return supportedLanguages.map(lang=>translatedMatch(lang,node.dataset.layoutMatch));
 if(node.dataset.fieldKey)return supportedLanguages.map(lang=>translate(lang,'field_'+node.dataset.fieldKey)+(['submitted_at','company','role'].includes(node.dataset.fieldKey)?' *':''));
 if(!key)return [];
 const params=JSON.parse(node.dataset.layoutParams||'{}');
 if(node.id==='count')return supportedLanguages.flatMap(lang=>['due','waiting','verify','verified','missingJd','conflicts'].map(focusKey=>translate(lang,'countAll',{n:params.total??params.n,total:params.total??params.n,focus:translate(lang,focusKey)+' · '})));
 return supportedLanguages.map(lang=>translate(lang,key,{...params,focus:params.focusKey?translate(lang,params.focusKey)+' · ':params.focus}));
}});
function reserveText(node,key,params={}){node.dataset.layoutKey=key;node.dataset.layoutParams=JSON.stringify(params);return node;}
let formSnapshot='',savingRecord=false,noticeTimer;
const stageKeys=['applied','awaiting_interview','awaiting_result'];
function recordValues(form=$('#record-form')){const values=Object.fromEntries(new FormData(form).entries());for(const key of stageKeys)values[key]=form.elements[key].checked?'☑':'☐';const submitted=form.elements.submitted_at;if(submitted)Object.assign(values,submissionFields(submitted,selected));return values;}
const formValues=()=>JSON.stringify(recordValues());
let noticeKey='saved',noticeText=null,deletedRecord=null,trashRows=[];
function renderNotice(){const node=$('#save-notice');node.dataset.tone=noticeKey==='deleted'?'danger':'success';node.replaceChildren(reserveText(el('span','',noticeText??t(noticeKey)),noticeText?'':noticeKey));if(noticeKey==='deleted'&&deletedRecord){const undo=reserveText(el('button','',t('undoDelete')),'undoDelete');undo.type='button';undo.addEventListener('click',()=>restoreRecord(deletedRecord,undo));node.append(undo);}}
function notice(message,key='saved'){clearTimeout(noticeTimer);noticeKey=key;noticeText=message===t(key)?null:message;renderNotice();$('#save-notice').hidden=false;noticeTimer=setTimeout(()=>$('#save-notice').hidden=true,7000);}
const today=()=>{const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);};
const groups=[['groupStage',stageKeys],['groupApplication',['id','submitted_at','company','role','status','next_action','followup_date','notes']],['groupContext',['company_info','role_analysis']],['groupJob',['job_url','requisition_id','jd','match_level','liveness','duplicate_status','knockout']],['groupMaterials',['mode','resume_path','letter_path','channel','submission_evidence','last_contact']]];
const $=s=>document.querySelector(s);
async function api(url,options){const response=await fetch(url,options);const data=await response.json();if(!response.ok)throw Error(data.error||t('apiError'));return data;}
function el(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
function applyLanguage(){
 setLanguage(language);
 for(const node of document.querySelectorAll('[data-i18n]'))node.textContent=t(node.dataset.i18n);
 for(const node of document.querySelectorAll('[data-i18n-aria]'))node.setAttribute('aria-label',t(node.dataset.i18nAria));
 $('.topbar-actions').setAttribute('aria-label',`${t('dashboard')} / ${t('editor')}`);
 for(const node of document.querySelectorAll('[data-i18n-placeholder]'))node.setAttribute('placeholder',t(node.dataset.i18nPlaceholder));
 for(const button of document.querySelectorAll('[data-language]'))button.setAttribute('aria-pressed',String(button.dataset.language===language));
 for(const option of $('#page-size').options)option.textContent=t('perPageOption',{n:option.value});
 $('#initial').querySelector('option[value="#"]').textContent=t('otherInitial');
 $('#editor-link').href=`http://127.0.0.1:8766/?lang=${language}`;
 if(!$('#save-notice').hidden)renderNotice();if($('#trash-dialog').open)renderTrash();
 if($('#editor').open)translateOpenDialog();
}
$('#source').dataset.layoutKey='';
window.addEventListener('message',event=>{if(event.source===window.parent&&/^http:\/\/(127\.0\.0\.1|localhost):876[56]$/.test(event.origin)&&event.data?.type==='workspace-language'&&supportedLanguages.includes(event.data.language))changeLanguage(event.data.language,{...event.data,remote:true});});
function recordSource(record){if(!record)return t('newSource');const conflict=[record.applied,record.awaiting_interview,record.awaiting_result].filter(x=>x==='☑').length>1?t('conflictHint'):'';return record.source_sheet?t('legacySource',{sheet:record.source_sheet,row:record.source_row,conflict}):t('editSource',{conflict});}
function renderHistory(){const events=selectedEvents;if(!events){$('#event-list').replaceChildren(el('li','',t('loadingHistory')));return;}const names={'imported-from-excel':'eventImported','source-whitespace-restored':'eventRestored','submission-receipt-verified':'eventVerified',created:'eventCreated',updated:'eventUpdated',deleted:'eventDeleted',restored:'eventUndeleted','material-path-renamed':'eventPathRenamed'};$('#event-list').replaceChildren(...(events.length?events.map(item=>el('li','',`${new Date(item.at).toLocaleString(locale())} · ${names[item.action]?t(names[item.action]):item.action}`)):[el('li','',t('noHistory'))]));}
function translateOpenDialog(){
 $('#dialog-title').textContent=selected?`${selected.company} · ${selected.role}`:t('newRecord');
 $('#source').textContent=recordSource(selected);
 for(const section of document.querySelectorAll('.form-section'))section.querySelector('h3').textContent=t(section.dataset.groupKey);
 for(const label of document.querySelectorAll('[data-field-key]'))label.textContent=t('field_'+label.dataset.fieldKey)+(['submitted_at','company','role'].includes(label.dataset.fieldKey)?' *':'');
 for(const option of $('#record-form').elements.status.options)option.textContent=displayStatus(option.value);
 const hint=$('.field-hint');if(hint)hint.textContent=t('sourceHint');
 const job=$('#form-fields a[target="_blank"]');if(job)job.textContent=t('openJob');
 for(const key of ['company_info','role_analysis'])$('#record-form').elements[key].placeholder=t(key==='company_info'?'companyInfoHint':'roleAnalysisHint');if(selected)renderHistory();
 const save=$('#record-form button[type="submit"]');save.textContent=t(save.disabled?'saving':'save');
}
function changeLanguage(next,options={}){if(!supportedLanguages.includes(next)||(!options.remote&&next===requestedLanguage))return;if(!options.remote)requestedLanguage=next;changeLabels(()=>{requestedLanguage=next;if(!setLanguage(next))return;const url=new URL(location.href);url.searchParams.set('lang',next);history.replaceState(null,'',url);applyLanguage();if(cachedDashboard){renderDashboard(...cachedDashboard);const points=cachedDashboard[2],total=points.reduce((sum,item)=>sum+item.count,0);renderTrendCount(total,options.animate!==false);$('#trend-chart').setAttribute('aria-label',t('trendAria',{days:points.length,total,highest:Math.max(0,...points.map(item=>item.count))}));$('#trend-chart svg')?.setAttribute('aria-label',t('trendSvg'));document.querySelectorAll('.trend-point').forEach((node,i)=>{const text=t('trendPoint',{date:points[i].date,n:points[i].count});node.setAttribute('aria-label',text);node.querySelector('title').textContent=text;});if(options.animate!==false)replayLanguageTrend();}},{...options,language:next});}
function renderTrendCount(total,pending=true){
 const counter=$('#trend-total'),label=t('trendTotal',{n:total}),parts=label.split(String(total));
 counter.replaceChildren();counter.dataset.trendCount=String(total);counter.setAttribute('aria-label',label);
 const number=el('span','trend-number',pending?'0':String(total));number.style.minInlineSize=`${String(total).length*.64}em`;number.setAttribute('aria-hidden','true');
 if(parts[0])counter.append(el('span','trend-unit',parts[0]));
 counter.append(number,reserveText(el('span','trend-unit',parts.slice(1).join(String(total))),'trendTotal',{n:''}));
}
function stat(labelKey,value,noteKey,filter){const label=t(labelKey),card=el('button','stat');card.type='button';card.dataset.focus=filter;card.setAttribute('aria-pressed',String(focus===filter));card.setAttribute('aria-label',t('statAria',{label,n:value}));card.append(reserveText(el('span','',label),labelKey),el('strong','',String(value)),reserveText(el('small','',t(noteKey)),noteKey));return card;}
function svgNode(name,attributes={}){const node=document.createElementNS('http://www.w3.org/2000/svg',name);for(const [key,value] of Object.entries(attributes))node.setAttribute(key,String(value));return node;}
function renderTrend(points){
 const total=points.reduce((sum,item)=>sum+item.count,0),highest=Math.max(0,...points.map(item=>item.count));
 const step=highest<=4?1:Math.ceil(highest/3),peak=Math.max(1,Math.ceil(highest/step)*step);
 renderTrendCount(total);
 const chart=$('#trend-chart');chart.setAttribute('aria-label',t('trendAria',{days:points.length,total,highest}));
 const svg=svgNode('svg',{viewBox:'0 0 1100 210',role:'group','aria-label':t('trendSvg')});
 const defs=svgNode('defs'),gradient=svgNode('linearGradient',{id:'trend-fill',x1:'0',y1:'0',x2:'0',y2:'1'});
 gradient.append(svgNode('stop',{offset:'0%','stop-color':'#65a8f4','stop-opacity':'.28'}),svgNode('stop',{offset:'100%','stop-color':'#65a8f4','stop-opacity':'.01'}));defs.append(gradient);svg.append(defs);
 const left=48,right=1080,top=16,bottom=170;
 const y=count=>bottom-count/peak*(bottom-top),x=index=>left+index/Math.max(1,points.length-1)*(right-left);
 for(let count=0;count<=peak;count+=step){
  svg.append(svgNode('line',{x1:left,x2:right,y1:y(count),y2:y(count),class:'trend-gridline'}));
  const label=svgNode('text',{x:left-12,y:y(count)+4,class:'trend-tick','text-anchor':'end'});label.textContent=String(count);svg.append(label);
 }
 for(const index of [...new Set([0,5,10,15,points.length-1])]){
  if(!points[index])continue;
  const label=svgNode('text',{x:x(index),y:199,class:'trend-tick','text-anchor':index===0?'start':index===points.length-1?'end':'middle'});label.textContent=points[index].date.slice(5);svg.append(label);
 }
 if(!points.length){chart.replaceChildren(svg);chart.dataset.loading='false';return;}
 const line=points.map((item,index)=>`${index?'L':'M'}${x(index).toFixed(1)},${y(item.count).toFixed(1)}`).join(' ');
 const series=svgNode('g',{class:'trend-series'});
 series.append(svgNode('path',{d:`${line} L${x(points.length-1).toFixed(1)},${bottom} L${left},${bottom} Z`,class:'trend-area'}),svgNode('path',{d:line,class:'trend-line'}));
 const markers=points.map((item,index)=>{const point=svgNode('circle',{cx:x(index),cy:y(item.count),r:4,class:`trend-point${item.count?' has-count':''}`,tabindex:'0','aria-label':t('trendPoint',{date:item.date,n:item.count})});point.append(svgNode('title'));point.firstChild.textContent=t('trendPoint',{date:item.date,n:item.count});point.addEventListener('focus',()=>showTip(index));point.addEventListener('blur',hideTip);point.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();markers[Math.min(points.length-1,Math.max(0,index+(event.key==='ArrowRight'?1:-1)))].focus();});series.append(point);return point;});
 svg.append(series);
 const hitArea=svgNode('rect',{x:left,y:top,width:right-left,height:bottom-top,fill:'transparent',class:'trend-hit-area'});
 hitArea.addEventListener('pointermove',event=>{if(event.pointerType==='touch')return;const box=svg.getBoundingClientRect();const position=(event.clientX-box.left)/box.width*1100;showTip(Math.min(points.length-1,Math.max(0,Math.round((position-left)/(right-left)*(points.length-1)))));});
 hitArea.addEventListener('pointerleave',hideTip);svg.append(hitArea);
 const tooltip=el('div','trend-tooltip');tooltip.setAttribute('aria-hidden','true');let activeIndex=-1;
 chart.replaceChildren(svg,tooltip);chart.dataset.loading='false';chart.dataset.motion='pending';
 motionReady.then(()=>afterEntrance()).then(()=>{if(svg.isConnected)animateTrend(chart);});
 function showTip(index){if(index===activeIndex&&chart.dataset.tooltip==='visible')return;activeIndex=index;const item=points[index],box=svg.getBoundingClientRect(),chartBox=chart.getBoundingClientRect();tooltip.textContent=`${item.date} · ${t('trendTotal',{n:item.count})}`;tooltip.style.left=`${Math.min(chartBox.width-72,Math.max(72,x(index)/1100*box.width+box.left-chartBox.left))}px`;tooltip.style.top=`${y(item.count)/210*box.height+box.top-chartBox.top}px`;chart.dataset.tooltip='visible';markers.forEach((marker,i)=>marker.classList.toggle('is-active',i===index));}
 function hideTip(){activeIndex=-1;chart.dataset.tooltip='';markers.forEach(marker=>marker.classList.remove('is-active'));}
}
function badge(record){const status=record.status;const css=status==='已提交'?'submitted':status==='受阻'||status==='待用户'?'blocked':status==='跳过'?'skipped':'';const wrapper=el('div','status-stack');const statusLabel=el('span',`badge ${css}`,displayStatus(status||'待处理'));statusLabel.dataset.layoutStatus=status||'待处理';statusLabel.dataset.layoutKey='';wrapper.append(statusLabel);if(status==='已提交'){const verified=record.submission_verified===1;const note=el('span',`receipt-note ${verified?'verified':'pending'}`,t(verified?'proofVerified':'proofPending'));reserveText(note,verified?'proofVerified':'proofPending');const symbol=svgNode('svg',{class:'receipt-symbol',viewBox:'0 0 20 20',fill:'none','aria-hidden':'true',focusable:'false'});symbol.append(svgNode('circle',{cx:10,cy:10,r:7.5,stroke:'currentColor','stroke-width':1.5}));symbol.append(svgNode('path',{d:verified?'m6.5 10 2.3 2.3 4.7-4.6':'M10 6v4l2.5 1.5',stroke:'currentColor','stroke-width':1.5,'stroke-linecap':'round','stroke-linejoin':'round'}));note.prepend(symbol);wrapper.append(note);}return wrapper;}
function row(record){const tr=el('tr');const company=el('td');company.append(el('span','company',record.company),el('span','role',record.role),el('span','record-date',recordDate(record)));const state=el('td','status-cell');state.dataset.label=t('status');state.append(badge(record));const match=el('td','match-cell muted',record.match_level?displayMatch(record.match_level):'—');match.dataset.label=t('match');const next=el('td','next-cell',record.next_action||'—');next.title=record.next_action||'';next.dataset.label=t('next');const due=record.followup_date&&record.followup_date<=today()&&!['跳过','拒绝','撤回','失效'].includes(record.status);const follow=el('td',`date-cell ${due?'due-date':'muted'}`,record.followup_date||'—');follow.dataset.label=t('followup');const action=el('td','action-cell');const button=el('button','linkbtn',t('view'));button.type='button';reserveText(button,'view');button.dataset.recordId=record.id;button.setAttribute('aria-label',t('viewAria',{company:record.company,role:record.role}));button.addEventListener('click',event=>edit(record.id,event.currentTarget));action.append(button);tr.append(company,state,match,next,follow,action);return tr;}
function focusLayoutNodes(){return [...$('#focus-bar').children,$('.table-wrap'),$('.pagination')];}
function renderDashboard(sum,result,trend,{animateLayout=false}={}){
 const render=()=>{
  $('#load-error').hidden=true;
  $('#stats').replaceChildren(stat('due',sum.followupDue,'statDueNote','due'),stat('statWaiting',sum.waitingUser,'statWaitingNote','waiting'),stat('verify',sum.pendingVerification,'statVerifyNote','verify'),stat('verified',sum.verifiedSubmitted,'statVerifiedNote','verified'));
  const trendSignature=JSON.stringify(trend);if(trendSignature!==lastTrendSignature){renderTrend(trend);lastTrendSignature=trendSignature;}
  for(const [id,value] of [['due-count',sum.followupDue],['waiting-count',sum.waitingUser],['verify-count',sum.pendingVerification],['verified-count',sum.verifiedSubmitted],['jd-count',sum.missingJd],['conflict-count',sum.stageConflicts]])$(`#${id}`).textContent=value;
  const rows=result.items;page=result.page;
  $('#rows').replaceChildren(...rows.map(row));
  const start=result.total?(page-1)*result.pageSize+1:0,end=start+rows.length-(result.total?1:0);
  const focusNames={due:'due',waiting:'waiting',verify:'verify',verified:'verified','missing-jd':'missingJd',conflicts:'conflicts'};
  const countKey=result.total!==sum.total?'countAll':'count',countParams={focus:focusNames[focus]?t(focusNames[focus])+' · ':'',n:result.total,total:sum.total,focusKey:focusNames[focus]};
  $('#count').textContent=t(countKey,countParams);reserveText($('#count'),countKey,countParams);
  const pageParams={start,end,total:result.total,page,pages:result.pages};$('#page-info').textContent=t('pageInfo',pageParams);reserveText($('#page-info'),'pageInfo',pageParams);
  $('#page-prev').disabled=page<=1;$('#page-next').disabled=page>=result.pages;
  $('#empty').hidden=rows.length>0;
  const select=$('#status'),current=select.value;
  select.replaceChildren(new Option(t('allStatuses'),''),...Object.keys(sum.byStatus).sort().map(s=>new Option(`${displayStatus(s)} (${sum.byStatus[s]})`,s)));
  select.value=current;
  languageLayout.reserve();
 };
 const releaseViewport=animateLayout?retainFilterViewport():()=>{};
 if(animateLayout)animateLayoutChange(focusLayoutNodes(),render);else render();
 releaseViewport();
}
async function refresh({animateLayout=false,paginate=false}={}){
 const serial=++refreshSerial;$('.table-wrap').setAttribute('aria-busy','true');if(!cachedDashboard)$('#count').textContent=t('load');
 const params=new URLSearchParams({q:$('#search').value.trim(),status:$('#status').value,initial:$('#initial').value,sort:$('#sort').value,focus,page:String(page),pageSize:$('#page-size').value});
 try{
  const [sum,result,trend]=await Promise.all([api('/api/summary'),api(`/api/applications?${params}`),api('/api/trend')]);
  if(serial!==refreshSerial)return;
  if(!animateLayout)releaseFilterViewport();
  cachedDashboard=[sum,result,trend];renderDashboard(sum,result,trend,{animateLayout});
  if(paginate){if(!matchMedia('(prefers-reduced-motion: reduce)').matches)$('#rows').animate([{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'none'}],{duration:320,easing:motion.ease});smoothScrollTo($('.table-wrap'));}
 }catch(error){if(serial===refreshSerial){$('#load-error-message').textContent=t('loadError',{error:error.message});$('#load-error').hidden=false;if(!lastTrendSignature){$('#trend-chart').dataset.loading='false';$('#trend-chart').replaceChildren(el('p','trend-error',t('trendError')));}$('#rows').replaceChildren();$('#empty').hidden=true;$('#count').textContent=t('loadFailed');$('#page-info').textContent='';$('#page-prev').disabled=true;$('#page-next').disabled=true;}}finally{if(serial===refreshSerial)$('.table-wrap').setAttribute('aria-busy','false');}
}
function control(key,value,isNew,dateOnly){const wrapper=el('label','field'+(['jd','notes','submission_evidence','next_action','company_info','role_analysis'].includes(key)?' full':''));const label=el('span','',t('field_'+key)+(['submitted_at','company','role'].includes(key)?' *':''));label.id=`label-${key}`;label.dataset.fieldKey=key;wrapper.append(label);let input;if(['jd','notes','submission_evidence','next_action','company_info','role_analysis'].includes(key)){input=el('textarea');input.value=value||'';}else if(stageKeys.includes(key)){wrapper.classList.add('checkbox-field');input=el('input');input.type='checkbox';input.value='☑';input.checked=value==='☑';}else if(key==='status'){input=el('select');for(const s of ['待处理','待用户','材料已准备','投递中','待确认提交结果','已提交','跳过','受阻'])input.append(new Option(displayStatus(s),s));input.value=value||'待处理';}else{input=el('input');input.type=key==='submitted_at'?'datetime-local':['date','followup_date','last_contact'].includes(key)?'date':key==='job_url'?'url':'text';input.value=key==='submitted_at'?localMinute(value):value||'';if(key==='submitted_at'){input.step='60';input.dataset.dateOnly=dateOnly||'';input.setCustomValidity(value||dateOnly?'':t('field_submitted_at'));}}input.name=key;input.setAttribute('aria-labelledby',`label-${key}`);if(key==='id'){input.readOnly=true;input.tabIndex=-1;}if(key==='company'&&isNew)input.autofocus=true;if(['id','date','company','role'].includes(key))input.required=true;if(key==='jd')input.rows=6;if(['company_info','role_analysis'].includes(key)){input.rows=3;input.placeholder=t(key==='company_info'?'companyInfoHint':'roleAnalysisHint');}if(stageKeys.includes(key))wrapper.prepend(input);else wrapper.append(input);if(key==='submission_evidence')wrapper.append(reserveText(el('small','field-hint',t('sourceHint')),'sourceHint'));if(key==='job_url'&&/^https?:\/\//i.test(value||'')){const link=reserveText(el('a','',t('openJob')),'openJob');link.href=value;link.target='_blank';link.rel='noopener noreferrer';wrapper.append(link);}return wrapper;}
function show(record,origin){
 dialogRevision++;selected=record;selectedEvents=null;
 const isNew=!record;
 $('#dialog-title').textContent=isNew?t('newRecord'):`${record.company} · ${record.role}`;
 $('#source').textContent=recordSource(record);
 const defaults={id:`UL-${today().replaceAll('-','')}-${crypto.randomUUID().slice(0,6)}`,date:today()};
 const sections=groups.map(([title,keys])=>{const section=el('section','form-section'+(title==='groupStage'?' stage-shortcuts':''));section.dataset.groupKey=title;section.append(reserveText(el('h3','',t(title)),title));const grid=el('div','section-grid');grid.append(...keys.map(key=>control(key,record?.[key]??defaults[key]??'',isNew,record?.date??defaults.date)));section.append(grid);return section;});
 $('#form-fields').replaceChildren(...sections);formSnapshot=formValues();$('#form-fields').scrollTop=0;
 $('#delete-record').hidden=isNew;$('#history').hidden=isNew;$('#history').open=false;
 $('#event-list').replaceChildren(...(isNew?[]:[el('li','',t('loadingHistory'))]));$('#form-error').textContent='';
 openDialog($('#editor'),origin);languageLayout.reserve();
 return dialogRevision;
}
async function closeEditor({force=false}={}){
 if(!$('#editor').open)return;
 if(!force){if(savingRecord)return;if(formValues()!==formSnapshot){openDialog($('#discard-dialog'),document.activeElement);return;}}
 dialogRevision++;await closeDialog($('#editor'));
}
async function edit(id,origin){let token=++dialogRevision;try{const record=await api(`/api/applications/${encodeURIComponent(id)}`);if(token!==dialogRevision)return;token=show(record,origin);const events=await api(`/api/applications/${encodeURIComponent(id)}/events`);if(token!==dialogRevision||!$('#editor').open)return;selectedEvents=events;renderHistory();}catch(e){if(token===dialogRevision)alert(e.message);}}
$('#record-form').addEventListener('change',event=>{if(stageKeys.includes(event.target.name)&&event.target.checked){for(const name of stageKeys)if(name!==event.target.name)$('#record-form').elements[name].checked=false;}});
let recordSaveOrigin={x:.5,y:.5};
$('#record-form button[type="submit"]').addEventListener('pointerdown',event=>{const box=event.currentTarget.getBoundingClientRect();recordSaveOrigin={x:(event.clientX-box.left)/box.width,y:(event.clientY-box.top)/box.height};});
$('#record-form').addEventListener('submit',async event=>{event.preventDefault();const save=event.currentTarget.querySelector('button[type="submit"]');if(save.disabled)return;savingRecord=true;save.disabled=true;save.textContent=t('saving');$('#form-fields').inert=true;$('#close').disabled=true;$('#cancel').disabled=true;let values=recordValues(event.currentTarget);try{const method=selected?'PATCH':'POST';const url=selected?`/api/applications/${encodeURIComponent(selected.id)}`:'/api/applications';if(selected){values=Object.fromEntries(Object.entries(values).filter(([key,value])=>value!==selected[key]));if(!Object.keys(values).length){await closeEditor({force:true});return;}values.version=selected.version;}await api(url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(values)});celebrateSave(save,recordSaveOrigin);await closeEditor({force:true});notice(t('saved'));if(!selected)page=1;await refresh();}catch(e){$('#form-error').textContent=e.message;}finally{savingRecord=false;$('#form-fields').inert=false;$('#close').disabled=false;$('#cancel').disabled=false;save.disabled=false;save.textContent=t('save');}});
async function setFocus(next,{clearFilters=false,scroll=false}={}){focus=next;page=1;if(clearFilters){$('#search').value='';$('#status').value='';$('#initial').value='';clearTimeout(timer);}animateLayoutChange(focusLayoutNodes(),()=>{for(const item of document.querySelectorAll('[data-focus]'))item.setAttribute('aria-pressed',String(item.dataset.focus===focus));languageLayout.reserve($('#focus-bar'));});await refresh({animateLayout:true});if(scroll&&focus===next)smoothScrollTo($('.records'));}
$('#focus-bar').addEventListener('click',event=>{const button=event.target.closest('button[data-focus]');if(button){showSelectionGlow(button,event);setFocus(button.dataset.focus,{clearFilters:true});}});
$('#stats').addEventListener('click',event=>{const button=event.target.closest('button[data-focus]');if(button)setFocus(button.dataset.focus,{clearFilters:true,scroll:true});});
$('#reset-filters').addEventListener('click',()=>{$('#sort').value='date-desc';setFocus('',{clearFilters:true});$('#search').focus();});
$('#retry').addEventListener('click',refresh);
$('#empty-reset').addEventListener('click',()=>$('#reset-filters').click());
$('#keep-editing').addEventListener('click',()=>closeDialog($('#discard-dialog')));
$('#discard-changes').addEventListener('click',async()=>{await closeDialog($('#discard-dialog'));await closeEditor({force:true});});
$('#discard-dialog').addEventListener('cancel',event=>{event.preventDefault();closeDialog(event.currentTarget);});
window.addEventListener('beforeunload',event=>{if($('#editor').open&&formValues()!==formSnapshot){event.preventDefault();event.returnValue='';}});
$('#add').addEventListener('click',event=>show(null,event.currentTarget));$('#close').addEventListener('click',event=>closeEditor());$('#cancel').addEventListener('click',event=>closeEditor());$('#editor').addEventListener('cancel',event=>{event.preventDefault();closeEditor();});const letters='ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');$('#initial').append(...letters.map(letter=>new Option(letter,letter)),new Option(t('otherInitial'),'#'));let timer;$('#search').addEventListener('input',()=>{clearTimeout(timer);page=1;timer=setTimeout(refresh,250);});for(const controlId of ['#status','#initial','#sort','#page-size'])$(controlId).addEventListener('change',()=>{page=1;refresh();});$('#page-prev').addEventListener('click',()=>{if(page>1){page--;refresh({paginate:true});}});$('#page-next').addEventListener('click',()=>{if(!$('#page-next').disabled){page++;refresh({paginate:true});}});$('.language-switch').addEventListener('click',event=>{const button=event.target.closest('button[data-language]');if(button)changeLanguage(button.dataset.language);});window.addEventListener('storage',event=>{if(!embeddedLanguageHost&&event.key==='ul-ui-language'&&supportedLanguages.includes(event.newValue))changeLanguage(event.newValue,{remote:true});});wirePageLink($('#editor-link'));applyLanguage();refresh().finally(notifyPageReady);

bindDialogDismiss($('#editor'),{canDismiss:()=>!savingRecord&&formValues()===formSnapshot,onDismiss:()=>closeEditor()});
bindDialogDismiss($('#discard-dialog'),{onDismiss:()=>closeDialog($('#discard-dialog'))});

function renderTrash(){
 const list=$('#trash-list');list.replaceChildren();
 if(!trashRows.length){list.append(reserveText(el('li','muted',t('trashEmpty')),'trashEmpty'));return;}
 for(const record of trashRows){const item=el('li'),description=el('div');description.append(el('strong','',record.company),el('p','',record.role));const button=reserveText(el('button','subtle',t('restoreRecord')),'restoreRecord');button.type='button';button.addEventListener('click',()=>restoreRecord(record,button));item.append(description,button);list.append(item);}
}
async function restoreRecord(record,button){
 if(!record||button.disabled)return;button.disabled=true;
 try{await api(`/api/applications/${encodeURIComponent(record.id)}/restore`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:record.version})});if(deletedRecord?.id===record.id)deletedRecord=null;trashRows=trashRows.filter(item=>item.id!==record.id);renderTrash();notice(t('restored'),'restored');await refresh();}
 catch(error){$('#trash-error').textContent=error.message;notice(error.message);button.disabled=false;}
}
$('#open-trash').addEventListener('click',async event=>{
 $('#trash-error').textContent='';trashRows=[];$('#trash-list').replaceChildren(el('li','muted',t('load')));openDialog($('#trash-dialog'),event.currentTarget);
 try{trashRows=await api('/api/deleted-applications');if($('#trash-dialog').open){renderTrash();languageLayout.reserve();}}catch(error){$('#trash-error').textContent=error.message;}
});
$('#close-trash').addEventListener('click',()=>closeDialog($('#trash-dialog')));
$('#trash-dialog').addEventListener('cancel',event=>{event.preventDefault();closeDialog(event.currentTarget);});
bindDialogDismiss($('#trash-dialog'),{onDismiss:()=>closeDialog($('#trash-dialog'))});
$('#delete-record').addEventListener('click',event=>{
 if(!selected||savingRecord)return;$('#delete-name').textContent=`${selected.company} · ${selected.role}`;$('#delete-error').textContent='';openDialog($('#delete-dialog'),event.currentTarget);
});
$('#cancel-delete').addEventListener('click',()=>closeDialog($('#delete-dialog')));
$('#delete-dialog').addEventListener('cancel',event=>{event.preventDefault();if(!savingRecord)closeDialog(event.currentTarget);});
bindDialogDismiss($('#delete-dialog'),{canDismiss:()=>!savingRecord,onDismiss:()=>closeDialog($('#delete-dialog'))});
$('#confirm-delete').addEventListener('click',async event=>{
 if(!selected||savingRecord)return;const button=event.currentTarget;savingRecord=true;button.disabled=true;$('#cancel-delete').disabled=true;$('#form-fields').inert=true;
 try{deletedRecord=await api(`/api/applications/${encodeURIComponent(selected.id)}`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:selected.version})});await closeDialog($('#delete-dialog'));await closeEditor({force:true});notice(t('deleted'),'deleted');await refresh();}
 catch(error){$('#delete-error').textContent=error.message;}
 finally{savingRecord=false;button.disabled=false;$('#cancel-delete').disabled=false;$('#form-fields').inert=false;}
});
