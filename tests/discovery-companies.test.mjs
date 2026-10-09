import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
const skill=path.resolve(process.env.USELESS_LINKEDIN_TEST_SKILL||path.join(import.meta.dirname,'..'));
const dir=await fs.mkdtemp(path.join(process.env.USELESS_LINKEDIN_TEST_TMP||os.tmpdir(),'ul-company-registry-'));
process.env.USELESS_LINKEDIN_WORKSPACE=dir;
const lib=name=>import(pathToFileURL(path.join(skill,'runtime/tools/lib',name)).href);
const {parse}=await lib('core.mjs');
const {companySources}=await lib('company-registry.mjs');
const {buildDiscoveryPlan}=await lib('discovery-plan.mjs');
const {careerProviderIds}=await lib('career-providers.mjs');
await fs.mkdir(path.join(dir,'个人资料'),{recursive:true});
const config={version:1,queries:['alternance data','stage software'],query_matrix:{contracts:['alternance','stage'],roles:['data','software']},locations:['France','Lyon','Toulouse'],discovery:{web_search:false}};
const save=companies=>fs.writeFile(path.join(dir,'个人资料/companies.yml'),JSON.stringify({version:1,companies}));

test('France employer catalog has distinct public career entries and one primary task per employer',async()=>{
 const file=path.join(skill,'workspace-template/个人资料/companies.yml');
 const catalog=parse(await fs.readFile(file,'utf8'),'yaml');
 assert.equal(catalog.catalog.market,'France');assert.ok(catalog.companies.length>=100);
 assert.ok(new Set(catalog.companies.map(c=>c.sector)).size>=14);
 assert.equal(new Set(catalog.companies.map(c=>c.name.toLocaleLowerCase('fr'))).size,catalog.companies.length);
 assert.equal(new Set(catalog.companies.map(c=>c.career_url)).size,catalog.companies.length);
 for(const c of catalog.companies){assert.equal(new URL(c.career_url).protocol,'https:');assert.ok(!c.provider||careerProviderIds.includes(c.provider));if(c.provider==='greenhouse')assert.ok(c.board_token);if(['lever','ashby'].includes(c.provider))assert.ok(c.site);assert.equal(c.provider_exhaustive,undefined);assert.equal(c.career_ops?.max_pages,undefined);}
 await save(catalog.companies);const portals=await companySources(config);
 const tasks=buildDiscoveryPlan({...config,portals});
 for(const source of portals){const primary=tasks.filter(t=>t.portal===source.name&&!t.fallbackOnly);assert.equal(primary.length,1,source.name);assert.equal(primary[0].query,'');assert.equal(primary[0].location,'');}
});

test('curated registry reuses a discovered Workday board across locale URLs',async()=>{
 const registered=[{name:'Workday: acme.wd3.myworkdayjobs.com/External',provider:'workday',career_url:'https://acme.wd3.myworkdayjobs.com/External',enabled:true}];
 await save([{name:'Synthetic Employer',career_url:'https://acme.wd3.myworkdayjobs.com/fr-FR/External'}]);
 const sources=await companySources(config,{registered});assert.equal(sources[0].name,registered[0].name);assert.equal(sources[0].company,'Synthetic Employer');
 const merged=[...new Map([...registered,...sources].map(s=>[s.name,s])).values()];
 assert.equal(buildDiscoveryPlan({...config,portals:merged}).filter(t=>!t.fallbackOnly).length,1);
});

test('disabling a curated company also disables its discovered source',async()=>{
 const registered=[{name:'Discovered board',career_url:'https://acme.wd3.myworkdayjobs.com/External',enabled:true}];
 await save([{name:'Synthetic Employer',career_url:'https://acme.wd3.myworkdayjobs.com/fr-FR/External',enabled:false}]);
 const sources=await companySources(config,{registered});assert.equal(sources[0].name,'Discovered board');assert.equal(sources[0].enabled,false);
 const merged=[...new Map([...registered,...sources].map(s=>[s.name,s])).values()];assert.equal(buildDiscoveryPlan({...config,portals:merged}).length,0);
});

