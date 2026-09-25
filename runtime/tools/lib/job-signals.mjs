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
    url.hash='';
    for(const key of [...url.searchParams.keys()])if(/^(utm_.*|gh_src|fbclid|gclid|mc_cid|mc_eid|igshid|_hsenc|_hsmi|trk|trackingid)$/i.test(key))url.searchParams.delete(key);
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
  if(/job (?:is )?no longer available|this job has expired|position has been filled|applications? (?:are|is) closed/i.test(bodyText))return {result:'expired',code:'closed',reason:'Applications closed'};
  const id=new URL(requestedUrl||'https://example.invalid').searchParams.get('jk');
  if(id&&finalUrl&&!finalUrl.includes(id))return {result:'uncertain',code:'redirected_off_posting',reason:'Posting identifier missing after redirect'};
  if(applyControls.some(x=>/postuler|apply|candidater|envoyer.*candidature/i.test(x)))return {result:'active',code:'apply_control_visible',reason:'Visible apply control'};
  return {result:'uncertain',code:bodyText.trim().length<200?'insufficient_content':'no_apply_control',reason:'Posting status needs review'};
}
