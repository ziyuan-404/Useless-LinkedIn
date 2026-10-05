export async function mapBounded(items,concurrency,fn){
 if(!Number.isInteger(concurrency)||concurrency<1||concurrency>16)throw Error('Concurrency must be 1..16');
 let next=0;const results=new Array(items.length);
 const workers=Array.from({length:Math.min(concurrency,items.length)},async()=>{while(next<items.length){const index=next++;results[index]=await fn(items[index],index);}});
 const settled=await Promise.allSettled(workers),failure=settled.find(x=>x.status==='rejected');if(failure)throw failure.reason;return results;
}
export function serialQueue(){let tail=Promise.resolve();return fn=>{const result=tail.then(fn);tail=result.catch(()=>{});return result;};}
export async function mapPriorityBounded(items,concurrency,priority,fn){
 for(const level of [...new Set(items.map(priority))].sort((a,b)=>a-b))await mapBounded(items.filter(item=>priority(item)===level),concurrency,fn);
}
