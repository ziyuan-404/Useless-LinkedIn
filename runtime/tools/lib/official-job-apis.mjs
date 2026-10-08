import {createHash} from 'node:crypto';
import {httpFailure} from './discovery-policy.mjs';

export const FT_SEARCH='https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search';
export const FT_TOKEN='https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=/partenaire';
export const LBA_SEARCH='https://api.apprentissage.beta.gouv.fr/api/job/v1/search';
const tokens=new Map();
const missing=names=>Object.assign(Error('API credentials missing: '+names.join(', ')),{credentialsMissing:true});
export function credentialRequirements(source){
 if(source.provider==='france-travail')return process.env[source.api_token_env||'FRANCE_TRAVAIL_TOKEN']?[]:[source.oauth?.client_id_env||'FRANCE_TRAVAIL_CLIENT_ID',source.oauth?.client_secret_env||'FRANCE_TRAVAIL_CLIENT_SECRET'];
 return source.api_token_env?[source.api_token_env]:source.provider==='la-bonne-alternance'?['LBA_API_TOKEN']:[];
}
export const credentialsReady=source=>credentialRequirements(source).every(name=>!!process.env[name]);
function endpoint(value){const url=new URL(value);if(url.username||url.password||url.protocol!=='https:'&&!(process.env.USELESS_LINKEDIN_TEST_LOCAL&&url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname)))throw Error('Authenticated API requires HTTPS without URL credentials');return url;}
async function ftToken(source,fetchPage,{renew=false}={}){
 const direct=process.env[source.api_token_env||'FRANCE_TRAVAIL_TOKEN'];if(direct)return direct;
 const names=credentialRequirements(source);if(!credentialsReady(source))throw missing(names.filter(n=>!process.env[n]));
 const tokenUrl=endpoint(source.oauth?.token_url||FT_TOKEN).href;
 const id=process.env[names[0]],secret=process.env[names[1]],scope=source.oauth?.scope||'o2dsoffre api_offresdemploiv2';
 const key=createHash('sha256').update(JSON.stringify([tokenUrl,id,secret,scope])).digest('hex'),cached=tokens.get(key);
 if(!renew&&cached?.until>Date.now()+10000)return cached.value;
 const response=await fetchPage(tokenUrl,{method:'POST',credentialBody:true,headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'client_credentials',client_id:id,client_secret:secret,scope}).toString()});
 httpFailure(response);let data;try{data=JSON.parse(response.body);}catch{throw Error('Invalid OAuth token response');}
 if(typeof data.access_token!=='string'||!data.access_token||!Number.isFinite(Number(data.expires_in))||Number(data.expires_in)<=0)throw Error('OAuth response lacks an expiring access token');
 tokens.set(key,{value:data.access_token,until:Date.now()+Number(data.expires_in)*1000});return data.access_token;
}
export async function authenticated(source,url,fetchPage){
 endpoint(url);
 let token=source.provider==='france-travail'?await ftToken(source,fetchPage):process.env[source.api_token_env||'LBA_API_TOKEN'];
 if(!token)throw missing(credentialRequirements(source));
 let response=await fetchPage(url,{headers:{Authorization:`Bearer ${token}`},credentialHeaders:true});
 if(response.status===401&&source.provider==='france-travail'&&!process.env[source.api_token_env||'FRANCE_TRAVAIL_TOKEN']){
  token=await ftToken(source,fetchPage,{renew:true});response=await fetchPage(url,{headers:{Authorization:`Bearer ${token}`},credentialHeaders:true});
 }
 if(source.provider==='la-bonne-alternance'&&response.status===419)throw Object.assign(Error('LBA API rate limit (419)'),{status:429,retryAfter:response.headers?.['retry-after']});
 httpFailure(response);return response;
}
const iso=(value,ceil=false)=>{const at=Date.parse(value);return Number.isFinite(at)?new Date(ceil?Math.ceil(at/1000)*1000:at).toISOString().replace(/\.\d{3}Z$/,'Z'):null;};
export async function franceTravailPage(source,task,{fetchPage}){
 const api=source.api||{},params=api.params||{},cursor=task.cursor||{},size=api.page_size??150,limit=api.range_limit??3150;
 if(!Number.isInteger(size)||size<1||size>150||!Number.isInteger(limit)||limit<1||limit>3150)throw Error('France Travail range: page_size <=150, range_limit <=3150');
 const url=endpoint(task.url),offset=cursor.offset||0,windowNumber=cursor.windowNumber||0;
 for(const [key,value] of Object.entries(params))if(value!==undefined&&value!==null)url.searchParams.set(key,String(value));
 if(task.query)url.searchParams.set('motsCles',task.query);
 if(task.location&&!['France',''].includes(task.location)){
  const filters=api.locations?.[task.location];if(!filters)throw Error('France Travail location requires INSEE/department/region mapping: '+task.location);
  for(const [key,value] of Object.entries(filters)){if(!['commune','departement','region','distance'].includes(key))throw Error('Unknown France Travail location filter');url.searchParams.set(key,String(value));}
 }
 const sort=String(params.sort??1);url.searchParams.set('sort',sort);
 const initialEnd=cursor.initialEnd||iso(params.maxCreationDate)||iso(new Date()),windowEnd=cursor.windowEnd||initialEnd;
 if(!windowEnd)throw Error('Invalid France Travail date boundary');
 url.searchParams.set('maxCreationDate',windowEnd);url.searchParams.set('range',`${offset}-${Math.min(offset+size-1,limit-1)}`);
 if(offset<0||offset>=limit||offset>3000)throw Error('France Travail cursor exceeds API range');
 const response=await authenticated(source,url.href,fetchPage);
 if(response.status===204)return {jobs:[],rowCount:0,page:offset,pageKey:`${task.url}:window-${windowNumber}:${offset}`,complete:true,nextCursor:null,reason:'exhausted',url:url.href};
 let body;try{body=JSON.parse(response.body);}catch{throw Error('Invalid France Travail JSON response');}
 if(!Array.isArray(body.resultats))throw Error('France Travail resultats must be an array');
 const rows=body.resultats,jobs=rows.map(row=>({url:row?.id?`https://candidat.francetravail.fr/offres/recherche/detail/${encodeURIComponent(row.id)}`:'',title:row?.intitule||'',company:row?.entreprise?.nom||'',location:row?.lieuTravail?.libelle||'',description:row?.description||'',contract:[row?.typeContratLibelle,row?.natureContrat,row?.alternance?'alternance':''].filter(Boolean).join(' '),requisitionId:String(row?.id||''),publishedAt:row?.dateCreation,updatedAt:row?.dateActualisation,isJob:true}));
 const rangeHeader=response.headers?.['content-range']||'',range=/^(?:offres\s+)?(\d+)-(\d+)\/(\d+|\*)$/i.exec(rangeHeader);
 const total=range&&range[3]!=='*'?Number(range[3]):null,seen=range?Number(range[2])+1:offset+rows.length;
 let nextCursor=null,complete=false,reason='pagination_metadata_missing';
 if(rangeHeader&&!range||rows.length>size||range&&(Number(range[1])!==offset||Number(range[2])-offset+1!==rows.length))reason='inconsistent_pagination_metadata';
 else if(response.status===200&&(!range||total!==null&&seen>=total)||total!==null&&seen>=total){complete=true;reason='exhausted';}
 else if(total!==null&&rows.length){
  if(seen<limit&&seen<=3000){nextCursor={offset:seen,initialEnd,windowEnd,windowNumber};reason='next_page';}
  else if(sort==='1'){
   // Filters accept whole seconds. Round UP to retain all unseen postings in
   // the boundary second; rounding down could silently lose fractional dates.
   const dates=rows.map(row=>iso(row.dateCreation,true)),boundary=dates.every(Boolean)?dates.sort()[0]:null;
   if(boundary&&Date.parse(boundary)<Date.parse(windowEnd)&&(!params.minCreationDate||Date.parse(boundary)>=Date.parse(params.minCreationDate))){nextCursor={offset:0,initialEnd,windowEnd:boundary,windowNumber:windowNumber+1};reason='next_creation_window';}
   else reason='timestamp_partition_unresolved';
  }else reason='provider_range_window_exceeded';
 }else if(response.status===206&&!rows.length)reason='inconsistent_pagination_metadata';
 return {jobs,rowCount:rows.length,nextCursor,complete,reason,url:url.href,page:offset,total,pageKey:`${task.url}:window-${windowNumber}:${offset}`,partition:`ft-window-${windowNumber}`,incrementalEligible:sort==='1'&&windowNumber===0&&(complete||!!nextCursor)&&reason!=='next_creation_window'};
}
export function lbaPosting(row){
 if(row?.identifier?.partner_label==='recruteurs_lba'||row?.offer?.status&&row.offer.status!=='Active')return null;
 const id=row?.identifier?.id,partner=row?.identifier?.partner_label,partnerId=row?.identifier?.partner_job_id;
 // Only LBA's own postings use the documented matcha route. Partner URLs
 // remain the observed apply URL; France Travail uses its verified job ID.
 let url=partner==='offres_emploi_lba'&&id?`https://labonnealternance.apprentissage.beta.gouv.fr/recherche-apprentissage?display=list&page=fiche&type=matcha&itemId=${encodeURIComponent(id)}`:partner==='France Travail'&&partnerId?`https://candidat.francetravail.fr/offres/recherche/detail/${encodeURIComponent(partnerId)}`:row?.apply?.url||'';
 if(partner!=='offres_emploi_lba'&&partner!=='France Travail'){try{const candidate=new URL(url);if(/^\/(?:apply|application|careers?|jobs?)?\/?$/i.test(candidate.pathname)&&!candidate.search)url='';}catch{url='';}}
 return {url,title:row?.offer?.title||'',company:row?.workplace?.name||row?.workplace?.legal_name||'',location:row?.workplace?.location?.address||'',description:[row?.offer?.description,...(row?.offer?.desired_skills||[]),...(row?.offer?.to_be_acquired_skills||[]),...(row?.offer?.access_conditions||[])].filter(Boolean).join('\n'),contract:(row?.contract?.type||[]).join(' '),requisitionId:String(id||partnerId||''),publishedAt:row?.offer?.publication?.creation,isJob:true};
}
export async function lbaPage(source,task,{fetchPage}){
 if(source.api?.mode==='export'){const {lbaExportPage}=await import('./official-feed.mjs');return lbaExportPage(source,task,{fetchPage});}
 const url=endpoint(task.url),params=source.api?.params||{},allowed=new Set(['latitude','longitude','radius','romes','rncp','target_diploma_level','opco','departements','partners_to_exclude']);
 for(const [key,value] of Object.entries(params)){
  if(!allowed.has(key))throw Error('Unsupported La Bonne Alternance search parameter: '+key);
  for(const item of Array.isArray(value)?value:[value])url.searchParams.append(key,String(item));
 }
 if(url.searchParams.has('latitude')!==url.searchParams.has('longitude'))throw Error('La Bonne Alternance requires latitude and longitude together');
 const response=await authenticated(source,url.href,fetchPage);let body;try{body=JSON.parse(response.body);}catch{throw Error('Invalid La Bonne Alternance JSON response');}
 if(!Array.isArray(body.jobs))throw Error('La Bonne Alternance jobs must be an array');
 const jobs=body.jobs.map(lbaPosting).filter(Boolean);
 // The official search has no pagination and caps EACH partner group at 150.
 // Even fewer than 450 results do not prove exhaustive retrieval.
 return {jobs,rowCount:body.jobs.length,nextCursor:null,complete:false,reason:body.warnings?.length?'provider_partial_warnings':'provider_search_window_unverified',url:url.href,page:0,warnings:body.warnings?.map(w=>String(w.code||'provider_warning'))||[],incrementalEligible:false};
}
