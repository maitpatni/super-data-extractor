'use strict';

const express = require('express');
const database = require('../database');
const { ValidationError, SpendLimitError } = require('../lib/errors');
const { logger } = require('../lib/logger');
const places = require('../services/places');
const enrichment = require('../services/enrichment');
const progress = require('../lib/progress');
const { requireSession } = require('../middleware/auth');
const { searchLimiter, validateKeyLimiter } = require('../middleware/rate-limit');
const { estimateMapsCost } = require('../lib/cost');
const { FIELD_MASK } = require('../lib/places-fields');

const router = express.Router();

function startOfTodayIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

router.get('/location-suggestions', requireSession, async (req, res, next) => {
  try {
    const settings = database.ensureUserSettings(req.auth.userId);
    const apiKey = String(req.query.apiKey || settings.googleMapsApiKey || '').trim();
    const query = String(req.query.query || '').trim();
    if (!apiKey) throw new ValidationError('Google Maps API key is required.');
    if (query.length < 2) return res.json({ suggestions: [] });
    const suggestions = await places.fetchAutocomplete(query, apiKey);
    res.json({ suggestions });
  } catch (err) {
    next(err);
  }
});

router.get('/cost/estimate', requireSession, (req, res) => {
  const expectedTextSearches = Math.max(1, Number(req.query.textSearches || 1));
  res.json({
    estimate: estimateMapsCost({ fieldMask: FIELD_MASK, expectedTextSearches }),
  });
});

router.post('/search/init', requireSession, (req, res) => {
  const session = progress.createSession(req.auth.userId, {
    status: 'pending',
    message: 'Session created',
  });
  res.json({ sessionId: session.sessionId });
});

router.get('/search/progress/:sessionId', requireSession, (req, res, next) => {
  try {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    progress.attach(req.params.sessionId, req.auth.userId, res);

    req.on('close', () => progress.detach(req.params.sessionId, res));
  } catch (err) {
    next(err);
  }
});

