import ExcelJS from 'exceljs';

const badFile = (message) => Object.assign(new Error(message), { status: 400 });
const cellText = (value) => {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'object') return String(value);
  if (Array.isArray(value.richText)) return value.richText.map((part) => part.text || '').join('');
  if (value.result != null) return cellText(value.result);
  if (value.text != null) return String(value.text);
  if (value.hyperlink) return String(value.hyperlink);
  return '';
};

export async function parseXlsxRows(buffer) {
  const book = new ExcelJS.Workbook();
  try { await book.xlsx.load(buffer); }
  catch { throw badFile('Could not read this XLSX workbook. Verify that it is a valid .xlsx file.'); }
  const sheet = book.worksheets[0];
  if (!sheet) throw badFile('The workbook does not contain a worksheet.');
  if (sheet.rowCount > 10001) throw badFile('Import one file with no more than 10,000 student rows.');

  const headers = Array.from(sheet.getRow(1).values.slice(1), cellText);
  const normalizedHeaders = headers.map((header) => header.trim().toLowerCase().replace(/[\s-]+/g, '_')).filter(Boolean);
  if (new Set(normalizedHeaders).size !== normalizedHeaders.length) throw badFile('The worksheet contains duplicate column headers.');

  const rows = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const worksheetRow = sheet.getRow(rowNumber);
    const record = {};
    headers.forEach((header, index) => { if (header.trim()) record[header] = cellText(worksheetRow.getCell(index + 1).value); });
    if (Object.values(record).some((value) => value !== '')) rows.push({ ...record, __sourceRowNumber: rowNumber });
  }
  return rows;
}
