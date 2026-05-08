'use strict';

const express = require('express');
const database = require('../database');
const { ValidationError } = require('../lib/errors');
const exportSvc = require('../services/exports');
const { requireSession } = require('../middleware/auth');

const router = express.Router();

function sanitizeFilename(name) {
  if (!name || typeof name !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 200);
}

router.post('/', requireSession, async (req, res, next) => {
  try {
    const { data = [], sheetName = 'Results', filename } = req.body || {};
    if (!Array.isArray(data) || !data.length) throw new ValidationError('Export data is required.');
    const buffer = await exportSvc.buildXlsxBuffer(data, sheetName);
    const safe = sanitizeFilename(filename) || `super_data_export_${exportSvc.timestamp()}.xlsx`;
    database.logActivity({
      userId: req.auth.userId,
      action: 'export',
      details: { format: 'xlsx', rowCount: data.length, filename: safe, sheetName },
    });
    res.setHeader('Content-Disposition', `attachment; filename="${safe}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

router.post('/csv', requireSession, (req, res, next) => {
  try {
    const { data = [], filename } = req.body || {};
    if (!Array.isArray(data) || !data.length) throw new ValidationError('Export data is required.');
    const buffer = exportSvc.buildCsvBuffer(data);
    const safe = sanitizeFilename(filename) || `super_data_export_${exportSvc.timestamp()}.csv`;
    database.logActivity({
      userId: req.auth.userId,
      action: 'export',
      details: { format: 'csv', rowCount: data.length, filename: safe },
    });
    res.setHeader('Content-Disposition', `attachment; filename="${safe}"`);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
