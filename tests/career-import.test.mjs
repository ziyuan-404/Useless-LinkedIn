import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {spawn} from 'node:child_process';
const fixture=await fs.mkdtemp(path.join(process.env.USELESS_LINKEDIN_TEST_TMP||os.tmpdir(),'career-import-'));
process.env.USELESS_LINKEDIN_WORKSPACE=fixture;process.env.USELESS_LINKEDIN_TEST_LOCAL='1';
const skill=path.resolve(import.meta.dirname,'..');
const {careerProviders,detectCareerProvider,careerProviderPage,careerProviderIds}=await import('../runtime/tools/lib/career-providers.mjs');
const {captureAtsJd}=await import('../runtime/tools/lib/ats-jd.mjs');
const {materialPreflight}=await import('../runtime/tools/lib/work-packets.mjs');
const {buildDiscoveryPlan}=await import('../runtime/tools/lib/discovery-plan.mjs');
const {createDiscoveryFetcher}=await import('../runtime/tools/lib/discovery-policy.mjs');
const {mapBounded}=await import('../runtime/tools/lib/async-pool.mjs');
const {blacklistMatch}=await import('../runtime/tools/lib/blacklist.mjs');
const {buildEvaluationPrompt,callEvaluationModel,validateModelEvaluation,evaluationDefaults}=await import('../runtime/tools/lib/model-evaluation.mjs');
const {validateDecision}=await import('../runtime/tools/lib/assessment-validation.mjs');
const save=async(file,value)=>{await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,JSON.stringify(value));};
const command=(dir,tool,...flags)=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,[path.join(skill,'runtime/tools',tool+'.mjs'),...flags],{cwd:dir,env:{...process.env,USELESS_LINKEDIN_WORKSPACE:dir,PYTHONUTF8:'1'},stdio:['ignore','pipe','pipe']});let out='',err='';child.stdout.on('data',s=>out+=s);child.stderr.on('data',s=>err+=s);child.on('error',reject);child.on('exit',code=>resolve({code,out,err,json:()=>JSON.parse(out)}));});
const json=async(file)=>JSON.parse(await fs.readFile(file,'utf8'));
const networkFixture=async(handler)=>{const app=http.createServer(handler);await new Promise(r=>app.listen(0,'127.0.0.1',r));return {url:`http://127.0.0.1:${app.address().port}`,close:()=>new Promise(r=>app.close(r))};};
const jd=('Alternance software developer. Bachelor education required. Python and JavaScript delivery. Start September 2026. Paris. French and English. ').repeat(8)+'End of full requirements.';
const raw=(url,body,status=200)=>({status,body:JSON.stringify(body),finalUrl:url,headers:{'content-type':'application/json'}});

test('all 102 imported public providers load and detect ATS URLs without network or another profile',async()=>{
 const providers=await careerProviders();assert.equal(providers.size,102);
 assert.deepEqual([...providers.keys()].sort(),careerProviderIds);
 for(const id of ['greenhouse','lever','ashby','workday','bamboohr','smartrecruiters','personio','teamtailor','wttj','remoteok'])assert.ok(providers.has(id),id);
 assert.ok(!providers.has('local-parser'));
 assert.equal((await detectCareerProvider({name:'Fixture',career_url:'https://careers.smartrecruiters.com/Fixture'})).provider.id,'smartrecruiters');
 const config={version:1,portals:[{name:'Fixture',provider:'smartrecruiters',career_url:'https://careers.smartrecruiters.com/Fixture',listing_mode:'fallback',web_search:'fallback'}],discovery:{web_search:false}};
 const plan=buildDiscoveryPlan(config);assert.ok(plan.some(t=>t.kind==='api'&&t.provider==='smartrecruiters'));
});

test('provider pagination resumes a request-budget interruption by replaying saved responses',async()=>{
 const directory=path.join(fixture,'provider-test'),source={name:'Fixture',provider:'smartrecruiters',career_url:'https://careers.smartrecruiters.com/Fixture'},task={id:'resume-fixture',url:source.career_url,cycle:1};
 let calls=0,interrupted=true;
 const fetchPage=async url=>{calls++;const offset=Number(new URL(url).searchParams.get('offset')||0);if(offset&&interrupted)throw Object.assign(Error('budget'),{budget:true});const content=Array.from({length:offset?1:100},(_,i)=>({id:String(offset+i+1),name:'Alternance software '+(offset+i+1),location:{city:'Paris'}}));return raw(url,{content,totalFound:101});};
 await assert.rejects(careerProviderPage(source,task,{directory,fetchPage}),/budget/);assert.equal(calls,2);
 interrupted=false;const result=await careerProviderPage(source,task,{directory,fetchPage});assert.equal(calls,3,'earlier page is replayed without HTTP');assert.equal(result.jobs.length,101);assert.equal(result.complete,false,'unverified provider coverage is explicit');
 assert.ok(result.jobs.every(j=>j.url.startsWith('https://jobs.smartrecruiters.com/')));
});

