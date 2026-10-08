import test from 'node:test';
import assert from 'node:assert/strict';
import {localMinute,submissionFields} from '../runtime/dashboard/dashboard-datetime.js';

test('untouched historical dates and timestamp precision survive form serialization',()=>{
 const historical={date:'2026-09-19',submitted_at:''};
 assert.deepEqual(submissionFields({value:'',dataset:{dateOnly:historical.date}},historical),historical);
 const precise={date:'2020-01-01',submitted_at:'2026-10-03T20:38:49.271Z'};
 assert.deepEqual(submissionFields({value:localMinute(precise.submitted_at),dataset:{dateOnly:precise.date}},precise),precise);
});

test('single input updates the legacy date and exact time together, allowing date-only edits',()=>{
 const original={date:'2026-09-19',submitted_at:''};
 assert.deepEqual(submissionFields({value:'',dataset:{dateOnly:'2026-09-20'}},original),{date:'2026-09-20',submitted_at:''});
 const minute='2026-10-03T22:38';
 assert.deepEqual(submissionFields({value:minute,dataset:{dateOnly:'2026-10-03'}},original),{date:'2026-10-03',submitted_at:new Date(minute).toISOString()});
 assert.deepEqual(submissionFields({value:'',dataset:{dateOnly:'2026-10-04'}}),{date:'2026-10-04',submitted_at:''});
});
