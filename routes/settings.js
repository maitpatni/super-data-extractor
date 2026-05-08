'use strict';

const express = require('express');
const database = require('../database');
const places = require('../services/places');
const apollo = require('../services/apollo');
const { ValidationError } = require('../lib/errors');
const { validateKeyLimiter } = require('../middleware/rate-limit');
const { requireSession } = require('../middleware/auth');

const router = express.Router();

const SET_SENTINEL = '__SET__';

function maskKey(key) {
  if (!key) return '';
  if (key.length <= 8) return '****';
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

function publicSettings(s) {
  return {
    ...s,
    googleMapsApiKey: s.googleMapsApiKey ? SET_SENTINEL : '',
    linkedinApiKey: s.linkedinApiKey ? SET_SENTINEL : '',
    googleMapsApiKeyPreview: maskKey(s.googleMapsApiKey),
    linkedinApiKeyPreview: maskKey(s.linkedinApiKey),
  };
}

// Resolve a posted key field to either: undefined (leave unchanged) or a real string.
// Empty string and the SET sentinel both mean "leave unchanged"; explicit non-empty
// non-sentinel string means "use this new key". `null` clears.
function resolveKey(posted, current) {
  if (posted === undefined) return current;
  if (posted === null) return '';
  if (posted === '' || posted === SET_SENTINEL) return current;
  return posted;
}

router.get('/', requireSession, (req, res) => {
  const s = database.ensureUserSettings(req.auth.userId);
  res.json(publicSettings(s));
});

router.post('/', requireSession, (req, res, next) => {
  try {
    const cur = database.ensureUserSettings(req.auth.userId);
    const body = req.body || {};
    const merged = {
      ...cur,
      ...body,
      googleMapsApiKey: resolveKey(body.googleMapsApiKey, cur.googleMapsApiKey),
      linkedinApiKey: resolveKey(body.linkedinApiKey, cur.linkedinApiKey),
      validations: {
        ...cur.validations,
        ...(body.validations || {}),
        googleMaps: { ...cur.validations.googleMaps, ...(body.validations?.googleMaps || {}) },
        linkedin: { ...cur.validations.linkedin, ...(body.validations?.linkedin || {}) },
      },
    };
    const saved = database.saveUserSettings(req.auth.userId, merged);
    res.json({ success: true, settings: publicSettings(saved) });
  } catch (err) {
    next(err);
  }
});

// Legacy: validate-google / validate-linkedin (kept for the existing frontend).
router.post('/validate-google', requireSession, validateKeyLimiter, async (req, res, next) => {
  try {
    const settings = database.ensureUserSettings(req.auth.userId);
    const apiKey = String(req.body?.apiKey || '').trim() || settings.googleMapsApiKey;
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

router.post('/validate-linkedin', requireSession, validateKeyLimiter, async (req, res, next) => {
  try {
    const settings = database.ensureUserSettings(req.auth.userId);
    const apiKey = String(req.body?.apiKey || '').trim() || settings.linkedinApiKey;
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