test('host provider transport preserves manual redirect metadata and swallowed transient failures remain retryable',async()=>{
 const source={name:'Transport fixture',provider:'fixture'},task={id:'transport-fixture',url:'https://fixture.example/careers'};
 const provider={id:'fixture',fetch:async(entry,ctx)=>{
  const response=await ctx.fetchResponse('https://fixture.example/redirect',{redirect:'manual'});assert.equal(response.status,302);assert.equal(response.headers.get('location'),'/new-list');
  try{await ctx.fetchText('https://fixture.example/redirect',{redirect:'manual'});}catch(error){assert.equal(error.status,302);assert.equal(error.location,'/new-list');}
  try{await ctx.fetchJson('https://fixture.example/transient');}catch{}
  return [{url:'https://fixture.example/jobs/1',title:'Developer'}];
 }};
 const result=await careerProviderPage(source,task,{directory:path.join(fixture,'transport'),providers:new Map([['fixture',provider]]),fetchPage:async url=>url.endsWith('/redirect')?{status:302,body:'',finalUrl:url,headers:{location:'/new-list'}}:{status:429,body:'',finalUrl:url,headers:{'retry-after':'60'}}});
 assert.equal(result.jobs.length,1);assert.equal(result.complete,false);assert.equal(result.providerFailure.status,429);assert.equal(result.providerFailure.retryAfter,'60');assert.deepEqual(result.nextCursor,{replay:true});
});

test('ATS JSON captures preserve full JD, closed-state signals and distinguish posting from application route',async()=>{
 let calls=0;
 const gh='https://job-boards.greenhouse.io/fixture/jobs/123';
 const captured=await captureAtsJd(gh,{fetchPage:async url=>{calls++;assert.ok(url.includes('/jobs/123'));assert.ok(url.includes('content=true'));return raw(url,{id:123,title:'Alternance software',content:'<p>'+jd+'</p>',location:{name:'Paris'},offices:[{name:'Paris'}]});}});
 assert.equal(calls,1);assert.equal(captured.liveness.result,'active');assert.ok(captured.jd.endsWith('End of full requirements.'));assert.deepEqual(captured.applyControls,[]);
 assert.ok(materialPreflight({url:gh,state:'awaiting-agent'},{capture:captured}).reasons.includes('application_entry_unverified'));
 const lever=await captureAtsJd('https://jobs.lever.co/fixture/job-id',{fetchPage:async url=>raw(url,{},404)});assert.equal(lever,null,'non-authoritative API 404 must use page fallback');
 const wd=await captureAtsJd('https://fixture.wd3.myworkdayjobs.com/External/job/Paris/Developer_R123',{fetchPage:async url=>raw(url,{jobPostingInfo:{title:'Developer',jobDescription:jd,canApply:false}})});assert.equal(wd.liveness.result,'expired');
 const ghClosed=await captureAtsJd(gh,{fetchPage:async url=>raw(url,{},410)});assert.equal(ghClosed.liveness.result,'expired');
 const ashby=await captureAtsJd('https://jobs.ashbyhq.com/fixture/job-id',{fetchPage:async url=>raw(url,{jobs:[{id:'job-id',title:'Developer',descriptionPlain:jd,isListed:true}]})});assert.equal(ashby.jd,jd);
});

test('host concurrency is bounded and one concurrent robots fetch is shared per origin',async()=>{
 let active=0,max=0;await mapBounded(Array.from({length:9},(_,i)=>i),3,async()=>{active++;max=Math.max(active,max);await new Promise(r=>setTimeout(r,8));active--;});assert.equal(max,3);
 let robots=0,requests=0;
 const fetcher=createDiscoveryFetcher({minIntervalMs:0,beforeRequest:()=>requests++,request:async url=>{if(url.endsWith('/robots.txt')){robots++;await new Promise(r=>setTimeout(r,8));}return {status:200,body:'',headers:{}};}});
 await Promise.all([1,2,3].map(n=>fetcher('https://fixture.example/jobs/'+n)));assert.equal(robots,1);assert.equal(requests,4);
});

