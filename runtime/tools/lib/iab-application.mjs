// Portable: only the documented IAB tab APIs are used. No browser launch, HTTP or filesystem access.
export function formSignature(form){
  return JSON.stringify({url:form.pageUrl,scope:form.scope||null,fields:form.fields.map(({key,label,type,required,locator,options,accept,unsupported})=>({key,label,type,required,locator,options,accept,unsupported})),controls:form.controls.map(({label,locator})=>({label,locator}))});
}
export async function inspectIabForm(tab,scope){
  const pageUrl=await tab.url();
  const observed=await tab.playwright.evaluate(({scope})=>{
    const visible=el=>!!(el.getClientRects().length)&&getComputedStyle(el).visibility!=='hidden';
    const forms=[...document.querySelectorAll('form')].filter(visible);
    let root=scope?document.querySelector(scope):forms.length===1?forms[0]:document.body;
    if(!root)return {error:'form-scope-missing',fields:[],controls:[]};
    if(!scope&&forms.length>1)return {error:'multiple-forms-select-scope',fields:[],controls:[]};
    const label=el=>el.getAttribute('aria-label')||[...(el.labels||[])].map(l=>l.innerText.trim()).join(' ')||el.getAttribute('placeholder')||el.name||el.id||'';
    const locator=el=>el.id?{by:'css',value:'#'+CSS.escape(el.id)}:el.name?{by:'css',value:el.tagName.toLowerCase()+'[name="'+CSS.escape(el.name)+'"]'}:{by:'label',value:label(el)};
    const fields=[],radios=new Set();
    for(const el of root.querySelectorAll('input,textarea,select,[role="combobox"]')){
      if((!visible(el)&&el.type!=='file')||el.disabled||['hidden','submit','button','reset'].includes(el.type))continue;
      if(el.type==='radio'){
        if(radios.has(el.name))continue;radios.add(el.name);
        const group=[...root.querySelectorAll('input[type="radio"]')].filter(x=>x.name===el.name&&visible(x));
        fields.push({key:'radio:'+el.name,label:el.closest('fieldset')?.querySelector('legend')?.innerText.trim()||el.getAttribute('aria-label')||el.name,type:'radio',required:group.some(x=>x.required),options:group.map(x=>({label:label(x),value:x.value,locator:x.id?locator(x):{by:'label',value:label(x)},disabled:x.disabled})),value:group.find(x=>x.checked)?.value||'',locator:{by:'radio-group',value:el.name}});continue;
      }
      const type=el.getAttribute('role')==='combobox'?'autocomplete':el.tagName==='SELECT'?'select':el.type||'text';
      const uploadLabel=type==='file'&&!visible(el)&&el.id?[...(el.labels||[])].find(visible):null;
      // IAB's read-only DOM exposes the selected file value but may omit FileList/accept properties.
      const filenames=type==='file'?[...(el.files||[])].map(f=>f.name):undefined;
      if(type==='file'&&!filenames.length&&el.value)filenames.push(el.value.split(/[\\/]/).at(-1));
      fields.push({key:el.id||el.name||label(el),label:label(el),type,required:!!el.required||el.getAttribute('aria-required')==='true',locator:uploadLabel?{by:'css',value:'label[for="'+CSS.escape(el.id)+'"]'}:locator(el),unsupported:type==='file'&&!visible(el)&&!uploadLabel||undefined,accept:el.getAttribute('accept')||'',options:type==='select'?[...el.options].map(o=>({label:o.text,value:o.value,disabled:o.disabled})):undefined,value:type==='checkbox'?el.checked:el.value||'',files:filenames});
    }
    const controls=[...root.querySelectorAll('button,input[type="submit"],[role="button"]')].filter(visible).map(el=>({label:el.innerText?.trim()||el.value||el.getAttribute('aria-label')||'',locator:el.id?{by:'css',value:'#'+CSS.escape(el.id)}:{by:'role',role:'button',value:el.innerText?.trim()||el.value||el.getAttribute('aria-label')||''},disabled:el.disabled}));
    const text=document.body.innerText;
    return {fields,controls,attachmentText:text.split('\n').filter(line=>/\.pdf\b/i.test(line)).join('\n').slice(0,4000),blocker:/verify you are human|vérifiez que vous êtes|cloudflare challenge|complete the captcha/i.test(text)?'challenge':fields.some(f=>f.type==='password')?'login':null,hasIframe:[...root.querySelectorAll('iframe')].some(visible)};
  },{scope:scope||null});
  return {version:1,kind:'application-form',pageUrl,scope:scope||null,capturedAt:new Date().toISOString(),...observed};
}
export function iabLocator(tab,spec){
  if(spec.by==='css')return tab.playwright.locator(spec.value);
  if(spec.by==='label')return tab.playwright.getByLabel(spec.value,{exact:true});
  if(spec.by==='role')return tab.playwright.getByRole(spec.role,{name:spec.value,exact:true});
  throw Error('Unsupported observed locator');
}
const usedPermits=new Set();
export async function executeIabPlan(tab,plan,{permit}={}){
  const started=Date.now(),metrics={actions:0,filled:0,alreadyCorrect:0,uploads:0},written=new Set(),redactedFields=[];
  const result=(status,extra={})=>({version:1,jobId:plan.jobId,planHash:plan.planHash,status,observedAt:new Date().toISOString(),metrics:{...metrics,elapsedMs:Date.now()-started},...extra});
  let form=await inspectIabForm(tab,plan.form.scope);
  if(form.blocker||form.error)return result('blocked',{reason:form.blocker||form.error,form});
  if(formSignature(form)!==plan.signature)return result('needs-replan',{reason:'form-changed',form});
  const fieldMap=new Map(form.fields.map(f=>[f.key,f]));
  if(plan.unresolved.some(f=>f.required))return result('needs-agent',{unresolved:plan.unresolved});
  // Validate every locator before changing any field. Re-check after conditional controls.
  for(const step of plan.steps)if(step.kind!=='radio'&&await iabLocator(tab,step.locator).count()!==1)return result('needs-replan',{reason:'ambiguous-locator',key:step.key});
  for(const step of plan.steps){
    const field=fieldMap.get(step.key);
    if(step.kind==='upload'&&field.files?.includes(step.filename)||step.kind!=='upload'&&field.value===step.value){metrics.alreadyCorrect++;continue;}
    const control=step.kind==='radio'?null:iabLocator(tab,step.locator);
    try{
      if(step.kind==='upload'){
        let uploaded=false;
        for(const activate of step.locator.by==='css'&&step.locator.value.startsWith('label')?['click','press']:['press','click']){
          const chooser=tab.playwright.waitForEvent('filechooser',{timeoutMs:5000});
          // Always consume a rejected chooser promise, including a failed activation.
          const guarded=chooser.then(value=>({value}),error=>({error}));
          try{metrics.actions++;if(activate==='press')await control.press('Enter',{timeoutMs:5000});else await control.click({timeoutMs:5000});}catch{}
          const outcome=await guarded;
          if(outcome.value){await outcome.value.setFiles(step.path);metrics.actions++;uploaded=true;break;}
        }
        if(!uploaded)return result('blocked',{reason:'upload-no-filechooser',key:step.key});
        const after=await inspectIabForm(tab,plan.form.scope);
        if(!after.fields.find(f=>f.key===step.key)?.files?.includes(step.filename))return result('blocked',{reason:'upload-not-confirmed',key:step.key,form:after});
        metrics.uploads++;if(formSignature(after)!==plan.signature)return result('needs-replan',{reason:'resume-parsed-form-changed',form:after});
        for(const f of after.fields)fieldMap.set(f.key,f);
      }else if(step.kind==='select'){await control.selectOption({value:step.value},{timeoutMs:5000});metrics.actions++;}
      else if(step.kind==='checkbox'){await control.setChecked(step.value,{timeoutMs:5000});metrics.actions++;}
      else if(step.kind==='radio'){const option=field.options.find(o=>o.value===step.value);if(!option||await iabLocator(tab,option.locator).count()!==1)return result('needs-replan',{reason:'radio-option-changed'});await iabLocator(tab,option.locator).check({timeoutMs:5000});metrics.actions++;}
      else {await control.fill(step.value,{timeoutMs:5000});written.add(step.key);metrics.actions++;}
      if(step.kind!=='upload')metrics.filled++;
      if(['select','checkbox','radio'].includes(step.kind)){
        const after=await inspectIabForm(tab,plan.form.scope);
        if(formSignature(after)!==plan.signature)return result('needs-replan',{reason:'conditional-fields-changed',form:after});
      }
    }catch(e){return result('blocked',{reason:'field-action-failed',key:step.key,message:String(e.message).slice(0,300)});}
  }
  form=await inspectIabForm(tab,plan.form.scope);
  if(formSignature(form)!==plan.signature)return result('needs-replan',{reason:'form-changed-after-fill',form});
  const mismatches=plan.steps.filter(s=>{const f=form.fields.find(x=>x.key===s.key);if(f?.value==='<redacted>'&&['email','tel'].includes(f.type)&&written.has(s.key)){redactedFields.push(s.key);return false;}return s.kind==='upload'?!f?.files?.includes(s.filename):f?.value!==s.value;}).map(s=>s.key);
  if(mismatches.length)return result('blocked',{reason:'values-not-accepted',keys:mismatches,form});
  const invalid=await tab.playwright.evaluate(({scope})=>[...(scope?document.querySelector(scope):document).querySelectorAll('input,select,textarea')].filter(x=>x.getClientRects().length&&!x.disabled&&x.matches(':invalid')).map(x=>x.id||x.name),{scope:plan.form.scope});
  if(invalid.length)return result('needs-agent',{reason:'browser-validation',keys:invalid,form});
  if(!plan.action)return result('filled',{form});
  if(plan.action.kind==='submit'){
    if(!permit||permit.planHash!==plan.planHash||permit.jobId!==plan.jobId||!permit.attemptId||!Number.isFinite(Date.parse(permit.issuedAt))||Date.now()-Date.parse(permit.issuedAt)>300000||Date.parse(permit.issuedAt)>Date.now()+10000||usedPermits.has(permit.attemptId))return result('ready-to-submit',{form,redactedFields});
    usedPermits.add(permit.attemptId);
  }
  const button=iabLocator(tab,plan.action.locator);
  if(await button.count()!==1||!await button.isEnabled())return result('blocked',{reason:'action-unavailable',form});
  const successBefore=plan.action.kind==='submit'?await tab.playwright.evaluate(()=>document.body.innerText):'';
  // Submit is intentionally clicked once. An uncertain result is reconciled, never retried here.
  try{await button.click({timeoutMs:10000});metrics.actions++;}catch(e){return result(plan.action.kind==='submit'?'submission-unconfirmed':'blocked',{reason:'action-outcome-uncertain',attemptId:permit?.attemptId});}
  if(plan.action.kind!=='submit'){
    let next=await inspectIabForm(tab);
    if(formSignature(next)===plan.signature){
      try{await button.press('Enter',{timeoutMs:5000});metrics.actions++;next=await inspectIabForm(tab);}catch{}
      if(formSignature(next)===plan.signature)return result('blocked',{reason:'next-no-progress',form:next});
    }
    return result('next-page',{form:next});
  }
  await tab.playwright.domSnapshot();
  const evidence=await tab.playwright.evaluate(()=>{
    const success=/application (?:has been |was )?(?:submitted|sent)|thank you for applying|candidature (?:a (?:bien )?été |a ete )?(?:envoyée|envoyee|transmise)|merci (?:pour|de).*candidature/i;
    const candidates=[...document.querySelectorAll('main,[role="status"],[role="alert"],h1,h2,p,div')].filter(x=>x.getClientRects().length&&success.test(x.innerText||''));
    candidates.sort((a,b)=>a.innerText.length-b.innerText.length);let el=candidates[0];
    if(!el||document.querySelector('form input:invalid'))return null;
    const text=el.innerText;while(el.parentElement&&el.outerHTML.length<100)el=el.parentElement;
    if(el.outerHTML.length>32000)return {text,requiresScreenshot:true};
    return {text,artifactHtml:el.outerHTML};
  });
  const independent=evidence&&!successBefore.includes(evidence.text);
  return result(independent?'success-observed':'submission-unconfirmed',{attemptId:permit.attemptId,pageUrl:await tab.url(),evidence:independent?evidence:null});
}
