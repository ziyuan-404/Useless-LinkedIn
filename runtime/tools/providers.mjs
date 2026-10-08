import path from 'node:path';
import {args} from './runtime.mjs';
import {home,write} from './lib/core.mjs';
import {careerProviders,detectCareerProvider} from './lib/career-providers.mjs';
const a=args();if(a.help){console.log('providers [--list] [--detect PUBLIC_CAREER_URL]\nNetwork-free provider inventory and automatic URL routing. Configure career_ops fields under portals.yml.');process.exit(0);}
const providers=await careerProviders(),file=path.join(home,'providers.json');
await write(file,{upstream:'a156d4dfa18cbc3a10da6ebf2a3466ed57e681f8',providers:[...providers.keys()].sort()});
const hit=a.detect?await detectCareerProvider({name:'Detected employer',career_url:a.detect}):null;
console.log(JSON.stringify({count:providers.size,inventory:file,...(a.list?{providers:[...providers.keys()].sort()}:{}),...(a.detect?{detected:hit?.provider?.id||null}: {})}));
