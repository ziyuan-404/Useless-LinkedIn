import path from 'node:path';
import {args} from './runtime.mjs';
import {home,hash,write,capture} from './lib/core.mjs';
const a=args();if(a.help){console.log('fetch-jd --url PUBLIC_POSTING_URL\nPublic ATS API first, HTTP fallback; persists complete JD and liveness evidence.');process.exit(0);}
if(!a.url)throw Error('Provide --url');const result=await capture(a.url),dir=path.join(home,'jd-fetch',hash(a.url).slice(0,16));
await write(path.join(dir,'capture.json'),result);await write(path.join(dir,'jd.txt'),result.jd||'');
console.log(JSON.stringify({capture:path.join(dir,'capture.json'),jd:path.join(dir,'jd.txt'),liveness:result.liveness,layer:result.layer,applicationRouteVerified:result.applicationRouteVerified??null}));
