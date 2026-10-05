import path from 'node:path';
import {root} from '../runtime.mjs';
import {home,read,transaction} from './core.mjs';
import {synchronizeDashboard} from './dashboard-sync.mjs';

// Lead transitions are durable first. A failed derived view remains explicitly retryable.
export async function syncDashboardStage(id,{strict=false}={}){
 try{
  const job=(await read(path.join(home,'leads.json'))).jobs.find(j=>j.id===id);
  if(!job)throw Error('Unknown lead ID');
  const result=await synchronizeDashboard(root,home,job);
  await transaction(s=>{const current=s.jobs.find(j=>j.id===id);current.dashboardSynced=!result.archived&&result.complete;current.dashboardSync={complete:result.complete,missing:result.missing,recordId:result.recordId};});
  return {recordId:result.recordId,complete:result.complete,missing:result.missing,changed:result.changed,submissionVerified:result.submissionVerified,warnings:result.issues.filter(i=>i.severity!=='info').length};
 }catch(error){
  await transaction(s=>{const current=s.jobs.find(j=>j.id===id);if(current){current.dashboardSynced=false;current.dashboardSync={complete:false,error:error.message};}});
  if(strict)throw error;
  console.error(JSON.stringify({dashboardSyncPending:id,error:error.message}));return {id,error:error.message};
 }
}
