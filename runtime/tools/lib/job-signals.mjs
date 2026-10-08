import {createHash} from 'node:crypto';

// Keep posting identifiers while dropping only campaign parameters.
export function normalizeUrl(raw){
  try{
    const url=new URL(String(raw).trim());
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return '';
    url.protocol='https:';
    if(url.hostname==='app.mokahr.com'){
      const job=/^#\/job\/([^/?#]+)/.exec(url.hash);
      if(job)url.searchParams.set('mokahr_job_id',decodeURIComponent(job[1]));
    }
    if(url.hostname==='app.mokahr.com'||!/^#\/(?:jobs?|positions?)\/[^/?#]+/i.test(url.hash))url.hash='';
    if(/(^|\.)welcometothejungle\.com$/.test(url.hostname)){
      url.hostname='www.welcometothejungle.com';url.pathname=url.pathname.replace(/^\/[a-z]{2}(?:-[a-z]{2})?\/companies\//i,'/companies/');
    }
    if(/(^|\.)linkedin\.com$/.test(url.hostname)){
      const id=/\/jobs\/view\/(?:[^/]*-)?(\d+)\/?$/.exec(url.pathname)?.[1];
      if(id){url.hostname='www.linkedin.com';url.pathname=`/jobs/view/${id}`;url.search='';}
    }
    if(url.hostname==='boards.greenhouse.io')url.hostname='job-boards.greenhouse.io';
    if(['job-boards.greenhouse.io','www.welcometothejungle.com'].includes(url.hostname)){
      const id=url.searchParams.get('gh_jid');if(id&&/^\d+$/.test(id)&&url.pathname.split('/').filter(Boolean)[0]!=='embed'){url.pathname=`/${url.pathname.split('/').filter(Boolean)[0]}/jobs/${id}`;url.searchParams.delete('gh_jid');}
    }
    // Language selectors alter presentation, while job IDs and application tokens remain.
    for(const key of [...url.searchParams.keys()])if(/^(utm_.*|gh_src|fbclid|gclid|mc_cid|mc_eid|igshid|_hsenc|_hsmi|trk|trackingid|refid|lang|language|locale)$/i.test(key))url.searchParams.delete(key);
    url.searchParams.sort();
    if(url.pathname.length>1)url.pathname=url.pathname.replace(/\/$/,'');
    return url.href;
  }catch{return '';}
}

export function fingerprintText(value){
  const clean=String(value||'').toLowerCase().replace(/<[^>]*>|https?:\/\/\S+|&[a-z#0-9]+;/gi,' ').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  if(clean.length<200)return '';
  const words=clean.split(/\s+/);
  if(words.length<3)return '';
  const weight=new Int32Array(64);
  for(let i=0;i<words.length-2;i++){
    const bytes=createHash('sha1').update(words.slice(i,i+3).join(' ')).digest();
    for(let bit=0;bit<64;bit++)weight[bit]+=(bytes[bit>>3]&(1<<(7-(bit&7))))?1:-1;
  }
  let result=0n;
  for(let bit=0;bit<64;bit++)if(weight[bit]>0)result|=1n<<BigInt(63-bit);
  return result.toString(16).padStart(16,'0');
}

export function similarity(left,right){
  if(!/^[0-9a-f]{16}$/.test(left)||!/^[0-9a-f]{16}$/.test(right))return 0;
  let xor=BigInt(`0x${left}`)^BigInt(`0x${right}`),bits=0;
  while(xor){xor&=xor-1n;bits++;}
  return 1-bits/64;
}

export function classifyLiveness({status=0,requestedUrl='',finalUrl='',bodyText='',applyControls=[]}){
  if(status>=500)return {result:'uncertain',code:'server_error',reason:`HTTP ${status}`};
  if(status===404||status===410)return {result:'expired',code:'http_gone',reason:`HTTP ${status}`};
  if(/les candidatures ne sont plus accept[ée]es|n.accept[eé] plus de candidatures|offre (?:n.est plus|plus) disponible/i.test(bodyText))return {result:'expired',code:'fr_closed',reason:'Applications closed'};
  if(/(?:this )?(?:job|position) (?:is )?no longer (?:available|accepting applications)|this job has expired|position has been filled|applications? (?:are|is) closed/i.test(bodyText))return {result:'expired',code:'closed',reason:'Applications closed'};
  if(/stelle (?:ist )?(?:nicht mehr verfügbar|bereits besetzt)|position (?:ist )?bereits besetzt|oferta (?:ya no está disponible|cerrada)|puesto (?:ya )?cubierto|posizione (?:non è più disponibile|chiusa)|vaga (?:encerrada|não está mais disponível)|职位已关闭|岗位已下线/i.test(bodyText))return {result:'expired',code:'localized_closed',reason:'Applications closed'};
  const id=new URL(requestedUrl||'https://example.invalid').searchParams.get('jk');
  if(id&&finalUrl&&!finalUrl.includes(id))return {result:'uncertain',code:'redirected_off_posting',reason:'Posting identifier missing after redirect'};
  if(applyControls.some(x=>/postuler|je postule\b|apply|candidater|envoyer.*candidature/i.test(x)))return {result:'active',code:'apply_control_visible',reason:'Visible apply control'};
  return {result:'uncertain',code:bodyText.trim().length<200?'insufficient_content':'no_apply_control',reason:'Posting status needs review'};
}

export function commercialDeveloper(title){
 const text=String(title||'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
 return /\b(?:business|bussines[s]?)\s+develop(?:er|ment)|\bdeveloppeu(?:r|se)\s+commercial(?:e)?\b/.test(text);
}

export function postingIdentityMismatch(listed,captured){
 const tokens=s=>new Set(String(s||'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').split(' ').filter(x=>x.length>2&&!['alternance','stage','pour','avec','the','and','les','des','une','vous','hfm'].includes(x)));
 const left=tokens(listed.title),right=tokens(captured.title);
 const titleMismatch=left.size>=2&&right.size>=2&&![...left].some(x=>right.has(x));
 const listedCompany=tokens(listed.company),capturedCompany=tokens(captured.company);
 const companyMismatch=listedCompany.size&&capturedCompany.size&&![...listedCompany].some(x=>capturedCompany.has(x));
 return titleMismatch||Boolean(companyMismatch);
}
