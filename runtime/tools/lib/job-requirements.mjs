import {createHash} from 'node:crypto';

const sha=value=>createHash('sha256').update(value).digest('hex');
const brand=job=>([job.company,job.title].join(' ').match(/NEXA|AURLOM|Digital School of Paris|CFA WEC|ISCOD|Institut F2I|Ironhack|LIVECAMPUS/i)||[])[0]?.toLowerCase();
export function postingRequirements(job,jd=''){
 const lines=jd.split(/\r?\n|(?<=[.!?])\s+/).map(s=>s.trim()).filter(Boolean),schoolBrand=brand(job);
 const patterns={education:/bac\s*\+\s*[345]|bachelor|master|BTS|ing[ée]nieur/i,start:/20\d\d|septembre|start date|date de d[ée]but/i,rhythm:/rythme|rhythm|\d+\s*(?:semaines?|weeks?|jours?|days?)\s*(?:en|[ée]cole|entreprise|company|school|\/)/i,school:/notre (?:[ée]cole|formation)|inscri.{0,40}(?:formation|[ée]cole|BTS)|int[ée]grer.{0,30}(?:BTS|[ée]cole)|(?:pr[ée]parer|suivre).{0,50}(?:notre|nos|formation)/i};
 const clauses=Object.entries(patterns).flatMap(([kind,re])=>lines.filter(s=>re.test(s)).slice(0,3).map(quote=>({kind,quote,groupId:sha(JSON.stringify([kind,schoolBrand||job.company||job.portal||'',quote])).slice(0,20),reviewRequired:true})));
 return {jdHash:sha(jd),schoolBrand:schoolBrand||null,clauses};
}
export function requirementGroups(cards){
 const groups=new Map();for(const card of cards)for(const clause of card.requirements?.clauses||[]){if(!groups.has(clause.groupId))groups.set(clause.groupId,{...clause,ids:[]});groups.get(clause.groupId).ids.push(card.id);}
 return [...groups.values()].filter(g=>g.ids.length>1||g.review).map(g=>({...g,instruction:'Review this exact source clause once; candidate KO and each posting route remain separate.'}));
}
export const schoolAdvertisement=job=>Boolean(brand(job));
