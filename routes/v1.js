'use strict';

const express = require('express');
const database = require('../database');
const places = require('../services/places');
const apollo = require('../services/apollo');
const enrichmentSvc = require('../services/enrichment');
const jobs = require('../services/jobs');
const { ValidationError } = require('../lib/errors');
const { requireApiKey } = require('../middleware/auth');
const { apiV1Limiter, enrichmentLimiter } = require('../middleware/rate-limit');
const { FIELD_MASK } = require('../lib/places-fields');
const { estimateMapsCost } = require('../lib/cost');
const { validateEmail, validateEmailsBatch } = require('../lib/email-validate');
const { buildKeyPool } = require('../lib/build-key-pool');

const router = express.Router();
router.use(requireApiKey, apiV1Limiter);

router.get('/me', (req, res) => {
  res.json({ userId: req.auth.userId, scopes: req.auth.scopes });
});

router.post('/maps/search', async (req, res, next) => {
  try {
    const keyPool = buildKeyPool(req.auth.userId, 'google_maps');
    if (!keyPool) throw new ValidationError('Google Maps API key not configured.');
    const settings = database.ensureUserSettings(req.auth.userId);
    const {
      searchTerm,
      location,
      radius = 5000,
      maxResults = 60,
      includedType = '',
      filters = {},
      freshOnly = false,
      enrich = false,
    } = req.body || {};
    if (!searchTerm || !location) throw new ValidationError('searchTerm and location are required.');
    const excludePlaceIds = new Set(freshOnly ? database.getUserPlaceIds(req.auth.userId) : []);
    const out = await places.runMapsSearch({
      keyPool,
      searchTerm,
      location,
      radiusMeters: radius,
      maxResults,
      includedType,
      filters,
      excludePlaceIds,
    });
    const resultsOut = places.applyServerFilters(out.results, filters);
    if (enrich && settings.enrichmentEnabled) {
      await enrichmentSvc.enrichResults(resultsOut);
    }
    const extraction = database.createExtraction({
      userId: req.auth.userId,
      source: 'Google Maps (API)',
      keyword: searchTerm,
      location,
      category: includedType,
      radius,
      maxResults,
      resultCount: resultsOut.length,
      costInr: out.cost.inr,
      costUsd: out.cost.usd,
      params: { searchTerm, location, radius, maxResults, includedType, filters, freshOnly, enrich },
      results: resultsOut,
      summary: out.summary,
    });
    res.json({
      success: true,
      results: resultsOut,
      extractionId: extraction.id,
      meta: { ...out.summary, cost: out.cost },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/maps/cost-estimate', (req, res) => {
  const { expectedTextSearches = 1 } = req.body || {};
  res.json({ estimate: estimateMapsCost({ fieldMask: FIELD_MASK, expectedTextSearches }) });
});

router.post('/linkedin/search', async (req, res, next) => {
  try {
    const keyPool = buildKeyPool(req.auth.userId, 'apollo');
    if (!keyPool) throw new ValidationError('Apollo.io API key not configured.');
    const {
      name = '',
      company = '',
      role = '',
      location = '',
      industry = '',
      maxResults = 25,
    } = req.body || {};
    const profiles = await apollo.searchProfiles({
      keyPool,
      name,
      company,
      role,
      location,
      industry,
      maxResults,
    });
    const extraction = database.createExtraction({
      userId: req.auth.userId,
      source: 'LinkedIn (API)',
      keyword: name || role || company || '',
      location,
      category: industry,
      radius: null,
      maxResults: Number(maxResults) || 25,
      resultCount: profiles.length,
      costInr: 0,
      costUsd: 0,
      params: req.body || {},
      results: profiles,
      summary: { returnedResults: profiles.length },
    });
    res.json({ success: true, results: profiles, extractionId: extraction.id });
  } catch (err) {
    next(err);
  }
});

router.post('/jobs/bulk-maps', (req, res, next) => {
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
      if (!q.location || !(q.searchTerm || q.keyword))
        throw new ValidationError('Each query needs location and searchTerm/keyword.');
    }
    const id = jobs.createJob({
      userId: req.auth.userId,
      type: 'bulk-maps',
      params: {
        queries,
        maxResultsPerQuery,
        enrich: Boolean(enrich),
        includeHistoryDedup: Boolean(includeHistoryDedup),
      },
    });
    res.json({ success: true, jobId: id });
  } catch (err) {
    next(err);
  }
});

router.get('/jobs/:id', (req, res) => {
  const j = jobs.getJobForUser(req.auth.userId, Number(req.params.id));
  if (!j) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Job not found.' } });
  res.json(j);
});

router.get('/extractions/:id', (req, res) => {
  const ex = database.getExtractionForUser(req.auth.userId, Number(req.params.id));
  if (!ex) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Extraction not found.' } });
  res.json(ex);
});

router.get('/extractions', (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  res.json({
    total: database.countExtractionsForUser(req.auth.userId),
    items: database.getExtractionHistoryByUser(req.auth.userId, { limit, offset }).map((e) => ({
      id: e.id,
      source: e.source,
      count: e.count,
      cost: e.cost,
      timestamp: e.timestamp,
      summary: e.summary,
    })),
  });
});

// ---------------------------------------------------------------------------
// Enrichment-only endpoint — the strategic differentiator. Caller posts an
// array of rows that already have a `website` (or `domain`); we return them
// enriched with emails (DNS-validated), socials, phones, and tech stack.
// No search, no Google Places spend. CSV-in/JSON-out workflows are the most-
// asked use case across competitor users.
// ---------------------------------------------------------------------------
router.post('/enrich', enrichmentLimiter, async (req, res, next) => {
  try {
    const { rows = [], includeTech = true, validateEmails: doValidate = true } = req.body || {};
    if (!Array.isArray(rows) || !rows.length) {
      throw new ValidationError('rows[] is required.', { hint: 'Each row needs a `website` or `domain`.' });
    }
    if (rows.length > 1000) throw new ValidationError('Maximum 1000 rows per request.');
    // Normalise: accept either `website` or `domain`
    const items = rows.map((r, i) => {
      const obj = { ...r };
      if (!obj.website && obj.domain) {
        const d = String(obj.domain).trim();
        obj.website = d.startsWith('http') ? d : `https://${d}`;
      }
      obj._idx = i;
      return obj;
    });
    const enriched = await enrichmentSvc.enrichResults(items.slice());
    if (!includeTech) for (const r of enriched) delete r.tech;
    if (!doValidate) for (const r of enriched) delete r.emailsScored;
    res.json({
      success: true,
      count: enriched.length,
      enrichedCount: enriched.filter((r) => r.enrichmentStatus === 'enriched').length,
      results: enriched,
    });
  } catch (err) {
    next(err);
  }
});

// Single-shot email validator (DNS-only). Useful for "verify this list".
router.post('/email/validate', enrichmentLimiter, async (req, res, next) => {
  try {
    const { email, emails } = req.body || {};
    if (Array.isArray(emails)) {
      if (emails.length > 500) throw new ValidationError('Maximum 500 emails per request.');
      const out = await validateEmailsBatch(emails);
      return res.json({ success: true, results: out });
    }
    if (typeof email !== 'string' || !email) {
      throw new ValidationError('Either `email` (string) or `emails` (array) is required.');
    }
    const out = await validateEmail(email);
    return res.json({ success: true, result: out });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
