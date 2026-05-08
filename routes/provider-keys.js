'use strict';

const express = require('express');
const database = require('../database');
const { ValidationError } = require('../lib/errors');
const { requireSession } = require('../middleware/auth');

const router = express.Router();

const PROVIDERS = new Set(['google_maps', 'apollo']);

router.get('/', requireSession, (req, res) => {
  const items = database.providerKeys.listForUser(req.auth.userId);
  res.json({ items });
});

router.post('/', requireSession, (req, res, next) => {
  try {
    const provider = String(req.body?.provider || '').trim();
    const key = String(req.body?.key || '').trim();
    const name = String(req.body?.name || '')
      .trim()
      .slice(0, 80);
    const ceilingInr = Number(req.body?.ceilingInr || 0);
    if (!PROVIDERS.has(provider)) {
      throw new ValidationError('provider must be one of: google_maps, apollo.', { provider });
    }
    if (!key || key.length < 8) throw new ValidationError('key is required (≥8 chars).');
    if (!name) throw new ValidationError('name is required.');
    if (ceilingInr < 0 || !Number.isFinite(ceilingInr))
      throw new ValidationError('ceilingInr must be a positive number.');

    const id = database.providerKeys.create({
      userId: req.auth.userId,
      provider,
      name,
      key,
      ceilingInr,
    });
    res.json({ success: true, id });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireSession, (req, res, next) => {
  try {
    database.providerKeys.revoke(req.auth.userId, Number(req.params.id));
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
