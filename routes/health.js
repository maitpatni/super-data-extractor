'use strict';

const express = require('express');
const { requireSession } = require('../middleware/auth');
const { enrichmentLimiter } = require('../middleware/rate-limit');
const { safeFetch } = require('../lib/ssrf');
const { ValidationError } = require('../lib/errors');

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({ ok: true, version: require('../package.json').version, time: new Date().toISOString() });
});

router.get('/check-url', requireSession, enrichmentLimiter, async (req, res, next) => {
  try {
    const url = String(req.query.url || '').trim();
    if (!url) throw new ValidationError('url is required.');
    const r = await safeFetch(url, { method: 'HEAD', maxBytes: 0, timeoutMs: 5000, maxRedirects: 3 });
    res.json({ status: r.status, reachable: r.ok });
  } catch (err) {
    // Return 200 with status:0 for benign reachability misses; let SSRF rejection surface as 400.
    if (err.code === 'VALIDATION') return next(err);
    res.json({ status: 0, reachable: false, error: err.message });
  }
});

module.exports = router;
