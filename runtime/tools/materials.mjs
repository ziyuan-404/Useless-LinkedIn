import path from 'node:path';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {args,root,dependency} from './runtime.mjs';
import {home,read,write,transaction,hash} from './lib/core.mjs';
import {jobDirectory,resolveStoragePath} from './lib/storage-paths.mjs';
import {selectLeads,verifiedCapture,materialPreflight,composePayload} from './lib/work-packets.mjs';
import {validateDecision,checkSources} from './lib/assessment-validation.mjs';
import {validateMatchReview} from './lib/match-review.mjs';
import {assertTransition} from './lib/state-machine.mjs';
import {generateApplication} from './lib/material-generator.mjs';
import {syncDashboardStage} from './lib/dashboard-stage.mjs';
const a=args();if(a.help){console.log('materials --plan|--run --ids FILE [--limit 10] [--offset N]\nmaterials --compose --base FILE --tailoring FILE --out FILE\nSources remain authoritative; no automatic semantic/visual approval or submission.');process.exit(0);}
if(a.compose){
 for(const key of ['base','tailoring','out'])if(typeof a[key]!=='string')throw Error('Recipe requires --base, --tailoring and --out');
 const output=path.resolve(root,a.out);if(!output.startsWith(root+path.sep))throw Error('Recipe output must be inside workspace');
 const payload=composePayload(await read(await resolveStoragePath(root,a.base)),await read(await resolveStoragePath(root,a.tailoring)));
 await checkSources(payload.cv,[path.join(root,'个人资料/profile')]);await checkSources(payload.letter,[path.join(root,'个人资料/profile'),path.join(home,'jobs')]);
 await write(output,payload);console.log(JSON.stringify({payload:output,reviewRequired:true}));process.exit(0);
}
if(!a.ids||!a.plan&&!a.run)throw Error('Use --plan or --run with an IDs file');
const store=await read(path.join(home,'leads.json'),{jobs:[]}),ids=await read(path.resolve(root,a.ids));
const page=selectLeads(store.jobs,{ids,limit:Number(a.limit??10),offset:Number(a.offset??0)}),items=[];
for(const job of page.items){
 const dir=await jobDirectory(root,home,job),verified=await verifiedCapture(root,job,dir),assessment=await read(path.join(dir,'assessment.json'),null);
 const preflight=materialPreflight(job,verified,{decision:assessment});
 preflight.routeReady=preflight.ready;
 if(!['awaiting-agent','needs-decision','generation-failed','materials-pending-review'].includes(job.state))preflight.reasons.push('assessment_or_material_state_required');
 if(!assessment?.payload)preflight.reasons.push('sourced_payload_required');
 if(assessment?.decision?.route==='bulk')preflight.reasons.push('use_verified_resume_pool');
 preflight.ready=preflight.reasons.length===0;
 items.push({id:job.id,company:job.company,title:job.title,dir,preflight,assessment,job,verified});
}
const runDir=path.join(home,'material-batches',randomUUID()),manifest=path.join(runDir,'manifest.json');
await write(manifest,{version:1,items:items.map(({id,company,title,preflight})=>({id,company,title,...preflight})),remaining:page.remaining,nextOffset:page.nextOffset});
const results=[];let browser;
try{
 for(const item of items){
  const {job,assessment,dir,verified}=item;
  if(!a.run||!item.preflight.ready){results.push({id:job.id,ready:item.preflight.ready,reasons:item.preflight.reasons});continue;}
  try{
   const context=await read(path.join(dir,'context.json'));const currentSources={};
   for(const file of Object.keys(context.sources))currentSources[file]=await fs.readFile(await resolveStoragePath(root,file),'utf8');
   const contextHash=hash(JSON.stringify({jd:verified.capture.jd,sources:currentSources}));
   if(contextHash!==job.contextHash||contextHash!==context.contextHash)throw Error('JD or candidate facts changed; reassessment required');
   if(assessment.assessmentType==='user-selected-application'){
    if(!assessment.userOverride?.instruction?.trim())throw Error('Explicit user-selected instruction required');
    await validateMatchReview({jobId:job.id,matchLevel:assessment.matchLevel,reason:assessment.matchReason,sources:assessment.matchSources},{workspace:root,job,dir});
   }else if(await validateDecision(assessment,{captured:verified.capture,dir,contextHash})!=='PASS')throw Error('Only PASS or an evidenced user-selected application can generate materials');
   await checkSources(assessment.payload.cv,[path.join(root,'个人资料/profile')]);await checkSources(assessment.payload.letter,[path.join(root,'个人资料/profile'),path.join(dir,'jd.txt')]);
   for(const selector of ['.subtitle','.profil-text','.skill-bullets','.availability','.course-list'])if(!assessment.payload.cv.some(x=>x.selector===selector))throw Error('Full customization requires '+selector);
   for(let index=0;index<4;index++)if(!assessment.payload.cv.some(x=>x.selector==='.item-bullets'&&x.index===index))throw Error('Missing sourced experience customization '+index);
   for(const selector of ['.item-date','.item-sub'])if(!assessment.payload.cv.some(x=>x.selector===selector&&x.index===4))throw Error('Education route must be explicitly customized');
   if(assessment.schoolRouteReview)await checkSources([assessment.schoolRouteReview],[path.join(root,'个人资料/profile')]);
   const claims=path.join(dir,'payload.json');await write(claims,assessment.payload);
   const options={company:job.company||assessment.company,role:job.title||assessment.role,claims,reuse:true};
   await generateApplication({...options,'validate-only':true});
   // One isolated local renderer for the whole batch, without user cookies or external navigation.
   browser??=await dependency('playwright').chromium.launch({headless:true,...(process.env.USELESS_LINKEDIN_CHROME?{executablePath:process.env.USELESS_LINKEDIN_CHROME}:{})});
   const generated=await generateApplication(options,{sharedBrowser:browser});
   await write(path.join(dir,'generation.json'),{contextHash,payloadHash:hash(JSON.stringify(assessment.payload)),output:generated.output,createdAt:new Date().toISOString()});
   await transaction(s=>{const current=s.jobs.find(x=>x.id===job.id);assertTransition(current.state,'materials-pending-review',{});current.events=[...(current.events||[]),{at:new Date().toISOString(),from:current.state,to:'materials-pending-review',reason:'local_material_batch'}];Object.assign(current,{state:'materials-pending-review',output:generated.output,matchLevel:assessment.matchLevel,applicationMode:'precision'});});
   const dashboardSync=await syncDashboardStage(job.id);results.push({id:job.id,...generated,dashboardSync});
  }catch(error){results.push({id:job.id,error:error.message,reviewRequired:true});}
 }
}finally{await browser?.close();}
const resultFile=path.join(runDir,'result.json');await write(resultFile,{results,remaining:page.remaining,nextOffset:page.nextOffset});
console.log(JSON.stringify({manifest,result:resultFile,routeReady:items.filter(i=>i.preflight.routeReady).length,ready:items.filter(i=>i.preflight.ready).length,deferred:items.filter(i=>!i.preflight.ready).length,generated:results.filter(i=>i.output).length,errors:results.filter(i=>i.error).length,remaining:page.remaining,nextOffset:page.nextOffset}));
