import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';

test('Playwright PDFs pass compression and rendered PDF QA',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'useless-linkedin-pdf-'));
  await fs.mkdir(path.join(dir,'work'));
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage();
    for(const name of ['candidate-CV','candidate-Lettre']){
      await page.setContent(`<html><body><h1>${name}</h1><p>Reviewed application material fixture.</p></body></html>`);
      await page.pdf({path:path.join(dir,`${name}.pdf`),format:'A4'});
    }
  }finally{await browser.close();}
  const script=path.resolve(import.meta.dirname,'../runtime/tools/pdf-qa.py');
  const result=spawnSync(process.env.USELESS_LINKEDIN_PYTHON||'python',[script,dir],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  const qa=JSON.parse(await fs.readFile(path.join(dir,'work/qa.json'),'utf8'));
  assert.equal(qa.files.length,2);
  assert.equal(qa.state,'pending-visual-review');
  for(const entry of qa.files)assert.ok((await fs.stat(path.join(dir,'work',`${path.parse(entry.file).name}-pdf.png`))).size>0);
});
