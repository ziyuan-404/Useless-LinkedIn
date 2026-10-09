import fs from 'node:fs/promises';
import path from 'node:path';
import {args,root,dependency} from './runtime.mjs';
import {read,write,home,hash} from './lib/core.mjs';
import {alertLinks} from './lib/alert-links.mjs';
import {acquireFileLock} from './lib/file-lock.mjs';
const a=args();
if(a.help){console.log('alerts --eml FILE_OR_DIRECTORY | --imap [--settings FILE] [--limit 100]\nRead-only alert intake. Requires allowed_hosts; IMAP additionally requires an explicit mailbox, senders and environment credentials. Output links must be verified by scan --alerts FILE.');process.exit(0);}
if(!a.eml&&!a.imap)throw Error('Choose --eml or --imap');
const settings=await read(path.resolve(root,a.settings||'个人资料/operations/alerts.json'),{});
if(!Array.isArray(settings.allowed_hosts)||!settings.allowed_hosts.length)throw Error('Configure allowed_hosts for alert links');
const limit=Number(a.limit??100);if(!Number.isInteger(limit)||limit<1)throw Error('limit must be a positive integer');
await fs.mkdir(home,{recursive:true});const lock=await acquireFileLock(path.join(home,'.alerts.lock'));
try{
 const file=path.join(home,'alert-links.json'),state=await read(path.join(home,'alerts-state.json'),{messages:[],files:{}}),saved=await read(file,[]),seen=new Set(state.messages),links=new Map(saved.map(s=>[s.url,s]));let processed=0,pending=0;
 const consume=async bytes=>{const mail=await alertLinks(bytes,settings);if(!seen.has(mail.id)){for(const link of mail.suggestions)links.set(link.url,link);seen.add(mail.id);}processed++;};
 if(a.eml){
  const source=path.resolve(root,a.eml),stat=await fs.stat(source),files=stat.isDirectory()?(await fs.readdir(source)).filter(n=>n.toLowerCase().endsWith('.eml')).sort().map(n=>path.join(source,n)):[source];
  for(const name of files){const key=hash(name),stat=await fs.stat(name),stamp=stat.mtimeMs+':'+stat.size;if(state.files[key]===stamp)continue;if(processed>=limit){pending++;continue;}if(stat.size>(settings.max_message_bytes??8*1024*1024))throw Error('Alert exceeds message byte budget');await consume(await fs.readFile(name));state.files[key]=stamp;}
 }else{
  const imap=settings.imap;
  if(!imap?.host||!imap.mailbox||!settings.allowed_senders?.length)throw Error('IMAP needs explicit host, mailbox and allowed_senders');
  const user=process.env[imap.user_env],pass=process.env[imap.password_env];if(!user||!pass)throw Error('IMAP environment credentials missing');
  const {ImapFlow}=dependency('imapflow'),client=new ImapFlow({host:imap.host,port:imap.port??993,secure:true,auth:{user,pass},logger:false,disableAutoIdle:true,socketTimeout:30000});
  try{
   await client.connect();const mailboxLock=await client.getMailboxLock(imap.mailbox,{readOnly:true});
   try{
    const account=hash(imap.host+'|'+user+'|'+imap.mailbox),validity=String(client.mailbox.uidValidity),previous=state.imap;
    let uid=previous?.account===account&&previous.validity===validity?previous.uid:0;
    const uids=(await client.search({uid:`${uid+1}:*`},{uid:true})).filter(n=>n>uid).sort((a,b)=>a-b);
    for(const n of uids){if(processed>=limit){pending++;continue;}const meta=await client.fetchOne(n,{size:true,envelope:true},{uid:true});if(meta.size>(settings.max_message_bytes??8*1024*1024))throw Error('Alert exceeds message byte budget');
     const sender=meta.envelope?.from?.map(s=>s.address?.toLowerCase())||[];
     if(sender.some(s=>settings.allowed_senders.map(s=>s.toLowerCase()).includes(s))){const msg=await client.fetchOne(n,{source:true},{uid:true});await consume(msg.source);}else processed++;
     uid=n;state.imap={account,validity,uid};
    }
   }finally{mailboxLock.release();}
  }finally{if(client.usable)await client.logout();else client.close();}
 }
 state.messages=[...seen];await write(file,[...links.values()]);await write(path.join(home,'alerts-state.json'),state);
 console.log(JSON.stringify({file,processed,pending,links:links.size,complete:pending===0,verificationRequired:true}));
}finally{await lock.close();}
