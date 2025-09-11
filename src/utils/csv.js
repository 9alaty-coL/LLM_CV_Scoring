// Minimal CSV parser and stringifier (handles commas, quotes, newlines in quoted fields)
// Assumes UTF-8 text input.

export function parseCsv(text) {
  const rows = [];
  let i = 0, field = '', row = [], inQuotes = false;
  while (i < text.length) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') { // escaped quote
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += char;
      i++;
    } else {
      if (char === '"') { inQuotes = true; i++; }
      else if (char === ',') { row.push(field); field=''; i++; }
      else if (char === '\r') { i++; }
      else if (char === '\n') { row.push(field); rows.push(row); row=[]; field=''; i++; }
      else { field += char; i++; }
    }
  }
  // trailing field
  if (field.length > 0 || inQuotes || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function csvRowsToObjects(rows) {
  if (!rows.length) return [];
  const header = rows[0].map(h => h.trim());
  return rows.slice(1).filter(r => r.some(c => c.trim() !== '')).map(r => {
    const obj = {};
    header.forEach((h, idx) => { obj[h] = r[idx] != null ? r[idx] : ''; });
    return obj;
  });
}

export function stringifyCsv(rows) {
  return rows.map(r => r.map(v => {
    const s = String(v ?? '').replace(/"/g,'""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  }).join(',')).join('\n');
}

export function objectsToCsv(objs) {
  if (!objs.length) return '';
  const headers = Object.keys(objs[0]);
  const dataRows = objs.map(o => headers.map(h => o[h]));
  return stringifyCsv([headers, ...dataRows]);
}