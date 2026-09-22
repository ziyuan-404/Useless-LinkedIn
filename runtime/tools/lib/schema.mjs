import fs from 'node:fs/promises';
import path from 'node:path';
import {skillRoot} from '../runtime.mjs';

const schemas=new Map();
async function load(name){
  if(!schemas.has(name))schemas.set(name,JSON.parse(await fs.readFile(path.join(skillRoot,'schemas',name),'utf8')));
  return schemas.get(name);
}
function actualType(value){
  if(value===null)return 'null';
  if(Array.isArray(value))return 'array';
  if(Number.isInteger(value))return 'integer';
  return typeof value;
}
function visit(value,rule,document,location,errors){
  if(rule.$ref){
    const resolved=rule.$ref.startsWith('#/')?rule.$ref.slice(2).split('/').reduce((x,key)=>x[key],document):schemas.get(rule.$ref);
    if(!resolved)throw Error(`Unknown schema reference ${rule.$ref}`);
    visit(value,resolved,rule.$ref.startsWith('#/')?document:resolved,location,errors);return;
  }
  const types=Array.isArray(rule.type)?rule.type:[rule.type];
  const actual=actualType(value);
  if(rule.type&&!types.includes(actual)&&!(actual==='integer'&&types.includes('number'))){errors.push(`${location}: expected ${types.join('|')}`);return;}
  if(rule.const!==undefined&&value!==rule.const)errors.push(`${location}: invalid constant`);
  if(rule.enum&&!rule.enum.includes(value))errors.push(`${location}: invalid enum value`);
  if(typeof value==='string'){
    if(rule.minLength!==undefined&&value.length<rule.minLength)errors.push(`${location}: too short`);
    if(rule.format==='date-time'&&!Number.isFinite(Date.parse(value)))errors.push(`${location}: invalid date-time`);
    if(rule.format==='uri'){try{new URL(value);}catch{errors.push(`${location}: invalid URI`);}}
  }
  if(typeof value==='number'&&((rule.minimum!==undefined&&value<rule.minimum)||(rule.maximum!==undefined&&value>rule.maximum)))errors.push(`${location}: out of range`);
  if(Array.isArray(value)){
    if(rule.minItems!==undefined&&value.length<rule.minItems||rule.maxItems!==undefined&&value.length>rule.maxItems)errors.push(`${location}: invalid array length`);
    value.forEach((item,index)=>rule.items&&visit(item,rule.items,document,`${location}[${index}]`,errors));
  }
  if(value&&typeof value==='object'&&!Array.isArray(value)){
    for(const key of rule.required||[])if(!(key in value))errors.push(`${location}.${key}: required`);
    for(const [key,item] of Object.entries(value)){
      const child=rule.properties?.[key]??rule.additionalProperties;
      if(child===false)errors.push(`${location}.${key}: unexpected property`);
      else if(child&&typeof child==='object')visit(item,child,document,`${location}.${key}`,errors);
    }
    if(rule.if){
      const conditionErrors=[];visit(value,rule.if,document,location,conditionErrors);
      if(conditionErrors.length===0&&rule.then)visit(value,rule.then,document,location,errors);
    }
  }
}
export async function validateSchema(name,value){
  const schema=await load(name);
  for(const ref of JSON.stringify(schema).matchAll(/"\$ref":"([^#][^"]*)"/g))await load(ref[1]);
  const errors=[];visit(value,schema,schema,name.replace('.schema.json',''),errors);
  if(errors.length)throw Error(`${name} invalid: ${errors.join('; ')}`);
}
export const validateAssessment=value=>validateSchema('assessment.schema.json',value);
export const validateLead=value=>validateSchema('lead.schema.json',value);
export const validateAuthorization=value=>validateSchema('authorization.schema.json',value);
