import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateEligibility, applicationTransitions } from '../src/services/eligibility.js';

const drive={minimum_cgpa:7,maximum_backlogs:0,application_deadline:new Date(Date.now()+86400000).toISOString(),status:'published'};
const student={branch_id:'cse-id',cgpa:8,active_backlogs:0};

test('eligible student receives a pass and a criteria snapshot',()=>{
 const result=evaluateEligibility(student,drive,['cse-id']);
 assert.equal(result.eligible,true);assert.deepEqual(result.reasons,[]);assert.equal(result.criteriaAtApplication.maximumBacklogs,0);
});
test('CGPA, branch, and backlog failures return explicit reasons',()=>{
 const result=evaluateEligibility({...student,cgpa:6,active_backlogs:2},drive,['other-id']);
 assert.equal(result.eligible,false);assert.equal(result.reasons.length,3);
});
test('incomplete academics, closed drive, and expired deadline fail safely',()=>{
 const result=evaluateEligibility({branch_id:'cse-id',cgpa:null,active_backlogs:null},{...drive,status:'closed',application_deadline:'2020-01-01'},[]);
 assert.equal(result.eligible,false);assert.equal(result.reasons.length,4);
});
test('rejected applications can return to review while offers remain terminal',()=>{
 assert.deepEqual(applicationTransitions.rejected,['under_review']);assert.ok(applicationTransitions.applied.includes('under_review'));assert.ok(!applicationTransitions.offered.includes('applied'));
});