router.post('/search', requireSession, searchLimiter, async (req, res, next) => {
  try {
    const {
      query,
      keyword,
      location,
      radius = 5000,
      maxResults = 20,
      category = '',
      filters = {},
      freshOnly = false,
      enrich = true,
    } = req.body || {};
    let { sessionId } = req.body || {};

    // If the caller didn't pre-create a session, mint one bound to this user.
    if (!sessionId) {
      const s = progress.createSession(req.auth.userId, {
        status: 'pending',
        message: 'Session created on demand',
      });
      sessionId = s.sessionId;
    }

    const settings = database.ensureUserSettings(req.auth.userId);
    const apiKey = settings.googleMapsApiKey;
    if (!apiKey) throw new ValidationError('Google Maps API key is required.');

    const { categoryText, includedType } = places.resolveCategory(category);
    const searchTerm = [categoryText, query || keyword].filter(Boolean).join(' ').trim();
    if (!searchTerm || !location) throw new ValidationError('Both query and location are required.');

    // Optional spending ceiling check
    let costCeilingInr = null;
    if (settings.dailyInrCeiling && settings.dailyInrCeiling > 0) {
      const spent = database.spendInrSince(req.auth.userId, startOfTodayIso());
      const estimate = estimateMapsCost({
        fieldMask: FIELD_MASK,
        expectedTextSearches: Math.max(1, Math.ceil(maxResults / 20)),
      });
      if (spent + estimate.inr > settings.dailyInrCeiling) {
        throw new SpendLimitError('Daily INR ceiling would be exceeded.', {
          spent,
          estimate,
          ceiling: settings.dailyInrCeiling,
        });
      }
      costCeilingInr = settings.dailyInrCeiling - spent;
    }

    progress.update(sessionId, req.auth.userId, {
      status: 'running',
      total: maxResults,
      fetched: 0,
      stage: 'preparing',
      strategy: 'grid',
      message: `Preparing search for ${maxResults} results`,
    });

    const excludePlaceIds = new Set(freshOnly ? database.getUserPlaceIds(req.auth.userId) : []);

    const out = await places.runMapsSearch({
      apiKey,
      searchTerm,
      location,
      radiusMeters: radius,
      maxResults,
      includedType,
      filters,
      excludePlaceIds,
      costCeilingInr,
      onProgress: (p) => {
        progress.update(sessionId, req.auth.userId, {
          status: 'running',
          total: maxResults,
          fetched: p.fetched,
          stage: p.stage,
          strategy: p.strategy,
          gridPoint: p.gridPoint,
          totalPoints: p.totalPoints,
          skippedDuplicates: p.duplicatesSkipped,
          skippedExcluded: p.excludedSkipped,
          message: `Searching: ${p.fetched}/${maxResults}`,
        });
      },
    });

    const filteredResults = places
      .applyServerFilters(out.results, filters)
      .slice(0, out.summary.requestedResults);

    if (enrich && settings.enrichmentEnabled) {
      progress.update(sessionId, req.auth.userId, {
        stage: 'enriching',
        message: `Enriching ${filteredResults.length} results from websites…`,
      });
      await enrichment.enrichResults(filteredResults, {
        onProgress: ({ done, total }) =>
          progress.update(sessionId, req.auth.userId, {
            stage: 'enriching',
            message: `Enriching: ${done}/${total}`,
          }),
      });
    }

    const extraction = database.createExtraction({
      userId: req.auth.userId,
      source: 'Google Maps',
      keyword: keyword || query || '',
      location,
      category,
      radius,
      maxResults: out.summary.requestedResults,
      resultCount: filteredResults.length,
      costInr: out.cost.inr,
      costUsd: out.cost.usd,
      params: { ...req.body, freshOnly, enrich },
      results: filteredResults,
      summary: { searchTerm, ...out.summary },
    });

    database.logActivity({
      userId: req.auth.userId,
      action: 'search',
      details: {
        source: 'Google Maps',
        keyword: keyword || query || '',
        location,
        resultCount: filteredResults.length,
        costInr: out.cost.inr,
      },
    });

    progress.finish(sessionId, req.auth.userId, {
      status: 'completed',
      fetched: filteredResults.length,
      total: out.summary.requestedResults,
      stage: 'completed',
      failedCells: out.summary.failedCells,
      message: `Done. ${filteredResults.length} results.`,
    });

    res.json({
      success: true,
      results: filteredResults,
      extraction,
      sessionId,
      meta: {
        searchTerm,
        requestedResults: out.summary.requestedResults,
        returnedResults: filteredResults.length,
        duplicatesSkipped: out.summary.duplicatesSkipped,
        excludedSkipped: out.summary.excludedSkipped,
        failedCells: out.summary.failedCells,
        strategy: out.summary.strategy,
        textSearches: out.summary.textSearches,
        detailLookups: out.summary.detailLookups,
        geocodings: out.summary.geocodings,
        cost: out.cost,
      },
    });
  } catch (err) {
    if (req.body?.sessionId) {
      try {
        progress.finish(req.body.sessionId, req.auth.userId, {
          status: 'failed',
          error: err.message,
          message: err.message,
        });
      } catch (_e) {
        /* ignore */
      }
    }
    logger.warn({ err: err.message }, 'maps search failed');
    next(err);
  }
});

router.post('/validate-key', requireSession, validateKeyLimiter, async (req, res, next) => {
  try {
    const settings = database.ensureUserSettings(req.auth.userId);
    const apiKey = String(req.body?.apiKey || settings.googleMapsApiKey || '').trim();
    if (!apiKey) throw new ValidationError('Google Maps API key is required.');
    const status = await places.validateApiKey(apiKey);
    const validatedAt = new Date().toISOString();
    database.updateSettingsValidation(req.auth.userId, 'googleMaps', true, validatedAt);
    res.json({ valid: true, status, lastValidatedAt: validatedAt });
  } catch (err) {
    if (req.auth?.userId) {
      database.updateSettingsValidation(req.auth.userId, 'googleMaps', false, new Date().toISOString());
    }
    next(err);
  }
});

// Legacy: per-cache-key seen list (now backed by the user's persisted history).
// Kept for back-compat with the existing frontend; new clients should use
// `freshOnly: true` on /api/maps/search instead.
router.get('/session/seen', requireSession, (req, res) => {
  const cacheKey = String(req.query.cacheKey || '');
  const placeIds = database.getUserPlaceIds(req.auth.userId);
  res.json({ cacheKey, placeIds, updatedAt: new Date().toISOString() });
});

router.post('/session/seen', requireSession, (req, res) => {
  // No-op: history is already persisted as part of /api/maps/search.
  res.json({
    cacheKey: String(req.body?.cacheKey || ''),
    placeIds: Array.isArray(req.body?.placeIds) ? req.body.placeIds : [],
    updatedAt: new Date().toISOString(),
  });
});

module.exports = router;
