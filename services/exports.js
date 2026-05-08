'use strict';

const ExcelJS = require('exceljs');
const { defangCell, defangRows } = require('../lib/csv-injection');

function normalizeSheetName(name) {
  return (
    (name || 'Results')
      .replace(/[\\/?*[\]:]/g, ' ')
      .trim()
      .slice(0, 31) || 'Results'
  );
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function flatten(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if (Array.isArray(value)) return value.join(', ');
    return JSON.stringify(value);
  }
  return value;
}

async function buildXlsxBuffer(rows, sheetName = 'Results') {
  const safe = defangRows(
    rows.map((r) => {
      const out = {};
      for (const k of Object.keys(r)) out[k] = flatten(r[k]);
      return out;
    }),
  );
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Super Data Extractor';
  wb.created = new Date();
  const ws = wb.addWorksheet(normalizeSheetName(sheetName), {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  if (!safe.length) {
    ws.columns = [{ header: 'No data', key: 'empty', width: 24 }];
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  const headers = Object.keys(safe[0]);
  ws.columns = headers.map((h) => ({ header: h, key: h, width: Math.min(Math.max(h.length + 2, 14), 42) }));
  for (const r of safe) ws.addRow(r);

  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
  header.alignment = { vertical: 'middle' };

  for (let i = 0; i < headers.length; i += 1) {
    const col = ws.getColumn(i + 1);
    let max = headers[i].length;
    safe.forEach((r) => {
      const len = String(r[headers[i]] ?? '').length;
      if (len > max) max = len;
    });
    col.width = Math.min(Math.max(max + 2, 14), 60);
  }

  for (let i = 2; i <= safe.length + 1; i += 1) {
    const row = ws.getRow(i);
    const fill = i % 2 === 0 ? 'FFF7FBFF' : 'FFEAF2FF';
    row.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
      cell.alignment = { vertical: 'top', wrapText: true };
    });
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

function buildCsvBuffer(rows) {
  const safe = defangRows(rows);
  if (!safe.length) return Buffer.from('', 'utf8');
  const headers = Object.keys(safe[0]);
  const escape = (v) => {
    const s = flatten(v);
    if (s === '') return '';
    if (/["\n,]/.test(String(s))) return `"${String(s).replace(/"/g, '""')}"`;
    return String(s);
  };
  const lines = [headers.join(',')];
  for (const r of safe) lines.push(headers.map((h) => escape(r[h])).join(','));
  return Buffer.from(lines.join('\r\n'), 'utf8');
}

// Note: defangCell is imported above but used only via defangRows; export for tests.
module.exports = { buildXlsxBuffer, buildCsvBuffer, normalizeSheetName, timestamp, _defangCell: defangCell };
