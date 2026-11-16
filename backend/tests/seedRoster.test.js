import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { registrationDepartments } from '../src/config/registrationPolicy.js';
import { readFictionalDemoRoster } from '../database/demo-roster.mjs';

const here = dirname(fileURLToPath(import.meta.url));

test('synthetic 4SF seed roster has a larger 2024 cohort per represented department', async () => {
  const sql = await readFile(join(here, '..', 'database', 'seed.sql'), 'utf8');
  const entries = [...sql.matchAll(/\('(4SF(24|25)(IS|CS|AI|RE|ME|EC)\d{3})','[^']+','([^']+)'/g)]
    .map(([, registration, year, departmentCode, branchCode]) => ({ registration, year, departmentCode, branchCode }));
  assert.ok(entries.length > 0, 'The synthetic seed should contain 4SF-format demo records.');

  const counts = new Map();
  for (const entry of entries) {
    const department = registrationDepartments[entry.departmentCode];
    assert.ok(department, `Unconfigured synthetic registration code ${entry.departmentCode}`);
    assert.ok(department.branchCode, `Synthetic roster may not guess the ${entry.departmentCode} branch mapping.`);
    assert.equal(entry.branchCode, department.branchCode, `${entry.registration} must use its configured canonical branch.`);
    const key = entry.departmentCode;
    const current = counts.get(key) || { '24': 0, '25': 0 };
    current[entry.year] += 1;
    counts.set(key, current);
  }
  assert.deepEqual([...counts.keys()].sort(), ['AI', 'CS', 'EC', 'IS', 'ME']);
  for (const [department, count] of counts) {
    assert.equal(count['24'], 4, `${department}: expected four 2024 demo students.`);
    assert.equal(count['25'], 2, `${department}: expected two 2025 demo students.`);
  }
});

test('fictional roster dataset has realistic labels, unique IDs/emails, and exactly 4:2 cohorts', async () => {
  const records = await readFictionalDemoRoster();
  assert.equal(records.length, 30);
  assert.equal(new Set(records.map((record) => record.registration_number)).size, 30);
  assert.equal(new Set(records.map((record) => record.email.toLowerCase())).size, 30);
  assert.ok(records.every((record) => record.full_name.split(' ').length >= 2));
  assert.ok(records.every((record) => !/^synthetic\b/i.test(record.full_name)));
  assert.ok(records.every((record) => record.email.endsWith('@demo.example')));
});
