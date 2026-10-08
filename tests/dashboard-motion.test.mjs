import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

test('empty filters preserve the viewport without retaining the old table height',async()=>{
 const source=await fs.readFile(new URL('../runtime/dashboard/dashboard.js',import.meta.url),'utf8');
 const code=source.slice(source.indexOf('let retainedNaturalEnd'),source.indexOf('function replayLanguageTrend'));
 const main={offsetHeight:3500,offsetTop:66,style:{}};
 const pagination={offsetHeight:50,offsetTop:1200,offsetParent:null,getBoundingClientRect(){throw Error('painted FLIP bounds must not set document height');}};
 const listeners=new Map();
 const context={scrollY:600,innerHeight:900,$:selector=>selector==='main'?main:pagination,getComputedStyle:()=>({paddingBottom:'56'}),window:{addEventListener(type,listener){listeners.set(type,listener);}}};
 vm.createContext(context);vm.runInContext(code,context);
 const release=context.retainFilterViewport();assert.equal(main.style.minHeight,'3500px');
 release();assert.equal(main.style.minHeight,'1434px');
 context.scrollY=400;listeners.get('scroll')();assert.equal(main.style.minHeight,'');
 context.scrollY=600;context.retainFilterViewport()();
 context.releaseFilterViewport();assert.equal(main.style.minHeight,'');
});
