import {dependency} from '../runtime.mjs';
import {parse,publicUrl,normalizeUrl,hash} from './core.mjs';

export async function alertLinks(buffer,settings={}){
 const limit=settings.max_message_bytes??8*1024*1024;if(buffer.length>limit)throw Error('Alert exceeds configured message byte budget');
 const {simpleParser}=dependency('mailparser');
 const mail=await simpleParser(buffer,{skipImageLinks:true,skipTextToHtml:true,skipHtmlToText:true,maxHtmlLengthToParse:limit});
 const senders=mail.from?.value?.map(v=>v.address?.toLowerCase())||[];
 if(settings.allowed_senders?.length&&!senders.some(s=>settings.allowed_senders.map(s=>s.toLowerCase()).includes(s)))return {id:hash(buffer),suggestions:[],ignored:'sender_not_allowed'};
 const rows=[...parse(mail.html||'').links,...(String(mail.text||'').match(/https?:\/\/[^\s<>"']+/g)||[]).map(url=>({url,title:''}))];
 const suggestions=[...new Map(rows.flatMap(row=>{
  try{
   const url=publicUrl(row.url),u=new URL(url);
   if(!settings.allowed_hosts?.some(host=>u.hostname===host||u.hostname.endsWith('.'+host)))return [];
   if(/unsubscribe|preferences|privacy|email-settings/i.test(u.href))return [];
   return [[normalizeUrl(url),{url,title:row.title||''}]];
  }catch{return [];}
 })).values()];
 return {id:hash(mail.messageId||buffer),suggestions};
}
