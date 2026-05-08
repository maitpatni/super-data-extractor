'use strict';

const express = require('express');
const database = require('../database');
const places = require('../services/places');
const apollo = require('../services/apollo');
const enrichmentSvc = require('../services/enrichment');
const jobs = require('../services/jobs');
const { ValidationError } = require('../lib/errors');
const { requireApiKey } = require('../middleware/auth');
const { apiV1Limiter } = require('../middleware/rate-limit');
const { FIELD_MASK } = require('../lib/places-fields');
const { estimateMapsCost } = require('../lib/cost');

const router = express.Router();
router.use(requireApiKey, apiV1Limiter);

router.get('/me', (req, res) => {
  res.json({ userId: req.auth.userId, scopes: req.auth.scopes });
});

router.post('/maps/search', async (req, res, next) => {
  try {
    const settings = database.ensureUserSettings(req.auth.userId);
    if (!settings.googleMapsApiKey) throw new ValidationError('Google Maps API key not configured.');
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
      apiKey: settings.googleMapsApiKey,
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
    const settings = database.ensureUserSettings(req.auth.userId);
    if (!settings.linkedinApiKey) throw new ValidationError('Apollo.io API key not configured.');
    const {
      name = '',
      company = '',
      role = '',
      location = '',
      industry = '',
      maxResults = 25,
    } = req.body || {};
    const profiles = await apollo.searchProfiles({
      apiKey: settings.linkedinApiKey,
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

module.exports = router;
