import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source=await fs.readFile(new URL('../runtime/shared/controls.js',import.meta.url),'utf8');
class Node {
 constructor(tag,className='',text=''){this.tag=tag;this.className=className;this.textContent=text;this.children=[];this.attributes={};this.dataset={};this.events={};this.disabled=false;this.validity={valid:true};this.classList={add:name=>this.className+=' '+name};}
 append(...children){this.children.push(...children);}
 setAttribute(name,value){this.attributes[name]=value;}
 addEventListener(name,callback){this.events[name]=callback;}
 querySelector(selector){
  const descendants=this.children.flatMap(child=>[child,...child.all()]);
  return descendants.find(child=>selector==='button[tabindex="0"]:not(:disabled)'?child.tag==='button'&&child.tabIndex===0&&!child.disabled:selector==='button:not(:disabled):not(.outside-month)'?child.tag==='button'&&!child.disabled&&!child.className.includes('outside-month'):false);
 }
 all(){return this.children.flatMap(child=>[child,...child.all()]);}
}
function fixture(value='',datetime=true){
 const commits=[],copy={date:'Choose a date',dateTime:'Choose a date and time',previous:'Previous month',next:'Next month',hour:'Hour',minute:'Minute',today:'Today',clear:'Clear',apply:'Apply'};
 let valid=true;
 const native={value,min:'',max:'',required:false,cloneNode:()=>({value:'',get validity(){return {valid};}})};
 const context={Date,Intl,node:(...args)=>new Node(...args),words:()=>copy,locale:()=> 'en-GB',icons:{chevron:'',calendar:''},commit:(state,result)=>{commits.push(result);state.native.value=result;},render:()=>{}};
 vm.createContext(context);
 vm.runInContext(source.slice(source.indexOf('const iso ='),source.indexOf('const rect ='))+'\n'+source.slice(source.indexOf('function renderCalendar('),source.indexOf('function render(state)'))+'\nglobalThis.helpers={dateText,dayUnavailable,datetimeDraft,chooseDate,renderCalendar,syncTime};',context);
 const state={native,datetime,date:true,draftDate:value.slice(0,10),hour:value.slice(11,13)||'00',minute:value.slice(14,16)||'00',month:new Date(2026,9,1),focusDate:value.slice(0,10)};
 return {state,commits,helpers:context.helpers,setValid:value=>valid=value};
}

test('datetime calendar selection stays a draft and commits date and minute together',()=>{
 const f=fixture();let calendar=f.helpers.renderCalendar(f.state);
 f.helpers.syncTime(f.state);assert.equal(f.state.apply.disabled,true);
 calendar.all().find(node=>node.attributes.role==='gridcell'&&node.attributes['aria-label'].startsWith('Saturday, 3 October')).events.click();
 assert.equal(f.state.draftDate,'2026-10-03');assert.equal(f.state.native.value,'');assert.equal(f.commits.length,0);
 calendar=f.helpers.renderCalendar(f.state);
 const [hour,minute]=calendar.all().filter(node=>node.className==='ui-time-input');
 hour.value='22';hour.events.input();minute.value='38';minute.events.input();
 assert.equal(f.state.native.value,'');
 assert.equal(f.helpers.datetimeDraft(f.state),'2026-10-03T22:38');
 f.state.apply.events.click();assert.deepEqual(f.commits,['2026-10-03T22:38']);
});

test('minute fields reject missing or invalid values and retain native range/step validation',()=>{
 const f=fixture('2026-10-03T22:38');
 assert.equal(f.helpers.datetimeDraft(f.state),'2026-10-03T22:38');
 for(const hour of ['','24','-1','1.5']){f.state.hour=hour;assert.equal(f.helpers.datetimeDraft(f.state),'');}
 f.state.hour='00';f.state.minute='59';assert.equal(f.helpers.datetimeDraft(f.state),'2026-10-03T00:59');
 for(const minute of ['','60','-1','1.5']){f.state.minute=minute;assert.equal(f.helpers.datetimeDraft(f.state),'');}
 f.state.minute='00';f.setValid(false);assert.equal(f.helpers.datetimeDraft(f.state),'','native min/max/step rejects the combined local timestamp');
 f.state.native.min='2026-10-03T12:30';f.state.native.max='2026-10-05T18:00';
 assert.equal(f.helpers.dayUnavailable(f.state,'2026-10-03'),false,'the first allowed day is selectable despite a time bound');
 assert.equal(f.helpers.dayUnavailable(f.state,'2026-10-02'),true);
 assert.equal(f.helpers.dayUnavailable(f.state,'2026-10-06'),true);
});

