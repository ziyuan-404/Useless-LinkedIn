import fs from 'node:fs/promises';
import path from 'node:path';
import {skillRoot as root} from './runtime.mjs';
import {leadStates} from './lib/state-machine.mjs';

const schema=JSON.parse(await fs.readFile(path.join(root,'schemas/state.schema.json'),'utf8'));
if (JSON.stringify(schema.enum)!==JSON.stringify(leadStates)) throw Error('state.schema.json differs from leadStates');
for (const name of (await fs.readdir(path.join(root,'schemas'))).filter(x=>x.endsWith('.json'))) {
  const parsed=JSON.parse(await fs.readFile(path.join(root,'schemas',name),'utf8'));
  if (!parsed.$schema || !parsed.type) throw Error(`Incomplete schema: ${name}`);
  const refs=JSON.stringify(parsed).matchAll(/"\$ref":"([^"]+)"/g);
  for (const [,ref] of refs) if (!ref.startsWith('#/')&&!await fs.stat(path.join(root,'schemas',ref)).then(()=>true,()=>false)) throw Error(`Missing schema reference: ${name} -> ${ref}`);
}

const pipelineSource=await fs.readFile(path.join(root,'.career-os/tools/pipeline.mjs'),'utf8');
if (!pipelineSource.includes('validateAssessment(result)')) throw Error('Pipeline must validate the assessment schema');
for (const [,schemaPath] of pipelineSource.matchAll(/['"]((?:schemas\/)[a-z-]+\.schema\.json)['"]/g)) {
  await fs.access(path.join(root,schemaPath)).catch(()=>{throw Error(`Pipeline references missing schema: ${schemaPath}`);});
}

const files=(await fs.readdir(path.join(root,'workflows'))).filter(x=>x.endsWith('.md')).map(x=>path.join(root,'workflows',x));
files.push(path.join(root,'references/state-machine.md'));
files.push(...(await fs.readdir(path.join(root,'docs'))).filter(x=>x.endsWith('.md')).map(x=>path.join(root,'docs',x)));
const terminologyFiles=[
  path.join(root,'SKILL.md'),
  path.join(root,'agents/openai.yaml'),
  path.join(root,'README.md'),
  path.join(root,'README.en.md'),
  ...(await fs.readdir(path.join(root,'references'))).filter(x=>x.endsWith('.md')).map(x=>path.join(root,'references',x)),
  ...(await fs.readdir(path.join(root,'modules'))).map(x=>path.join(root,'modules',x,'MODULE.md'))
];
const known=new Set(leadStates);
const errors=[];
for (const file of files) {
  const content=await fs.readFile(file,'utf8');
  for (const [,span] of content.matchAll(/`([^`]+)`/g)) {
    if (/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/.test(span) && !span.startsWith('CAREER_')) errors.push(`${path.relative(root,file)}: uppercase state-like token ${span}`);
    if (/^[a-z]+(?:-[a-z]+)+$/.test(span) && !known.has(span)) errors.push(`${path.relative(root,file)}: unknown state-like token ${span}`);
    const target=span.match(/\b--to\s+([a-z][a-z-]*)\b/);
    if (target && !known.has(target[1])) errors.push(`${path.relative(root,file)}: unknown --to state ${target[1]}`);
  }
}
for (const file of [...new Set([...files,...terminologyFiles])]) {
  const content=await fs.readFile(file,'utf8');
  if (/A[–-]H/.test(content)) errors.push(`${path.relative(root,file)}: use A–G analysis + H answer drafts`);
}
if (errors.length) throw Error(errors.join('\n'));
console.log(`Architecture check passed: ${leadStates.length} states, ${new Set([...files,...terminologyFiles]).size} documentation files`);
