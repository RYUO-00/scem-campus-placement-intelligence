import ExcelJS from 'exceljs';
import {
  REGISTRATION_NUMBER_EXAMPLES,
  OFFICIAL_REGISTRATION_PATTERN,
  getRegistrationPolicyReport,
  getValidatedIntakeYear,
} from '../config/registrationPolicy.js';

export const ROSTER_HEADERS = Object.freeze([
  'registration_number', 'full_name', 'branch_code', 'cgpa',
  'active_backlogs', 'graduation_year', 'email', 'phone',
]);

const CANONICAL_BRANCHES = Object.freeze([
  { branchCode: 'CSE', branchName: 'Computer Science and Engineering', registrationCode: 'CS' },
  { branchCode: 'CSE-AIML', branchName: 'Computer Science and Engineering (Artificial Intelligence and Machine Learning)', registrationCode: 'AI' },
  { branchCode: 'EC', branchName: 'Electronics and Computer Engineering', registrationCode: '' },
  { branchCode: 'ECE', branchName: 'Electronics and Communication Engineering', registrationCode: 'EC' },
  { branchCode: 'ISE', branchName: 'Information Science and Engineering', registrationCode: 'IS' },
  { branchCode: 'MECH-ROBOTICS', branchName: 'Mechanical and Robotics Engineering', registrationCode: 'ME' },
]);

const titleStyle = (row, cellCount) => {
  for (let index = 1; index <= cellCount; index += 1) {
    const cell = row.getCell(index);
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF173B4B' } };
    cell.alignment = { vertical: 'middle' };
  }
};

function departmentCounts(records, branch) {
  const students = records.filter((record) => record.branch_code === branch.branchCode);
  const intake2024 = students.filter((record) => getValidatedIntakeYear(record.registration_number, branch.branchCode) === '2024').length;
  const intake2025 = students.filter((record) => getValidatedIntakeYear(record.registration_number, branch.branchCode) === '2025').length;
  return { total: students.length, intake2024, intake2025, other: students.length - intake2024 - intake2025 };
}

function addDepartmentSummary(workbook, records) {
  const summary = workbook.addWorksheet('Department Summary');
  summary.columns = [{ width: 18 }, { width: 72 }, { width: 20 }, { width: 18 }, { width: 17 }, { width: 17 }, { width: 17 }];
  summary.addRow(['Department summary from Roster Import']);
  summary.mergeCells('A1:G1');
  titleStyle(summary.getRow(1), 1);
  summary.getRow(1).height = 26;
  summary.addRow(['Canonical branch code', 'Department name', 'Registration code', 'Import rows', '2024 intake', '2025 intake', 'Other IDs']);
  titleStyle(summary.getRow(2), 7);
  summary.getRow(2).height = 24;

  const start = 3;
  for (const [index, branch] of CANONICAL_BRANCHES.entries()) {
    const rowNumber = start + index;
    const counts = departmentCounts(records, branch);
    summary.addRow([branch.branchCode, branch.branchName, branch.registrationCode || 'Legacy IDs only']);
    summary.getCell(rowNumber, 4).value = {
      formula: `COUNTIF('Roster Import'!$C$2:$C$10001,A${rowNumber})`, result: counts.total,
    };
    summary.getCell(rowNumber, 5).value = branch.registrationCode
      ? { formula: `COUNTIFS('Roster Import'!$C$2:$C$10001,$A${rowNumber},'Roster Import'!$A$2:$A$10001,"4SF24"&$C${rowNumber}&"???")`, result: counts.intake2024 }
      : { formula: '0', result: 0 };
    summary.getCell(rowNumber, 6).value = branch.registrationCode
      ? { formula: `COUNTIFS('Roster Import'!$C$2:$C$10001,$A${rowNumber},'Roster Import'!$A$2:$A$10001,"4SF25"&$C${rowNumber}&"???")`, result: counts.intake2025 }
      : { formula: '0', result: 0 };
    summary.getCell(rowNumber, 7).value = { formula: `D${rowNumber}-E${rowNumber}-F${rowNumber}`, result: counts.other };
  }
  const totalRow = start + CANONICAL_BRANCHES.length;
  summary.addRow(['Overall total']);
  summary.getCell(totalRow, 4).value = { formula: `SUM(D${start}:D${totalRow - 1})`, result: records.length };
  summary.getCell(totalRow, 5).value = { formula: `SUM(E${start}:E${totalRow - 1})`, result: records.filter((record) => getValidatedIntakeYear(record.registration_number, record.branch_code) === '2024').length };
  summary.getCell(totalRow, 6).value = { formula: `SUM(F${start}:F${totalRow - 1})`, result: records.filter((record) => getValidatedIntakeYear(record.registration_number, record.branch_code) === '2025').length };
  summary.getCell(totalRow, 7).value = { formula: `SUM(G${start}:G${totalRow - 1})`, result: records.length - records.filter((record) => getValidatedIntakeYear(record.registration_number, record.branch_code)).length };
  summary.getRow(totalRow).font = { bold: true, color: { argb: 'FF173B4B' } };
  summary.getRow(totalRow).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF4F0' } };
  summary.addRow(['The first worksheet is the only import input. Intake counts reflect the configured registration code for that canonical branch; all remaining rows are listed as Other IDs.']);
  summary.mergeCells(`A${totalRow + 1}:G${totalRow + 1}`);
  summary.getCell(`A${totalRow + 1}`).alignment = { wrapText: true, vertical: 'middle' };
  summary.getCell(`A${totalRow + 1}`).font = { color: { argb: 'FF637477' }, italic: true, size: 10 };
  summary.getRow(totalRow + 1).height = 30;
  summary.views = [{ state: 'frozen', ySplit: 2 }];
  summary.autoFilter = { from: 'A2', to: `G${totalRow - 1}` };
}

