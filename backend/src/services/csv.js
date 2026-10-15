export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); if (row.some((cell) => cell.trim())) rows.push(row);
      row = []; field = '';
    } else field += ch;
  }
  if (quoted) throw Object.assign(new Error('The CSV contains an unclosed quoted value.'), { status: 400 });
  if (field.length || row.length) { row.push(field); if (row.some((cell) => cell.trim())) rows.push(row); }
  if (!rows.length) return [];
  const headers = rows.shift().map((h) => h.replace(/^\uFEFF/, '').trim().toLowerCase());
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}
