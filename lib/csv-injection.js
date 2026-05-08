'use strict';

// CSV injection (a.k.a. "formula injection") — when a spreadsheet opens a CSV
// or XLSX with a cell starting with `=`, `+`, `-`, `@`, `\t`, or `\r`, it can
// execute a formula. Prepend a single quote (technically a leading `'`) to
// neutralize without changing what the user sees in most viewers.
const DANGER = /^[=+\-@\t\r]/;

function defangCell(value) {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'string') return value;
  if (DANGER.test(value)) return `'${value}`;
  return value;
}

function defangRow(row) {
  if (!row || typeof row !== 'object') return row;
  const out = Array.isArray(row) ? row.slice() : { ...row };
  for (const k of Object.keys(out)) out[k] = defangCell(out[k]);
  return out;
}

function defangRows(rows) {
  return Array.isArray(rows) ? rows.map(defangRow) : rows;
}

module.exports = { defangCell, defangRow, defangRows };
