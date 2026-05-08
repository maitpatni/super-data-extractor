'use strict';

const express = require('express');
const database = require('../database');
const { ValidationError } = require('../lib/errors');
const jobs = require('../services/jobs');
const { requireSession, requireSessionOrApiKey } = require('../middleware/auth');

const router = express.Router();

router.post('/bulk-maps', requireSessionOrApiKey, (req, res, next) => {
  try {
    const {
      queries = [],
      maxResultsPerQuery = 60,
      enrich = true,
      includeHistoryDedup = false,
    } = req.body || {};
    if (!Array.isArray(queries) || !queries.length) throw new ValidationError('queries[] is required.');
    if (queries.length > 200) throw new ValidationError('Maximum 200 queries per job.');
    for (const q of queries) {
      if (!q.location || !(q.searchTerm || q.keyword)) {
        throw new ValidationError('Each query needs `location` and `searchTerm` (or `keyword`).');
      }
    }
    const id = jobs.createJob({
      userId: req.auth.userId,
      type: 'bulk-maps',
      params: {
        queries,
        maxResultsPerQuery: Math.min(Math.max(Number(maxResultsPerQuery) || 60, 1), 500),
        enrich: Boolean(enrich),
        includeHistoryDedup: Boolean(includeHistoryDedup),
      },
    });
    res.json({ success: true, jobId: id });
  } catch (err) {
    next(err);
  }
});

router.get('/', requireSession, (req, res) => {
  res.json({ items: database.jobs.listForUser(req.auth.userId, 100) });
});

router.get('/:id', requireSession, (req, res, next) => {
  try {
    const j = jobs.getJobForUser(req.auth.userId, Number(req.params.id));
    if (!j) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Job not found.' } });
    res.json(j);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/cancel', requireSession, (req, res, next) => {
  try {
    const ok = jobs.cancelJob(req.auth.userId, Number(req.params.id));
    if (!ok) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Job not found.' } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