export async function createRosterWorkbookBuffer({ records = [], fictionalDemo = false } = {}) {
  const policy = getRegistrationPolicyReport();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Unified Campus Placement Project';
  workbook.subject = fictionalDemo
    ? 'Fictional demonstration student roster and department summary'
    : 'Empty student roster import template and department summary';
  workbook.title = fictionalDemo ? 'Fictional 4SF Demo Roster' : 'SCEM Student Roster Import Template (4SF format)';
  workbook.created = new Date('2026-01-01T00:00:00.000Z');
  workbook.modified = workbook.created;
  workbook.calcProperties = { calcMode: 'auto', fullCalcOnLoad: true, forceFullCalc: true };

  const roster = workbook.addWorksheet('Roster Import', { views: [{ state: 'frozen', ySplit: 1 }] });
  roster.addRow(ROSTER_HEADERS);
  for (const record of records) {
    roster.addRow([
      record.registration_number,
      record.full_name,
      record.branch_code,
      record.cgpa,
      record.active_backlogs,
      record.graduation_year,
      record.email,
      record.phone,
    ]);
  }
  roster.getRow(1).height = 24;
  titleStyle(roster.getRow(1), ROSTER_HEADERS.length);
  roster.autoFilter = { from: 'A1', to: 'H1' };
  [24, 28, 20, 12, 18, 18, 32, 20].forEach((width, index) => { roster.getColumn(index + 1).width = width; });
  roster.getColumn(1).numFmt = '@';
  roster.getColumn(8).numFmt = '@';
  roster.properties.defaultRowHeight = 20;

  addDepartmentSummary(workbook, records);

  const instructions = workbook.addWorksheet('Instructions');
  instructions.columns = [{ width: 34 }, { width: 100 }];
  instructions.addRows([
    [fictionalDemo ? 'Fictional demonstration roster' : 'Student roster import template'],
    ['Purpose', fictionalDemo ? 'All student identities in the Roster Import sheet are fictional examples for local demonstrations; they are not actual SCEM students.' : 'Upload official roster data through the Placement Cell portal. This template is empty by default.'],
    ['Import worksheet', 'Use only the first worksheet, Roster Import. Keep its header row unchanged and put each student on a new row.'],
    ['Required headers', ROSTER_HEADERS.join(', ')],
    ['Registration number', 'Use the full 4SF prefix, intake year 24 or 25, a configured department code, and exactly three digits. Keep the value as text to preserve leading zeros.'],
    ['Normalization', 'The importer trims surrounding whitespace and uppercases letters. Duplicate normalized registration numbers are rejected or skipped without overwriting existing records.'],
    ['Canonical branch', 'branch_code must be an active canonical branch and must match the configured mapping for an official registration department code. Unconfirmed mappings are blocked.'],
    ['Phone', 'The phone column is required as a header; each phone value may be blank.'],
    ['Other fields', 'CGPA must be 0–10, active_backlogs a nonnegative whole number, graduation_year 2000–2100, and email must be valid.'],
    ['Synthetic IDs', 'Existing DEMO-prefixed development IDs remain accepted for local demonstrations. Do not replace official roster IDs with DEMO IDs.'],
  ]);
  titleStyle(instructions.getRow(1), 1);
  for (let row = 2; row <= instructions.rowCount; row += 1) {
    instructions.getCell(row, 1).font = { bold: true, color: { argb: 'FF173B4B' } };
  }
  instructions.views = [{ state: 'frozen', ySplit: 1 }];
  instructions.getRow(1).height = 26;
  for (let row = 2; row <= instructions.rowCount; row += 1) {
    instructions.getCell(row, 2).alignment = { vertical: 'top', wrapText: true };
    instructions.getRow(row).height = 30;
  }

  const guide = workbook.addWorksheet('Registration Format Guide');
  guide.columns = [{ width: 30 }, { width: 34 }, { width: 26 }, { width: 82 }];
  guide.addRows([
    ['Official registration format'],
    ['Pattern', OFFICIAL_REGISTRATION_PATTERN],
    ['Structure', '4SF + intake year + department code + three-digit sequence'],
    ['Supported intake years', policy.intakeYears.join(', ')],
    ['Department mappings', 'Mapping status is explicit. A pending mapping must be confirmed before records can be imported or registered.'],
    ['Registration code', 'Canonical branch_code', 'Mapping status', 'Canonical branch name'],
  ]);
  guide.mergeCells('A1:D1');
  titleStyle(guide.getRow(1), 1);
  titleStyle(guide.getRow(6), 4);
  guide.getRow(1).height = 24;
  guide.getRow(6).height = 24;
  guide.getCell('B2').alignment = { vertical: 'top', wrapText: true };
  guide.getCell('B3').alignment = { vertical: 'top', wrapText: true };
  guide.getCell('B5').alignment = { vertical: 'top', wrapText: true };
  guide.getRow(2).height = 30;
  guide.getRow(3).height = 30;
  guide.getRow(5).height = 42;
  for (const department of policy.departments) {
    guide.addRow([
      department.registrationCode,
      department.branchCode || 'Pending confirmation',
      department.mappingStatus,
      department.branchName || 'Confirm the official department identity and canonical branch.',
    ]);
  }
  const exampleStart = guide.rowCount + 1;
  guide.addRow(['Format examples']);
  guide.mergeCells(`A${exampleStart}:D${exampleStart}`);
  titleStyle(guide.getRow(exampleStart), 1);
  guide.addRow(['Example registration number', 'Intake year', 'Registration department code', 'Sequence']);
  titleStyle(guide.getRow(exampleStart + 1), 4);
  for (const example of REGISTRATION_NUMBER_EXAMPLES) {
    guide.addRow([example, example.slice(3, 5), example.slice(5, 7), example.slice(7)]);
  }
  const cohortStart = guide.rowCount + 1;
  guide.addRow(['Illustrative cohort distribution (not import records)']);
  guide.mergeCells(`A${cohortStart}:D${cohortStart}`);
  titleStyle(guide.getRow(cohortStart), 1);
  guide.addRow(['Registration department code', 'Illustrative intake 24 records', 'Illustrative intake 25 records', 'Note']);
  titleStyle(guide.getRow(cohortStart + 1), 4);
  for (const department of policy.departments) {
    const confirmed = department.mappingStatus === 'confirmed';
    guide.addRow([
      department.registrationCode,
      confirmed ? 4 : 0,
      confirmed ? 2 : 0,
      confirmed
        ? 'Illustrative counts only; the Department Summary reads the actual Roster Import worksheet.'
        : 'No demo rows are generated until this department code has a confirmed branch mapping.',
    ]);
  }
  guide.getColumn(1).numFmt = '@';
  guide.getColumn(2).numFmt = '@';
  guide.getColumn(3).numFmt = '@';
  guide.getColumn(4).numFmt = '@';
  guide.views = [{ state: 'frozen', ySplit: 6 }];
  guide.autoFilter = { from: 'A6', to: 'D12' };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function createRosterTemplateBuffer() {
  return createRosterWorkbookBuffer();
}

export async function createFictionalDemoRosterBuffer(records) {
  return createRosterWorkbookBuffer({ records, fictionalDemo: true });
}
