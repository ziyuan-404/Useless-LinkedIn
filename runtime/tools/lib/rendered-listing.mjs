import {dependency} from '../runtime.mjs';
import {assertPublicUrl} from './core.mjs';

// An isolated public browsing context never imports the user's cookies or profile.
export async function renderListing(url,{beforeNavigation,maxWaitMs=12000,settleMs=600}={}){
 await assertPublicUrl(url);await beforeNavigation?.();const {chromium}=dependency('playwright');
 const browser=await chromium.launch({headless:true});
 try{
  const context=await browser.newContext({userAgent:'UselessLinkedIn/1.0 (public job discovery)'}),page=await context.newPage();
  const hosts=new Map();
  await context.route('**/*',async route=>{
   try{const u=new URL(route.request().url());if(!hosts.has(u.host))hosts.set(u.host,assertPublicUrl(u.href));await hosts.get(u.host);await route.continue();}catch{await route.abort();}
  });
  const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:maxWaitMs});
  if(settleMs)await page.waitForTimeout(settleMs);
  const body=await page.content(),visibleText=await page.locator('body').innerText(),visibleLinks=await page.locator('a[href]').evaluateAll(links=>links.map(a=>({url:a.href,title:a.innerText.trim(),rel:a.rel,label:a.getAttribute('aria-label')||'',isJob:a.getAttribute('itemprop')==='url'&&!!a.closest('[itemtype*="JobPosting"]')})));
  return {status:response?.status()||200,headers:response?await response.allHeaders():{},finalUrl:page.url(),body,visibleText,visibleLinks,rendered:true};
 }finally{await browser.close();}
}
