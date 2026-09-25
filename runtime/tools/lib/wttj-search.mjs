const origin='https://www.welcometothejungle.com';

function readCredentials(text){
  const start=text.indexOf('{'),end=text.lastIndexOf('}');
  if(start<0||end<=start)throw Error('WTTJ credentials unavailable');
  const data=JSON.parse(text.slice(start,end+1));
  const appId=data.PUBLIC_ALGOLIA_APPLICATION_ID,key=data.PUBLIC_ALGOLIA_API_KEY_CLIENT;
  if(!/^[a-z0-9]{6,16}$/i.test(appId)||typeof key!=='string'||key.length<16||key.length>500)throw Error('WTTJ credentials invalid');
  return {appId,key};
}

function jobFromHit(hit){
  const title=hit?.name,slug=hit?.slug,organization=hit?.organization?.slug;
  if(typeof title!=='string'||!title.trim()||typeof slug!=='string'||typeof organization!=='string'||!/^[a-z0-9_-]+$/i.test(slug)||!/^[a-z0-9_-]+$/i.test(organization))return null;
  const office=hit.offices?.[0]||{};
  return {url:`${origin}/en/companies/${organization}/jobs/${slug}`,title:title.trim(),company:hit.organization.name||'',location:[office.city,office.country,hit.remote==='fulltime'?'Remote':''].filter(Boolean).join(', ')};
}

export async function searchWttj(entry,{fetchText,fetchJson}){
  const settings=entry.wttj||{};
  const queries=Array.isArray(settings.queries)?settings.queries.filter(x=>typeof x==='string'&&x.trim()):[];
  const filters=typeof settings.filters==='string'?settings.filters.trim():'';
  if(!queries.length&&!filters)throw Error('WTTJ requires queries or filters');
  if(filters.length>1000)throw Error('WTTJ filter too long');
  const {appId,key}=readCredentials(await fetchText(`${origin}/api/env`,{}));
  const max=Math.min(Number.isInteger(settings.max_hits)&&settings.max_hits>0?settings.max_hits:100,filters?1000:200);
  const jobs=new Map();
  for(const query of queries.length?queries:['']){
    const params=new URLSearchParams({query,hitsPerPage:String(max),attributesToRetrieve:'name,slug,organization,offices,remote'});
    if(filters)params.set('filters',filters);
    const data=await fetchJson(`https://${appId}-dsn.algolia.net/1/indexes/wttj_jobs_production_en/query`,{method:'POST',headers:{'x-algolia-application-id':appId,'x-algolia-api-key':key,referer:`${origin}/`,'content-type':'application/json'},body:JSON.stringify({params:params.toString()})});
    if(!Array.isArray(data?.hits))throw Error('WTTJ returned no jobs array');
    for(const hit of data.hits){const job=jobFromHit(hit);if(job)jobs.set(job.url,job);}
  }
  return [...jobs.values()];
}
