import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {normalizeUrl,classifyLiveness} from './job-signals.mjs';
import {identityUrls} from './posting-identity.mjs';
import {read,write} from './core.mjs';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export function evidenceError(code,field,message,action){return Object.assign(Error(message),{code,field,action});}
export async function registerCapture(home,file,capture){
 const bytes=await fs.readFile(file),entry={file:path.resolve(file),sha256:digest(bytes),url:capture.url,capturedAt:capture.capturedAt};
 // One sidecar per capture avoids lost updates between concurrent fetches.
 await write(file+'.source.json',entry);return entry;
}
export async function observedCapture(workspace,home,job,item,decision){
 const base=await fs.realpath(workspace),file=await fs.realpath(path.resolve(workspace,item.captureFile));
 if(!file.startsWith(base+path.sep))throw evidenceError('capture_path','captureFile','Capture must be within workspace','Use the file returned by fetch-jd or research; keep it inside this workspace.');
 const bytes=await fs.readFile(file),captured=JSON.parse(bytes.toString('utf8')),urls=identityUrls(job);
 if(!urls.includes(normalizeUrl(captured.url))||captured.finalUrl&&!urls.includes(normalizeUrl(captured.finalUrl)))throw evidenceError('posting_identity','url/finalUrl','Capture belongs to another posting or an unlinked redirect','Keep original URLs. Import the official posting and record an observed posting-route link; do not edit source URLs.');
 if(!Number.isFinite(Date.parse(captured.capturedAt))||Math.abs(Date.now()-Date.parse(captured.capturedAt))>86400000)throw evidenceError('capture_stale','capturedAt','Capture must be less than 24 hours old','Fetch the posting again; do not change its timestamp.');
 const registered=await read(file+'.source.json',null);
 const triageFile=job.triage?.captureFile&&path.resolve(workspace,job.triage.captureFile);
 const internal=triageFile===file&&job.triage.captureHash===digest(JSON.stringify(captured))||registered?.file===file&&registered.sha256===digest(bytes)&&registered.url===captured.url;
 if(item.cached&&!internal)throw evidenceError('unregistered_capture','captureFile','Local capture hash is not registered or has changed','Use the unchanged file returned by fetch-jd/triage. A modified source must be recorded as a separate observed page.');
 if(typeof captured.jd!=='string'||typeof captured.bodyText!=='string'||!internal&&(captured.kind!=='full-page'||!captured.bodyText.includes(captured.jd)))throw evidenceError('capture_content','kind/jd/bodyText','Full posting JD and original body are required','Use research --capture --id ID --file FILE --cached for a registered local capture; otherwise save an actual full-page observation.');
 if(!Array.isArray(captured.applyControls)||captured.applyControls.some(c=>typeof c!=='string'||!captured.bodyText.includes(c)))throw evidenceError('capture_controls','applyControls','Application controls must occur in the observed page body','Keep API controls empty. Store actual route controls separately; never append invented Apply text.');
 const live=classifyLiveness({status:captured.status||0,requestedUrl:captured.url,finalUrl:captured.finalUrl||captured.url,bodyText:captured.bodyText,applyControls:captured.applyControls});
 // A registered API proves publication, never an accessible application form.
 const liveness=live.result==='uncertain'&&internal&&captured.layer==='ATS-API'&&captured.liveness?.code==='api_published_posting'?captured.liveness:live;
 if(decision&&!internal&&liveness.result!=='expired'&&!captured.applyControls.length)throw evidenceError('capture_controls','applyControls','Decision requires observed application controls','Save real controls, or reuse a registered published API capture without claiming the route was verified.');
 if(liveness.result!=='expired'&&captured.jd.length<300)throw evidenceError('capture_short','jd','Full active posting requires at least 300 characters','Retrieve the full JD; a search snippet is insufficient.');
 if(decision&&(!['candidate','excluded'].includes(decision.status)||!decision.evidence?.trim()||!(internal?captured.jd:captured.bodyText).includes(decision.evidence)))throw evidenceError('decision_quote','evidence','Decision needs candidate/excluded and an exact posting quote','Use a literal quote from the saved full JD.');
 return {...captured,kind:captured.kind||'full-page',liveness};
}
