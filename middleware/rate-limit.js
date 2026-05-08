'use strict';

const rateLimit = require('express-rate-limit');
const { config } = require('../lib/config');

function withDefaults(opts) {
  return rateLimit({
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => config.isTest, // disable in tests
    handler: (req, res, _next, options) => {
      res.status(options.statusCode || 429).json({
        error: { code: 'RATE_LIMIT', message: options.message || 'Too many requests.' },
      });
    },
    ...opts,
  });
}

const userKey = (req) => (req.auth?.userId ? `u:${req.auth.userId}` : `ip:${req.ip}`);

const loginLimiter = withDefaults({
  windowMs: 15 * 60 * 1000,
  limit: config.rateLimit.loginPerIp15m,
  message: 'Too many login attempts. Try again later.',
});

const registerLimiter = withDefaults({
  windowMs: 60 * 60 * 1000,
  limit: config.rateLimit.registerPerIp1h,
  message: 'Too many sign-up attempts.',
});

const searchLimiter = withDefaults({
  windowMs: 60 * 60 * 1000,
  limit: config.rateLimit.searchPerUser1h,
  keyGenerator: userKey,
  message: 'Search rate limit reached. Try again in an hour.',
});

const validateKeyLimiter = withDefaults({
  windowMs: 60 * 60 * 1000,
  limit: config.rateLimit.validateKeyPerUser1h,
  keyGenerator: userKey,
  message: 'Validation rate limit reached.',
});

const enrichmentLimiter = withDefaults({
  windowMs: 60 * 60 * 1000,
  limit: config.rateLimit.enrichmentPerUser1h,
  keyGenerator: userKey,
  message: 'Enrichment rate limit reached.',
});

const apiV1Limiter = withDefaults({
  windowMs: 60 * 1000,
  limit: config.rateLimit.apiV1PerKey1m,
  keyGenerator: (req) => (req.auth?.apiKeyId ? `k:${req.auth.apiKeyId}` : `ip:${req.ip}`),
  message: 'API rate limit reached.',
});

module.exports = {
  loginLimiter,
  registerLimiter,
  searchLimiter,
  validateKeyLimiter,
  enrichmentLimiter,
  apiV1Limiter,
};
