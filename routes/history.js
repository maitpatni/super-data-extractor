'use strict';

const express = require('express');
const database = require('../database');
const { requireSession } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireSession, (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const q = String(req.query.q || '')
      .trim()
      .toLowerCase();
    let items = database.getExtractionHistoryByUser(req.auth.userId, { limit, offset });
    if (q) {
      items = items.filter((it) => {
        return [it.source, it.params?.keyword, it.params?.location, it.params?.category]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q));
      });
    }
    // Legacy shape (array) by default; new clients can opt into the paged shape.
    if (req.query.paged === '1' || req.query.paged === 'true') {
      return res.json({
        total: database.countExtractionsForUser(req.auth.userId),
        limit,
        offset,
        items,
      });
    }
    return res.json(items);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requireSession, (req, res, next) => {
  try {
    const ex = database.getExtractionForUser(req.auth.userId, Number(req.params.id));
    if (!ex) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Extraction not found.' } });
    res.json(ex);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireSession, (req, res, next) => {
  try {
    database.deleteExtraction(req.auth.userId, Number(req.params.id));
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
