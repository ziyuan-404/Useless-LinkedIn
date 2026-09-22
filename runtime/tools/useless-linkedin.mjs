import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {toolsRoot} from './runtime.mjs';

const commands=['init','doctor','migrate','scan','pipeline','tracker','state','authorization','resume'];
const command=process.argv[2];
if (command==='--help' || command==='-h' || !command) {
  console.log(`useless-linkedin.mjs <${commands.join('|')}> [options]`);
  process.exit(command ? 0 : 1);
}
if (!commands.includes(command)) {
  console.error(`Unknown command: ${command}. Use useless-linkedin.mjs --help`);
  process.exit(1);
}

const result=spawnSync(process.execPath,[path.join(toolsRoot,`${command}.mjs`),...process.argv.slice(3)],{stdio:'inherit'});
if (result.error) throw result.error;
process.exit(result.status??1);
