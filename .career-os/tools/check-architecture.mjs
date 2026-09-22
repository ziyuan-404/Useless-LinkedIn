import fs from 'node:fs/promises';
import path from 'node:path';
import {root} from './runtime.mjs';
import {leadStates} from './lib/state-machine.mjs';

const schema=JSON.parse(await fs.readFile(path.join(root,'schemas/state.schema.json'),'utf8'));
if (JSON.stringify(schema.enum)!==JSON.stringify(leadStates)) throw Error('state.schema.json differs from leadStates');
for (const name of (await fs.readdir(path.join(root,'schemas'))).filter(x=>x.endsWith('.json'))) {
  const parsed=JSON.parse(await fs.readFile(path.join(root,'schemas',name),'utf8'));
  if (!parsed.$schema || !parsed.type) throw Error(`Incomplete schema: ${name}`);
  const refs=JSON.stringify(parsed).matchAll(/"\$ref":"([^"]+)"/g);
  for (const [,ref] of refs) if (!await fs.stat(path.join(root,'schemas',ref)).then(()=>true,()=>false)) throw Error(`Missing schema reference: ${name} -> ${ref}`);
}

const files=(await fs.readdir(path.join(root,'workflows'))).filter(x=>x.endsWith('.md')).map(x=>path.join(root,'workflows',x));
files.push(path.join(root,'references/state-machine.md'));
files.push(...(await fs.readdir(path.join(root,'docs'))).filter(x=>x.endsWith('.md')).map(x=>path.join(root,'docs',x)));
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
if (errors.length) throw Error(errors.join('\n'));
console.log(`Architecture check passed: ${leadStates.length} states, ${files.length} documentation files`);
