import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
export const matchLevels=['高','中','低','延伸','无法评分'];
export async function validateMatchReview(review,{workspace,job,dir}){
 if(review.jobId!==job.id||!matchLevels.includes(review.matchLevel)||typeof review.reason!=='string'||review.reason.trim().length<20)throw Error('Match review requires the job ID, matchLevel and a substantive reason');
 if(!Array.isArray(review.sources)||review.sources.length<2)throw Error('Match review requires JD and candidate fact sources');
 const profile=await fs.realpath(path.join(workspace,'个人资料/profile')),jd=await fs.realpath(path.join(dir,'jd.txt'));let hasJd=false,hasFacts=false;const sources=[];
 for(const source of review.sources){
  const file=await fs.realpath(path.resolve(workspace,source.path));const isJd=file===jd,isFact=file.startsWith(profile+path.sep);if(!isJd&&!isFact)throw Error('Match source must be this JD or candidate profile');
  const text=await fs.readFile(file,'utf8'),sha256=createHash('sha256').update(text).digest('hex');
  if(typeof source.quote!=='string'||source.quote.length<8||!text.includes(source.quote)||source.sha256&&source.sha256!==sha256)throw Error('Match source changed or quote is missing');
  hasJd||=isJd;hasFacts||=isFact;sources.push({...source,sha256});
 }
 if(!hasJd||!hasFacts)throw Error('Match review requires both JD and candidate facts');
 return {...review,sources,reviewedAt:new Date().toISOString()};
}
