import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REGISTRATION_NUMBER_EXAMPLES,
  OFFICIAL_REGISTRATION_REGEX,
  getValidatedIntakeYear,
  getRegistrationPolicyReport,
  normalizeRegistrationNumber,
  normalizeRegistrationSearchTerm,
  validateRegistrationNumber,
} from '../src/config/registrationPolicy.js';

test('accepts every supplied 2024 and 2025 registration format as text', () => {
  assert.equal(REGISTRATION_NUMBER_EXAMPLES.length, 13);
  for (const example of REGISTRATION_NUMBER_EXAMPLES) {
    assert.match(example, OFFICIAL_REGISTRATION_REGEX);
    assert.equal(validateRegistrationNumber(example).valid, true, example);
  }
  assert.equal(validateRegistrationNumber(' 4sf24is001 ').normalized, '4SF24IS001');
  assert.equal(validateRegistrationNumber('4SF24IS001').normalized, '4SF24IS001');
  assert.equal(normalizeRegistrationNumber(' 4sf24is001 '), '4SF24IS001');
});

test('rejects obsolete prefixes, unsupported years/codes, and invalid sequence lengths', () => {
  for (const value of ['24AI001', 'RE001', 'ME001', '4SA24IS001']) {
    assert.equal(validateRegistrationNumber(value).valid, false, value);
  }
  assert.match(validateRegistrationNumber('4SF23IS001').error, /Intake year/);
  assert.match(validateRegistrationNumber('4SF24ZZ001').error, /not configured/);
  for (const value of ['4SF24IS', '4SF24IS01', '4SF24IS0001', '4SF24IS00A']) {
    assert.match(validateRegistrationNumber(value).error, /exactly three digits/);
  }
});

test('keeps registration department mappings explicit and reports unresolved codes', () => {
  const report = getRegistrationPolicyReport();
  const mapping = new Map(report.departments.map((row) => [row.registrationCode, row]));
  assert.equal(mapping.get('IS').branchCode, 'ISE');
  assert.equal(mapping.get('CS').branchCode, 'CSE');
  assert.equal(mapping.get('AI').branchCode, 'CSE-AIML');
  assert.equal(mapping.get('EC').branchCode, 'ECE');
  assert.equal(mapping.get('ME').branchCode, 'MECH-ROBOTICS');
  assert.deepEqual(report.departments.filter((row) => row.mappingStatus === 'unresolved').map((row) => row.registrationCode), ['RE']);
  const unresolved = validateRegistrationNumber('4SF24RE001');
  assert.equal(unresolved.valid, true);
  assert.equal(unresolved.mappingStatus, 'unresolved');
  assert.match(unresolved.mappingError, /no confirmed canonical branch mapping/);
});

test('derives intake years only for valid IDs whose mapping matches the canonical branch', () => {
  assert.equal(getValidatedIntakeYear('4SF24CS001', 'CSE'), '2024');
  assert.equal(getValidatedIntakeYear('4SF25AI001', 'CSE-AIML'), '2025');
  assert.equal(getValidatedIntakeYear('4SF24CS001', 'ECE'), null);
  assert.equal(getValidatedIntakeYear('4SF24RE001', 'CSE'), null);
  assert.equal(getValidatedIntakeYear('DEMO2026CSE001', 'CSE'), null);
  assert.equal(getValidatedIntakeYear('4SF24CS01', 'CSE'), null);
});

test('preserves legacy synthetic DEMO identifiers and normalizes directory ID search', () => {
  assert.equal(validateRegistrationNumber('demo2026aiml001').kind, 'demo');
  assert.equal(validateRegistrationNumber('DEMO2026CSE001').valid, true);
  assert.equal(validateRegistrationNumber('DEMO2026EC001').valid, true);
  assert.equal(normalizeRegistrationSearchTerm(' 4sf24is001 '), '4SF24IS001');
  assert.equal(normalizeRegistrationSearchTerm('  DEMO2026cse001  '), 'DEMO2026CSE001');
  assert.equal(normalizeRegistrationSearchTerm('  Aria Rao  '), 'Aria Rao');
});
