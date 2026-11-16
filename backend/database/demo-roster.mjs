import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registrationDepartments, validateRegistrationNumber } from '../src/config/registrationPolicy.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const START = '-- BEGIN FICTIONAL 4SF DEMO ROSTER';
const END = '-- END FICTIONAL 4SF DEMO ROSTER';

export async function readFictionalDemoRoster() {
  const sql = await readFile(path.join(here, 'seed.sql'), 'utf8');
  const start = sql.indexOf(START);
  const end = sql.indexOf(END);
  if (start < 0 || end <= start) throw new Error('The fictional 4SF roster section is missing from seed.sql.');
  const block = sql.slice(start + START.length, end);
  const expression = /\('([^']*)','([^']*)','([^']*)',([0-9]+(?:\.[0-9]+)?),(\d+),'([^']*)','([^']*)'\)/g;
  const records = [...block.matchAll(expression)].map(([, registration, name, branchCode, cgpa, graduationYear, phone, email]) => ({
    registration_number: registration,
    full_name: name,
    branch_code: branchCode,
    cgpa: Number(cgpa),
    active_backlogs: 0,
    graduation_year: Number(graduationYear),
    email,
    phone,
  }));
  if (!records.length) throw new Error('No fictional 4SF roster rows were found in seed.sql.');

  const registrations = new Set();
  const emails = new Set();
  const cohorts = new Map();
  for (const record of records) {
    const registration = validateRegistrationNumber(record.registration_number);
    if (!registration.valid || registration.kind !== 'official' || registration.mappingStatus !== 'confirmed') {
      throw new Error(`${record.registration_number} does not have a confirmed official registration mapping.`);
    }
    if (registration.branchCode !== record.branch_code) {
      throw new Error(`${record.registration_number} maps to ${registration.branchCode}, not ${record.branch_code}.`);
    }
    if (/^synthetic\b/i.test(record.full_name)) throw new Error(`${record.registration_number} still has a placeholder name.`);
    if (registrations.has(registration.normalized)) throw new Error(`Duplicate fictional registration number ${registration.normalized}.`);
    if (emails.has(record.email.toLowerCase())) throw new Error(`Duplicate fictional roster email ${record.email}.`);
    registrations.add(registration.normalized);
    emails.add(record.email.toLowerCase());
    const current = cohorts.get(registration.departmentCode) || { '24': 0, '25': 0 };
    current[registration.intakeYear] += 1;
    cohorts.set(registration.departmentCode, current);
  }

  const expectedCodes = Object.entries(registrationDepartments)
    .filter(([, department]) => department.branchCode)
    .map(([code]) => code)
    .sort();
  if (JSON.stringify([...cohorts.keys()].sort()) !== JSON.stringify(expectedCodes)) {
    throw new Error(`Fictional roster departments must match all confirmed codes: ${expectedCodes.join(', ')}.`);
  }
  for (const [code, count] of cohorts) {
    if (count['24'] !== 4 || count['25'] !== 2) {
      throw new Error(`${code} needs four 2024 and two 2025 fictional records; found ${count['24']} and ${count['25']}.`);
    }
  }
  return records;
}

export function fictionalRosterCsv(records) {
  const headers = ['registration_number', 'full_name', 'branch_code', 'cgpa', 'active_backlogs', 'graduation_year', 'email', 'phone'];
  const cell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return [
    headers.join(','),
    ...records.map((record) => headers.map((header) => cell(record[header])).join(',')),
  ].join('\r\n') + '\r\n';
}