test('company label similarity never merges different boards',async()=>{
 await save([{name:'Synthetic Employer',career_url:'https://another.wd3.myworkdayjobs.com/External'}]);
 const sources=await companySources(config,{registered:[{name:'Old board',company:'Synthetic Employer',career_url:'https://acme.wd3.myworkdayjobs.com/External'}]});assert.equal(sources[0].name,'Company: Synthetic Employer');
});

test('an employer with multiple real boards schedules each board without multiplying queries',async()=>{
 await save([{name:'Synthetic Employer',career_url:'https://employer.example/careers',provider:'greenhouse',boards:[{career_url:'https://job-boards.greenhouse.io/acme',board_token:'acme'},{career_url:'https://job-boards.greenhouse.io/acmelabs',board_token:'acmelabs'}]}]);
 const sources=await companySources(config),tasks=buildDiscoveryPlan({...config,portals:sources});assert.equal(sources.length,2);assert.equal(tasks.filter(t=>!t.fallbackOnly).length,2);assert.ok(sources.every(s=>s.company==='Synthetic Employer'));assert.equal(new Set(tasks.map(t=>t.id)).size,tasks.length);
});

test('disabled employers cannot be reactivated by an enabled child board',async()=>{
 const registered=[{name:'Existing board',career_url:'https://job-boards.greenhouse.io/acme'}];
 await save([{name:'Synthetic Employer',enabled:false,career_url:'https://employer.example/careers',boards:[{career_url:'https://job-boards.greenhouse.io/acme',enabled:true}]}]);
 const sources=await companySources(config,{registered});assert.equal(sources[0].enabled,false);assert.equal(buildDiscoveryPlan({...config,portals:sources}).length,0);
});

test('same-host boards infer distinct identities without inheriting the group token',async()=>{
 await save([{name:'Synthetic Employer',career_url:'https://employer.example/careers',provider:'greenhouse',board_token:'old-token',boards:[{career_url:'https://job-boards.greenhouse.io/acme'},{career_url:'https://job-boards.greenhouse.io/acmelabs'}]}]);
 const sources=await companySources(config);assert.deepEqual(sources.map(s=>s.board_token),['acme','acmelabs']);assert.equal(new Set(sources.map(s=>s.name)).size,2);assert.equal(buildDiscoveryPlan({...config,portals:sources}).filter(t=>!t.fallbackOnly).length,2);
});

test('large scan plans flush complete JSON through a paused stdout pipe',async()=>{
 await save([]);const queries=Array.from({length:1500},(_,i)=>'alternance software '+i);
 await fs.writeFile(path.join(dir,'large-plan.json'),JSON.stringify({...config,queries,query_matrix:{},locations:['France'],portals:[{name:'Synthetic Board',search_domain:'employer.example'}]}));
 const child=spawn(process.execPath,[path.join(skill,'runtime/tools/scan.mjs'),'--config','large-plan.json','--plan'],{cwd:dir,env:{...process.env,USELESS_LINKEDIN_WORKSPACE:dir}});
 let stdout='',stderr='';child.stdout.on('data',chunk=>stdout+=chunk);child.stdout.pause();child.stderr.on('data',chunk=>stderr+=chunk);
 const resume=setTimeout(()=>child.stdout.resume(),1500);
 const status=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});clearTimeout(resume);
 assert.equal(status,0,stderr);assert.ok(stdout.length>256*1024);const plan=JSON.parse(stdout);assert.equal(plan.taskCount,queries.length);assert.equal(plan.tasks.length,queries.length);assert.ok(plan.tasks.some(t=>t.query.includes('1499')));
});

test.after(()=>fs.rm(dir,{recursive:true,force:true}));
