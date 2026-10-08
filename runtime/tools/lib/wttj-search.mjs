const origin='https://www.welcometothejungle.com';

function readCredentials(text){
  const start=text.indexOf('{'),end=text.lastIndexOf('}');
  if(start<0||end<=start)throw Error('WTTJ credentials unavailable');
  const data=JSON.parse(text.slice(start,end+1));
  const appId=data.PUBLIC_ALGOLIA_APPLICATION_ID,key=data.PUBLIC_ALGOLIA_API_KEY_CLIENT;
  if(!/^[a-z0-9]{6,16}$/i.test(appId)||typeof key!=='string'||key.length<16||key.length>500)throw Error('WTTJ credentials invalid');
  return {appId,key};
}

export function jobFromHit(hit){
  const title=hit?.name,slug=hit?.slug,organization=hit?.organization?.slug;
  if(typeof title!=='string'||!title.trim()||typeof slug!=='string'||typeof organization!=='string'||!/^[a-z0-9_-]+$/i.test(slug)||!/^[a-z0-9_-]+$/i.test(organization))return null;
  const office=hit.offices?.[0]||{};
  return {url:`${origin}/en/companies/${organization}/jobs/${slug}`,title:title.trim(),company:hit.organization.name||'',location:[office.city,office.country,hit.remote==='fulltime'?'Remote':''].filter(Boolean).join(', '),requisitionId:String(hit.objectID||slug),isJob:true};
}

export async function searchWttjPage(entry,{fetchText,fetchJson,query='',page=0,credentials}){
  const settings=entry.wttj||{};
  const filters=typeof settings.filters==='string'?settings.filters.trim():'';
  const {appId,key}=credentials||readCredentials(await fetchText(`${origin}/api/env`,{}));
  const size=settings.page_size??settings.max_hits??100;
  if(!Number.isInteger(size)||size<1)throw Error('WTTJ page_size must be a positive integer');
  const params=new URLSearchParams({query,page:String(page),hitsPerPage:String(size),attributesToRetrieve:'objectID,name,slug,organization,offices,remote'});
  if(filters)params.set('filters',filters);
  const data=await fetchJson(`https://${appId}-dsn.algolia.net/1/indexes/wttj_jobs_production_en/query`,{method:'POST',headers:{'x-algolia-application-id':appId,'x-algolia-api-key':key,referer:`${origin}/`,'content-type':'application/json'},body:JSON.stringify({params:params.toString()})});
  if(!Array.isArray(data?.hits))throw Error('WTTJ returned no jobs array');
  const known=Number.isInteger(data.nbPages),nextPage=known&&page+1<data.nbPages?page+1:null;
  const windowLimited=known&&Number.isFinite(data.nbHits)&&data.nbHits>data.nbPages*(data.hitsPerPage||size);
  const jobs=data.hits.map(jobFromHit).filter(Boolean),unusableRecords=data.hits.length-jobs.length;
  return {jobs,unusableRecords,rowCount:data.hits.length,nextPage,total:data.nbHits,credentials:{appId,key},
   complete:known&&nextPage===null&&!windowLimited&&!unusableRecords,reason:windowLimited?'provider_search_window':unusableRecords?'unusable_posting_records':!known?'pagination_metadata_missing':nextPage===null?'exhausted':'next_page'};
}

export async function searchWttj(entry,dependencies){
  const queries=entry.wttj?.queries??entry.queries??[''];
  const jobs=new Map(),coverage=[];
  let credentials;
  for(const query of queries){
   let page=0;const seen=new Set();let complete=false,reason='not_started';
   while(page!==null){
    const data=await searchWttjPage(entry,{...dependencies,query,page,credentials});credentials=data.credentials;
    const key=JSON.stringify(data.jobs.map(j=>j.url));if(data.jobs.length&&seen.has(key)){reason='repeated_page';break;}seen.add(key);
    for(const job of data.jobs)jobs.set(job.url,job);page=data.nextPage;
    complete=data.complete;reason=data.reason;
   }
   coverage.push({query,complete,reason});
  }
  return {jobs:[...jobs.values()],coverage,complete:coverage.every(x=>x.complete)};
}
