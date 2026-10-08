import {motion} from '/motion-tokens.js';
import {initMotion,openDialog,closeDialog,bindDialogDismiss,revealSurface,wirePageLink,notifyPageReady} from '/motion.js';
import {installLanguageLayout,changeLabels} from '/language-layout.js';
import {celebrateSave,refreshControls} from '/controls.js';
const motionReady=initMotion();
const messages={
 zh:{cancelChanges:'取消',editorTitle:'材料编辑器',languageLabel:'界面语言',local:'仅在本机运行',dashboard:'投递看板',libraryIndex:'01 / 材料库',chooseMaterial:'选择材料',libraryIntro:'选择一份已生成的岗位材料，开始调整版面与文字。',project:'岗位目录',kind:'材料类型',loading:'正在读取…',cv:'CV 简历',letter:'动机信',open:'打开材料',howTo:'使用方法',select:'选中',selectTip:'单击页面中的文字、图片或区块',adjust:'调整',adjustTip:'拖动组件移动，从四角调整尺寸，或输入精确数值',saveVerb:'保存',saveTip:'重建 PDF，同时保留原版本',canvasLabel:'材料画布',canvasIndex:'02 / 画布',notOpened:'尚未打开材料',chooseProjectState:'请选择岗位目录',savePdf:'保存并生成 PDF',generating:'正在生成 PDF…',previewTitle:'A4 材料预览',emptyTitle:'你的材料将在这里显示',emptyBody:'从左侧选一份岗位材料，打开后即可编辑。',propertiesIndex:'03 / 属性',propertiesTitle:'组件属性',selectionPrompt:'单击画布上的文字、图片或区块，查看可调整的属性。',content:'内容',textContent:'文字内容',textHint:'含多层格式的文字可在页面中双击编辑。',replaceImage:'更换图片',positionSize:'位置与尺寸',offsetX:'水平偏移',offsetY:'垂直偏移',width:'宽度',height:'高度',appearance:'外观',fontSize:'字号',opacity:'透明度',textColor:'文字颜色',backgroundColor:'背景颜色',bringFront:'置于顶层',resetSize:'重置位置和尺寸',saveNote:'保存时会保留旧版。修改文字后，请核对事实与整页版面，再用于投递。',unsavedTitle:'有未保存的修改',unsavedBody:'打开其他材料后，当前修改将丢失。你可以返回画布，先保存这份材料。',returnEditing:'返回编辑',discardOpen:'放弃修改并打开',requestFailed:'请求失败',unsavedState:'有未保存修改 · 完成后请保存',readingLibrary:'正在读取材料库…',chooseProject:'选择岗位目录',noMaterials:'尚无已生成材料',readyToOpen:'选择岗位目录和材料类型后，点击打开',noMaterialsState:'尚无材料，请先生成一份岗位简历或动机信。',retryLibrary:'重试读取材料库',readFailed:'读取失败：{error}',propertyFailed:'调整失败：{error}',selected:'已选中{type}{detail}',image:'图片',separator:'分隔线',text:'文字',block:'区块',opening:'正在打开材料…',openFailed:'打开失败：{error}。请重试。',openTimeout:'材料未能完成加载，请重新打开。',opened:'材料已打开 · 单击选中组件，双击编辑文字',imageTooLarge:'图片不能超过 1 MB，请选择较小的图片。',imageReadFailed:'图片读取失败，请重新选择。',saving:'正在保存并生成 PDF，请稍候…',saved:'PDF 已保存，旧版已保留。请核对整页预览。保存位置：{path}',saveFailed:'保存失败：{error}。修改仍保留在画布上，可以调整后重试。',nestedTextError:'请直接在页面中编辑多层格式文字',selectImageError:'请选择图片文件',unknownPropertyError:'未知属性',invalidProjectError:'无效的岗位目录',invalidKindError:'无效的材料类型',notFoundError:'找不到材料',tooLargeError:'材料文件过大',invalidHtmlError:'编辑后的 HTML 无效',pdfMissingError:'找不到原 PDF',overflowError:'页面内容超出边界，请调整版面后再保存',localOnlyError:'仅限本机访问',originError:'访问来源无效',jsonRequiredError:'需要 JSON 数据'},
 en:{cancelChanges:'Cancel',editorTitle:'Material editor',languageLabel:'Interface language',local:'Local and offline',dashboard:'Application dashboard',libraryIndex:'01 / Library',chooseMaterial:'Choose a document',libraryIntro:'Choose a generated document to adjust its layout and text.',project:'Job folder',kind:'Document type',loading:'Loading…',cv:'CV / résumé',letter:'Cover letter',open:'Open document',howTo:'How it works',select:'Select',selectTip:'Click text, an image, or a block on the page',adjust:'Adjust',adjustTip:'Drag to move, resize from corners, or enter precise values',saveVerb:'Save',saveTip:'Rebuild the PDF and keep the previous version',canvasLabel:'Document canvas',canvasIndex:'02 / Canvas',notOpened:'No document open',chooseProjectState:'Choose a job folder',savePdf:'Save and generate PDF',generating:'Generating PDF…',previewTitle:'A4 document preview',emptyTitle:'Your document will appear here',emptyBody:'Choose a job document on the left, then open it to edit.',propertiesIndex:'03 / Properties',propertiesTitle:'Item properties',selectionPrompt:'Select an item on the canvas to adjust its content and style.',content:'Content',textContent:'Text content',textHint:'Double-click on the page to edit text with nested formatting.',replaceImage:'Replace image',positionSize:'Position and size',offsetX:'Horizontal offset',offsetY:'Vertical offset',width:'Width',height:'Height',appearance:'Appearance',fontSize:'Font size',opacity:'Opacity',textColor:'Text color',backgroundColor:'Background color',bringFront:'Bring to front',resetSize:'Reset position and size',saveNote:'Previous versions are kept when you save. After editing text, check the facts and full-page layout before applying.',unsavedTitle:'Unsaved changes',unsavedBody:'Opening another document will discard your current changes. You can return to the canvas and save this document first.',returnEditing:'Keep editing',discardOpen:'Discard and open',requestFailed:'Request failed',unsavedState:'Unsaved changes · Save when finished',readingLibrary:'Loading document library…',chooseProject:'Choose a job folder',noMaterials:'No generated documents yet',readyToOpen:'Choose a job folder and document type, then open it',noMaterialsState:'No documents yet. Generate a CV or cover letter first.',retryLibrary:'Retry loading library',readFailed:'Could not load library: {error}',selected:'Selected: {type}{detail}',image:'image',separator:'divider',text:'text',block:'block',opening:'Opening document…',openFailed:'Could not open document: {error}. Please try again.',openTimeout:'The document did not finish loading. Please reopen it.',opened:'Document open · Click to select an item, double-click to edit text',imageTooLarge:'Image must be under 1 MB. Choose a smaller image.',imageReadFailed:'Could not read image. Please choose it again.',saving:'Saving and generating PDF…',saved:'PDF saved; the previous version was kept. Check the full-page preview. Saved to: {path}',saveFailed:'Save failed: {error}. Your changes remain on the canvas; adjust them and retry.',nestedTextError:'Edit nested text directly on the page',selectImageError:'Choose an image file',unknownPropertyError:'Unknown property',invalidProjectError:'Invalid job folder',invalidKindError:'Invalid document type',notFoundError:'Document not found',tooLargeError:'Document too large',invalidHtmlError:'Invalid edited HTML',pdfMissingError:'Original PDF not found',overflowError:'Page content overflows. Adjust the layout before saving.'},
 fr:{cancelChanges:'Annuler',editorTitle:'Éditeur de documents',languageLabel:'Langue de l’interface',local:'En local, hors ligne',dashboard:'Tableau des candidatures',libraryIndex:'01 / Bibliothèque',chooseMaterial:'Choisir un document',libraryIntro:'Choisissez un document déjà généré pour ajuster sa mise en page et son texte.',project:'Dossier de candidature',kind:'Type de document',loading:'Chargement…',cv:'CV',letter:'Lettre de motivation',open:'Ouvrir le document',howTo:'Mode d’emploi',select:'Sélectionner',selectTip:'Cliquez sur un texte, une image ou un bloc dans la page',adjust:'Ajuster',adjustTip:'Déplacez l’élément, redimensionnez depuis les coins ou saisissez des valeurs précises',saveVerb:'Enregistrer',saveTip:'Recréez le PDF tout en conservant la version précédente',canvasLabel:'Zone de travail du document',canvasIndex:'02 / Zone de travail',notOpened:'Aucun document ouvert',chooseProjectState:'Choisissez un dossier de candidature',savePdf:'Enregistrer et générer le PDF',generating:'Génération du PDF…',previewTitle:'Aperçu du document A4',emptyTitle:'Votre document apparaîtra ici',emptyBody:'Choisissez un document à gauche, puis ouvrez-le pour le modifier.',propertiesIndex:'03 / Propriétés',propertiesTitle:'Propriétés de l’élément',selectionPrompt:'Sélectionnez un élément pour ajuster son contenu et son style.',content:'Contenu',textContent:'Contenu du texte',textHint:'Double-cliquez dans la page pour modifier un texte à plusieurs niveaux de formatage.',replaceImage:'Remplacer l’image',positionSize:'Position et dimensions',offsetX:'Décalage horizontal',offsetY:'Décalage vertical',width:'Largeur',height:'Hauteur',appearance:'Apparence',fontSize:'Taille du texte',opacity:'Opacité',textColor:'Couleur du texte',backgroundColor:'Couleur de fond',bringFront:'Mettre au premier plan',resetSize:'Réinitialiser position et dimensions',saveNote:'Les anciennes versions sont conservées. Après avoir modifié le texte, vérifiez les faits et la mise en page complète avant de postuler.',unsavedTitle:'Modifications non enregistrées',unsavedBody:'L’ouverture d’un autre document effacera vos modifications en cours. Vous pouvez revenir à la zone de travail pour enregistrer d’abord ce document.',returnEditing:'Continuer la modification',discardOpen:'Ignorer et ouvrir',requestFailed:'Échec de la requête',unsavedState:'Modifications non enregistrées · Pensez à enregistrer',readingLibrary:'Chargement de la bibliothèque…',chooseProject:'Choisir un dossier de candidature',noMaterials:'Aucun document généré',readyToOpen:'Choisissez un dossier et un type de document, puis ouvrez-le',noMaterialsState:'Aucun document disponible. Générez d’abord un CV ou une lettre de motivation.',retryLibrary:'Réessayer le chargement',readFailed:'Chargement impossible : {error}',selected:'Élément sélectionné : {type}{detail}',image:'image',separator:'séparateur',text:'texte',block:'bloc',opening:'Ouverture du document…',openFailed:'Ouverture impossible : {error}. Réessayez.',openTimeout:'Le chargement du document ne s’est pas terminé. Rouvrez-le.',opened:'Document ouvert · Cliquez pour sélectionner, double-cliquez pour modifier le texte',imageTooLarge:'L’image doit peser moins de 1 Mo. Choisissez un fichier plus léger.',imageReadFailed:'Lecture de l’image impossible. Choisissez-la de nouveau.',saving:'Enregistrement et génération du PDF…',saved:'PDF enregistré ; l’ancienne version est conservée. Vérifiez l’aperçu complet. Fichier : {path}',saveFailed:'Enregistrement impossible : {error}. Vos modifications restent sur la page ; ajustez-les et réessayez.',nestedTextError:'Modifiez le texte à plusieurs niveaux directement dans la page',selectImageError:'Choisissez un fichier image',unknownPropertyError:'Propriété inconnue',invalidProjectError:'Dossier de candidature non valide',invalidKindError:'Type de document non valide',notFoundError:'Document introuvable',tooLargeError:'Document trop volumineux',invalidHtmlError:'Code HTML modifié non valide',pdfMissingError:'PDF d’origine introuvable',overflowError:'Le contenu dépasse la page. Ajustez la mise en page avant d’enregistrer.'}
};
Object.assign(messages.en,{propertyFailed:'Could not update item: {error}',localOnlyError:'Local access only',originError:'Invalid origin',jsonRequiredError:'JSON required'});
Object.assign(messages.fr,{propertyFailed:'Modification impossible : {error}',localOnlyError:'Accès local uniquement',originError:'Origine non autorisée',jsonRequiredError:'Données JSON requises'});
Object.assign(messages.zh,{navDashboard:'投递看板',navEditor:'材料编辑器'});
Object.assign(messages.en,{navDashboard:'Dashboard',navEditor:'Document editor'});
Object.assign(messages.fr,{navDashboard:'Candidatures',navEditor:'Documents'});
Object.assign(messages.zh,{navigationRetained:'修改会保留在编辑器中，返回后可以继续编辑。关闭或刷新窗口前，请先保存。',navigationDiscarded:'离开此页面会丢失当前未保存的修改。请先保存，或选择放弃修改后切换。',keepAndNavigate:'保留修改并切换',discardAndNavigate:'放弃修改并切换',saveAndNavigate:'保存后切换'});
Object.assign(messages.en,{navigationRetained:'Your changes stay in the editor, ready to continue when you return. Save before closing or refreshing the window.',navigationDiscarded:'Leaving this page will discard your unsaved changes. Save first, or discard them to switch.',keepAndNavigate:'Keep changes and switch',discardAndNavigate:'Discard changes and switch',saveAndNavigate:'Save and switch'});
Object.assign(messages.fr,{navigationRetained:'Vos modifications restent dans l’éditeur : vous pourrez les reprendre à votre retour. Enregistrez avant de fermer ou d’actualiser la fenêtre.',navigationDiscarded:'Quitter cette page effacera vos modifications non enregistrées. Enregistrez-les ou ignorez-les pour changer de page.',keepAndNavigate:'Conserver et changer de page',discardAndNavigate:'Ignorer et changer de page',saveAndNavigate:'Enregistrer et changer de page'});
const $=selector=>document.querySelector(selector);
const project=$('#project'),kind=$('#kind'),frame=$('#canvas'),surface=$('#canvas-surface'),wrap=$('.canvas-wrap'),state=$('#state'),name=$('#document-name'),save=$('#save'),fields=$('#fields'),openButton=$('#open');
const languages=['zh','en','fr'];
const errorKeys={'Edit nested text directly on the page':'nestedTextError','Select an image file':'selectImageError','Unknown property':'unknownPropertyError','Invalid project':'invalidProjectError','Invalid document type':'invalidKindError','Document not found':'notFoundError','Document too large':'tooLargeError','Invalid edited HTML':'invalidHtmlError','Original PDF not found':'pdfMissingError','Page content overflows; adjust the layout before saving':'overflowError','Local access only':'localOnlyError','Invalid origin':'originError','JSON required':'jsonRequiredError'};
const storedLanguage=()=>{try{return localStorage.getItem('ul-ui-language');}catch{return null;}};
Object.assign(messages.zh,{addElement:'添加元素',chooseElement:'选择元素',textBox:'文本框',shape:'色块',newText:'双击编辑文字',removeElement:'删除新增元素'});
Object.assign(messages.en,{addElement:'Add element',chooseElement:'Choose an element',textBox:'Text box',shape:'Shape',newText:'Double-click to edit text',removeElement:'Remove added element'});
Object.assign(messages.fr,{addElement:'Ajouter un élément',chooseElement:'Choisir un élément',textBox:'Zone de texte',shape:'Forme',newText:'Double-cliquez pour modifier',removeElement:'Supprimer l’élément ajouté'});
const queryLanguage=new URLSearchParams(location.search).get('lang');
let language=languages.includes(queryLanguage)?queryLanguage:languages.includes(storedLanguage())?storedLanguage():'zh';
let requestedLanguage=language;
let active=null,activeLabel='',dirty=false,selected=null,loading=false,saving=false,libraryFailed=false,libraryLoaded=false,libraryRows=[],loadTimer;
const embeddedWorkspace=window.parent!==window&&new URLSearchParams(location.search).get('motion-embedded')==='1';
const navigationDialog=$('#navigation-dialog'),dashboardLink=$('#dashboard-link');
let navigationApproved=false;
$('#navigation-message').dataset.i18n=embeddedWorkspace?'navigationRetained':'navigationDiscarded';
$('#navigation-continue').dataset.i18n=embeddedWorkspace?'keepAndNavigate':'discardAndNavigate';
let stateMessage={key:'chooseProjectState',params:{},isError:false};
const propertyKeys=['x','y','width','height','fontSize','opacity','color','backgroundColor'];
const t=(key,params={})=>(messages[language][key]??messages.zh[key]??key).replace(/\{(\w+)\}/g,(_,name)=>params[name]??'');
const translation=(lang,key,params={})=>(messages[lang][key]??messages.zh[key]??key).replace(/\{(\w+)\}/g,(_,name)=>params[name]??'');
const languageLayout=installLanguageLayout({variants:node=>{
 let key=node.dataset.layoutKey||node.dataset.i18n,params=JSON.parse(node.dataset.layoutParams||'{}');
 if(node.matches('.ui-control-value')){const native=node.parentElement.previousElementSibling;if(native===kind)return languages.map(lang=>translation(lang,kind.value));if(native?.id==='insert-type')return languages.map(lang=>translation(lang,'chooseElement'));if(native===project&&project.value==='')return languages.map(lang=>translation(lang,!libraryLoaded?'loading':libraryRows.length?'chooseProject':'noMaterials'));return [node.textContent];}
 if(node.id==='save')return languages.flatMap(lang=>[translation(lang,'savePdf'),translation(lang,'generating')]);
 if(node.id==='document-name')return languages.map(lang=>active?`${activeLabel} · ${translation(lang,active.kind)}`:translation(lang,'notOpened'));
 if(node.id==='state'){key=stateMessage.key;params=stateMessage.params;}
 if(node.id==='selection'){const type=selected?.kind==='block'?'block':selected?.image?'image':selected?.tag==='hr'?'separator':selected?.text!==null?'text':'block',detail=selected?.text?.trim().slice(0,32);return languages.map(lang=>selected?translation(lang,'selected',{type:translation(lang,type),detail:detail?' · '+detail:''}):translation(lang,'selectionPrompt'));}
 return key?languages.map(lang=>translation(lang,key,params)):[];
}});
for(const node of [save,name,state,$('#selection')])node.dataset.layoutKey='';
function renderState(){const params={...stateMessage.params};if(params.error&&errorKeys[params.error])params.error=t(errorKeys[params.error]);state.textContent=t(stateMessage.key,params);state.dataset.error=String(stateMessage.isError);}
function setState(key,params={},isError=false){stateMessage={key,params,isError};renderState();}
function renderSelection(){const type=selected?.kind==='block'?'block':selected?.image?'image':selected?.tag==='hr'?'separator':selected?.text!==null?'text':'block';const detail=selected?.text?.trim().slice(0,32);$('#selection').textContent=selected?t('selected',{type:t(type),detail:detail?' · '+detail:''}):t('selectionPrompt');}
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
 renderState();renderSelection();updateControls();languageLayout.reserve();
}
window.addEventListener('message',event=>{if(event.source===window.parent&&/^http:\/\/(127\.0\.0\.1|localhost):876[56]$/.test(event.origin)&&event.data?.type==='workspace-language'&&languages.includes(event.data.language))setLanguage(event.data.language,{...event.data,remote:true});});
function syncLanguageUrl(){const url=new URL(location.href);url.searchParams.set('lang',language);history.replaceState(history.state,'',url);}
function setLanguage(next,options={}){if(!languages.includes(next)||(!options.remote&&next===requestedLanguage))return;if(!options.remote)requestedLanguage=next;changeLabels(()=>{requestedLanguage=next;language=next;try{localStorage.setItem('ul-ui-language',next);}catch{}syncLanguageUrl();renderLanguage();},{...options,language:next});}
if(languages.includes(queryLanguage)){try{localStorage.setItem('ul-ui-language',language);}catch{}}
document.querySelectorAll('.language-switch button').forEach(button=>button.addEventListener('click',()=>setLanguage(button.dataset.lang)));
window.addEventListener('storage',event=>{if(!embeddedWorkspace&&event.key==='ul-ui-language'&&languages.includes(event.newValue))setLanguage(event.newValue,{remote:true});});
async function api(url,options){const res=await fetch(url,options);const data=await res.json();if(!res.ok)throw Error(data.error||'Request failed');return data;}
function updateControls(){$('#insert-type').disabled=!active||loading||saving;project.disabled=loading||saving;kind.disabled=loading||saving||!project.value;openButton.disabled=loading||saving||(!libraryFailed&&!project.value);save.disabled=loading||saving||!dirty;$('#cancel-changes').disabled=loading||saving||!dirty;fields.inert=saving;surface.inert=saving;save.textContent=t(saving?'generating':'savePdf');}
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
 selected=details;fields.hidden=!details;$('#remove-added').hidden=!details?.added;
 renderSelection();
 if(!details)return;
 for(const key of propertyKeys)$('#'+key).value=details[key];refreshControls(fields);
 if(document.activeElement!==$('#text'))$('#text').value=details.text??'';$('#text').disabled=details.text===null;$('#text-hint').hidden=details.text!==null;$('#image-row').hidden=!details.image;
}
async function openMaterial(restore=null){
 const next=restore||{project:project.value,kind:kind.value};
 if(!next.project||loading||saving)return;
 loading=true;updateControls();setState('opening');
 const url=`/document/${encodeURIComponent(next.project)}/${next.kind}`;
 try{
  const response=await fetch(url);
  if(!response.ok){const error=await response.json();throw Error(error.error||'Document not found');}
  await response.text();
  active=next;if(!restore)activeLabel=project.selectedOptions[0].textContent;dirty=false;show(null);
  name.textContent=`${activeLabel} · ${t(active.kind)}`;name.title=name.textContent;
  frame.src=url;surface.style.opacity='0';surface.hidden=false;frame.hidden=false;fitCanvas();$('#empty').hidden=true;
  clearTimeout(loadTimer);loadTimer=setTimeout(()=>{surface.style.opacity='';loading=false;updateControls();setState('openTimeout',{},true);},15000);
 }catch(e){loading=false;updateControls();setState('openFailed',{error:e.message},true);}
}
project.addEventListener('change',options);
openButton.addEventListener('click',()=>{if(libraryFailed){refresh();return;}if(dirty){openDialog($('#switch-dialog'),openButton);return;}openMaterial();});
$('#keep-editing').addEventListener('click',()=>closeDialog($('#switch-dialog')));
$('#discard-open').addEventListener('click',async()=>{await closeDialog($('#switch-dialog'));openMaterial();});
$('#switch-dialog').addEventListener('cancel',event=>{event.preventDefault();closeDialog(event.currentTarget);});
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
window.addEventListener('message',event=>{
 if(event.origin!==location.origin||event.source!==frame.contentWindow||event.data?.source!=='useless-linkedin-editor')return;
 if(event.data.type==='ready'){clearTimeout(loadTimer);loading=false;updateControls();setState('opened');surface.style.opacity='';motionReady.then(()=>revealSurface(surface,openButton));}
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
function insertElement(type,image){
 if(!active||loading||saving)return;
 const sheet=surface.getBoundingClientRect(),viewport=wrap.getBoundingClientRect(),scale=sheet.width/794;
 const x=(viewport.left+viewport.width/2-sheet.left)/scale-130,y=(viewport.top+Math.min(viewport.height/2,280)-sheet.top)/scale-40;
 try{frame.contentWindow.editorApi.insert(type,{x,y,image,text:t('newText'),duration:motion.popover,easing:motion.ease,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches});}
 catch(error){setState('propertyFailed',{error:error.message},true);}
}
$('#insert-type').addEventListener('change',event=>{const type=event.target.value;event.target.value='';refreshControls($('.insert-tools'));if(type==='image')$('#insert-image').click();else if(type)insertElement(type);});
$('#insert-image').addEventListener('change',event=>{
 const file=event.target.files[0];event.target.value='';if(!file)return;
 if(file.size>1000000){setState('imageTooLarge',{},true);return;}
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)){setState('propertyFailed',{error:t('selectImageError')},true);return;}
 const reader=new FileReader();reader.onload=()=>insertElement('image',reader.result);reader.onerror=()=>setState('imageReadFailed',{},true);reader.readAsDataURL(file);
});
$('#remove-added').addEventListener('click',()=>{if(!loading&&!saving)frame.contentWindow.editorApi.removeAdded();});
async function saveMaterial(event){
 if(!active||saving||loading)return false;
 if(!dirty)return true;
 const box=save.getBoundingClientRect(),origin=event?.detail?{x:Math.max(0,Math.min(1,(event.clientX-box.left)/box.width)),y:Math.max(0,Math.min(1,(event.clientY-box.top)/box.height))}:{x:.5,y:.5};
 saving=true;updateControls();setState('saving');
 try{const html=frame.contentWindow.editorApi.serialize(),result=await api('/api/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...active,html})});dirty=false;setState('saved',{path:result.pdfPath});languageLayout.reserve($('.stage-head'));celebrateSave(save,origin);return true;}
 catch(e){setState('saveFailed',{error:e.message},true);return false;}
 finally{saving=false;updateControls();}
}
save.addEventListener('click',saveMaterial);
$('#cancel-changes').addEventListener('click',()=>{if(dirty&&active&&!saving&&!loading)openMaterial({...active});});
function canNavigate(){
 if(!dirty||navigationApproved)return true;
 openDialog(navigationDialog,dashboardLink);
 return false;
}
$('#navigation-cancel').addEventListener('click',()=>closeDialog(navigationDialog));
navigationDialog.addEventListener('cancel',event=>{event.preventDefault();closeDialog(navigationDialog);});
bindDialogDismiss(navigationDialog);
$('#navigation-continue').addEventListener('click',async()=>{
 await closeDialog(navigationDialog);
 // Both embedded pages stay mounted. The standalone editor instead leaves
 // its document, so explicitly choosing this action discards that draft.
 if(!embeddedWorkspace)dirty=false;
 navigationApproved=true;dashboardLink.click();
});
$('#navigation-save').addEventListener('click',async()=>{
 await closeDialog(navigationDialog);
 if(await saveMaterial()){navigationApproved=true;dashboardLink.click();}
});
window.addEventListener('message',event=>{
 if(event.source===window.parent&&/^http:\/\/(127\.0\.0\.1|localhost):876[56]$/.test(event.origin)&&event.data?.type==='workspace-visible')navigationApproved=false;
});
wirePageLink(dashboardLink,{canLeave:canNavigate});renderLanguage();refresh().finally(notifyPageReady);
