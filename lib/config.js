'use strict';

require('dotenv').config();

const path = require('path');

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function bool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(value));
}

function list(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProd = NODE_ENV === 'production';
const isTest = NODE_ENV === 'test';

const config = {
  nodeEnv: NODE_ENV,
  isProd,
  isTest,

  // HTTP
  port: num(process.env.PORT, 3000),
  host: process.env.HOST || '0.0.0.0',
  trustProxy: bool(process.env.TRUST_PROXY, false),
  allowedOrigins: list(process.env.ALLOWED_ORIGIN),
  forceHttps: bool(process.env.FORCE_HTTPS, false),

  // Logging
  logLevel: process.env.LOG_LEVEL || (isProd ? 'info' : 'debug'),
  logRedactSecrets: bool(process.env.LOG_REDACT, true),

  // Storage
  dataDir: process.env.DATA_DIR || path.join(__dirname, '..', 'data'),

  // Crypto
  // 32-byte key (base64 or hex). Required to encrypt API keys at rest.
  masterKey: process.env.MASTER_KEY || '',

  // Sessions
  sessionTtlDays: num(process.env.SESSION_TTL_DAYS, 30),

  // FX
  usdToInrOverride: process.env.USD_TO_INR ? num(process.env.USD_TO_INR, null) : null,

  // Rate limits
  rateLimit: {
    loginPerIp15m: num(process.env.RL_LOGIN_PER_IP_15M, 5),
    registerPerIp1h: num(process.env.RL_REGISTER_PER_IP_1H, 3),
    searchPerUser1h: num(process.env.RL_SEARCH_PER_USER_1H, 30),
    validateKeyPerUser1h: num(process.env.RL_VALIDATE_PER_USER_1H, 60),
    enrichmentPerUser1h: num(process.env.RL_ENRICHMENT_PER_USER_1H, 200),
    apiV1PerKey1m: num(process.env.RL_API_V1_PER_KEY_1M, 60),
  },

  // Spending
  defaultDailyInrCeiling: num(process.env.DEFAULT_DAILY_INR_CEILING, 0), // 0 = disabled

  // Enrichment
  enrichment: {
    enabled: bool(process.env.ENRICHMENT_ENABLED, true),
    perDomainConcurrency: 1,
    perDomainDelayMs: num(process.env.ENRICHMENT_DOMAIN_DELAY_MS, 1500),
    timeoutMs: num(process.env.ENRICHMENT_TIMEOUT_MS, 8000),
    maxBytes: num(process.env.ENRICHMENT_MAX_BYTES, 1024 * 1024),
    userAgent:
      process.env.ENRICHMENT_USER_AGENT ||
      'SuperDataExtractor/2.0 (+https://github.com/maitpatni/super-data-extractor)',
    paths: ['/', '/contact', '/contact-us', '/about', '/about-us'],
  },

  // SSRF guard
  ssrf: {
    allowPrivate: bool(process.env.SSRF_ALLOW_PRIVATE, false), // dev-only escape hatch
    allowedPorts: [80, 443],
    timeoutMs: 5000,
  },
};

function assertProductionReady() {
  const errors = [];
  if (!config.masterKey) {
    errors.push('MASTER_KEY is required (32 random bytes, base64 or hex).');
  } else {
    try {
      const len = Buffer.from(
        config.masterKey,
        /^[0-9a-f]+$/i.test(config.masterKey) ? 'hex' : 'base64',
      ).length;
      if (len !== 32) {
        errors.push(`MASTER_KEY must decode to 32 bytes (got ${len}).`);
      }
    } catch (err) {
      errors.push(`MASTER_KEY is not valid base64/hex: ${err.message}`);
    }
  }
  if (config.isProd && !config.allowedOrigins.length) {
    errors.push('ALLOWED_ORIGIN must list at least one origin in production (comma-separated).');
  }
  return errors;
}

module.exports = { config, assertProductionReady };