test('zero-token scan runs concurrent local sources and preserves budget, coverage and dedup evidence',async()=>{
 const workspace=await fs.mkdtemp(path.join(fixture,'scan-'));let inFlight=0,max=0;
 const server=await networkFixture(async(req,res)=>{inFlight++;max=Math.max(max,inFlight);await new Promise(r=>setTimeout(r,60));res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({jobs:[{url:'https://fixture.example/jobs/'+req.url.slice(1),title:'Alternance software',company:'Fixture'}]}));inFlight--;});
 try{
  const portals=Array.from({length:4},(_,i)=>({name:'source-'+i,api_url:server.url+'/'+i,api:{rows_path:'jobs',exhaustive:true},listing_mode:'disabled',web_search:false}));
  await save(path.join(workspace,'config.json'),{version:1,portals,discovery:{web_search:false,respect_robots:false,min_interval_ms:0}});
  const result=await command(workspace,'scan','--config','config.json','--zero-token','--concurrency','2','--max-requests','4','--summary');assert.equal(result.code,0,result.err);assert.equal(result.json().added,4);assert.equal(result.json().requests,4);assert.equal(max,2);
  const report=await json(path.join(workspace,'个人资料/applications/automation/zero-token-scan.json'));assert.equal(report.modelCalls,0);assert.equal(report.modelTokens,0);assert.equal(report.complete,true);
  const repeat=await command(workspace,'scan','--config','config.json','--zero-token','--resume','--summary');assert.equal(repeat.code,0,repeat.err);assert.equal(repeat.json().added,0);assert.equal((await json(path.join(workspace,'个人资料/applications/automation/leads.json'))).jobs.length,4);
 }finally{await server.close();}
});

test('blacklist gate stops a direct posting before fetching facts or network and keeps originals',async()=>{
 const workspace=await fs.mkdtemp(path.join(fixture,'blacklist-'));
 await save(path.join(workspace,'个人资料/operations/blacklist.json'),{version:1,entries:[{domain:'blocked.example',reason:'Explicit controlled exclusion'}]});
 const result=await command(workspace,'pipeline','--url','https://blocked.example/jobs/1');assert.equal(result.code,0,result.err);assert.equal(result.json().reason,'blacklist');assert.equal(result.json().generated,false);
 assert.equal(blacklistMatch({company:' Fixture ',url:'https://other.example'}, {entries:[{company:'fixture',reason:'fixture'}]}).reason,'fixture');
});

test('all evaluator clients issue one JSON request, normalize usage and reject incomplete output',async()=>{
 const prompt={system:'Output JSON.',user:'Controlled JD data.',bytes:42};
 process.env.SYNTHETIC_EVAL_KEY='not-a-real-secret';
 for(const backend of ['ollama','gemini','openai','openrouter']){
  let calls=0;const response=await callEvaluationModel(prompt,{...evaluationDefaults,backend,model:'fixture-model',base_url:backend==='ollama'?'http://localhost:11434':'https://model.example/v1',api_key_env:'SYNTHETIC_EVAL_KEY'},{fetchPage:async(url,options)=>{
   calls++;assert.equal(options.method,'POST');assert.equal(options.redirect,'error');const body=JSON.parse(options.body);assert.ok(body.model||url.includes('fixture-model'));
   const data=backend==='ollama'?{message:{content:'{}'},prompt_eval_count:12,eval_count:3}:backend==='gemini'?{candidates:[{finishReason:'STOP',content:{parts:[{text:'{}'}]}}],usageMetadata:{promptTokenCount:12,candidatesTokenCount:3}}:{choices:[{finish_reason:'stop',message:{content:'{}'}}],usage:{prompt_tokens:12,completion_tokens:3}};
   return raw(url,data);
  }});assert.equal(calls,1);assert.equal(response.usage.inputTokens,12);assert.equal(response.usage.outputTokens,3);assert.equal(response.text,'{}');
 }
 await assert.rejects(callEvaluationModel(prompt,{...evaluationDefaults,backend:'openai',model:'fixture',base_url:'https://model.example',api_key_env:'SYNTHETIC_EVAL_KEY'},{fetchPage:async url=>raw(url,{choices:[{finish_reason:'length',message:{content:'{}'}}]})}),/incomplete/);
});

