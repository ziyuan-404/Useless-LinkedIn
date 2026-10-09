import {dependency} from '../runtime.mjs';
import {assertPublicUrl} from './core.mjs';

// An isolated public browsing context never imports the user's cookies or profile.
export async function renderListing(url,{beforeNavigation,maxWaitMs=12000,settleMs=600}={}){
 await assertPublicUrl(url);await beforeNavigation?.();const {chromium}=dependency('playwright');
 const browser=await chromium.launch({headless:true});
 try{
  const context=await browser.newContext({userAgent:'UselessLinkedIn/1.0 (public job discovery)'}),page=await context.newPage();
  const hosts=new Map(),observedResponses=[],pending=new Set();
  page.on('response',response=>{
   const observation=(async()=>{
    const request=response.request(),headers=await request.allHeaders();
    if(request.method()!=='GET'||!['xhr','fetch'].includes(request.resourceType())||headers.authorization||headers.cookie||!response.ok())return;
    const metadata=await response.allHeaders(),length=Number(metadata['content-length']);
    if(!/json/i.test(metadata['content-type']||'')||!Number.isFinite(length)||length<=0||length>8*1024*1024)return;
    const body=await response.text();if(Buffer.byteLength(body)>8*1024*1024)return;
    observedResponses.push({url:response.url(),method:'GET',authenticated:false,body});
   })().catch(()=>{});pending.add(observation);observation.finally(()=>pending.delete(observation));
  });
  await context.route('**/*',async route=>{
   try{const u=new URL(route.request().url());if(!hosts.has(u.host))hosts.set(u.host,assertPublicUrl(u.href));await hosts.get(u.host);await route.continue();}catch{await route.abort();}
  });
  const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:maxWaitMs});
  if(settleMs)await page.waitForTimeout(settleMs);
  await Promise.allSettled([...pending]);
  const body=await page.content(),visibleText=await page.locator('body').innerText(),visibleLinks=await page.locator('a[href]').evaluateAll(links=>links.map(a=>({url:a.href,title:a.innerText.trim(),rel:a.rel,label:a.getAttribute('aria-label')||'',isJob:a.getAttribute('itemprop')==='url'&&!!a.closest('[itemtype*="JobPosting"]')})));
  return {status:response?.status()||200,headers:response?await response.allHeaders():{},finalUrl:page.url(),body,visibleText,visibleLinks,rendered:true,observedResponses};
 }finally{await browser.close();}
}
