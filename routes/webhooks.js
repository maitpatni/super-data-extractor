'use strict';

const express = require('express');
const crypto = require('crypto');
const database = require('../database');
const { ValidationError } = require('../lib/errors');
const { assertSafeUrl } = require('../lib/ssrf');
const { requireSession } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireSession, (req, res) => {
  res.json({ items: database.webhooks.listForUser(req.auth.userId) });
});

router.post('/', requireSession, async (req, res, next) => {
  try {
    const url = String(req.body?.url || '').trim();
    const events = String(req.body?.events || 'job.completed').trim();
    if (!url) throw new ValidationError('url is required.');
    await assertSafeUrl(url); // SSRF guard at registration time
    const secret = crypto.randomBytes(24).toString('base64url');
    database.webhooks.create({ userId: req.auth.userId, url, secret, events, enabled: 1 });
    res.json({ success: true, secret });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireSession, (req, res, next) => {
  try {
    database.webhooks.delete(req.auth.userId, Number(req.params.id));
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
