import fs from 'node:fs/promises';
import path from 'node:path';
import {skillRoot} from '../runtime.mjs';

export async function validateAssessment(value){
  const schema=JSON.parse(await fs.readFile(path.join(skillRoot,'schemas/assessment.schema.json'),'utf8'));
  const errors=[];
  function visit(data,rule,location){
    if(rule.$ref){visit(data,schema.$defs[rule.$ref.split('/').at(-1)],location);return;}
    const types=Array.isArray(rule.type)?rule.type:[rule.type];
    const actual=data===null?'null':Array.isArray(data)?'array':Number.isInteger(data)?'integer':typeof data;
    if(rule.type&&!types.includes(actual)&&!(actual==='integer'&&types.includes('number'))){errors.push(`${location}: expected ${types.join('|')}`);return;}
    if(rule.enum&&!rule.enum.includes(data))errors.push(`${location}: invalid enum value`);
    if(typeof data==='string'&&rule.minLength&&data.trim().length<rule.minLength)errors.push(`${location}: empty string`);
    if(typeof data==='number'&&((rule.minimum!==undefined&&data<rule.minimum)||(rule.maximum!==undefined&&data>rule.maximum)))errors.push(`${location}: out of range`);
    if(Array.isArray(data)){
      if(rule.minItems!==undefined&&data.length<rule.minItems||rule.maxItems!==undefined&&data.length>rule.maxItems)errors.push(`${location}: invalid array length`);
      data.forEach((item,i)=>rule.items&&visit(item,rule.items,`${location}[${i}]`));
    }
    if(data&&typeof data==='object'&&!Array.isArray(data)){
      for(const key of rule.required||[])if(!(key in data))errors.push(`${location}.${key}: required`);
      for(const [key,item] of Object.entries(data)){
        const child=rule.properties?.[key]||rule.additionalProperties;
        if(child&&typeof child==='object')visit(item,child,`${location}.${key}`);
      }
    }
  }
  visit(value,schema,'assessment');
  if(errors.length)throw Error(`Assessment schema invalid: ${errors.join('; ')}`);
}
