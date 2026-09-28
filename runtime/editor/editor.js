const $=selector=>document.querySelector(selector);
const project=$('#project'),kind=$('#kind'),frame=$('#canvas'),surface=$('#canvas-surface'),wrap=$('.canvas-wrap'),state=$('#state'),name=$('#document-name'),save=$('#save'),fields=$('#fields');
let active=null,dirty=false,selected=null;
async function api(url,options){const res=await fetch(url,options);const data=await res.json();if(!res.ok)throw Error(data.error||'请求失败');return data;}
function setState(message,isError=false){state.textContent=message;state.style.color=isError?'#b3423e':'';}
function markDirty(){dirty=true;save.disabled=false;setState('有未保存修改');}
async function refresh(){const rows=await api('/api/projects');project.replaceChildren(new Option(rows.length?'选择岗位目录':'尚无已生成材料',''));for(const row of rows)project.add(new Option(row.label||row.id,row.id));project.dataset.rows=JSON.stringify(rows);}
function fitCanvas(){const scale=Math.min(1,Math.max(.4,(wrap.clientWidth-56)/794));surface.style.width=`${Math.round(794*scale)}px`;surface.style.height=`${Math.round(1123*scale)}px`;frame.style.transform=`scale(${scale})`;}
new ResizeObserver(fitCanvas).observe(wrap);
function options(){const row=JSON.parse(project.dataset.rows||'[]').find(x=>x.id===project.value);kind.querySelectorAll('option').forEach(o=>o.disabled=!row?.kinds.includes(o.value));if(row&&!row.kinds.includes(kind.value))kind.value=row.kinds[0];}
function applyProperty(key,value){try{frame.contentWindow.editorApi.set(key,value);}catch(e){setState(e.message,true);}}
function show(details){selected=details;fields.hidden=!details;$('#selection').textContent=details?`${details.tag}${details.classes?' · '+details.classes:''}`:'单击页面中的文字、图片或区块。';if(!details)return;for(const key of ['x','y','width','height','fontSize','opacity','color','backgroundColor'])$('#'+key).value=details[key];$('#text').value=details.text??'';$('#text').disabled=details.text===null;$('#text-hint').hidden=details.text!==null;$('#image-row').hidden=!details.image;}
project.addEventListener('change',options);
$('#open').addEventListener('click',()=>{if(!project.value){setState('请选择岗位目录',true);return;}if(dirty&&!confirm('当前修改未保存。确定打开其他材料吗？'))return;active={project:project.value,kind:kind.value};name.textContent=`${project.selectedOptions[0].textContent} · ${active.kind==='cv'?'CV 简历':'动机信'}`;frame.src=`/document/${encodeURIComponent(active.project)}/${active.kind}`;surface.hidden=false;frame.hidden=false;fitCanvas();$('#empty').hidden=true;fields.hidden=true;dirty=false;save.disabled=true;setState('正在打开…');});
window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==frame.contentWindow||event.data?.source!=='useless-linkedin-editor')return;if(event.data.type==='ready')setState('单击组件后即可修改');else if(event.data.type==='selection')show(event.data.details);else if(event.data.type==='dirty')markDirty();});
for(const key of ['x','y','width','height','fontSize','opacity','color','backgroundColor'])$('#'+key).addEventListener('change',event=>applyProperty(key,event.target.value));
$('#text').addEventListener('change',event=>applyProperty('text',event.target.value));
$('#front').addEventListener('click',()=>applyProperty('front',true));$('#reset').addEventListener('click',()=>applyProperty('reset',true));
$('#image').addEventListener('change',async event=>{const file=event.target.files[0];if(!file)return;if(file.size>1000000){setState('图片不能超过 1 MB',true);return;}const reader=new FileReader();reader.onload=()=>applyProperty('image',reader.result);reader.readAsDataURL(file);});
save.addEventListener('click',async()=>{if(!active||!dirty)return;save.disabled=true;setState('正在保存并生成 PDF…');try{const html=frame.contentWindow.editorApi.serialize();const result=await api('/api/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...active,html})});dirty=false;setState(`已保存 PDF：${result.pdf}；请核对页面预览。历史版本已保留。`);}catch(e){setState(e.message,true);save.disabled=false;}});
refresh().catch(e=>setState(e.message,true));
