const norm=s=>String(s||'').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,' ').trim();
export const successStatement=/application (?:has been |was )?(?:submitted|sent|received)|thank you for (?:applying|your application)|(?:received|reçu|reçue|reception|réception).{0,100}(?:application|candidature)|candidature.{0,100}(?:envoyée|envoyee|transmise|validée|validee|reçue|recue)|merci (?:pour|de).{0,80}candidature/i;
export const failedStatement=/(?:application|candidature).{0,100}(?:not (?:been )?(?:submitted|sent|received)|could not|failed|n['’]a pas|n['’]est pas)|(?:unable to|could not|échec|echec).{0,80}(?:application|candidature)/i;
export function emailQuery(job,since){
 const literal=value=>String(value||'').replace(/["\\\r\n]/g,' ').trim();
 return `after:${Math.floor(Date.parse(since)/1000)} -in:trash -in:spam ("${literal(job.title)}" OR "${literal(job.company)}")`;
}
export function normalizeEmail(input){
 const email=input.structuredContent||input,headers=email.payload?.headers||email.headers||[];
 const header=name=>Array.isArray(headers)?headers.find(h=>h.name?.toLowerCase()===name.toLowerCase())?.value||'':headers[name]||headers[name.toLowerCase()]||'';
 const parts=[];
 function walk(part){if(part?.mime_type==='text/plain'||part?.mimeType==='text/plain')parts.push(part.body?.content||'');if(part?.mime_type==='text/html'||part?.mimeType==='text/html')parts.push(part.body?.content||'');for(const p of part?.parts||[])walk(p);}
 walk(email.payload);
 const body=email.body||email.text||parts.join('\n');
 return {messageId:email.id||email.message_id||header('Message-ID'),threadId:email.thread_id||email.threadId,from:header('From')||email.from,to:header('To')||email.to,subject:header('Subject')||email.subject||'',date:header('Date')||email.date,body:String(body),labels:email.label_ids||email.labelIds||[],attachments:(email.payload?.parts||email.attachments||[]).filter(p=>p.filename).map(p=>({filename:p.filename,size:p.body?.size||p.size}))};
}
export function verifyEmailReceipt(job,input,{since,now=Date.now(),sentRoute=false,recipient}={}){
 const email=normalizeEmail(input),when=Date.parse(email.date);
 if(!email.messageId||!email.from||!email.to||!email.body.trim()||!Number.isFinite(when)||when<Date.parse(since)-300000||when>now+300000)throw Error('A dated original email with headers after this application attempt is required');
 const searchable=norm(email.subject+'\n'+email.body);
 if(!(job.title&&job.company&&searchable.includes(norm(job.title))&&searchable.includes(norm(job.company)))&&!searchable.includes(norm(job.url)))throw Error('Email does not identify this job title/company or exact URL');
 const sent=email.labels.includes('SENT');
 if(sentRoute){
  if(!sent||!recipient||!norm(email.to).includes(norm(recipient)))throw Error('Sent application must match the observed employer email route');
  const expected=job.approvalSnapshot?.materials||[];
  if(!expected.length||expected.some(m=>!email.attachments.some(a=>a.filename===m.path.split(/[\\/]/).at(-1))))throw Error('Sent application attachments do not match reviewed materials');
 }else{
  if(sent||email.labels.includes('DRAFT'))throw Error('A sent or draft message is not an incoming confirmation');
  if(/confirmez|confirmer (?:ma|votre) candidature|confirm (?:your|my) application|verify your email|finaliser votre candidature|verification code|one.time password|code de vérification|mot de passe/i.test(email.subject+'\n'+email.body))throw Error('Email requires confirmation; application is not yet confirmed');
  if(failedStatement.test(email.subject+'\n'+email.body)||!successStatement.test(email.subject+'\n'+email.body))throw Error('No explicit application receipt in this email');
 }
 // The message ID allows re-reading the original. Keep confirmation text, never authentication links.
 let removedLinks=0;email.body=email.body.replace(/https?:\/\/[^\s"'<>]+/g,url=>{if(url===job.url){const publicUrl=new URL(url);publicUrl.search='';publicUrl.hash='';return publicUrl.href;}removedLinks++;return '[link omitted]';});
 return {schema:'application-confirmation/v1',jobId:job.id,type:'email',observedAt:new Date(now).toISOString(),email,removedLinks,route:sentRoute?'employer-email':'incoming-confirmation'};
}
