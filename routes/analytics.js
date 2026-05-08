'use strict';

const express = require('express');
const database = require('../database');
const { requireSession } = require('../middleware/auth');

const router = express.Router();

function dayKey(iso) {
  return String(iso).slice(0, 10);
}

router.get('/spend', requireSession, (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
  const all = database.getExtractionHistoryByUser(req.auth.userId, { limit: 1000, offset: 0 });
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const recent = all.filter((e) => new Date(e.timestamp).getTime() >= cutoff);
  const byDay = new Map();
  const byCategory = new Map();
  let totalCost = 0;
  let totalResults = 0;

  for (const e of recent) {
    totalCost += Number(e.cost?.inr || 0);
    totalResults += Number(e.count || 0);
    const day = dayKey(e.timestamp);
    if (!byDay.has(day)) byDay.set(day, { day, costInr: 0, results: 0, runs: 0 });
    const d = byDay.get(day);
    d.costInr += Number(e.cost?.inr || 0);
    d.results += Number(e.count || 0);
    d.runs += 1;
    const cat = e.params?.category || e.params?.industry || e.source || 'unknown';
    byCategory.set(cat, (byCategory.get(cat) || 0) + Number(e.cost?.inr || 0));
  }

  const days_ = Array.from(byDay.values()).sort((a, b) => a.day.localeCompare(b.day));
  const topCategories = Array.from(byCategory.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([category, costInr]) => ({ category, costInr: Number(costInr.toFixed(2)) }));

  res.json({
    rangeDays: days,
    totals: {
      costInr: Number(totalCost.toFixed(2)),
      results: totalResults,
      runs: recent.length,
      inrPerResult: totalResults ? Number((totalCost / totalResults).toFixed(4)) : 0,
    },
    byDay: days_,
    topCategories,
  });
});

module.exports = router;