test('evaluation retains full requirements and source evidence, omits contacts and cannot enter pipeline as an unreviewed draft',async()=>{
 const basics='Confirmed Bachelor education and Python software delivery. Contact fixture@example.test';
 await fs.mkdir(path.join(fixture,'个人资料/profile'),{recursive:true});await fs.writeFile(path.join(fixture,'个人资料/profile/basics.md'),basics);
 const dir=path.join(fixture,'个人资料/applications/automation/jobs/test');await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,'jd.txt'),jd);
 const context={id:'fixture',contextHash:'fixture-hash',url:'https://fixture.example/jobs/1',captured:{jd,title:'Developer',liveness:{result:'active'}},sources:{'个人资料/profile/basics.md':basics},history:{verified:true,duplicate:'no known application found in pipeline history check'}};
 const prompt=await buildEvaluationPrompt(context,{...evaluationDefaults,model:'fixture'});assert.ok(prompt.user.includes('End of full requirements.'));assert.ok(!prompt.user.includes('fixture@example.test'));
 await assert.rejects(buildEvaluationPrompt(context,{...evaluationDefaults,max_prompt_bytes:50}),/budget/);
 const keys=['contract','rhythm','location','remote','start','education','experience','technology','french','english','permit','salary','credentials','duplicate'];
 const assessment={assessmentType:'gate',contextHash:'fixture-hash',company:'Fixture',role:'Developer',ko:{status:'MARGINAL',items:keys.map(key=>({key,result:'UNKNOWN',reason:'Need exact hard evidence'}))},decision:{route:'needs-user',gaps:['Hard evidence'],nextAction:'Review missing facts',owner:'agent'},questions:[],evaluation:{backend:'fixture',reviewRequired:true}};
 await validateModelEvaluation({assessment,koEvidence:[],requirements:[]},{context,dir});
 await assert.rejects(validateDecision(assessment,{captured:context.captured,contextHash:context.contextHash,dir}),/requires semantic/);
 const fabricated=structuredClone(assessment);fabricated.ko.items[0]={key:'contract',result:'FAIL',reason:'Controlled mismatch',jdQuote:'Alternance'};fabricated.ko.status='FAIL';fabricated.decision.route='skip';
 await assert.rejects(validateModelEvaluation({assessment:fabricated,koEvidence:[{key:'contract',jdQuote:'Alternance',sources:[{path:'个人资料/profile/basics.md',quote:'invented candidate claim'}]}]},{context,dir}),/quote missing/);
});

test('standalone evaluator saves a draft, reuses it without another request and rejects stale facts',async()=>{
 const workspace=await fs.mkdtemp(path.join(fixture,'evaluator-'));
 assert.equal((await command(workspace,'init','--workspace',workspace)).code,0);
 const url='https://fixture.example/jobs/evaluation',at=new Date().toISOString(),id='evaluation-fixture',stateDir=path.join(workspace,'个人资料/applications/automation');
 await save(path.join(stateDir,'leads.json'),{version:1,jobs:[{id,url,key:url,company:'Fixture',title:'Developer',state:'discovered',submitted:false,createdAt:at,lastSeenAt:at}],scans:[]});
 await save(path.join(workspace,'capture.json'),{kind:'full-page',url,finalUrl:url,title:'Developer',company:'Fixture',jd,bodyText:jd+' Apply',applyControls:['Apply'],capturedAt:at});
 const prepared=await command(workspace,'pipeline','--id',id,'--web-capture','capture.json');assert.equal(prepared.code,0,prepared.err);
 const keys=['contract','rhythm','location','remote','start','education','experience','technology','french','english','permit','salary','credentials','duplicate'];let calls=0;
 const server=await networkFixture(async(req,res)=>{
  let text='';for await(const chunk of req)text+=chunk;const input=JSON.parse(JSON.parse(text).messages[1].content);calls++;
  const assessment={assessmentType:'gate',contextHash:input.contextHash,company:'Fixture',role:'Developer',ko:{status:'MARGINAL',items:keys.map(key=>({key,result:'UNKNOWN',reason:'Controlled fixture needs confirmation'}))},decision:{route:'needs-user',gaps:['Missing hard evidence'],nextAction:'Review facts',owner:'agent'},questions:[]};
  res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({assessment,koEvidence:[],requirements:[]})}}],usage:{prompt_tokens:100,completion_tokens:50}}));
 });
 try{
  await save(path.join(workspace,'个人资料/operations/evaluation.json'),{backend:'openai-compatible',model:'fixture-model',base_url:server.url+'/v1',api_key_env:'SYNTHETIC_EVAL_KEY'});
  const first=await command(workspace,'evaluate','--run','--id',id);assert.equal(first.code,0,first.err);assert.equal(first.json().errors,0);assert.equal(first.json().calls,1);assert.equal(calls,1);
  const manifest=await json(first.json().manifest);assert.equal(manifest.items[0].usage.inputTokens,100);assert.equal((await json(manifest.items[0].file)).envelope.assessment.evaluation.reviewRequired,true);
  const second=await command(workspace,'evaluate','--run','--id',id);assert.equal(second.code,0,second.err);assert.equal(second.json().calls,0);assert.equal(second.json().reused,1);assert.equal(calls,1);
  assert.equal((await json(path.join(stateDir,'leads.json'))).jobs[0].state,'awaiting-agent');
  await fs.appendFile(path.join(workspace,'个人资料/profile/basics.md'),'\nUpdated fixture fact.');
  const stale=await command(workspace,'evaluate','--run','--id',id);assert.equal(stale.json().errors,1);assert.equal(calls,1);
 }finally{await server.close();}
});
