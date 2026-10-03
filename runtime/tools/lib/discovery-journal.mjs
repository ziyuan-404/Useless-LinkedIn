import fs from 'node:fs/promises';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';

function open(home){
 const db=new DatabaseSync(path.join(home,'discovery.sqlite'));
 db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS pending (sequence INTEGER PRIMARY KEY AUTOINCREMENT, payload TEXT NOT NULL);');return db;
}
// A page is durable before its cursor advances; legacy JSON remains a batch snapshot.
export async function stageDiscovery(home,jobs){
 if(!jobs.length)return;await fs.mkdir(home,{recursive:true});const db=open(home);
 try{db.prepare('INSERT INTO pending(payload) VALUES (?)').run(JSON.stringify(jobs));}finally{db.close();}
}
export async function pendingDiscovery(home){
 if(!await fs.stat(path.join(home,'discovery.sqlite')).then(()=>true,()=>false))return [];
 const db=open(home);try{return db.prepare('SELECT sequence,payload FROM pending ORDER BY sequence').all().map(row=>({...row,jobs:JSON.parse(row.payload)}));}finally{db.close();}
}
export function acknowledgeDiscovery(home,sequence){const db=open(home);try{db.prepare('DELETE FROM pending WHERE sequence<=?').run(sequence);}finally{db.close();}}
