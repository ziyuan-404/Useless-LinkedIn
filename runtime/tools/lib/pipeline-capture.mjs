import path from 'node:path';
import {resolveStoragePath} from './storage-paths.mjs';
import {root} from '../runtime.mjs';
import {capture,classifyLiveness,read} from './core.mjs';

const fresh=value=>Number.isFinite(Date.parse(value))&&Math.abs(Date.now()-Date.parse(value))<=86400000;

export async function currentCapture({job,dir,webCapture,assessment}){
  if(webCapture){
    const page=await read(await resolveStoragePath(root,webCapture));
    if(page.url!==job.url||page.kind!=='full-page'||typeof page.jd!=='string'||page.jd.length<300||typeof page.bodyText!=='string'||!Array.isArray(page.applyControls)||page.applyControls.some(control=>!page.bodyText.includes(control))||!page.bodyText.includes(page.jd)||!fresh(page.capturedAt))throw Error('Web capture requires a recent full page and observed controls, not search snippets');
    return {...page,layer:'AgentWebFetch',liveness:classifyLiveness({status:0,requestedUrl:page.url,finalUrl:page.finalUrl||page.url,bodyText:page.bodyText,applyControls:page.applyControls})};
  }
  const context=assessment?await read(path.join(dir,'context.json'),null):null;
  const saved=context?.captured;
  if(context?.url===job.url&&saved?.liveness?.result==='active'&&typeof saved.jd==='string'&&saved.jd.length>=300&&fresh(saved.capturedAt))return saved;
  return capture(job.url);
}
