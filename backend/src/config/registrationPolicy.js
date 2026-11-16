const intakeYears = Object.freeze(['24', '25']);

// Keep registration codes separate from application branch_code values. Only map
// a code when the department identity is supported by the supplied format and
// the college's published program names. A null branchCode deliberately blocks
// imports and account registration until that mapping is confirmed.
export const registrationDepartments = Object.freeze({
  IS: Object.freeze({ branchCode: 'ISE', branchName: 'Information Science and Engineering' }),
  CS: Object.freeze({ branchCode: 'CSE', branchName: 'Computer Science and Engineering' }),
  AI: Object.freeze({ branchCode: 'CSE-AIML', branchName: 'Computer Science and Engineering (Artificial Intelligence and Machine Learning)' }),
  RE: Object.freeze({ branchCode: null, branchName: null }),
  ME: Object.freeze({ branchCode: 'MECH-ROBOTICS', branchName: 'Mechanical and Robotics Engineering' }),
  EC: Object.freeze({ branchCode: 'ECE', branchName: 'Electronics and Communication Engineering' }),
});

const departmentCodes = Object.keys(registrationDepartments);
const escapedCodes = departmentCodes.join('|');
const escapedYears = intakeYears.join('|');

export const OFFICIAL_REGISTRATION_PATTERN = `^4SF(${escapedYears})(${escapedCodes})\\d{3}$`;
export const OFFICIAL_REGISTRATION_REGEX = new RegExp(OFFICIAL_REGISTRATION_PATTERN);
export const OFFICIAL_REGISTRATION_SQL_PATTERN = OFFICIAL_REGISTRATION_PATTERN.replace('\\d', '[0-9]');
export function getOfficialRegistrationSqlPattern(intakeYear) {
  if (!intakeYears.includes(String(intakeYear))) throw new Error('Unsupported registration intake year.');
  return `^4SF${intakeYear}(${escapedCodes})[0-9]{3}$`;
}
export const REGISTRATION_NUMBER_EXAMPLES = Object.freeze([
  '4SF24IS001', '4SF24IS002', '4SF25IS001',
  '4SF24CS001', '4SF25CS001', '4SF24AI001', '4SF25AI001',
  '4SF24RE001', '4SF25RE001', '4SF24ME001', '4SF25ME001',
  '4SF24EC001', '4SF25EC001',
]);

const demoRegistrationRegex = /^DEMO\d{4}[A-Z0-9-]{1,32}$/;
const normalize = (value) => typeof value === 'string' ? value.trim().toUpperCase() : '';

export function normalizeRegistrationNumber(value) {
  return normalize(value);
}

export function validateRegistrationNumber(value) {
  const normalized = normalizeRegistrationNumber(value);
  if (!normalized) return { valid: false, normalized, error: 'Registration number is required.' };

  // These IDs are already used by the synthetic local seed and development tests.
  if (demoRegistrationRegex.test(normalized)) {
    return { valid: true, normalized, kind: 'demo', departmentCode: null, branchCode: null, mappingStatus: 'legacy-demo' };
  }

  if (!normalized.startsWith('4SF')) {
    return { valid: false, normalized, error: 'Registration number must preserve the complete 4SF prefix.' };
  }

  const intakeYear = normalized.slice(3, 5);
  if (!intakeYears.includes(intakeYear)) {
    return { valid: false, normalized, error: `Intake year must be ${intakeYears.join(' or ')}.` };
  }

  const departmentCode = normalized.slice(5, 7);
  const department = registrationDepartments[departmentCode];
  if (!department) {
    return { valid: false, normalized, error: `Department code ${departmentCode || '(missing)'} is not configured.` };
  }

  if (!/^\d{3}$/.test(normalized.slice(7))) {
    return { valid: false, normalized, error: 'Registration number must end with exactly three digits.' };
  }

  if (!department.branchCode) {
    return {
      valid: true,
      normalized,
      kind: 'official',
      intakeYear,
      departmentCode,
      branchCode: null,
      mappingStatus: 'unresolved',
      mappingError: `Registration department code ${departmentCode} has no confirmed canonical branch mapping. Confirm it with the Placement Cell before importing or registering this record.`,
    };
  }

  return {
    valid: true,
    normalized,
    kind: 'official',
    intakeYear,
    departmentCode,
    branchCode: department.branchCode,
    branchName: department.branchName,
    mappingStatus: 'confirmed',
  };
}

export function getValidatedIntakeYear(value, canonicalBranchCode) {
  const registration = validateRegistrationNumber(value);
  if (!registration.valid || registration.kind !== 'official') return null;
  if (registration.mappingStatus !== 'confirmed' || registration.branchCode !== canonicalBranchCode) return null;
  return `20${registration.intakeYear}`;
}

// Directory search also accepts partial registration IDs. Normalize only ID-like
// terms, leaving names untouched; the SQL search itself remains case-insensitive.
export function normalizeRegistrationSearchTerm(value) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return /^(?:4SF|DEMO)/i.test(trimmed) ? normalizeRegistrationNumber(trimmed) : trimmed;
}

export function getRegistrationPolicyReport() {
  return {
    prefix: '4SF',
    intakeYears: [...intakeYears],
    sequenceDigits: 3,
    pattern: OFFICIAL_REGISTRATION_PATTERN,
    legacyDemoPattern: '^DEMO\\d{4}[A-Z0-9-]{1,32}$',
    departments: departmentCodes.map((code) => ({
      registrationCode: code,
      branchCode: registrationDepartments[code].branchCode,
      branchName: registrationDepartments[code].branchName,
      mappingStatus: registrationDepartments[code].branchCode ? 'confirmed' : 'unresolved',
    })),
  };
}
