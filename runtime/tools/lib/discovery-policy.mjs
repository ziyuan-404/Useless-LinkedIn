// Network errors and access gates require different recovery paths.
export function httpFailure(raw){
 const status=raw.status;
 if(status>=200&&status<300)return;
 throw Object.assign(Error(`HTTP ${status}`),{status,retryAfter:raw.headers?.['retry-after']});
}
export function failureDisposition(error,{attempt=1,now=Date.now(),baseSeconds=30,maxSeconds=1800}={}){
 if(error.budget)return {status:'partial',reason:'configured_request_budget'};
 if(error.deferredUntil)return {status:'retry-wait',reason:error.message,nextRetryAt:error.deferredUntil};
 const status=error.status??Number(/(?:HTTP|access_)(\d{3})/.exec(error.message)?.[1]);
 const code=error.code||error.cause?.code;
 const transient=status===408||status===425||status===429||status>=500||['ECONNREFUSED','ECONNRESET','ETIMEDOUT','EAI_AGAIN','ENETUNREACH','UND_ERR_CONNECT_TIMEOUT'].includes(code)||/timeout|timed out|fetch failed|connection refused/i.test(error.message);
 if(transient){
  const retry=error.retryAfter,seconds=retry&&/^\d+(?:\.\d+)?$/.test(retry)?Number(retry):null;
  const providerUntil=seconds!==null?now+seconds*1000:Date.parse(retry||'')||0;
  const until=Math.max(now+Math.min(maxSeconds,baseSeconds*2**Math.min(attempt-1,16))*1000,providerUntil);
  return {status:'retry-wait',reason:error.message,failureCode:code||status||error.name,failureClass:'transient',attempts:attempt,nextRetryAt:new Date(until).toISOString()};
 }
 return {status:status===401||status===403||error.blocked?'blocked':'needs-agent',reason:error.message,failureClass:status===401||status===403||error.blocked?'access-gate':'configuration-or-content'};
}

export function robotsPolicy(body,url,agent='UselessLinkedIn'){
 const groups=[];let group=null,hasRules=false;
 for(const line of String(body).split(/\r?\n/)){
  const match=/^\s*([\w-]+)\s*:\s*(.*?)\s*$/.exec(line.replace(/#.*$/,''));if(!match)continue;
  const key=match[1].toLowerCase(),value=match[2];
  if(key==='user-agent'){
   if(!group||hasRules){group={agents:[],rules:[],delay:0};groups.push(group);hasRules=false;}
   group.agents.push(value.toLowerCase());
  }else if(group){hasRules=true;if(['allow','disallow'].includes(key)&&value)group.rules.push({allow:key==='allow',path:value});if(key==='crawl-delay'&&Number.isFinite(Number(value)))group.delay=Math.max(0,Number(value));}
 }
 const score=g=>Math.max(-1,...g.agents.map(a=>a==='*'?0:agent.toLowerCase().includes(a)?a.length:-1));
 const best=Math.max(-1,...groups.map(score)),chosen=groups.filter(g=>score(g)===best&&best>=0);
 const parsed=new URL(url),target=parsed.pathname+parsed.search;
 const matches=chosen.flatMap(g=>g.rules).filter(rule=>{
  const end=rule.path.endsWith('$'),literal=end?rule.path.slice(0,-1):rule.path;
  return new RegExp('^'+literal.split('*').map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*')+(end?'$':'')).test(target);
 }).sort((a,b)=>b.path.replace(/[*$]/g,'').length-a.path.replace(/[*$]/g,'').length||Number(b.allow)-Number(a.allow));
 return {allowed:matches[0]?.allow!==false,delaySeconds:Math.max(0,...chosen.map(g=>g.delay))};
}

export function createDiscoveryFetcher({request,beforeRequest,cache=new Map(),minIntervalMs=500,respectRobots=true,now=()=>Date.now(),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
 const slots=new Map();
 const reserve=async(url,delay=minIntervalMs)=>{
  const origin=new URL(url).origin,wait=Math.max(0,(slots.get(origin)||0)-now());
  if(wait>1000)throw Object.assign(Error('host_crawl_delay'),{deferredUntil:new Date(now()+wait).toISOString()});
  if(wait)await sleep(wait);
  beforeRequest();slots.set(origin,now()+delay);
 };
 const raw=async(url,opts,delay)=>{await reserve(url,delay);return request(url,opts);};
 const fetcher=async(url,opts={},source={})=>{
  let policy={allowed:true,delaySeconds:0};
  if((source.respect_robots??respectRobots)!==false){
   const origin=new URL(url).origin;let entry=cache.get(origin);
   if(!entry||now()-entry.at>86400000){
    const response=await raw(origin+'/robots.txt');
    if(response.status===429||response.status>=500)httpFailure(response);
    if(response.status===401||response.status===403)throw Object.assign(Error('robots_access_gate'),{blocked:true});
    entry={at:now(),body:response.status===404||response.status===410?'':response.body};cache.set(origin,entry);
   }
   policy=robotsPolicy(entry.body,url);
   if(!policy.allowed)throw Object.assign(Error('robots_disallowed'),{blocked:true});
  }
  return raw(url,opts,Math.max(source.min_interval_ms??minIntervalMs,policy.delaySeconds*1000));
 };
 fetcher.beforeNavigation=(url,source={})=>reserve(url,source.min_interval_ms??minIntervalMs);return fetcher;
}
