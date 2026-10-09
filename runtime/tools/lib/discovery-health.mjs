export function sourceHealth(previous,logs,{now=new Date().toISOString(),retryHours=6}={}){
 const next={...previous};
 for(const log of logs){
  const attempts=log.attempts.filter(a=>!a.deferred);if(!attempts.length)continue;
  const old=previous[log.name]||{},failed=attempts.filter(a=>a.error),succeeded=attempts.length-failed.length;
  const failures=succeeded?0:(old.consecutiveFailures||0)+failed.length;
  const warning=succeeded&&old.lastFound>0&&log.found===0&&!log.unchanged?'unexpected_zero_results':null;
  next[log.name]={runs:(old.runs||0)+1,successfulRuns:(old.successfulRuns||0)+(succeeded?1:0),lastAttemptAt:now,lastSuccessAt:succeeded?now:old.lastSuccessAt,lastPostingObservedAt:log.found?now:old.lastPostingObservedAt,lastNewPostingAt:old.lastNewPostingAt,lastFound:log.found,consecutiveFailures:failures,warning,reason:failed.at(-1)?.error||warning||null,circuitUntil:failures>=3?new Date(Date.parse(now)+retryHours*3600000).toISOString():null};
 }
 return next;
}
export function discoveryDigest(jobs,report,health){
 const byId=new Map(jobs.map(j=>[j.id,j])),ids=[...new Set((report.added||[]).map(j=>j.id).filter(Boolean))];
 const card=job=>({id:job.id,title:job.title,company:job.company,url:job.url,disposition:job.discoveryDisposition,triage:job.triage?.status||'pending',possiblyClosed:!!job.possiblyClosed,possibleDuplicates:job.possibleDuplicates||[],employerOriginal:!!job.employerOriginal,historyChecked:!!job.historyCheckedAt,submitted:!!job.submitted});
 return {version:1,startedAt:report.startedAt,finishedAt:report.finishedAt,modelCalls:0,modelTokens:0,coverage:report.coverage,complete:report.complete,newCount:ids.length,newJobs:ids.map(id=>byId.get(id)).filter(Boolean).map(card),reviewIds:jobs.filter(j=>j.discoveryDisposition==='review'&&(!j.triage||j.triage.status==='pending')).map(j=>j.id),closureReviewIds:jobs.filter(j=>j.possiblyClosed).map(j=>j.id),observedAgain:(report.duplicates||[]).length,sourceIssues:(report.searchRequests||[]).map(t=>({id:t.id,portal:t.portal,status:t.status,reason:t.reason,nextRetryAt:t.nextRetryAt})),healthWarnings:Object.entries(health).filter(([,v])=>v.warning||v.circuitUntil).map(([portal,v])=>({portal,...v})),identityPolicy:'Only exact identity or observed route evidence merges postings; similar company/title/location remains a review signal.'};
}