test('plain dates still commit immediately and datetime presentation retains local minutes',()=>{
 const f=fixture('2026-10-03',false);
 f.helpers.chooseDate(f.state,'2026-10-04');assert.deepEqual(f.commits,['2026-10-04']);
 assert.equal(f.helpers.dateText('2026-10-03T22:38',true),'03/10/2026 22:38');
 assert.equal(f.helpers.dateText('2026-03-29T02:30',true),'29/03/2026 02:30','formatting does not silently move a local time through DST');
 assert.equal(f.helpers.dateText('',true),'Choose a date and time');
});

test('datetime fields use the shared dialog control and Tab moves between hour and minute',()=>{
 const body=new Node('body'),closed=[],native={tagName:'INPUT',type:'datetime-local',dataset:{},classList:{add(){}},setAttribute(){},insertAdjacentElement(_,button){this.button=button;},addEventListener(){},closest(){return null;}};
 const document={body,activeElement:null},context={document,node:(...args)=>new Node(...args),adapted:new WeakMap(),states:new Set(),nextId:0,icons:{calendar:'shared-calendar',chevron:'shared-chevron'},dateLabel:()=> 'Choose a date and time',refresh(){},close:()=>closed.push('closed'),open(){}};
 vm.createContext(context);vm.runInContext(source.slice(source.indexOf('function adapt(native)'),source.indexOf('export function installControls()'))+'\nglobalThis.adaptControl=adapt;',context);
 context.adaptControl(native);
 const popup=body.children[0];assert.equal(native.button.attributes['aria-haspopup'],'dialog');assert.equal(native.button.attributes['aria-controls'],popup.id);assert.match(popup.className,/ui-date-popup/);
 const hour=new Node('input'),minute=new Node('input');hour.tabIndex=minute.tabIndex=0;
 hour.focus=()=>document.activeElement=hour;minute.focus=()=>document.activeElement=minute;
 popup.querySelectorAll=()=>[hour,minute];document.activeElement=hour;
 popup.events.keydown({key:'Tab',preventDefault(){}});assert.equal(document.activeElement,minute);assert.equal(closed.length,0);
 popup.events.keydown({key:'Tab',shiftKey:true,preventDefault(){}});assert.equal(document.activeElement,hour);assert.equal(closed.length,0);
});


test('one datetime control retains date-only history without inventing midnight',()=>{
 const f=fixture();f.state.native.dataset={dateOnly:'2026-09-19'};
 f.state.draftDate='2026-09-19';f.state.hour=f.state.minute='';
 assert.equal(f.helpers.datetimeDraft(f.state),'2026-09-19');
 assert.equal(f.helpers.dateText('2026-09-19',true),'19/09/2026');
 let calendar=f.helpers.renderCalendar(f.state);
 const inputs=calendar.all().filter(node=>node.className==='ui-time-input');
 assert.ok(inputs.every(input=>!input.required));
 f.helpers.chooseDate(f.state,'2026-09-20');
 assert.equal(f.helpers.datetimeDraft(f.state),'2026-09-20');
 f.state.hour='22';assert.equal(f.helpers.datetimeDraft(f.state),'','a half-entered time cannot be saved');
 f.state.minute='38';assert.equal(f.helpers.datetimeDraft(f.state),'2026-09-20T22:38');
});

test('unified datetime commits date-only values separately and validates a cleared required date',()=>{
 const context={refresh(){},close(){},Event,words:()=>({dateTime:'Choose a date and time'})};
 vm.createContext(context);
 vm.runInContext(source.slice(source.indexOf('function commit(state,value)'),source.indexOf('function renderSelect(state)'))+'\nglobalThis.commitDate=commit;',context);
 const state={datetime:true,native:{dataset:{dateOnly:'2026-09-19'},value:'',setCustomValidity(value){this.validationMessage=value;},dispatchEvent(){}}};
 context.commitDate(state,'2026-09-20');assert.equal(state.native.value,'');assert.equal(state.native.dataset.dateOnly,'2026-09-20');assert.equal(state.native.validationMessage,'');
 context.commitDate(state,'2026-09-20T22:38');assert.equal(state.native.value,'2026-09-20T22:38');
 context.commitDate(state,'');assert.equal(state.native.dataset.dateOnly,'');assert.equal(state.native.validationMessage,'Choose a date and time');
});
