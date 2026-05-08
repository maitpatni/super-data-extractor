'use strict';

const express = require('express');
const database = require('../database');
const { ValidationError } = require('../lib/errors');
const { generateApiKey, hashToken } = require('../lib/crypto');
const { requireSession } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireSession, (req, res) => {
  res.json({ items: database.apiKeys.listForUser(req.auth.userId) });
});

router.post('/', requireSession, (req, res, next) => {
  try {
    const name = String(req.body?.name || '')
      .trim()
      .slice(0, 100);
    const scopes = String(req.body?.scopes || '*').slice(0, 200);
    if (!name) throw new ValidationError('name is required.');
    const plaintext = generateApiKey('sde_live_');
    database.apiKeys.create({
      userId: req.auth.userId,
      name,
      keyHash: hashToken(plaintext),
      keyPreview: `${plaintext.slice(0, 12)}…${plaintext.slice(-4)}`,
      scopes,
    });
    // Plaintext key is shown ONCE.
    res.json({ success: true, apiKey: plaintext });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireSession, (req, res, next) => {
  try {
    database.apiKeys.revoke(req.auth.userId, Number(req.params.id));
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
