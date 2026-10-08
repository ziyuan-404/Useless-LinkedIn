export function localMinute(stamp){
 if(!stamp||!Number.isFinite(Date.parse(stamp)))return '';
 const date=new Date(stamp);return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
}
export const recordDate=record=>record.submitted_at?localMinute(record.submitted_at).replace('T',' '):record.date;
export function timestampFromInput(value){if(!value)return '';const date=new Date(value);if(!Number.isFinite(date.getTime()))throw Error('Invalid submission time');return date.toISOString();}

// A single control may retain a historical date without inventing a clock time.
// Keep original timestamp precision when its displayed minute was not edited.
export function submissionFields(input,original){
 const unchanged=original&&input.value===localMinute(original.submitted_at);
 return {date:unchanged&&input.dataset.dateOnly===original.date?original.date:input.value.slice(0,10)||input.dataset.dateOnly||'',submitted_at:unchanged?original.submitted_at||'':timestampFromInput(input.value)};
}
