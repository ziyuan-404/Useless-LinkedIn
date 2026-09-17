import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const require=createRequire(import.meta.url);
export function dependency(name){try{return require(name);}catch{const base=process.env.CAREER_NODE_MODULES || path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');return require(path.join(base,name));}}
export function args(argv=process.argv.slice(2)){const r={};for(let i=0;i<argv.length;i++){if(!argv[i].startsWith('--'))throw Error('Unexpected argument');r[argv[i].slice(2)]=argv[i+1]&&!argv[i+1].startsWith('--')?argv[++i]:true;}return r;}
export function slug(s){const v=s.normalize('NFKD').replace(/\p{M}/gu,'').replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,90);if(!v)throw Error('Empty filename');return v;}
