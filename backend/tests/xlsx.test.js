import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { parseXlsxRows } from '../src/services/xlsx.js';

async function bufferFrom(rows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Students');
  for (const row of rows) sheet.addRow(row);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

test('reads XLSX values and preserves original worksheet row numbers', async () => {
  const buffer = await bufferFrom([
    ['registration_number', 'full_name', 'branch_code', 'cgpa'],
    ['A100', 'Aria Student', 'CSE', 8.5],
    [],
    ['A101', 'Bo Student', 'ISE', 7.75],
  ]);
  const rows = await parseXlsxRows(buffer);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].cgpa, '8.5');
  assert.equal(rows[0].__sourceRowNumber, 2);
  assert.equal(rows[1].registration_number, 'A101');
  assert.equal(rows[1].__sourceRowNumber, 4);
});

test('rejects normalized duplicate XLSX headers', async () => {
  const buffer = await bufferFrom([['registration number', 'registration_number'], ['A100', 'A101']]);
  await assert.rejects(parseXlsxRows(buffer), { message: 'The worksheet contains duplicate column headers.' });
});

test('rejects malformed XLSX content with a client error', async () => {
  await assert.rejects(parseXlsxRows(Buffer.from('not a workbook')), (error) => error.status === 400 && /valid \.xlsx file/.test(error.message));
});
