'use strict';

const express = require('express');
const database = require('../database');
const apollo = require('../services/apollo');
const { requireSession } = require('../middleware/auth');
const { searchLimiter, validateKeyLimiter } = require('../middleware/rate-limit');
const { ValidationError } = require('../lib/errors');

const router = express.Router();

router.post('/search', requireSession, searchLimiter, async (req, res, next) => {
  try {
    const settings = database.ensureUserSettings(req.auth.userId);
    if (!settings.linkedinApiKey) {
      return res.status(402).json({
        error: { code: 'CONFIG_REQUIRED', message: 'Apollo.io API key not configured' },
        configRequired: true,
      });
    }

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

    const filtered = profiles.filter((p) => Boolean(p.name || p.profileUrl));

    const extraction = database.createExtraction({
      userId: req.auth.userId,
      source: 'LinkedIn',
      keyword: name || role || company || '',
      location,
      category: industry || '',
      radius: null,
      maxResults: Number(maxResults) || 25,
      resultCount: filtered.length,
      costInr: 0,
      costUsd: 0,
      params: req.body || {},
      results: filtered,
      summary: { returnedResults: filtered.length },
    });

    database.logActivity({
      userId: req.auth.userId,
      action: 'search',
      details: {
        source: 'LinkedIn',
        keyword: name || role || company || '',
        location,
        resultCount: filtered.length,
      },
    });

    res.json({
      success: true,
      results: filtered,
      extraction,
      meta: { returnedResults: filtered.length, totalResultCount: filtered.length },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/validate-key', requireSession, validateKeyLimiter, async (req, res, next) => {
  try {
    const settings = database.ensureUserSettings(req.auth.userId);
    const apiKey = String(req.body?.apiKey || settings.linkedinApiKey || '').trim();
    if (!apiKey) throw new ValidationError('Apollo.io API key is required.');
    const status = await apollo.validateApiKey(apiKey);
    const validatedAt = new Date().toISOString();
    database.updateSettingsValidation(req.auth.userId, 'linkedin', true, validatedAt);
    res.json({ valid: true, status, lastValidatedAt: validatedAt, message: 'Apollo.io reachable.' });
  } catch (err) {
    if (req.auth?.userId) {
      database.updateSettingsValidation(req.auth.userId, 'linkedin', false, new Date().toISOString());
    }
    next(err);
  }
});

module.exports = router;
