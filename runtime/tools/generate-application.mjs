import {args} from './runtime.mjs';
import {generateApplication} from './lib/material-generator.mjs';
const a=args();
if(a.help){console.log('generate-application.mjs --company COMPANY --role ROLE --claims FILE [--date YYYY-MM-DD] [--validate-only] [--reuse]');process.exit(0);}
const result=await generateApplication(a);
console.log(JSON.stringify(result));
