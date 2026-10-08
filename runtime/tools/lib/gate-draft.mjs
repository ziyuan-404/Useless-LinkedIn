export const koKeys=['contract','rhythm','location','remote','start','education','experience','technology','french','english','permit','salary','credentials','duplicate'];
export function gateDraft({contextHash,company,role}){
 return {assessmentType:'gate',contextHash,company:company||'UNKNOWN — verify employer',role:role||'UNKNOWN — verify role',draft:true,reviewRequired:true,ko:{status:'MARGINAL',items:koKeys.map(key=>({key,result:'UNKNOWN',reason:'Requires JD and candidate source review'}))},decision:{route:'needs-user',gaps:['Draft only: review all 14 checks and literal source evidence'],nextAction:'Review current JD/facts; preserve unknowns. PASS requires full assessment.',owner:'agent'},questions:[]};
}
