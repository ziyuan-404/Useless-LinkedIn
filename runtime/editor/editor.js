const messages={
 zh:{editorTitle:'材料编辑器',languageLabel:'界面语言',local:'本机离线',dashboard:'投递看板',libraryIndex:'01 / 材料库',chooseMaterial:'选择材料',libraryIntro:'选择一份已生成的岗位材料，开始调整版面与文字。',project:'岗位目录',kind:'材料类型',loading:'正在读取…',cv:'CV 简历',letter:'动机信',open:'打开材料',howTo:'使用方法',select:'选中',selectTip:'单击页面中的文字、图片或区块',adjust:'调整',adjustTip:'拖动位置与边缘，或输入精确数值',saveVerb:'保存',saveTip:'重建 PDF，同时保留原版本',canvasLabel:'材料画布',canvasIndex:'02 / 画布',notOpened:'尚未打开材料',chooseProjectState:'请选择岗位目录',savePdf:'保存并生成 PDF',generating:'正在生成 PDF…',previewTitle:'A4 材料预览',emptyTitle:'你的材料将在这里显示',emptyBody:'从左侧选一份岗位材料，打开后即可编辑。',propertiesIndex:'03 / 属性',propertiesTitle:'组件属性',selectionPrompt:'单击画布上的文字、图片或区块，查看可调整的属性。',content:'内容',textContent:'文字内容',textHint:'含多层格式的文字可在页面中双击编辑。',replaceImage:'更换图片',positionSize:'位置与尺寸',offsetX:'水平偏移',offsetY:'垂直偏移',width:'宽度',height:'高度',appearance:'外观',fontSize:'字号',opacity:'透明度',textColor:'文字颜色',backgroundColor:'背景颜色',bringFront:'置于顶层',resetSize:'重置位置和尺寸',saveNote:'保存时会保留旧版。修改文字后，请核对事实与整页版面，再用于投递。',unsavedTitle:'有未保存的修改',unsavedBody:'打开其他材料后，当前修改将丢失。你可以返回画布，先保存这份材料。',returnEditing:'返回编辑',discardOpen:'放弃修改并打开',requestFailed:'请求失败',unsavedState:'有未保存修改 · 完成后请保存',readingLibrary:'正在读取材料库…',chooseProject:'选择岗位目录',noMaterials:'尚无已生成材料',readyToOpen:'选择岗位目录和材料类型后，点击打开',noMaterialsState:'尚无材料，请先生成一份岗位简历或动机信。',retryLibrary:'重试读取材料库',readFailed:'读取失败：{error}',propertyFailed:'调整失败：{error}',selected:'已选中{type}{detail}',image:'图片',separator:'分隔线',text:'文字',block:'区块',opening:'正在打开材料…',openFailed:'打开失败：{error}。请重试。',openTimeout:'材料未能完成加载，请重新打开。',opened:'材料已打开 · 单击选中组件，双击编辑文字',imageTooLarge:'图片不能超过 1 MB，请选择较小的图片。',imageReadFailed:'图片读取失败，请重新选择。',saving:'正在保存并生成 PDF，请稍候…',saved:'PDF 已保存，旧版已保留。请核对整页预览。',saveFailed:'保存失败：{error}。修改仍保留在画布上，可以调整后重试。',nestedTextError:'请直接在页面中编辑多层格式文字',selectImageError:'请选择图片文件',unknownPropertyError:'未知属性',invalidProjectError:'无效的岗位目录',invalidKindError:'无效的材料类型',notFoundError:'找不到材料',tooLargeError:'材料文件过大',invalidHtmlError:'编辑后的 HTML 无效',pdfMissingError:'找不到原 PDF',overflowError:'页面内容超出边界，请调整版面后再保存',localOnlyError:'仅限本机访问',originError:'访问来源无效',jsonRequiredError:'需要 JSON 数据'},
 en:{editorTitle:'Material editor',languageLabel:'Interface language',local:'Local and offline',dashboard:'Application dashboard',libraryIndex:'01 / Library',chooseMaterial:'Choose a document',libraryIntro:'Choose a generated document to adjust its layout and text.',project:'Job folder',kind:'Document type',loading:'Loading…',cv:'CV / résumé',letter:'Cover letter',open:'Open document',howTo:'How it works',select:'Select',selectTip:'Click text, an image, or a block on the page',adjust:'Adjust',adjustTip:'Drag the item or its edges, or enter exact values',saveVerb:'Save',saveTip:'Rebuild the PDF and keep the previous version',canvasLabel:'Document canvas',canvasIndex:'02 / Canvas',notOpened:'No document open',chooseProjectState:'Choose a job folder',savePdf:'Save and generate PDF',generating:'Generating PDF…',previewTitle:'A4 document preview',emptyTitle:'Your document will appear here',emptyBody:'Choose a job document on the left, then open it to edit.',propertiesIndex:'03 / Properties',propertiesTitle:'Item properties',selectionPrompt:'Select an item on the canvas to adjust its content and style.',content:'Content',textContent:'Text content',textHint:'Double-click on the page to edit text with nested formatting.',replaceImage:'Replace image',positionSize:'Position and size',offsetX:'Horizontal offset',offsetY:'Vertical offset',width:'Width',height:'Height',appearance:'Appearance',fontSize:'Font size',opacity:'Opacity',textColor:'Text color',backgroundColor:'Background color',bringFront:'Bring to front',resetSize:'Reset position and size',saveNote:'Previous versions are kept when you save. After editing text, check the facts and full-page layout before applying.',unsavedTitle:'Unsaved changes',unsavedBody:'Opening another document will discard your current changes. You can return to the canvas and save this document first.',returnEditing:'Keep editing',discardOpen:'Discard and open',requestFailed:'Request failed',unsavedState:'Unsaved changes · Save when finished',readingLibrary:'Loading document library…',chooseProject:'Choose a job folder',noMaterials:'No generated documents yet',readyToOpen:'Choose a job folder and document type, then open it',noMaterialsState:'No documents yet. Generate a CV or cover letter first.',retryLibrary:'Retry loading library',readFailed:'Could not load library: {error}',selected:'Selected: {type}{detail}',image:'image',separator:'divider',text:'text',block:'block',opening:'Opening document…',openFailed:'Could not open document: {error}. Please try again.',openTimeout:'The document did not finish loading. Please reopen it.',opened:'Document open · Click to select an item, double-click to edit text',imageTooLarge:'Image must be under 1 MB. Choose a smaller image.',imageReadFailed:'Could not read image. Please choose it again.',saving:'Saving and generating PDF…',saved:'PDF saved; the previous version was kept. Check the full-page preview.',saveFailed:'Save failed: {error}. Your changes remain on the canvas; adjust them and retry.',nestedTextError:'Edit nested text directly on the page',selectImageError:'Choose an image file',unknownPropertyError:'Unknown property',invalidProjectError:'Invalid job folder',invalidKindError:'Invalid document type',notFoundError:'Document not found',tooLargeError:'Document too large',invalidHtmlError:'Invalid edited HTML',pdfMissingError:'Original PDF not found',overflowError:'Page content overflows. Adjust the layout before saving.'},
 fr:{editorTitle:'Éditeur de documents',languageLabel:'Langue de l’interface',local:'En local, hors ligne',dashboard:'Tableau des candidatures',libraryIndex:'01 / Bibliothèque',chooseMaterial:'Choisir un document',libraryIntro:'Choisissez un document déjà généré pour ajuster sa mise en page et son texte.',project:'Dossier de candidature',kind:'Type de document',loading:'Chargement…',cv:'CV',letter:'Lettre de motivation',open:'Ouvrir le document',howTo:'Mode d’emploi',select:'Sélectionner',selectTip:'Cliquez sur un texte, une image ou un bloc dans la page',adjust:'Ajuster',adjustTip:'Déplacez l’élément ou ses bords, ou saisissez des valeurs précises',saveVerb:'Enregistrer',saveTip:'Recréez le PDF tout en conservant la version précédente',canvasLabel:'Zone de travail du document',canvasIndex:'02 / Zone de travail',notOpened:'Aucun document ouvert',chooseProjectState:'Choisissez un dossier de candidature',savePdf:'Enregistrer et générer le PDF',generating:'Génération du PDF…',previewTitle:'Aperçu du document A4',emptyTitle:'Votre document apparaîtra ici',emptyBody:'Choisissez un document à gauche, puis ouvrez-le pour le modifier.',propertiesIndex:'03 / Propriétés',propertiesTitle:'Propriétés de l’élément',selectionPrompt:'Sélectionnez un élément pour ajuster son contenu et son style.',content:'Contenu',textContent:'Contenu du texte',textHint:'Double-cliquez dans la page pour modifier un texte à plusieurs niveaux de formatage.',replaceImage:'Remplacer l’image',positionSize:'Position et dimensions',offsetX:'Décalage horizontal',offsetY:'Décalage vertical',width:'Largeur',height:'Hauteur',appearance:'Apparence',fontSize:'Taille du texte',opacity:'Opacité',textColor:'Couleur du texte',backgroundColor:'Couleur de fond',bringFront:'Mettre au premier plan',resetSize:'Réinitialiser position et dimensions',saveNote:'Les anciennes versions sont conservées. Après avoir modifié le texte, vérifiez les faits et la mise en page complète avant de postuler.',unsavedTitle:'Modifications non enregistrées',unsavedBody:'L’ouverture d’un autre document effacera vos modifications en cours. Vous pouvez revenir à la zone de travail pour enregistrer d’abord ce document.',returnEditing:'Continuer la modification',discardOpen:'Ignorer et ouvrir',requestFailed:'Échec de la requête',unsavedState:'Modifications non enregistrées · Pensez à enregistrer',readingLibrary:'Chargement de la bibliothèque…',chooseProject:'Choisir un dossier de candidature',noMaterials:'Aucun document généré',readyToOpen:'Choisissez un dossier et un type de document, puis ouvrez-le',noMaterialsState:'Aucun document disponible. Générez d’abord un CV ou une lettre de motivation.',retryLibrary:'Réessayer le chargement',readFailed:'Chargement impossible : {error}',selected:'Élément sélectionné : {type}{detail}',image:'image',separator:'séparateur',text:'texte',block:'bloc',opening:'Ouverture du document…',openFailed:'Ouverture impossible : {error}. Réessayez.',openTimeout:'Le chargement du document ne s’est pas terminé. Rouvrez-le.',opened:'Document ouvert · Cliquez pour sélectionner, double-cliquez pour modifier le texte',imageTooLarge:'L’image doit peser moins de 1 Mo. Choisissez un fichier plus léger.',imageReadFailed:'Lecture de l’image impossible. Choisissez-la de nouveau.',saving:'Enregistrement et génération du PDF…',saved:'PDF enregistré ; l’ancienne version est conservée. Vérifiez l’aperçu complet.',saveFailed:'Enregistrement impossible : {error}. Vos modifications restent sur la page ; ajustez-les et réessayez.',nestedTextError:'Modifiez le texte à plusieurs niveaux directement dans la page',selectImageError:'Choisissez un fichier image',unknownPropertyError:'Propriété inconnue',invalidProjectError:'Dossier de candidature non valide',invalidKindError:'Type de document non valide',notFoundError:'Document introuvable',tooLargeError:'Document trop volumineux',invalidHtmlError:'Code HTML modifié non valide',pdfMissingError:'PDF d’origine introuvable',overflowError:'Le contenu dépasse la page. Ajustez la mise en page avant d’enregistrer.'}
};
Object.assign(messages.en,{propertyFailed:'Could not update item: {error}',localOnlyError:'Local access only',originError:'Invalid origin',jsonRequiredError:'JSON required'});
Object.assign(messages.fr,{propertyFailed:'Modification impossible : {error}',localOnlyError:'Accès local uniquement',originError:'Origine non autorisée',jsonRequiredError:'Données JSON requises'});
const $=selector=>document.querySelector(selector);
const project=$('#project'),kind=$('#kind'),frame=$('#canvas'),surface=$('#canvas-surface'),wrap=$('.canvas-wrap'),state=$('#state'),name=$('#document-name'),save=$('#save'),fields=$('#fields'),openButton=$('#open');
const languages=['zh','en','fr'];
const errorKeys={'Edit nested text directly on the page':'nestedTextError','Select an image file':'selectImageError','Unknown property':'unknownPropertyError','Invalid project':'invalidProjectError','Invalid document type':'invalidKindError','Document not found':'notFoundError','Document too large':'tooLargeError','Invalid edited HTML':'invalidHtmlError','Original PDF not found':'pdfMissingError','Page content overflows; adjust the layout before saving':'overflowError','Local access only':'localOnlyError','Invalid origin':'originError','JSON required':'jsonRequiredError'};
const storedLanguage=()=>{try{return localStorage.getItem('ul-ui-language');}catch{return null;}};
const queryLanguage=new URLSearchParams(location.search).get('lang');
let language=languages.includes(queryLanguage)?queryLanguage:languages.includes(storedLanguage())?storedLanguage():'zh';
let active=null,activeLabel='',dirty=false,selected=null,loading=false,saving=false,libraryFailed=false,libraryLoaded=false,libraryRows=[],loadTimer;
let stateMessage={key:'chooseProjectState',params:{},isError:false};
const propertyKeys=['x','y','width','height','fontSize','opacity','color','backgroundColor'];
const t=(key,params={})=>(messages[language][key]??messages.zh[key]??key).replace(/\{(\w+)\}/g,(_,name)=>params[name]??'');
function renderState(){const params={...stateMessage.params};if(params.error&&errorKeys[params.error])params.error=t(errorKeys[params.error]);state.textContent=t(stateMessage.key,params);state.dataset.error=String(stateMessage.isError);}
function setState(key,params={},isError=false){stateMessage={key,params,isError};renderState();}
function renderSelection(){const type=selected?.image?'image':selected?.tag==='hr'?'separator':selected?.text!==null?'text':'block';const detail=selected?.text?.trim().slice(0,32);$('#selection').textContent=selected?t('selected',{type:t(type),detail:detail?' · '+detail:''}):t('selectionPrompt');}
function renderLanguage(){
 document.documentElement.lang={zh:'zh-CN',en:'en',fr:'fr'}[language];document.title=`${t('editorTitle')} · Useless LinkedIn`;
 document.querySelectorAll('[data-i18n]').forEach(el=>el.textContent=t(el.dataset.i18n));
 document.querySelectorAll('[data-i18n-aria-label]').forEach(el=>el.setAttribute('aria-label',t(el.dataset.i18nAriaLabel)));
 document.querySelectorAll('[data-i18n-title]').forEach(el=>el.title=t(el.dataset.i18nTitle));
 document.querySelectorAll('.language-switch button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.lang===language)));
 if(project.options[0]?.value==='')project.options[0].textContent=t(!libraryLoaded?'loading':libraryRows.length?'chooseProject':'noMaterials');
 $('#open-label').textContent=t(libraryFailed?'retryLibrary':'open');
 name.textContent=active?`${activeLabel} · ${t(active.kind)}`:t('notOpened');name.title=active?name.textContent:'';
 const dashboardUrl=new URL($('#dashboard-link').href);dashboardUrl.searchParams.set('lang',language);$('#dashboard-link').href=dashboardUrl.href;
 renderState();renderSelection();updateControls();
}
function syncLanguageUrl(){const url=new URL(location.href);url.searchParams.set('lang',language);history.replaceState(history.state,'',url);}
function setLanguage(next){if(!languages.includes(next)||next===language)return;language=next;try{localStorage.setItem('ul-ui-language',next);}catch{}syncLanguageUrl();renderLanguage();}
if(languages.includes(queryLanguage)){try{localStorage.setItem('ul-ui-language',language);}catch{}}
document.querySelectorAll('.language-switch button').forEach(button=>button.addEventListener('click',()=>setLanguage(button.dataset.lang)));
window.addEventListener('storage',event=>{if(event.key==='ul-ui-language'&&languages.includes(event.newValue)&&event.newValue!==language){language=event.newValue;syncLanguageUrl();renderLanguage();}});
async function api(url,options){const res=await fetch(url,options);const data=await res.json();if(!res.ok)throw Error(data.error||'Request failed');return data;}
function updateControls(){project.disabled=loading||saving;kind.disabled=loading||saving||!project.value;openButton.disabled=loading||saving||(!libraryFailed&&!project.value);save.disabled=loading||saving||!dirty;fields.inert=saving;surface.inert=saving;save.textContent=t(saving?'generating':'savePdf');}
function markDirty(){if(loading||saving)return;dirty=true;updateControls();setState('unsavedState');}
async function refresh(){
 libraryFailed=false;loading=true;updateControls();setState('readingLibrary');
 try{const rows=await api('/api/projects');libraryRows=rows;libraryLoaded=true;project.replaceChildren(new Option(t(rows.length?'chooseProject':'noMaterials'),''));for(const row of rows)project.add(new Option(row.label||row.id,row.id));project.dataset.rows=JSON.stringify(rows);$('#open-label').textContent=t('open');setState(rows.length?'readyToOpen':'noMaterialsState');}
 catch(e){libraryFailed=true;$('#open-label').textContent=t('retryLibrary');setState('readFailed',{error:e.message},true);}
 finally{loading=false;options();}
}
function fitCanvas(){const scale=Math.min(1,Math.max(.1,(wrap.clientWidth-32)/794));surface.style.width=`${Math.round(794*scale)}px`;surface.style.height=`${Math.round(1123*scale)}px`;frame.style.transform=`scale(${scale})`;}
new ResizeObserver(fitCanvas).observe(wrap);
function options(){const row=JSON.parse(project.dataset.rows||'[]').find(x=>x.id===project.value);kind.querySelectorAll('option').forEach(o=>o.disabled=!row?.kinds.includes(o.value));if(row&&!row.kinds.includes(kind.value))kind.value=row.kinds[0];updateControls();}
function applyProperty(key,value){if(saving||loading)return;try{frame.contentWindow.editorApi.set(key,value);if(selected)markDirty();}catch(e){setState('propertyFailed',{error:e.message},true);}}
function show(details){
 selected=details;fields.hidden=!details;
 renderSelection();
 if(!details)return;
 for(const key of propertyKeys)$('#'+key).value=details[key];
 if(document.activeElement!==$('#text'))$('#text').value=details.text??'';$('#text').disabled=details.text===null;$('#text-hint').hidden=details.text!==null;$('#image-row').hidden=!details.image;
}
async function openMaterial(){
 if(!project.value||loading||saving)return;
 const next={project:project.value,kind:kind.value};
 loading=true;updateControls();setState('opening');
 const url=`/document/${encodeURIComponent(next.project)}/${next.kind}`;
 try{
  const response=await fetch(url);
  if(!response.ok){const error=await response.json();throw Error(error.error||'Document not found');}
  await response.text();
  active=next;activeLabel=project.selectedOptions[0].textContent;dirty=false;show(null);
  name.textContent=`${activeLabel} · ${t(active.kind)}`;name.title=name.textContent;
  frame.src=url;surface.hidden=false;frame.hidden=false;fitCanvas();$('#empty').hidden=true;
  clearTimeout(loadTimer);loadTimer=setTimeout(()=>{loading=false;updateControls();setState('openTimeout',{},true);},15000);
 }catch(e){loading=false;updateControls();setState('openFailed',{error:e.message},true);}
}
project.addEventListener('change',options);
openButton.addEventListener('click',()=>{if(libraryFailed){refresh();return;}if(dirty){$('#switch-dialog').showModal();return;}openMaterial();});
$('#keep-editing').addEventListener('click',()=>$('#switch-dialog').close());
$('#discard-open').addEventListener('click',()=>{$('#switch-dialog').close();openMaterial();});
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
window.addEventListener('message',event=>{
 if(event.origin!==location.origin||event.source!==frame.contentWindow||event.data?.source!=='useless-linkedin-editor')return;
 if(event.data.type==='ready'){clearTimeout(loadTimer);loading=false;updateControls();setState('opened');}
 else if(event.data.type==='selection')show(event.data.details);
 else if(event.data.type==='dirty')markDirty();
});
for(const key of propertyKeys)$('#'+key).addEventListener('change',event=>applyProperty(key,event.target.value));
$('#text').addEventListener('input',event=>applyProperty('text',event.target.value));
$('#front').addEventListener('click',()=>applyProperty('front',true));
$('#reset').addEventListener('click',()=>applyProperty('reset',true));
$('#image').addEventListener('change',event=>{
 const file=event.target.files[0];if(!file)return;
 if(file.size>1000000){setState('imageTooLarge',{},true);return;}
 const reader=new FileReader();reader.onload=()=>applyProperty('image',reader.result);reader.onerror=()=>setState('imageReadFailed',{},true);reader.readAsDataURL(file);
});
save.addEventListener('click',async()=>{
 if(!active||!dirty||saving||loading)return;
 saving=true;updateControls();setState('saving');
 try{const html=frame.contentWindow.editorApi.serialize();await api('/api/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...active,html})});dirty=false;setState('saved');}
 catch(e){setState('saveFailed',{error:e.message},true);}
 finally{saving=false;updateControls();}
});
renderLanguage();refresh();
