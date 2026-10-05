import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {root,toolsRoot,args} from './runtime.mjs';
import {home,read,write,hash,parse} from './lib/core.mjs';
import {jobDirectory} from './lib/storage-paths.mjs';
import {snapshotMatches} from './lib/approval.mjs';
import {acquireFileLock} from './lib/file-lock.mjs';
import {validateAnswer,loadAnswers,answerFor} from './lib/form-answers.mjs';
import {formSignature} from './lib/iab-application.mjs';
import {syncDashboardStage} from './lib/dashboard-stage.mjs';

const a=args();
if(a.help){console.log('apply --id ID --prepare --form FILE | --arm --result FILE | --record FILE | --answers FILE | --iab-script\nUse the shared IAB script once per session. Unknown required fields pause this job. Arm only after ready-to-submit, and reconcile an unconfirmed attempt before any retry.');process.exit(0);}
if(a['iab-script']){
  const source=await fs.readFile(path.join(toolsRoot,'lib/iab-application.mjs'),'utf8');
  console.log(`var applicationExecutor = (() => {\n${source.replace(/^export /gm,'')}\nreturn {inspectIabForm,executeIabPlan};\n})();`);process.exit(0);
}
await fs.mkdir(home,{recursive:true});
const lock=await acquireFileLock(path.join(home,'apply-operation.lock'));
try{
 if(a.answers){
  const input=await read(path.resolve(root,a.answers));if(!Array.isArray(input))throw Error('Answers file must be an array');
  const records=[];for(const answer of input)records.push(await validateAnswer(answer,root));
  const registry=path.join(root,'个人资料/operations/form-answers.json'),old=await read(registry,{version:1,answers:[]});
  const aliases=new Set(records.flatMap(r=>r.questions));
  const answers=[...old.answers.filter(r=>!r.questions.some(q=>aliases.has(q))),...records];
  await write(registry,{version:1,answers});console.log(JSON.stringify({registered:records.length,total:answers.length}));
 }else{
  const store=await read(path.join(home,'leads.json'),{jobs:[]}),job=store.jobs.find(j=>j.id===a.id);if(!job)throw Error('Valid --id required');
  const dir=await jobDirectory(root,home,job),applyDir=path.join(dir,'apply');await fs.mkdir(applyDir,{recursive:true});
  const planFile=path.join(applyDir,'plan.json'),attemptFile=path.join(applyDir,'attempt.json');
  const invoke=(command,flags)=>{const result=spawnSync(process.execPath,[path.join(toolsRoot,command+'.mjs'),...flags],{cwd:root,encoding:'utf8'});if(result.status!==0)throw Error(result.stderr||result.stdout);return result.stdout;};
  const questions=await read(path.join(dir,'questions.json'),[]);
  const check=async()=>{
    if(!await snapshotMatches(job))throw Error('Materials, JD, answers or candidate facts changed; review again');
    invoke('authorization',['--check','submit','--job-id',job.id,'--approval-snapshot-id',job.approvalSnapshot.id]);
  };
  if(a.prepare){
    if(['submission-unconfirmed','submitting','submitted','followup-due'].includes(job.state)||await read(attemptFile,null)){console.log(JSON.stringify({id:job.id,state:job.state,action:'reconcile-existing-attempt',attemptFile}));process.exitCode=2;}
    else{
      if(job.state!=='approved')throw Error('Reviewed approved materials required before application execution');await check();
      if(typeof a.form!=='string')throw Error('--form FILE required');
      const form=await read(path.resolve(root,a.form));
      const captured=await read(path.join(dir,'capture.json'),{});
      const allowed=[job.url,captured.finalUrl].filter(Boolean);
      const normalize=url=>{const u=new URL(url);u.hash='';return u.href;};
      if(form.kind!=='application-form'||!allowed.some(url=>normalize(url)===normalize(form.pageUrl)))throw Error('Form must be an observed application page for this job; capture the actual employer/ATS entry first');
      if(!Number.isFinite(Date.parse(form.capturedAt))||Date.now()-Date.parse(form.capturedAt)>86400000||Date.parse(form.capturedAt)>Date.now()+300000)throw Error('Form capture must be recent');
      if(form.error||form.blocker)throw Error('Form is blocked: '+(form.error||form.blocker));
      if(!Array.isArray(form.fields)||!form.fields.length||!Array.isArray(form.controls)||new Set(form.fields.map(f=>f.key)).size!==form.fields.length)throw Error('Form needs unambiguous observed fields and controls');
      const answers=await loadAnswers(root,questions),steps=[],unresolved=[];
      const host=new URL(form.pageUrl).hostname,templateSignature=formSignature({...form,pageUrl:new URL(form.pageUrl).origin}),templateId=hash(host+'\n'+templateSignature);
      const templateFile=path.join(home,'ats-templates',templateId+'.json'),cached=await read(templateFile,null);
      const templateReused=cached?.signature===templateSignature;
      if(templateReused)for(const field of form.fields){const prior=cached.fields.find(f=>f.key===field.key&&f.label===field.label&&f.type===field.type);if(prior&&JSON.stringify(prior.locator)===JSON.stringify(field.locator))field.locator=prior.locator;}
      const materials=job.approvalSnapshot.materials;
      for(const field of form.fields){
        if(!field.label||!field.locator)throw Error('Observed field requires a label and locator');
        if(field.type==='file'){
          const letter=/cover|lettre|motivation/i.test(field.label),cv=/resume|résumé|\bcv\b|curriculum/i.test(field.label);
          const candidates=materials.filter(m=>letter?/lettre|letter/i.test(path.basename(m.path)):cv||form.fields.filter(f=>f.type==='file').length===1?/\bcv\b|resume/i.test(path.basename(m.path)):false);
          if(candidates.length!==1||field.unsupported){unresolved.push({key:field.key,label:field.label,required:field.required,reason:'material-or-upload-control-unresolved'});continue;}
          const filename=path.basename(candidates[0].path);if(/under\d+mb|test|compressed|compression/i.test(filename))throw Error('External material filename has an internal marker');
          if(field.accept&&!field.accept.split(',').some(x=>['.pdf','application/pdf','*/*'].includes(x.trim().toLowerCase()))) {unresolved.push({key:field.key,label:field.label,required:field.required,reason:'file-type-not-accepted'});continue;}
          steps.push({kind:'upload',key:field.key,locator:field.locator,path:path.resolve(root,candidates[0].path),filename,sha256:candidates[0].sha256});continue;
        }
        if(['password','autocomplete','date','number'].includes(field.type)){unresolved.push({key:field.key,label:field.label,required:field.required,reason:'requires-specific-format-or-interaction'});continue;}
        const answer=answerFor(field,answers.records);
        if(answer.status!=='matched'){unresolved.push({key:field.key,label:field.label,required:field.required,reason:answer.status});continue;}
        steps.push({kind:['select','checkbox','radio'].includes(field.type)?field.type:'fill',key:field.key,locator:field.locator,value:answer.value,sources:answer.sources});
      }
      const next=form.controls.filter(c=>/^(next|continue|suivant|suivante|continuer|review|vérifier|verifier)$/i.test(c.label));
      const submit=form.controls.filter(c=>/^(submit(?: application)?|apply(?: now)?|send application|postuler|candidater|envoyer(?: ma candidature| la candidature)?|soumettre(?: ma candidature)?)$/i.test(c.label));
      let action=next.length===1?{kind:'next',...next[0]}:!next.length&&submit.length===1?{kind:'submit',...submit[0]}:null;
      if(a.action||a.control){if(!['next','submit'].includes(a.action)||typeof a.control!=='string')throw Error('Observed override requires --action next|submit and --control exact label');const selected=form.controls.filter(c=>c.label===a.control);if(selected.length!==1)throw Error('Override control was not uniquely observed');action={kind:a.action,...selected[0]};}
      else if(!action&&templateReused&&cached.action){const observed=form.controls.filter(c=>c.label===cached.action.label&&JSON.stringify(c.locator)===JSON.stringify(cached.action.locator));if(observed.length===1)action={kind:cached.action.kind,...observed[0]};}
      if(!action)unresolved.push({required:true,reason:'application-action-ambiguous'});
      if(form.hasIframe)unresolved.push({required:true,reason:'iframe-requires-scoped-capture'});
      if(action?.kind==='submit'&&!steps.some(s=>s.kind==='upload')&&!materials.some(m=>form.attachmentText?.includes(path.basename(m.path))))unresolved.push({required:true,reason:'resume-attachment-not-observed'});
      // Upload first, then re-inspect autofilled/conditional fields before overwriting anything.
      steps.sort((x,y)=>Number(y.kind==='upload')-Number(x.kind==='upload'));
      const plan={version:1,jobId:job.id,approvalSnapshotId:job.approvalSnapshot.id,answersVersion:answers.version,form,signature:formSignature(form),steps,unresolved,action,templateId,templateReused,createdAt:new Date().toISOString()};plan.planHash=hash(JSON.stringify(plan));await write(planFile,plan);
      await write(templateFile,{version:1,host,signature:templateSignature,fields:form.fields.map(({key,label,type,locator})=>({key,label,type,locator})),action,observedAt:form.capturedAt,uses:(cached?.uses||0)+1});
      console.log(JSON.stringify({id:job.id,plan:planFile,steps:steps.length,unresolved:unresolved.map(({key,reason,required})=>({key,reason,required})),templateId,templateReused}));
    }
  }else if(a.arm){
    if(job.state!=='approved'||await read(attemptFile,null))throw Error('An existing attempt must be reconciled; cannot arm again');await check();
    const plan=await read(planFile),result=await read(path.resolve(root,a.result||''));
    const {planHash,...basis}=plan;if(hash(JSON.stringify(basis))!==planHash)throw Error('Plan changed');
    if(plan.action?.kind!=='submit'||plan.unresolved.some(f=>f.required)||plan.approvalSnapshotId!==job.approvalSnapshot.id||plan.answersVersion!==(await loadAnswers(root,questions)).version)throw Error('Plan or answers are stale/unresolved');
    if(result.status!=='ready-to-submit'||result.jobId!==job.id||result.planHash!==planHash||!result.form||formSignature(result.form)!==plan.signature||!Number.isFinite(Date.parse(result.observedAt))||Math.abs(Date.now()-Date.parse(result.observedAt))>300000)throw Error('A recent verified ready-to-submit result is required');
    const permit={jobId:job.id,planHash,attemptId:randomUUID(),issuedAt:new Date().toISOString()};
    // Persist uncertainty before the remote side effect. A crash cannot silently re-arm the job.
    await write(attemptFile,{...permit,status:'armed-unconfirmed'});
    invoke('state',['--id',job.id,'--to','submitting']);invoke('state',['--id',job.id,'--to','submission-unconfirmed']);
    await write(path.join(applyDir,'permit.json'),permit);console.log(JSON.stringify({id:job.id,permit:path.join(applyDir,'permit.json'),state:'submission-unconfirmed'}));
  }else if(a.record){
    const result=await read(path.resolve(root,a.record)),plan=await read(planFile),attempt=await read(attemptFile,null);
    if(result.jobId!==job.id||result.planHash!==plan.planHash)throw Error('Result belongs to a different plan/job');
    await write(path.join(applyDir,'last-result.json'),result);
    if(result.status==='success-observed'){
      if(!attempt||result.attemptId!==attempt.attemptId||!Number.isFinite(Date.parse(result.observedAt))||Date.parse(result.observedAt)<Date.parse(attempt.issuedAt)||Date.parse(result.observedAt)>Date.now()+300000||!result.evidence?.artifactHtml||result.evidence.requiresScreenshot)throw Error('Independent success artifact and current attempt required; save screenshot/email receipt if needed');
      if(new URL(result.pageUrl).origin!==new URL(plan.form.pageUrl).origin||!parse(result.evidence.artifactHtml).text.includes(result.evidence.text))throw Error('Success statement must be present in the observed same-origin artifact');
      if(!/application (?:has been |was )?(?:submitted|sent)|thank you for applying|candidature (?:a (?:bien )?été |a ete )?(?:envoyée|envoyee|transmise)|merci (?:pour|de).*candidature/i.test(result.evidence.text))throw Error('No explicit success statement');
      const artifact=path.join(applyDir,'success-'+attempt.attemptId+'.html');await fs.writeFile(artifact,result.evidence.artifactHtml);
      const receipt=path.join(applyDir,'receipt.json');await write(receipt,{kind:'success-page',observedAt:result.observedAt,description:result.evidence.text,artifactPath:path.relative(root,artifact),sourceUrl:result.pageUrl});
      invoke('state',['--id',job.id,'--to','submitted','--receipt',receipt]);await write(attemptFile,{...attempt,status:'confirmed'});
    }
    if(result.status!=='success-observed')await syncDashboardStage(job.id);
    const metricsFile=path.join(home,'application-metrics',job.id+'.json'),metrics=await read(metricsFile,{jobId:job.id,runs:[]}),runId=hash(JSON.stringify(result));
    if(!metrics.runs.some(r=>r.id===runId))metrics.runs.push({id:runId,planHash:result.planHash,status:result.status,observedAt:result.observedAt,metrics:result.metrics});
    metrics.totals={};for(const entry of metrics.runs)for(const [key,value] of Object.entries(entry.metrics||{}))if(Number.isFinite(value))metrics.totals[key]=(metrics.totals[key]||0)+value;
    await write(metricsFile,metrics);
    console.log(JSON.stringify({id:job.id,result:result.status,state:(await read(path.join(home,'leads.json'))).jobs.find(j=>j.id===job.id).state}));
  }else throw Error('Choose --prepare, --arm, --record, --answers or --iab-script');
 }
}finally{await lock.close();}
