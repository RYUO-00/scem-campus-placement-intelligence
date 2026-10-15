import { parseXlsxRows } from './xlsx.js';
import { parseCsv } from './csv.js';
import { pool } from '../config/db.js';

const required = ['registration_number','full_name','branch_code','cgpa','active_backlogs','graduation_year','email'];
const normalize = (row) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== '__sourceRowNumber').map(([key,value]) => [String(key).trim().toLowerCase().replace(/[\s-]+/g,'_'), String(value ?? '').trim()]));
export async function parseUpload(file) {
  const ext = file.originalname.toLowerCase().split('.').at(-1);
  let rows;
  if (ext === 'csv') rows = parseCsv(file.buffer.toString('utf8'));
  else if (ext === 'xlsx') rows = await parseXlsxRows(file.buffer);
  else throw Object.assign(new Error('Use a .csv or .xlsx file.'), { status: 415 });
  if (!rows.length) throw Object.assign(new Error('The file has headers but no student rows.'), { status: 400 });
  const normalized = rows.map((row) => ({ ...normalize(row), ...(row.__sourceRowNumber ? { __sourceRowNumber: row.__sourceRowNumber } : {}) }));
  const headers = new Set(Object.keys(normalized[0]));
  const missing = required.filter((header) => !headers.has(header));
  if (missing.length) throw Object.assign(new Error(`Missing required columns: ${missing.join(', ')}.`), { status: 400 });
  if (normalized.length > 10000) throw Object.assign(new Error('Import one file with no more than 10,000 rows.'), { status: 400 });
  const branchRows = await pool.query('SELECT branch_code,branch_id FROM branches WHERE is_active=true');
  const branches = new Map(branchRows.rows.map((branch) => [branch.branch_code.toUpperCase(), branch.branch_id]));
  const seen = new Set();
  const output = [];
  for (let index = 0; index < normalized.length; index++) {
    const row = normalized[index];
    const errors = [];
    const reg = row.registration_number?.trim();
    const email = row.email?.trim().toLowerCase();
    const name = row.full_name?.trim();
    const branchCode = row.branch_code?.trim().toUpperCase();
    const cgpa = Number(row.cgpa), backlogs = Number(row.active_backlogs), year = Number(row.graduation_year);
    if (!reg || reg.length > 60) errors.push('Registration number is required (max 60 characters).');
    if (!name || name.length > 120) errors.push('Full name is required (max 120 characters).');
    if (!branches.has(branchCode)) errors.push('Branch code is not an active configured branch.');
    if (!Number.isFinite(cgpa) || cgpa < 0 || cgpa > 10) errors.push('CGPA must be between 0 and 10.');
    if (!Number.isInteger(backlogs) || backlogs < 0) errors.push('Active backlogs must be a nonnegative whole number.');
    if (!Number.isInteger(year) || year < 2000 || year > 2100) errors.push('Graduation year must be between 2000 and 2100.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '')) errors.push('A valid email address is required for student account linking.');
    const duplicate = reg && seen.has(reg.toUpperCase());
    if (reg) seen.add(reg.toUpperCase());
    if (duplicate) errors.push('Registration number appears more than once in this file.');
    const payload = { registration_number: reg, full_name: name, branch_id: branches.get(branchCode), cgpa, active_backlogs: backlogs, graduation_year: year, phone: row.phone || null, contact_email: email };
    output.push({ row_number: row.__sourceRowNumber ?? index + 2, payload: errors.length ? {} : payload, errors, action: errors.length ? 'fail' : 'insert' });
  }
  const validRegs = output.filter((r) => r.action === 'insert').map((r) => r.payload.registration_number);
  if (validRegs.length) {
    const existing = await pool.query('SELECT upper(registration_number) AS value FROM students WHERE upper(registration_number)=ANY($1::text[])', [validRegs.map((v) => v.toUpperCase())]);
    const existingSet = new Set(existing.rows.map((r) => r.value));
    for (const item of output) if (item.action === 'insert' && existingSet.has(item.payload.registration_number.toUpperCase())) {
      item.action = 'skip'; item.payload = {}; item.errors = ['Registration number already exists; existing records are never overwritten.'];
    }
  }
  return output;
}
