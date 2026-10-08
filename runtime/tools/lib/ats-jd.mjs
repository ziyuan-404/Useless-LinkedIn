import {resolveAtsApi,JD_TEXT_API_ATS} from '../../vendor/career-ops/liveness-api.mjs';
import {normalizeWorkdayJob,normalizeAshbyJob,normalizeGreenhouseJob,normalizeLeverJob,normalizeSmartRecruitersJob} from '../../vendor/career-ops/jd-normalizers.mjs';

const uncertain=(url,ats,raw,reason)=>({url,finalUrl:url,layer:'ATS-API',status:raw.status,jd:'',bodyText:'',applyControls:[],liveness:{result:'uncertain',code:'api_inconclusive',reason},apiEvidence:{ats,url:raw.finalUrl},capturedAt:new Date().toISOString()});
export async function captureAtsJd(url,{fetchPage,resolve=resolveAtsApi}={}){
 const resolved=resolve(url);if(!resolved||!JD_TEXT_API_ATS.has(resolved.ats))return null;
 let apiUrl=resolved.apiUrl;
 if(resolved.ats==='greenhouse-embedded'){
  const raw=await fetchPage(apiUrl,{redirect:'manual'});
  const response=new Response(raw.body,{status:raw.status,headers:raw.headers});
  apiUrl=await resolved.followEmbed(response,resolved.parts);if(!apiUrl)return null;
 }
 if(resolved.ats==='greenhouse'||resolved.ats==='greenhouse-embedded'){const u=new URL(apiUrl);u.searchParams.set('content','true');apiUrl=u.href;}
 const raw=await fetchPage(apiUrl,{headers:{accept:'application/json'},timeoutMs:resolved.timeoutMs||18000});
 const ats=resolved.ats;
 // Lever API 404 can be inconclusive; upstream explicitly requires page fallback.
 if([404,410].includes(raw.status))return resolved.api404Authoritative?{...uncertain(url,ats,raw,'API posting not found'),liveness:{result:'expired',code:'api_'+raw.status,reason:'Authoritative ATS posting API returned '+raw.status}}:null;
 if(raw.status<200||raw.status>=300)return null;
 let json;try{json=JSON.parse(raw.body);}catch{return null;}
 let normalized;
 if(ats==='workday')normalized=normalizeWorkdayJob(json,url);
 if(ats==='ashby')normalized=normalizeAshbyJob(json,resolved.parts.jobId,url);
 if(ats.startsWith('greenhouse'))normalized=normalizeGreenhouseJob(json,url);
 if(ats==='lever')normalized=normalizeLeverJob(json,url);
 if(ats==='smartrecruiters')normalized=normalizeSmartRecruitersJob(json,url);
 const ashbyJob=ats==='ashby'?json.jobs?.find(j=>String(j.id).toLowerCase()===String(resolved.parts.jobId).toLowerCase()):null;
 let closed=ats==='workday'&&json.jobPostingInfo?.canApply===false||ats==='ashby'&&ashbyJob?.isListed===false;
 if(!normalized||normalized.text.length<300)return closed?{...uncertain(url,ats,raw,'Closed ATS posting'),liveness:{result:'expired',code:'api_closed',reason:'ATS explicitly disables applications'}}:null;
 const title=normalized.title,jd=normalized.text;
 // A published API record is evidence of a posting, not evidence that the
 // actual application form is accessible. Keep that route separate.
 const controls=[];
 return {kind:'full-page',url,finalUrl:url,layer:'ATS-API',status:raw.status,title,company:json.company?.name||'',jd,bodyText:[title,jd,...controls].join('\n'),applyControls:controls,
  applicationRouteVerified:false,applicationRouteRequired:true,links:[],apiEvidence:{ats,url:apiUrl,postingId:resolved.parts,capturedAt:new Date().toISOString()},
  liveness:{result:closed?'expired':'active',code:closed?'api_closed':'api_published_posting',reason:closed?'ATS explicitly disables applications':'Complete JD from a public ATS posting API; application form still needs route verification'},capturedAt:new Date().toISOString()};
}
